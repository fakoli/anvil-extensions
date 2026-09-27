// pi-session-retro — report rendering.
//
// Faithful port of the original `report_md`, `md_to_html`, and
// `report_html` (including the HTML template, verbatim). The template is
// MIT-licensed code from the original plugin; it is embedded here as a
// string so the port stays dependency-free (no build step, no markdown lib).

import { type Aggregate } from "./aggregate.js";
import { sumCounter } from "./types.js";

function bar(v: number, mx: number, width = 44): string {
  return "█".repeat(mx ? Math.round((width * (v || 0)) / mx) : 0);
}

function fmt(n: number | null | undefined): string {
  return n == null ? "n/a" : n.toLocaleString("en-US");
}

export function reportMd(agg: Aggregate): string {
  const L: string[] = [];
  const a = agg;
  L.push("## Session shape\n");
  L.push("| Metric | Value |");
  L.push("|---|---|");
  if (a.cwd) {
    L.push(
      `| Project (cwd) | \`${a.cwd}\`${a.branch ? " @ " + a.branch : ""} |`,
    );
  }
  if (a.runtimes.length) {
    L.push(`| Runtime(s) | ${a.runtimes.join(", ")} |`);
  }
  L.push(`| Wall-clock | ${a.wall_hours} h |`);
  L.push(`| Assistant turns | ${a.assistant_turns.toLocaleString("en-US")} |`);
  L.push(`| Human messages | ${a.user_turns} |`);
  L.push(`| Tool calls | ${sumCounter(a.tools)} |`);
  L.push(
    `| Background workflows | ${a.workflows} (${a.workflow_agents} subagents) |`,
  );
  L.push("");

  // Token economy (generative)
  L.push("## Token economy\n");
  L.push("**Generated (output) tokens — where the work happened:**\n");
  const mo = a.main_output_tokens;
  const wt = a.workflow_tokens;
  const wtAvail = a.workflow_tokens_available;
  const mx = Math.max(mo, wt, 1);
  const tot = mo + wt;
  const pct = (x: number) => (tot ? `${Math.round((100 * x) / tot)}%` : "0%");
  L.push("```");
  if (wtAvail) {
    L.push(
      `delegated to workflows  ${fmt(wt).padStart(12)}  ${bar(wt, mx)}  ${pct(wt)}`,
    );
    L.push(
      `main-loop orchestrator  ${fmt(mo).padStart(12)}  ${bar(mo, mx)}  ${pct(mo)}`,
    );
  } else {
    L.push(
      `delegated to workflows  ${"n/a".padStart(12)}  (totals unavailable in this log format)`,
    );
    L.push(`main-loop orchestrator  ${fmt(mo).padStart(12)}  ${bar(mo, mx)}`);
  }
  L.push(`${"total generative".padEnd(22)}  ${fmt(tot).padStart(12)}`);
  L.push("```\n");
  for (const note of a.measurement_notes) {
    L.push(`> Note: ${note}.\n`);
  }

  // Total processed incl cache
  const cr = a.cache_read_tokens;
  const cc = a.cache_creation_tokens;
  const inp = a.fresh_input_tokens;
  const gen = a.generative_total;
  const gt = cr + cc + gen + inp;
  const mxp = Math.max(cr, cc, gen, inp, 1);
  L.push("**Total tokens processed (incl. cache):**\n");
  L.push("```");
  for (const [label, v] of [
    ["cache read", cr],
    ["cache creation", cc],
    ["generated output", gen],
    ["fresh input", inp],
  ] as Array<[string, number]>) {
    L.push(`${label.padEnd(16)} ${fmt(v).padStart(14)}  ${bar(v, mxp)}`);
  }
  L.push(`${"total processed".padEnd(16)} ${fmt(gt).padStart(14)}`);
  L.push("```");
  L.push(
    "> Cache reads scale with session length (the context re-read each turn); " +
      "cheap per token but usually the largest line in a long session.\n",
  );

  // Workflow taxonomy
  if (a.workflows) {
    L.push("## Workflow analysis\n");
    L.push(
      `${a.workflows} workflows, ${a.workflow_agents} subagents.\n`,
    );
    L.push("```");
    const mxw = Math.max(
      ...Object.values(a.workflow_by_type).map((v) => v.tokens ?? 0),
      1,
    );
    let anyUnknown = false;
    for (const [k, v] of Object.entries(a.workflow_by_type)) {
      const mark = v.unknown_runs ? "*" : " ";
      anyUnknown = anyUnknown || Boolean(v.unknown_runs);
      L.push(
        `${k.padEnd(14)} ${String(v.runs).padStart(3)} runs ${String(v.agents).padStart(4)} ag ${fmt(v.tokens).padStart(12)}${mark} ${bar(v.tokens ?? 0, mxw, 30)}`,
      );
    }
    L.push("```\n");
    if (anyUnknown) {
      L.push("> \\* includes runs whose token totals are unavailable in this log format.\n");
    }
    L.push("**Most expensive runs:**\n");
    L.push("| tokens | agents | min | summary |");
    L.push("|---:|---:|---:|---|");
    for (const r of a.workflow_runs.slice(0, 8)) {
      L.push(
        `| ${fmt(r.tokens)} | ${r.agents} | ${(r.ms / 60000).toFixed(1)} | ${(r.summary || "").slice(0, 48)} |`,
      );
    }
    L.push("");
  }

  // Tools
  L.push("## Tool distribution\n");
  L.push("```");
  const mxt = Math.max(...Object.values(a.tools), 1);
  for (const [k, v] of Object.entries(a.tools)) {
    L.push(`${k.padEnd(16)} ${String(v).padStart(4)}  ${bar(v, mxt, 40)}`);
  }
  L.push("```\n");

  // Dynamic workflows + agents + skills
  if (Object.keys(a.workflows_named).length) {
    L.push("## Dynamic workflows in play\n");
    L.push("```");
    const mxn = Math.max(...Object.values(a.workflows_named), 1);
    for (const [k, v] of Object.entries(a.workflows_named)) {
      L.push(`${k.slice(0, 34).padEnd(34)} ${String(v).padStart(3)}x  ${bar(v, mxn, 28)}`);
    }
    L.push("```\n");
  }
  if (Object.keys(a.agent_types).length || Object.keys(a.skills_used).length) {
    L.push("## Agents & skills\n");
    const at = a.agent_types;
    L.push(
      `- **Agent types** (${Object.values(at).reduce((x, y) => x + y, 0)} subagents): ` +
        (Object.entries(at).map(([k, v]) => `${k} (${v})`).join(", ") || "none"),
    );
    const sk = a.skills_used;
    L.push(
      "- **Skills invoked**: " +
        (Object.entries(sk).map(([k, v]) => `${k} (${v})`).join(", ") || "none") +
        "\n",
    );
  }

  // Narrative scaffold for the model
  L.push("## Interaction analysis (fill in)\n");
  L.push(
    "Characterize the steering pattern from the human messages below " +
      "(autonomous directive vs step-by-step; where they intervened; friction " +
      "signals like repeated status checks):\n",
  );
  a.user_turn_text.forEach((t, i) => {
    L.push(`${String(i + 1).padStart(2)}. ${t}`);
  });
  L.push(
    "\n## Retrospective (fill in)\n",
    "Write an honest retro, grounded in the numbers above:\n",
    "- **What went well** - and *why* it worked, so it can be repeated.",
    "- **What went wrong** - the real problems and the rework they caused.",
    "- **Where we got lucky** - outcomes that worked out but were not earned " +
      "by the process: a near-miss caught by chance, a guess that happened to " +
      "be right, an error that surfaced before it mattered. Luck is not skill; " +
      "name it so the process can be hardened to not depend on it.",
    '- **Five Whys** - take the most important problem and ask "why" five ' +
      'times to reach the root cause, then name the systemic fix.\n',
    "## Recommendations (fill in)\n",
  );
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// markdown -> HTML (narrative only; ported from the original's minimal
// md_to_html: headings, bold, code, links, lists)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`(.+?)`/g, "<code>$1</code>");
  out = out.replace(/\[(.+?)\]\((.+?)\)/g, (m, label, target) => {
    const t = target.trim();
    const scheme = t.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? "";
    if (scheme && !["http", "https", "mailto"].includes(scheme)) return m;
    if (t.startsWith("//")) return m;
    return `<a href="${escapeHtml(t)}">${label}</a>`;
  });
  return out;
}

