import {
  chunkEncounter,
  retrieveCandidates,
  buildFormatterInput,
  parseFormatterOutput,
  verifyEntries,
  GROK_FORMATTER_PROMPT,
} from "@/lib/validation";
import { formatWithGrok } from "@/lib/hx/grok";
import type { Encounter } from "@/lib/hx";

export const runtime = "nodejs";

// A deliberately MESSY provider note for the demo: known concepts in sloppy
// phrasing (should code + verify), plus one drug absent from the public set
// (atorvastatin) that the gate should refuse rather than mis-code.
const DEMO_ENCOUNTER: Encounter = {
  id: "demo-validate",
  date: "2026-06-13",
  providerId: "er",
  title: "ER note (raw provider text)",
  place: "Mercy General ER",
  summary: "Messy intake note coded + verified by Hx.",
  notes: ["Blood pressure 150/95", "A1c 8.2%"],
  addProblems: [{ name: "high BP" }, { name: "type II DM" }, { name: "feeling really down lately" }],
  addMedications: [
    { name: "zoloft", dose: "100 mg", reason: "mood" },
    { name: "ultram", dose: "50 mg", reason: "pain" },
    { name: "atorvastatin", dose: "20 mg", reason: "cholesterol" },
  ],
  addAllergies: [{ substance: "penicillin", reaction: "rash" }],
};

export async function POST(req: Request) {
  let body: { encounter?: Encounter; tamper?: boolean } = {};
  try {
    body = await req.json();
  } catch {}
  const enc = body.encounter ?? DEMO_ENCOUNTER;
  const tamper = !!body.tamper;

  const chunked = chunkEncounter(enc);
  const items = chunked.sections.flatMap((s) => s.items);

  // Parallel: each item's Grok call is independent (keeps us under serverless limits).
  const perItem = await Promise.all(
    items.map(async (item) => {
      const candidates = retrieveCandidates(item);
      const raw = await formatWithGrok(GROK_FORMATTER_PROMPT, buildFormatterInput(item, candidates));
      return { coded: parseFormatterOutput(raw, item), top: candidates[0]?.code ?? null };
    }),
  );
  const coded = perItem.map((p) => p.coded);
  const topCandidate: (string | null)[] = perItem.map((p) => p.top);

  // Optional: simulate the AI hallucinating a code, to show the verifier catch it
  // deterministically (independent of how Grok actually behaved).
  if (tamper) {
    const idx = coded.findIndex((c) => c.section === "medications" && c.code);
    if (idx >= 0) coded[idx] = { ...coded[idx], code: "99999" };
  }

  const { results } = verifyEntries(coded);
  const entries = results.map((r, i) => ({
    section: r.section,
    system: r.system,
    term: r.term,
    code: r.code,
    accepted: r.accepted,
    reason: r.reason,
    note: r.note,
    similarity: Number(r.similarity.toFixed(2)),
    matchedDescription: r.matchedDescription,
    topCandidate: topCandidate[i],
    fields: r.fields,
  }));

  return Response.json({
    encounterTitle: enc.title,
    accepted: entries.filter((e) => e.accepted).length,
    flagged: entries.filter((e) => !e.accepted).length,
    entries,
  });
}
