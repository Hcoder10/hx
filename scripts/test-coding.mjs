// Comprehensive generalization test for the Hx coding+verify pipeline.
// Sends labelled cases across ALL systems to the live /api/validate and scores:
//   - real terms must be ACCEPTED (and, when given, matchedDescription must contain
//     an expected keyword — catches "accepted but clinically wrong")
//   - fake terms/codes must be REFUSED
// Usage: node scripts/test-coding.mjs [baseUrl]
const BASE = process.argv[2] || "https://hx-zeta.vercel.app";

// section -> list of { in, accept, kw? }  (kw = keyword expected in matched desc)
const CASES = {
  problems: [
    // clinical
    { in: "type 2 diabetes", accept: true, kw: "diabetes" },
    { in: "essential hypertension", accept: true, kw: "hypertension" },
    { in: "GERD", accept: true, kw: "reflux" },
    { in: "asthma", accept: true, kw: "asthma" },
    { in: "COPD", accept: true, kw: "obstructive" },
    { in: "atrial fibrillation", accept: true, kw: "fibrillation" },
    { in: "hypothyroidism", accept: true, kw: "hypothyroid" },
    { in: "migraine", accept: true, kw: "migraine" },
    { in: "pneumonia", accept: true, kw: "pneumonia" },
    { in: "urinary tract infection", accept: true, kw: "urinary" },
    // colloquial / lay (rely on rewrite)
    { in: "high blood pressure", accept: true, kw: "hypertension" },
    { in: "sugar problem", accept: true, kw: "diabetes" },
    { in: "feeling really down lately", accept: true, kw: "depress" },
    { in: "cant stop worrying", accept: true, kw: "anxiety" },
    { in: "wants to kill themselves", accept: true, kw: "suicidal" },
    { in: "covid", accept: true, kw: "covid" },
    { in: "the flu", accept: true, kw: "influenza" },
    { in: "pink eye", accept: true, kw: "conjunctivitis" },
    { in: "shingles", accept: true, kw: "zoster" },
    { in: "kidney infection", accept: true, kw: "pyelonephritis" },
    { in: "ringing in my ears", accept: true, kw: "tinnitus" },
    { in: "ear infection", accept: true, kw: "otitis" },
    { in: "heartburn", accept: true, kw: "heartburn" },
    { in: "kidney stones", accept: true, kw: "calculus" },
    { in: "high cholesterol", accept: true, kw: "cholesterol" },
    { in: "cant sleep", accept: true, kw: "insomnia" },
    { in: "really bad headache", accept: true, kw: "headache" },
    { in: "low back pain", accept: true, kw: "back pain" },
    // must refuse
    { in: "glorptosis of the spleen", accept: false },
    { in: "wibble syndrome", accept: false },
    { in: "asdfqwer", accept: false },
  ],
  medications: [
    { in: "metformin", accept: true, kw: "metformin" },
    { in: "lisinopril", accept: true, kw: "lisinopril" },
    { in: "atorvastatin", accept: true, kw: "atorvastatin" },
    { in: "gabapentin", accept: true, kw: "gabapentin" },
    { in: "amoxicillin", accept: true, kw: "amoxicillin" },
    { in: "omeprazole", accept: true, kw: "omeprazole" },
    { in: "sertraline", accept: true, kw: "sertraline" },
    { in: "ozempic", accept: true, kw: "ozempic" },
    // brand names
    { in: "zoloft", accept: true, kw: "sertraline" }, // brand -> ingredient is OK
    { in: "tylenol", accept: true, kw: "acetaminophen" },
    { in: "advil", accept: true }, // advil or ibuprofen both fine
    { in: "lipitor", accept: true },
    { in: "prozac", accept: true, kw: "fluoxetine" },
    // colloquial
    { in: "water pill", accept: true },
    // must refuse
    { in: "zorblax", accept: false },
    { in: "made up drug xyz", accept: false },
  ],
  allergies: [
    { in: "penicillin", accept: true, kw: "penicillin" },
    { in: "amoxicillin", accept: true, kw: "amoxicillin" },
    { in: "sulfa", accept: true, kw: "sulfamethoxazole" },
    { in: "aspirin", accept: true, kw: "aspirin" },
    { in: "ibuprofen", accept: true, kw: "ibuprofen" },
    { in: "codeine", accept: true, kw: "codeine" },
    { in: "latex", accept: true, kw: "latex" },
    { in: "peanuts", accept: true, kw: "peanut" },
    { in: "shrimp", accept: true, kw: "shrimp" },
    { in: "eggs", accept: true, kw: "egg" },
    { in: "bee sting", accept: true, kw: "bee" },
    { in: "walnut", accept: true, kw: "walnut" },
    { in: "notarealsubstance123", accept: false },
  ],
  vitals: [
    { in: "Systolic blood pressure 150", accept: true, kw: "systolic" },
    { in: "A1c 8.2%", accept: true, kw: "a1c" },
    { in: "Heart rate 88", accept: true, kw: "heart rate" },
  ],
};

function buildEncounter(section, cases) {
  const enc = { id: "test", date: "2026-06-13", providerId: "er", title: "test", place: "Hx", summary: "", notes: [], addProblems: [], addMedications: [], addAllergies: [] };
  if (section === "problems") enc.addProblems = cases.map((c) => ({ name: c.in }));
  else if (section === "medications") enc.addMedications = cases.map((c) => ({ name: c.in }));
  else if (section === "allergies") enc.addAllergies = cases.map((c) => ({ substance: c.in }));
  else if (section === "vitals") enc.notes = cases.map((c) => c.in);
  return enc;
}

async function run() {
  let pass = 0, fail = 0;
  const fails = [];
  for (const [section, cases] of Object.entries(CASES)) {
    const enc = buildEncounter(section, cases);
    const r = await fetch(`${BASE}/api/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ encounter: enc }) });
    const data = await r.json();
    const entries = data.entries.filter((e) => e.section === section);
    console.log(`\n===== ${section.toUpperCase()} (${cases.length}) =====`);
    cases.forEach((c, i) => {
      const e = entries[i] || {};
      const md = (e.matchedDescription || "").toLowerCase();
      let ok = e.accepted === c.accept;
      if (ok && c.accept && c.kw && !md.includes(c.kw.toLowerCase())) ok = false;
      const tag = ok ? "PASS" : "FAIL";
      if (ok) pass++; else { fail++; fails.push(`${section}: "${c.in}"`); }
      const detail = e.accepted ? `${e.system} ${e.code} (${e.matchedDescription || ""})` : `REFUSED (${e.reason || "-"})`;
      console.log(`  [${tag}] ${(c.in).padEnd(34)} -> ${detail}`);
    });
  }
  console.log(`\n========== ${pass}/${pass + fail} passed ==========`);
  if (fails.length) console.log("FAILURES:\n  " + fails.join("\n  "));
}
run().catch((e) => { console.error(e); process.exit(1); });
