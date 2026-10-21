/* GeneTune-PID learning report: deterministic, offline explanations and questions. */
(function (root) {
  "use strict";
  const finite = x => typeof x === "number" && Number.isFinite(x);
  const round = (x, n = 1) => Number(x.toFixed(n));
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  function band(value, reference) {
    if (!finite(value) || !finite(reference) || reference <= 0) return null;
    const ratio = value / reference;
    return {ratio: round(ratio, 2), label: ratio < 0.9 ? "below" : ratio > 1.1 ? "above" : "near"};
  }
  function build(input) {
    const r = {schema: "genetune-learning-report-v1", createdAt: input.createdAt || new Date().toISOString(),
      title: input.title || "GeneTune-PID experiment", source: input.source, mode: input.mode,
      context: input.context || {}, metrics: input.metrics || {}, reference: input.reference || null,
      explanations: [], questions: [], answers: [], evidence: input.evidence || null};
    const m = r.metrics, src = input.source === "emulator" ? "This run came from the firmware emulator and reflects its model, not a physical measurement." :
      input.source === "rig" ? "This run was recorded from the connected rig. A single trial is subject to sensor noise and plant variation." :
      "This replay uses recorded rig data; no new hardware trial was performed.";
    r.explanations.push(src);
    if (r.mode === "run") {
      r.explanations.push(`At the ${input.context.setpoint} cm setpoint, ITAE was ${round(m.J)} cm s². ITAE weights late absolute error more heavily; a lower value describes this realised trial only.`);
      r.explanations.push(`Overshoot was ${round(m.os)}% of the step, settling time (within ±2 cm) was ${round(m.ts)} s, and actuator variation was ${round(m.tv)} PWM counts. Compare these measures together rather than selecting a controller from ITAE alone.`);
      const c = r.reference && band(m.J, r.reference.J);
      if (c) {
        const relation = c.label === "below" ? "below" : c.label === "above" ? "above" : "within 10% of";
        r.explanations.push(`The ITAE is ${relation} the ${r.reference.label} (${round(r.reference.J)} cm s²; ratio ${c.ratio}). ${r.reference.note}`);
        r.questions.push({id:"compare", type:"choice", prompt:`How does ITAE ${round(m.J)} compare with the stated reference ${round(r.reference.J)} cm s²?`, options:["below by more than 10%","within 10%","above by more than 10%"], answer:c.label === "below" ? 0 : c.label === "near" ? 1 : 2, feedback:"This compares the measured ITAE with the stated reference using a ±10% band; it does not establish expected controller performance."});
      }
      if (!c) r.questions.push({id:"itae", type:"choice", prompt:"What does a lower ITAE mean for one completed trial?", options:["Less time-weighted absolute error in this realisation","Proof of a better controller under all conditions","Lower actuator variation in every case"], answer:0, feedback:"ITAE summarises time-weighted absolute error in the realised trial; it does not measure actuator variation or prove general superiority."});
      r.questions.push({id:"interpret", type:"text", prompt:"Explain whether this one trial is enough to claim that these PID gains are generally better. Use ITAE, actuator variation and measurement variability in your answer.", feedback:"A justified answer distinguishes the observed trial from repeated performance and considers actuator variation."});
    } else if (r.mode === "tune" || r.mode === "replay") {
      const n = input.trials || [], completed = n.filter(t => !t.x), interrupted = n.length - completed.length;
      const best = completed.length ? Math.min(...completed.map(t => t.J)) : null;
      const confirm = input.confirmation;
      if (!confirm) r.explanations.push("No independent confirmation was recorded; this report describes an incomplete search.");
      r.metrics = {searchTrials:n.length, interrupted, bestStored:best, confirmed:confirm && confirm.J};
      r.explanations.push(`${n.length} search trials are available; ${interrupted} were interrupted when accumulated ITAE exceeded twice the best stored cost. Because accumulated ITAE only grows, an interrupted trial could not have finished below the best stored cost, so early stopping never discards a candidate that would have beaten it in that trial.`);
      const np = input.context && input.context.population, g = input.context && input.context.generations;
      if (np && g) r.explanations.push(`Trial budget: with population Np = ${np} and G = ${g} generations, one elite is kept without re-evaluation, so the search needs Np + G(Np − 1) = ${np + g*(np-1)} trials plus 1 confirmation = ${np + g*(np-1) + 1} physical trials.`);
      else if (n.length) r.explanations.push(`Trial budget: these ${n.length} search trials plus 1 confirmation give ${n.length + 1} physical trials, matching Np + G(Np − 1) + 1 (for Np = 8, G = 5: 8 + 5 × 7 + 1 = 44).`);
      if (finite(best) && confirm && finite(confirm.J)) {
        r.explanations.push(`The best stored score was ${round(best)} cm s² and independent confirmation was ${round(confirm.J)} cm s². Selecting a minimum among noisy trials can bias the stored score downward; confirmation is also a single trial.`);
        r.questions.push({id:"confirmation", type:"choice", prompt:"What does a difference between the stored score and confirmation show?", options:["The stored score is always the true expected cost","Trials with the same gains can differ, and selection favours a low recorded cost","The controller gains necessarily changed"], answer:1, feedback:"Fitness evaluations are noisy. A selected minimum can be optimistic, and one confirmation is not a population estimate."});
      }
      r.questions.push({id:"stopping", type:"choice", prompt:"When can the current trial be stopped without beating the best cost in this realised trial?", options:["As soon as its error changes sign","When accumulated ITAE exceeds twice the best stored cost","Only after the whole 30 s step"], answer:1, feedback:"Accumulated ITAE cannot decrease, so a trial already above twice the best stored cost cannot finish below the best stored cost. Stopping it discards no better candidate."});
      r.questions.push({id:"budget", type:"text", prompt:"Explain how population size and generation count determine the number of physical trials, including confirmation.", feedback:"For population Np and G generations with one retained elite: Np + G(Np − 1) + 1 trials."});
    } else if (r.mode === "relay") {
      r.explanations.push(`The relay response gives estimated ultimate gain Ku = ${round(m.Ku,2)} and period Pu = ${round(m.Pu,2)} s. Ziegler–Nichols gains follow from these estimates; noise and cycle selection affect them.`);
      r.questions.push({id:"relay", type:"choice", prompt:"Why estimate the period from several oscillation cycles?", options:["To reduce sensitivity to one noisy crossing","To make the integral gain zero","To remove the need for an amplitude estimate"], answer:0, feedback:"Several cycles reduce reliance on a single threshold crossing."});
      r.questions.push({id:"relay_open", type:"text", prompt:"Describe how uncertainty in oscillation amplitude or period would affect the resulting gains.", feedback:"Ku depends on amplitude, while the ZN integral and derivative terms also depend on Pu."});
    } else if (r.mode === "auto") {
      const episodes = input.episodes || [], first = episodes[0], trigger = input.trigger;
      r.metrics = {episodes:episodes.map(o => ({episode:o.n+1,setpoint:o.r,ITAE:o.J,normalisedCost:o.Jn})), triggerEpisode:finite(trigger) ? trigger+1 : null};
      r.explanations.push(`${episodes.length} operating episodes were recorded. The firmware compares normalised episode cost with a threshold based on the reference episode. A trigger is evidence for reassessment, not proof of a plant change.`);
      if (first) r.explanations.push(`The first episode set a normalised reference cost of ${round(first.Jn,2)}; the configured threshold is 1.5 times that value. ${finite(trigger) ? `Retuning was triggered at episode ${trigger+1}.` : "No trigger was recorded."}`);
      r.questions.push({id:"trigger", type:"choice", prompt:"What can an elevated episode cost mean?", options:["Only a permanent plant change","A changed setpoint, noise, disturbance or plant change","That the genetic algorithm has converged"], answer:1, feedback:"A threshold alone cannot identify the cause; compare setpoint, repeated episodes and actuator behaviour."});
      r.questions.push({id:"auto_open", type:"text", prompt:"Use the episode log to justify whether the trigger was timely or could have been false.", feedback:"Refer to the setpoint, the normalised cost and the threshold before and after the trigger."});
    }
    return r;
  }
  function check(report, answers) {
    return report.questions.map(q => {
      const value = answers[q.id];
      return {id:q.id, answer:value === undefined ? "" : value, correct:q.type === "choice" && value !== "" ? Number(value) === q.answer : null,
        feedback:q.type === "text" ? (String(value || "").trim() ? "Written response saved for discussion with the educator. " : "Write your justification before exporting. ") + q.feedback : q.feedback};
    });
  }
  function exportHtml(report) {
    const block = (label, value) => `<section><h2>${esc(label)}</h2>${value}</section>`;
    const list = a => `<ol>${a.map(v => `<li>${esc(v)}</li>`).join("")}</ol>`;
    const answers = report.questions.map(q => { const a = report.answers.find(x => x.id === q.id); return `<li><strong>${esc(q.prompt)}</strong><p>Student response: ${esc(a && a.answer !== "" ? (q.type === "choice" ? q.options[Number(a.answer)] : a.answer) : "No response")}</p><p>Feedback: ${esc(a ? a.feedback : q.feedback)}</p></li>`; }).join("");
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(report.title)}</title><style>body{font:16px/1.5 Arial,sans-serif;max-width:800px;margin:30px auto;padding:0 20px;color:#17202c}h1,h2{color:#184e85}section{border-top:1px solid #ccd3dc;margin-top:20px}li{margin:12px 0}pre{white-space:pre-wrap}</style><h1>${esc(report.title)}</h1><p>Source: ${esc(report.source)} · Mode: ${esc(report.mode)} · ${esc(report.createdAt)}</p>${block("Configuration",`<pre>${esc(JSON.stringify(report.context,null,2))}</pre>`)}${block("Results",`<pre>${esc(JSON.stringify(report.metrics,null,2))}</pre>`)}${block("Explanation",list(report.explanations))}${block("Student questionnaire",`<ol>${answers}</ol>`)}</html>`;
  }
  root.GTReport = {build, band, check, exportHtml, esc};
})(window);