export function mdToHtml(md: string): string {
  const out: string[] = [];
  let inList = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      continue;
    }
    let m = line.match(/^(#{1,4})\s+(.*)/);
    if (m) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inlineMd(m[2])}</h${lvl}>`);
      continue;
    }
    m = line.replace(/^\s+/, "").match(/^[-*]\s+(.*)/);
    if (m) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMd(m[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// interactive single-page site (template ported verbatim from the original)
// ---------------------------------------------------------------------------

const HTML_TEMPLATE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Session Retro</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--ac:#58a6ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
a{color:var(--ac)}.wrap{max-width:1080px;margin:0 auto;padding:28px 20px 70px}
header h1{margin:0 0 4px;font-size:24px}.meta{color:var(--mut);font-size:12px;margin-bottom:22px;word-break:break-all}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.kpi{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px 16px}
.kpi .v{font-size:21px;font-weight:700}.kpi .l{color:var(--mut);font-size:12px;margin-top:2px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:18px}.card h2{margin:0 0 14px;font-size:15px}
.bar{display:flex;align-items:center;gap:10px;margin:7px 0}.bar .lab{width:130px;color:var(--mut);font-size:12px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar .track{flex:1;background:#0d1117;border-radius:6px;overflow:hidden;height:22px;position:relative}
.bar .fill{height:100%;border-radius:6px;transition:width .9s cubic-bezier(.2,.8,.2,1);min-width:2px}
.bar .val{position:absolute;right:8px;top:0;line-height:22px;font-size:11px}.bar:hover .fill{filter:brightness(1.25)}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--bd)}
th{color:var(--mut);cursor:pointer;user-select:none}th:hover{color:var(--fg)}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.dough{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.legend div{margin:6px 0;color:var(--mut);font-size:12px}.legend b{color:var(--fg)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px}
.tl{max-height:330px;overflow:auto}.tl .t{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #21262d}.tl .i{color:var(--ac);font-weight:700;min-width:22px}
.note{color:var(--mut);font-size:12px;margin-top:8px}
.notes{margin-bottom:22px}.notes .n{border:1px solid var(--bd);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;color:var(--mut)}
.notes .warn{border-color:#f85149;background:#3d1418;color:#ffb4ab;font-weight:700}
.narrative{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:6px 22px 18px;margin-top:16px}
.narrative h2{font-size:18px;border-bottom:1px solid var(--bd);padding-bottom:8px}.narrative h3{font-size:14px;color:var(--ac)}
.narrative code{background:#0d1117;padding:2px 5px;border-radius:4px;font-size:12px}
footer{color:var(--mut);font-size:12px;margin-top:28px;text-align:center}
</style></head><body><div class="wrap">
<header><h1>Session Retro</h1><div class="meta" id="meta"></div></header>
<div class="notes" id="notes"></div>
<div class="kpis" id="kpis"></div>
<div class="grid">
<div class="card"><h2>Generated tokens — orchestrator vs delegated</h2><div class="dough" id="dough"></div><div class="note">Output tokens (the real work). Cache reads are shown separately.</div></div>
<div class="card"><h2>Tokens processed (incl. cache)</h2><div id="cache"></div><div class="note">Cache reads = context re-read each turn; cheap, usually the largest line.</div></div>
</div>
<div class="grid">
<div class="card"><h2>Workflows by type</h2><div id="wftype"></div><div class="note">Hover a bar for runs / agents / minutes.</div></div>
<div class="card"><h2>Tool calls</h2><div id="tools"></div></div>
</div>
<div class="grid">
<div class="card"><h2>Dynamic workflows in play</h2><div id="wfnamed"></div><div class="note">By invocation count. A reused workflow script counts each run.</div></div>
<div class="card"><h2>Agents &amp; skills</h2><div id="agents"></div></div>
</div>
<div class="card" style="margin-bottom:16px"><h2>Activity timeline <span class="note">output tokens / hour, purple dots = workflow dispatches</span></h2><div id="timeline"></div></div>
<div class="card" id="wfrunsCard" style="margin-bottom:16px"><h2>Most expensive workflow runs <span class="note">(click a header to sort)</span></h2><table id="wfruns"></table></div>
<div class="card"><h2>Interaction timeline <span class="note" id="utc"></span></h2><div class="tl" id="turns"></div></div>
<div class="narrative" id="narrative">__NARRATIVE__</div>
<footer>Generated by the session-retro skill - reads only local ~/.pi / ~/.claude / ~/.codex logs, sends nothing.</footer>
</div><script>
const D = __DATA__, fmt = n => (n==null ? 'n/a' : (n||0).toLocaleString()), $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('meta').textContent = [D.cwd, D.branch, D.wall_hours? D.wall_hours+' h':''].filter(Boolean).join('  -  ');
(D.measurement_notes||[]).forEach(n=>{const div=document.createElement('div'),warn=n.startsWith('INTEGRITY WARNING');div.className='n'+(warn?' warn':'');div.textContent=(warn?'⚠️ ':'')+n;$('notes').appendChild(div);});
$('kpis').innerHTML = [['Wall-clock',(D.wall_hours||0)+' h'],['Assistant turns',fmt(D.assistant_turns)],['Human messages',fmt(D.user_turns)],['Generated tokens',fmt(D.generative_total)],['Workflows',fmt(D.workflows)+' / '+fmt(D.workflow_agents)+' ag'],['Cache read',fmt(D.cache_read_tokens)]].map(([l,v])=>\`<div class="kpi"><div class="v">\${v}</div><div class="l">\${l}</div></div>\`).join('');
function doughnut(parts){const tot=parts.reduce((a,p)=>a+p.value,0)||1,R=52,C=2*Math.PI*R;let off=0;const segs=parts.map(p=>{const dash=p.value/tot*C,s=\`<circle r="\${R}" cx="70" cy="70" fill="none" stroke="\${p.color}" stroke-width="20" stroke-dasharray="\${dash} \${C-dash}" stroke-dashoffset="\${-off}" transform="rotate(-90 70 70)"/>\`;off+=dash;return s;}).join('');return \`<svg width="140" height="140" viewBox="0 0 140 140">\${segs}</svg><div class="legend">\${parts.map(p=>\`<div><span class="dot" style="background:\${p.color}"></span><b>\${fmt(p.value)}</b> \${p.label} (\${Math.round(100*p.value/tot)}%)\</div>\`).join('')}</div>\`;}
$('dough').innerHTML=doughnut([{label:'delegated to workflows',value:D.workflow_tokens,color:'#bc8cff'},{label:'main-loop orchestrator',value:D.main_output_tokens,color:'#58a6ff'}]);
if(D.workflow_tokens_available===false){$('dough').parentElement.querySelector('.note').textContent='Delegated token totals are unavailable in this log format — percentages omitted.';$('dough').querySelectorAll('.legend div').forEach((lg,i)=>{lg.innerHTML=lg.innerHTML.replace(/\\s*\\(\\d+%\\)/,'');if(i===0)lg.innerHTML=lg.innerHTML.replace(/<b>[^<]*<\\/b>/,'<b>n/a</b>');});}
function hbars(el,items){const mx=Math.max(...items.map(i=>i.value),1);el.innerHTML=items.map(i=>\`<div class="bar" title="\${esc(i.tip||'')}"><div class="lab">\${esc(i.label)}</div><div class="track"><div class="fill" style="width:\${100*i.value/mx}%;background:\${i.color}"></div><div class="val">\${i.disp||fmt(i.value)}</div></div></div>\`).join('');}
hbars($('cache'),[{label:'cache read',value:D.cache_read_tokens,color:'#6e7681'},{label:'cache creation',value:D.cache_creation_tokens,color:'#484f58'},{label:'generated output',value:D.generative_total,color:'#58a6ff'},{label:'fresh input',value:D.fresh_input_tokens,color:'#3fb950'}]);
hbars($('wftype'),Object.entries(D.workflow_by_type||{}).map(([k,v])=>({label:k,value:v.tokens,disp:fmt(v.tokens),tip:v.runs+' runs / '+v.agents+' agents / '+v.minutes+' min',color:'#3fb950'})));
hbars($('tools'),Object.entries(D.tools||{}).map(([k,v])=>({label:k,value:v,disp:String(v),color:'#d29922'})));
hbars($('wfnamed'),Object.entries(D.workflows_named||{}).map(([k,v])=>({label:k.length>22?k.slice(0,21)+'…':k,value:v,disp:v+'x',color:'#bc8cff',tip:k})));
(function(){const at=Object.entries(D.agent_types||{}),sk=Object.entries(D.skills_used||{}),tot=Object.values(D.agent_types||{}).reduce((a,b)=>a+b,0);const m1=Math.max(...at.map(x=>x[1]),1),m2=Math.max(...sk.map(x=>x[1]),1);let h='<div class="note" style="margin:0 0 6px">Agent types ('+tot+' subagents)</div>';h+=(at.map(([k,v])=>\`<div class="bar"><div class="lab">\${esc(k)}</div><div class="track"><div class="fill" style="width:\${100*v/m1}%;background:#58a6ff"></div><div class="val">\${fmt(v)}</div></div></div>\`).join('')||'<div class="note">none</div>');h+='<div class="note" style="margin:13px 0 6px">Skills invoked</div>';h+=(sk.length?sk.map(([k,v])=>\`<div class="bar"><div class="lab">\${esc(k)}</div><div class="track"><div class="fill" style="width:\${100*v/m2}%;background:#3fb950"></div><div class="val">\${v}</div></div></div>\`).join(''):'<div class="note">none</div>');$('agents').innerHTML=h;})();
(function(){const T=D.timeline||[];if(!T.length){$('timeline').closest('.card').style.display='none';return;}const mx=Math.max(...T.map(t=>t.out),1);$('timeline').innerHTML='<div style="display:flex;align-items:flex-end;gap:3px;height:120px">'+T.map(t=>\`<div title="\${t.hour}: \${fmt(t.out)} output tokens\${t.wf?', '+t.wf+' workflow(s) dispatched':''}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%"><div style="font-size:11px;color:#bc8cff;height:13px;line-height:13px">\${t.wf?'●':''}</div><div style="width:100%;background:linear-gradient(#58a6ff,#1f6feb);border-radius:3px 3px 0 0;height:\${Math.round(100*t.out/mx)}%;min-height:2px"></div></div>\`).join('')+'</div><div style="display:flex;gap:3px;margin-top:5px">'+T.map((t,i)=>\`<div style="flex:1;text-align:center;font-size:8px;color:var(--mut)">\${i%2?'':t.hour.slice(6,11)}</div>\`).join('')+'</div>';})();
const runs=(D.workflow_runs||[]).slice(0,30);let sk='tokens',sd=-1;
function rr(){runs.sort((a,b)=>sd*((a[sk]>b[sk])?1:(a[sk]<b[sk])?-1:0));$('wfruns').innerHTML='<tr><th data-k="kind">type</th><th data-k="agents" class="n">agents</th><th data-k="tokens" class="n">tokens</th><th data-k="ms" class="n">min</th><th data-k="summary">summary</th></tr>'+runs.map(r=>\`<tr><td>\${esc(r.kind)}</td><td class="n">\${r.agents}</td><td class="n">\${fmt(r.tokens)}</td><td class="n">\${(r.ms/60000).toFixed(1)}</td><td>\${(r.summary||'').replace(/</g,'&lt;').slice(0,60)}</td></tr>\`).join('');$('wfruns').querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;sd=(sk===k)?-sd:-1;sk=k;rr();});}
runs.length?rr():$('wfrunsCard').style.display='none';
$('utc').textContent='('+(D.user_turn_text||[]).length+' human turns)';
$('turns').innerHTML=(D.user_turn_text||[]).map((t,i)=>\`<div class="t"><div class="i">\${i+1}</div><div>\${t.replace(/</g,'&lt;')}</div></div>\`).join('');
if(!$('narrative').textContent.trim())$('narrative').style.display='none';
</script></body></html>`;

export function reportHtml(agg: Aggregate, narrativeHtml = ""): string {
  // prevent </script> breakout, as the original does
  const data = JSON.stringify(agg).replace(/</g, "\\u003c");
  // Single-pass replacement: a sequential .replace("__DATA__").replace(
  // "__NARRATIVE__) would let the embedded data (or narrative) containing the
  // other sentinel corrupt the page. A function replacer inserts the value
  // verbatim, without re-scanning it.
  return HTML_TEMPLATE.replace(/__DATA__|__NARRATIVE__/g, (m) =>
    m === "__DATA__" ? data : narrativeHtml || "",
  );
}
