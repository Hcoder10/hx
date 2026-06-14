// Grok baseline on the SAME held-out test.jsonl as the finetune, so the two are
// directly comparable. Code-exact-match against gold. Reads key from web/.env.local.
import { readFileSync } from "node:fs";
const env = readFileSync("web/.env.local", "utf8");
const KEY = (env.match(/XAI_API_KEY\s*=\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const MODEL = process.env.HX_FORMAT_MODEL || "grok-4.20-0309-non-reasoning";
const EP = "https://api.x.ai/v1/chat/completions";
const rows = readFileSync("/tmp/test.jsonl", "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

async function chat(messages) {
  const r = await fetch(EP, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0, messages }) });
  if (!r.ok) return "";
  return (await r.json())?.choices?.[0]?.message?.content ?? "";
}

let codeOk = 0, tot = 0;
const t0 = Date.now();
// modest concurrency to stay under rate limits
const CONC = 6;
for (let i = 0; i < rows.length; i += CONC) {
  const batch = rows.slice(i, i + CONC);
  const outs = await Promise.all(batch.map(async (r) => {
    const gold = JSON.parse(r.messages[2].content);
    const raw = await chat(r.messages.slice(0, 2));
    let pred = {};
    try { const m = raw.match(/\{[\s\S]*\}/); pred = m ? JSON.parse(m[0]) : {}; } catch {}
    return (pred.code || "").trim() === (gold.code || "").trim();
  }));
  outs.forEach((ok) => { tot++; if (ok) codeOk++; });
  if (tot % 60 === 0) console.log(`  ${tot}/${rows.length} acc=${(codeOk / tot * 100).toFixed(1)}%`);
}
const dt = (Date.now() - t0) / 1000;
console.log("RESULT " + JSON.stringify({ model: MODEL, n: tot, code_exact_match: +(codeOk / tot).toFixed(4), code_ok: codeOk, seconds: +dt.toFixed(1), per_item_s: +(dt / tot).toFixed(2) }));
