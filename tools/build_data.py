"""Export measured ball-in-tube logs to genetune/data.js for the GeneTune interface (replay only, no new data)."""
import csv, json, collections
D = "data/"
def rows(path):
    return list(csv.DictReader(open(path)))
def traj(rs, key="process_var"):
    return [round(float(r[key]), 2) for r in rs]
def events(path):
    out = []
    for r in rows(path):
        p = [x for x in r["payload"].split(",")]
        out.append((r["kind"], p, int(r["episode"])))
    return out
def by_episode(path):
    ep = collections.defaultdict(list)
    for r in rows(path):
        ep[int(r["episode"])].append(r)
    return ep
data = {"relay": {"y": traj(rows(D+"ball_relay.csv")), "u": traj(rows(D+"ball_relay.csv"), "output")}, "reps": [], "baselines": {}, "retune": []}
for i in range(10):
    ev = events(D+f"embedded/e1_rep{i}_events.csv"); ep = by_episode(D+f"embedded/e1_rep{i}_rows.csv")
    trials = []; gens = []; conf = None
    for kind, p, e in ev:
        if kind == "EV":
            trials.append({"g": int(p[0]), "i": int(p[1]), "k": [float(p[2]), float(p[3]), float(p[4])],
                           "J": float(p[5]), "x": int(p[6]), "d": float(p[7]),
                           "y": traj(ep[e]), "u": traj(ep[e], "output")})
        elif kind == "GEN":
            gens.append({"g": int(p[0]), "best": float(p[1]), "k": [float(p[2]), float(p[3]), float(p[4])], "us": int(p[5]), "ram": int(p[6])})
        elif kind == "TDONE":
            conf = {"k": [float(p[0]), float(p[1]), float(p[2])], "J": float(p[3]), "y": traj(ep[e]), "u": traj(ep[e], "output")}
    data["reps"].append({"session": "A" if i < 5 else "B", "trials": trials, "gens": gens, "conf": conf})
for s, day in (("A", "day2"), ("B", "day3")):
    runs = rows(D+f"ball_{day}_runs.csv")
    data["baselines"][s] = {m: {"J": [float(r["ITAE"]) for r in runs if r["method"] == m],
                                "y": [traj(rows(D+f"ball_{day}_{m.lower()}_rep{j}.csv")) for j in range(5)],
                                "u": [traj(rows(D+f"ball_{day}_{m.lower()}_rep{j}.csv"), "output") for j in range(5)]}
                            for m in ("GA", "ZN")}
for i in range(3):
    ops = []; trig = None; conf = None
    for kind, p, e in events(D+f"embedded/e5_rep{i}_events.csv"):
        if kind == "OP": ops.append({"n": int(p[0]), "r": float(p[1]), "J": float(p[2]), "Jn": float(p[3])})
        elif kind == "TRIG": trig = int(p[0])
        elif kind == "TDONE": conf = {"k": [float(x) for x in p[:3]], "J": float(p[3])}
    data["retune"].append({"ops": ops, "trig": trig, "conf": conf})
open("genetune/data.js", "w").write("window.TUNELAB_DATA=" + json.dumps(data, separators=(",", ":")) + ";\n")
r0 = data["reps"]
print("trials", sum(len(r["trials"]) for r in r0), "interrupted", sum(t["x"] for r in r0 for t in r["trials"]),
      "conf", [round(r["conf"]["J"]) for r in r0], "ZN A/B", [round(sum(v["ZN"]["J"])/5) for v in data["baselines"].values()])
