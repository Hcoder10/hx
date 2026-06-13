// One-off: discover the ephemeral-token response shape. Redacts the token value.
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function key() {
  for (const p of [path.join(__dirname, "..", ".env.local"), path.join(__dirname, "..", "..", ".env.local")]) {
    try {
      const t = readFileSync(p, "utf8");
      for (const l of t.split(/\r?\n/)) {
        const m = l.match(/^\s*XAI_API_KEY\s*=\s*(.*)$/);
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    } catch {}
  }
  throw new Error("no key");
}

const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
  method: "POST",
  headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
  body: JSON.stringify({ expires_after: { seconds: 300 } }),
});
console.log("HTTP", r.status);
const j = await r.json();
const redact = (o) =>
  JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "string" && v.length > 16 ? v.slice(0, 14) + `...(${v.length})` : v)));
console.log(JSON.stringify(redact(j), null, 2));
