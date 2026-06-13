import type { GrokFormat } from "@/lib/validation";

// Server-only Grok CHAT client — the validation pipeline's format+find callback.
// This is the ONLY LLM transport for coding; a fine-tuned 9B Qwen drops in by
// pointing HX_FORMAT_MODEL/HX_FORMAT_ENDPOINT at its vLLM server (same contract).
// Untrusted by design: the deterministic verifier re-checks everything it returns.
const ENDPOINT = process.env.HX_FORMAT_ENDPOINT || "https://api.x.ai/v1/chat/completions";
export const FORMAT_MODEL = process.env.HX_FORMAT_MODEL || "grok-4.20-0309-non-reasoning";

export const formatWithGrok: GrokFormat = async (prompt, payload) => {
  const key = process.env.XAI_API_KEY;
  if (!key) return ""; // fail-closed: no key -> abstain -> verifier flags "no_code"
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: FORMAT_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!r.ok) return "";
    const data = await r.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
};
