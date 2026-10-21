"""Convert a GeneTune live log (rows CSV + events CSV from "Download CSV") into logs/<name>.js
so that index.html#stage=6&livelog=<name> re-renders the Live rig panel from the recorded data.
usage: python log_to_js.py <rows.csv> [events.csv] <name>"""
import json, pathlib, sys
a = sys.argv[1:]
rows, name = pathlib.Path(a[0]), a[-1]
events = pathlib.Path(a[1]) if len(a) == 3 else None
out = pathlib.Path(__file__).resolve().parent / "logs" / f"{name}.js"
out.parent.mkdir(exist_ok=True)
out.write_text("window.GT_LOG=" + json.dumps({"name": rows.name, "rows": rows.read_text(),
               "events": events.read_text() if events else ""}) + ";\n", encoding="utf8")
print(out)
