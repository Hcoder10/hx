import { Alert, MedWithProvenance } from "./model";

// ---------------------------------------------------------------------------
// General, deterministic drug–drug interaction engine.
//
// This replaces the original single-combo check (SSRI + tramadol) with a small
// curated table of clinically real, common, dangerous pairs. The real product
// reasons across the whole record with Grok; here we deterministically catch a
// well-known set so the demo is trustworthy and reproducible (no network).
//
// Each interaction is two drug-CLASS matchers (`a` / `b`), expressed as arrays
// of lowercase ingredient-name substrings. checkConflicts() looks at every
// unordered pair of meds; if one med matches side `a` and the other matches
// side `b` (in either orientation), it emits one Alert per interaction type.
// ---------------------------------------------------------------------------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const SEVERITY_RANK: Record<Alert["severity"], number> = { high: 0, medium: 1, low: 2 };

// Reusable class definitions (lowercase ingredient-name substrings).
const SSRIS = ["sertraline", "fluoxetine", "citalopram", "escitalopram", "paroxetine", "fluvoxamine"];
const SNRIS = ["venlafaxine", "desvenlafaxine", "duloxetine", "milnacipran"];
const MAOIS = ["phenelzine", "tranylcypromine", "isocarboxazid", "selegiline", "linezolid"];
const TRIPTANS = ["sumatriptan", "rizatriptan", "zolmitriptan", "eletriptan", "naratriptan", "almotriptan"];
const SEROTONERGIC_OTHER = ["tramadol", "meperidine", "fentanyl", "dextromethorphan", "ondansetron"];
const NSAIDS = ["ibuprofen", "naproxen", "diclofenac", "ketorolac", "indomethacin", "celecoxib", "meloxicam", "aspirin"];
const ASPIRIN = ["aspirin", "acetylsalicylic"];
const ACE_ARB = ["lisinopril", "enalapril", "ramipril", "benazepril", "captopril", "losartan", "valsartan", "candesartan", "irbesartan", "olmesartan"];
const POTASSIUM_SPARING = ["spironolactone", "eplerenone", "amiloride", "triamterene", "potassium chloride", "potassium", "klor-con"];
const BENZOS = ["alprazolam", "lorazepam", "diazepam", "clonazepam", "temazepam", "midazolam", "chlordiazepoxide"];
const OPIOIDS = ["morphine", "oxycodone", "hydrocodone", "hydromorphone", "fentanyl", "codeine", "tramadol", "methadone", "oxymorphone", "buprenorphine"];
const STATINS = ["simvastatin", "atorvastatin", "lovastatin", "pravastatin", "rosuvastatin", "pitavastatin", "fluvastatin"];
const MACROLIDES = ["clarithromycin", "erythromycin", "azithromycin", "telithromycin"];
const AZOLE_ANTIFUNGALS = ["ketoconazole", "itraconazole", "fluconazole", "voriconazole", "posaconazole", "miconazole"];
const PDE5 = ["sildenafil", "tadalafil", "vardenafil", "avanafil"];
const NITRATES = ["nitroglycerin", "isosorbide", "nitrate", "nitroprusside"];

type InteractionMatch = string[];

export type Interaction = {
  /** Stable id used as the base for the emitted Alert id. */
  id: string;
  severity: Alert["severity"];
  /** Short clinical name of the reaction (used in titles/templates). */
  problem: string;
  /** Side A: lowercase ingredient-name substrings. */
  a: InteractionMatch;
  /** Side B: lowercase ingredient-name substrings. */
  b: InteractionMatch;
  /** Builds the patient-facing summary, given the two matched meds. */
  summary: (a: MedWithProvenance, b: MedWithProvenance) => string;
  /** Builds the plain-language explanation (provenance is appended automatically). */
  explanation: (a: MedWithProvenance, b: MedWithProvenance) => string;
  /** Steps the patient can take. */
  whatToDo: (a: MedWithProvenance, b: MedWithProvenance) => string[];
  /** A short symptom phrase used in the generic "get urgent help" step. */
  warningSigns: string;
};

/**
 * Curated interaction table. Each entry pairs two drug classes that are
 * dangerous together. Order of `a`/`b` is irrelevant — checkConflicts() tries
 * both orientations. In the templates, `a` is the med that matched side `a`
 * and `b` is the med that matched side `b`.
 */
export const INTERACTIONS: Interaction[] = [
  {
    id: "serotonin-syndrome",
    severity: "high",
    problem: "serotonin syndrome",
    a: [...SSRIS, ...SNRIS],
    b: [...SEROTONERGIC_OTHER, ...TRIPTANS],
    summary: (a, b) => `${cap(b.name)} and ${cap(a.name)} can interact.`,
    explanation: (a, b) =>
      `Taking ${a.name} (an antidepressant) together with ${b.name} raises the risk ` +
      `of a serious reaction called serotonin syndrome, where the body has too much of a brain chemical called serotonin.`,
    whatToDo: (_a, b) => [
      "Don’t stop any medicine on your own.",
      `Call ${b.providerName} or your regular doctor today and mention both medicines.`,
    ],
    warningSigns: "agitation, a fast heartbeat, shivering, muscle twitching, or confusion",
  },
  {
    id: "maoi-ssri",
    severity: "high",
    problem: "serotonin syndrome",
    a: MAOIS,
    b: [...SSRIS, ...SNRIS],
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} should not be taken together.`,
    explanation: (a, b) =>
      `${cap(a.name)} (an MAOI) and ${b.name} (an antidepressant) are a dangerous combination that can cause ` +
      `serotonin syndrome and severe blood-pressure changes. These usually need a washout period of weeks between them.`,
    whatToDo: (a, _b) => [
      "Don’t take both medicines together.",
      `Call ${a.providerName} or your regular doctor today before your next dose.`,
    ],
    warningSigns: "agitation, a pounding headache, a fast heartbeat, shivering, or confusion",
  },
  {
    id: "warfarin-nsaid",
    severity: "high",
    problem: "serious bleeding",
    a: ["warfarin"],
    b: NSAIDS,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} together can cause bleeding.`,
    explanation: (a, b) =>
      `${cap(a.name)} is a blood thinner, and ${b.name} (an anti-inflammatory/pain medicine) makes bleeding more likely. ` +
      `Together they sharply raise the risk of stomach and other internal bleeding.`,
    whatToDo: (a, _b) => [
      "Don’t stop your blood thinner on your own.",
      `Call ${a.providerName} or your regular doctor and ask about a safer pain option (such as acetaminophen).`,
    ],
    warningSigns: "black or bloody stools, vomiting blood, easy bruising, or unusual bleeding",
  },
  {
    id: "warfarin-aspirin",
    severity: "high",
    problem: "serious bleeding",
    a: ["warfarin"],
    b: ASPIRIN,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} together can cause bleeding.`,
    explanation: (a, b) =>
      `${cap(a.name)} is a blood thinner and ${b.name} also reduces blood clotting. ` +
      `Taking them together greatly increases the chance of dangerous bleeding.`,
    whatToDo: (a, _b) => [
      "Don’t change either medicine on your own.",
      `Call ${a.providerName} or your regular doctor to confirm this combination is intended and being monitored.`,
    ],
    warningSigns: "black or bloody stools, vomiting blood, easy bruising, or unusual bleeding",
  },
  {
    id: "acei-arb-potassium",
    severity: "high",
    problem: "high potassium (hyperkalemia)",
    a: ACE_ARB,
    b: POTASSIUM_SPARING,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} can raise potassium too high.`,
    explanation: (a, b) =>
      `${cap(a.name)} (a blood-pressure medicine) and ${b.name} both make the body hold on to potassium. ` +
      `Together they can push potassium dangerously high, which can affect the heart rhythm.`,
    whatToDo: (a, _b) => [
      "Don’t stop either medicine on your own.",
      `Call ${a.providerName} or your regular doctor and ask whether your potassium level should be checked.`,
    ],
    warningSigns: "muscle weakness, a slow or irregular heartbeat, numbness, or tingling",
  },
  {
    id: "benzo-opioid",
    severity: "high",
    problem: "dangerously slowed breathing",
    a: BENZOS,
    b: OPIOIDS,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} together can slow your breathing.`,
    explanation: (a, b) =>
      `${cap(a.name)} (a sedative) and ${b.name} (an opioid pain medicine) both slow down the brain and breathing. ` +
      `Taking them together can cause extreme drowsiness, slowed breathing, and overdose.`,
    whatToDo: (a, _b) => [
      "Don’t take both at the same time without medical advice.",
      `Call ${a.providerName} or your regular doctor today to review the combination.`,
      "Make sure someone nearby knows what you’re taking.",
    ],
    warningSigns: "extreme drowsiness, very slow or shallow breathing, or being hard to wake",
  },
  {
    id: "statin-macrolide",
    severity: "high",
    problem: "muscle breakdown (rhabdomyolysis)",
    a: STATINS,
    b: MACROLIDES,
    summary: (a, b) => `${cap(b.name)} can raise ${cap(a.name)} to harmful levels.`,
    explanation: (a, b) =>
      `${cap(b.name)} (an antibiotic) slows how the body clears ${a.name} (a cholesterol medicine). ` +
      `${cap(a.name)} can build up and cause serious muscle breakdown that can harm the kidneys.`,
    whatToDo: (a, b) => [
      "Don’t start the antibiotic without checking first.",
      `Call ${b.providerName} or ${a.providerName} and ask whether to pause your statin while on the antibiotic.`,
    ],
    warningSigns: "unexplained muscle pain, weakness, or dark/cola-colored urine",
  },
  {
    id: "statin-azole",
    severity: "high",
    problem: "muscle breakdown (rhabdomyolysis)",
    a: STATINS,
    b: AZOLE_ANTIFUNGALS,
    summary: (a, b) => `${cap(b.name)} can raise ${cap(a.name)} to harmful levels.`,
    explanation: (a, b) =>
      `${cap(b.name)} (an antifungal) slows how the body clears ${a.name} (a cholesterol medicine). ` +
      `${cap(a.name)} can build up and cause serious muscle breakdown that can harm the kidneys.`,
    whatToDo: (a, b) => [
      "Don’t start the antifungal without checking first.",
      `Call ${b.providerName} or ${a.providerName} and ask whether to pause your statin while on the antifungal.`,
    ],
    warningSigns: "unexplained muscle pain, weakness, or dark/cola-colored urine",
  },
  {
    id: "metformin-contrast",
    severity: "medium",
    problem: "kidney strain and lactic acidosis",
    a: ["metformin"],
    b: ["iodinated contrast", "iohexol", "iodixanol", "iopamidol", "contrast dye", "ct contrast"],
    summary: (a, b) => `${cap(a.name)} should be paused around ${b.name}.`,
    explanation: (a, b) =>
      `${cap(a.name)} (a diabetes medicine) plus ${b.name} used for imaging scans can stress the kidneys and, rarely, ` +
      `cause a serious buildup of acid in the blood (lactic acidosis).`,
    whatToDo: (a, b) => [
      "Tell the imaging team you take metformin before any scan with contrast.",
      `Ask ${a.providerName} whether to hold metformin around the scan and when to restart it.`,
    ],
    warningSigns: "deep fast breathing, severe nausea, muscle pain, or unusual tiredness",
  },
  {
    id: "nitrate-pde5",
    severity: "high",
    problem: "a dangerous drop in blood pressure",
    a: NITRATES,
    b: PDE5,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} can drop your blood pressure dangerously.`,
    explanation: (a, b) =>
      `${cap(a.name)} (a heart/chest-pain medicine) and ${b.name} both widen blood vessels. ` +
      `Together they can cause blood pressure to fall too far, leading to fainting or a heart problem.`,
    whatToDo: (a, _b) => [
      "Do not take these two together.",
      `Call ${a.providerName} or your regular doctor to discuss safe timing and alternatives.`,
    ],
    warningSigns: "dizziness, fainting, a pounding or irregular heartbeat, or chest pain",
  },
  {
    id: "methotrexate-nsaid",
    severity: "high",
    problem: "methotrexate toxicity",
    a: ["methotrexate"],
    b: NSAIDS,
    summary: (a, b) => `${cap(b.name)} can raise ${cap(a.name)} to toxic levels.`,
    explanation: (a, b) =>
      `${cap(b.name)} (an anti-inflammatory/pain medicine) slows how the body clears ${a.name}. ` +
      `${cap(a.name)} can build up and harm the bone marrow, kidneys, and liver.`,
    whatToDo: (a, _b) => [
      "Don’t take over-the-counter pain pills with methotrexate without asking.",
      `Call ${a.providerName} or your regular doctor about a safer pain option.`,
    ],
    warningSigns: "mouth sores, fever, severe fatigue, easy bruising, or shortness of breath",
  },
  {
    id: "lithium-nsaid",
    severity: "high",
    problem: "lithium toxicity",
    a: ["lithium"],
    b: NSAIDS,
    summary: (a, b) => `${cap(b.name)} can raise ${cap(a.name)} to toxic levels.`,
    explanation: (a, b) =>
      `${cap(b.name)} (an anti-inflammatory/pain medicine) makes the body hold on to ${a.name}. ` +
      `${cap(a.name)} can rise into a toxic range, which affects the brain and kidneys.`,
    whatToDo: (a, _b) => [
      "Avoid over-the-counter anti-inflammatory pain pills unless your doctor approves.",
      `Call ${a.providerName} or your regular doctor and ask whether your lithium level should be checked.`,
    ],
    warningSigns: "tremor, confusion, slurred speech, vomiting, or unsteady walking",
  },
  {
    id: "lithium-acei-arb",
    severity: "high",
    problem: "lithium toxicity",
    a: ["lithium"],
    b: ACE_ARB,
    summary: (a, b) => `${cap(b.name)} can raise ${cap(a.name)} to toxic levels.`,
    explanation: (a, b) =>
      `${cap(b.name)} (a blood-pressure medicine) makes the body hold on to ${a.name}. ` +
      `${cap(a.name)} can rise into a toxic range, which affects the brain and kidneys.`,
    whatToDo: (a, _b) => [
      "Don’t change either medicine on your own.",
      `Call ${a.providerName} or your regular doctor and ask whether your lithium level should be checked.`,
    ],
    warningSigns: "tremor, confusion, slurred speech, vomiting, or unsteady walking",
  },
  {
    id: "digoxin-amiodarone",
    severity: "high",
    problem: "digoxin toxicity",
    a: ["digoxin"],
    b: ["amiodarone"],
    summary: (a, b) => `${cap(b.name)} can raise ${cap(a.name)} to toxic levels.`,
    explanation: (a, b) =>
      `${cap(b.name)} (a heart-rhythm medicine) raises the level of ${a.name} in the blood. ` +
      `Too much ${a.name} can cause a dangerous heart rhythm and other toxic effects.`,
    whatToDo: (a, _b) => [
      "Don’t change either medicine on your own.",
      `Call ${a.providerName} or your regular doctor and ask whether your digoxin dose or level should be rechecked.`,
    ],
    warningSigns: "nausea, vision changes (yellow/green tint), confusion, or an irregular heartbeat",
  },
  {
    id: "digoxin-verapamil",
    severity: "high",
    problem: "digoxin toxicity",
    a: ["digoxin"],
    b: ["verapamil", "diltiazem"],
    summary: (a, b) => `${cap(b.name)} can raise ${cap(a.name)} to toxic levels.`,
    explanation: (a, b) =>
      `${cap(b.name)} (a heart/blood-pressure medicine) raises the level of ${a.name} in the blood. ` +
      `Too much ${a.name} can cause a dangerous heart rhythm and other toxic effects.`,
    whatToDo: (a, _b) => [
      "Don’t change either medicine on your own.",
      `Call ${a.providerName} or your regular doctor and ask whether your digoxin dose or level should be rechecked.`,
    ],
    warningSigns: "nausea, vision changes (yellow/green tint), confusion, or an irregular heartbeat",
  },
  {
    id: "ssri-nsaid",
    severity: "medium",
    problem: "increased bleeding risk",
    a: [...SSRIS, ...SNRIS],
    b: NSAIDS,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} together raise bleeding risk.`,
    explanation: (a, b) =>
      `${cap(a.name)} (an antidepressant) and ${b.name} (an anti-inflammatory/pain medicine) each make bleeding more likely, ` +
      `especially in the stomach. Together the risk is higher.`,
    whatToDo: (a, _b) => [
      "Avoid regular over-the-counter anti-inflammatory pain pills if you can.",
      `Ask ${a.providerName} or your pharmacist about a safer pain option and whether a stomach-protecting medicine is needed.`,
    ],
    warningSigns: "black or bloody stools, stomach pain, or vomiting blood",
  },
  {
    id: "clarithromycin-warfarin",
    severity: "high",
    problem: "serious bleeding",
    a: ["clarithromycin", "erythromycin"],
    b: ["warfarin"],
    summary: (a, b) => `${cap(a.name)} can make ${cap(b.name)} thin your blood too much.`,
    explanation: (a, b) =>
      `${cap(a.name)} (an antibiotic) raises the effect of ${b.name} (a blood thinner). ` +
      `This can make the blood too thin and cause dangerous bleeding.`,
    whatToDo: (a, b) => [
      "Don’t start the antibiotic without checking first.",
      `Call ${b.providerName} or ${a.providerName} and ask whether your blood thinner needs closer monitoring.`,
    ],
    warningSigns: "black or bloody stools, vomiting blood, easy bruising, or unusual bleeding",
  },
  {
    id: "potassium-potassium-sparing",
    severity: "high",
    problem: "high potassium (hyperkalemia)",
    a: ["potassium chloride", "klor-con", "potassium supplement"],
    b: POTASSIUM_SPARING,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} can raise potassium too high.`,
    explanation: (a, b) =>
      `A ${a.name} together with ${b.name} (a potassium-sparing medicine) can push potassium dangerously high, ` +
      `which can affect the heart rhythm.`,
    whatToDo: (a, _b) => [
      "Don’t take potassium supplements unless your doctor told you to.",
      `Call ${a.providerName} or your regular doctor and ask whether your potassium level should be checked.`,
    ],
    warningSigns: "muscle weakness, a slow or irregular heartbeat, numbness, or tingling",
  },
  {
    id: "maoi-other-serotonergic",
    severity: "high",
    problem: "serotonin syndrome",
    a: MAOIS,
    b: [...SEROTONERGIC_OTHER, ...TRIPTANS],
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} should not be taken together.`,
    explanation: (a, b) =>
      `${cap(a.name)} (an MAOI) and ${b.name} together can cause serotonin syndrome, ` +
      `a serious reaction from too much of the brain chemical serotonin.`,
    whatToDo: (a, _b) => [
      "Don’t take both medicines together.",
      `Call ${a.providerName} or your regular doctor today before your next dose.`,
    ],
    warningSigns: "agitation, a fast heartbeat, shivering, muscle twitching, or confusion",
  },
  {
    id: "triptan-ssri-snri",
    severity: "medium",
    problem: "serotonin syndrome",
    a: TRIPTANS,
    b: [...SSRIS, ...SNRIS],
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} can interact.`,
    explanation: (a, b) =>
      `${cap(a.name)} (a migraine medicine) and ${b.name} (an antidepressant) both raise serotonin. ` +
      `Used together they can, less commonly, lead to serotonin syndrome.`,
    whatToDo: (a, _b) => [
      "Don’t stop any medicine on your own.",
      `Mention both medicines to ${a.providerName} or your regular doctor.`,
    ],
    warningSigns: "agitation, a fast heartbeat, shivering, muscle twitching, or confusion",
  },
  {
    id: "warfarin-azole",
    severity: "high",
    problem: "serious bleeding",
    a: ["warfarin"],
    b: AZOLE_ANTIFUNGALS,
    summary: (a, b) => `${cap(b.name)} can make ${cap(a.name)} thin your blood too much.`,
    explanation: (a, b) =>
      `${cap(b.name)} (an antifungal) raises the effect of ${a.name} (a blood thinner), ` +
      `which can make the blood too thin and cause dangerous bleeding.`,
    whatToDo: (a, b) => [
      "Don’t start the antifungal without checking first.",
      `Call ${a.providerName} or ${b.providerName} and ask whether your blood thinner needs closer monitoring.`,
    ],
    warningSigns: "black or bloody stools, vomiting blood, easy bruising, or unusual bleeding",
  },
  {
    id: "ace-arb-combo",
    severity: "medium",
    problem: "kidney injury and high potassium",
    a: ["lisinopril", "enalapril", "ramipril", "benazepril", "captopril"],
    b: ["losartan", "valsartan", "candesartan", "irbesartan", "olmesartan"],
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} are usually not used together.`,
    explanation: (a, b) =>
      `${cap(a.name)} and ${b.name} work on the same blood-pressure system. ` +
      `Taking both adds little benefit and raises the risk of kidney injury, low blood pressure, and high potassium.`,
    whatToDo: (a, _b) => [
      "Don’t stop either medicine on your own.",
      `Call ${a.providerName} or your regular doctor to confirm both are meant to be taken.`,
    ],
    warningSigns: "dizziness, much less urine than usual, muscle weakness, or an irregular heartbeat",
  },
  {
    id: "fluoroquinolone-tizanidine",
    severity: "high",
    problem: "a dangerous drop in blood pressure and heavy sedation",
    a: ["ciprofloxacin", "fluvoxamine"],
    b: ["tizanidine"],
    summary: (a, b) => `${cap(a.name)} can raise ${cap(b.name)} to harmful levels.`,
    explanation: (a, b) =>
      `${cap(a.name)} blocks the enzyme that clears ${b.name} (a muscle relaxant). ` +
      `${cap(b.name)} can build up and cause very low blood pressure and heavy sedation.`,
    whatToDo: (a, b) => [
      "Don’t take these two together.",
      `Call ${b.providerName} or ${a.providerName} about a safer option.`,
    ],
    warningSigns: "dizziness, fainting, extreme drowsiness, or a slow heartbeat",
  },
  {
    id: "spironolactone-nsaid",
    severity: "medium",
    problem: "high potassium and kidney strain",
    a: ["spironolactone", "eplerenone", "amiloride", "triamterene"],
    b: NSAIDS,
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} can raise potassium and strain kidneys.`,
    explanation: (a, b) =>
      `${cap(a.name)} (a potassium-sparing diuretic) and ${b.name} (an anti-inflammatory/pain medicine) together ` +
      `can raise potassium and reduce kidney function.`,
    whatToDo: (a, _b) => [
      "Avoid regular over-the-counter anti-inflammatory pain pills if you can.",
      `Ask ${a.providerName} or your pharmacist about a safer pain option.`,
    ],
    warningSigns: "muscle weakness, an irregular heartbeat, or much less urine than usual",
  },
  {
    id: "clarithromycin-statin-broad",
    severity: "high",
    problem: "muscle breakdown (rhabdomyolysis)",
    a: ["clarithromycin", "erythromycin", "telithromycin"],
    b: ["simvastatin", "lovastatin", "atorvastatin"],
    summary: (a, b) => `${cap(a.name)} can raise ${cap(b.name)} to harmful levels.`,
    explanation: (a, b) =>
      `${cap(a.name)} (an antibiotic) blocks the enzyme that clears ${b.name} (a cholesterol medicine), ` +
      `letting it build up and risk serious muscle breakdown.`,
    whatToDo: (a, b) => [
      "Don’t start the antibiotic without checking first.",
      `Call ${b.providerName} or ${a.providerName} and ask whether to pause your statin during the antibiotic course.`,
    ],
    warningSigns: "unexplained muscle pain, weakness, or dark/cola-colored urine",
  },
  {
    id: "amiodarone-warfarin",
    severity: "high",
    problem: "serious bleeding",
    a: ["amiodarone"],
    b: ["warfarin"],
    summary: (a, b) => `${cap(a.name)} can make ${cap(b.name)} thin your blood too much.`,
    explanation: (a, b) =>
      `${cap(a.name)} (a heart-rhythm medicine) raises the effect of ${b.name} (a blood thinner), ` +
      `which can make the blood too thin and cause dangerous bleeding.`,
    whatToDo: (a, b) => [
      "Don’t change either medicine on your own.",
      `Call ${b.providerName} or ${a.providerName} and ask whether your blood thinner needs closer monitoring.`,
    ],
    warningSigns: "black or bloody stools, vomiting blood, easy bruising, or unusual bleeding",
  },
  {
    id: "opioid-gabapentinoid",
    severity: "high",
    problem: "dangerously slowed breathing",
    a: OPIOIDS,
    b: ["gabapentin", "pregabalin"],
    summary: (a, b) => `${cap(a.name)} and ${cap(b.name)} together can slow your breathing.`,
    explanation: (a, b) =>
      `${cap(a.name)} (an opioid pain medicine) and ${b.name} both calm the nervous system. ` +
      `Together they can cause heavy sedation and dangerously slowed breathing.`,
    whatToDo: (a, _b) => [
      "Don’t increase either medicine without medical advice.",
      `Call ${a.providerName} or your regular doctor to review the combination.`,
    ],
    warningSigns: "extreme drowsiness, very slow or shallow breathing, or being hard to wake",
  },
  {
    id: "methotrexate-trimethoprim",
    severity: "high",
    problem: "methotrexate toxicity and low blood counts",
    a: ["methotrexate"],
    b: ["trimethoprim", "sulfamethoxazole", "bactrim", "co-trimoxazole"],
    summary: (a, b) => `${cap(b.name)} can make ${cap(a.name)} dangerously toxic.`,
    explanation: (a, b) =>
      `${cap(b.name)} (an antibiotic) and ${a.name} both lower folate, so together they can severely drop blood counts ` +
      `and cause methotrexate toxicity.`,
    whatToDo: (a, b) => [
      "Don’t start this antibiotic with methotrexate without checking first.",
      `Call ${a.providerName} or ${b.providerName} about a safer antibiotic.`,
    ],
    warningSigns: "fever, mouth sores, severe fatigue, easy bruising, or shortness of breath",
  },
];

const norm = (s: string) => s.toLowerCase();
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const matchesClass = (med: MedWithProvenance, klass: InteractionMatch): boolean =>
  klass.some((needle) => norm(med.name).includes(needle));

/** Build the involved-meds list in a stable, severity-appropriate order. */
function involvedOf(a: MedWithProvenance, b: MedWithProvenance) {
  return [
    { name: `${a.name} ${a.dose}`.trim(), provider: a.providerName, date: a.date },
    { name: `${b.name} ${b.dose}`.trim(), provider: b.providerName, date: b.date },
  ];
}

/** Provenance sentence: when providers differ, neither record saw the other. */
function provenanceSentence(a: MedWithProvenance, b: MedWithProvenance): string {
  const differentProviders = norm(a.providerName) !== norm(b.providerName);
  if (differentProviders) {
    return (
      ` ${a.providerName} started your ${a.name} on ${fmt(a.date)}, and ${b.providerName} added ${b.name} on ` +
      `${fmt(b.date)} — neither record showed the other.`
    );
  }
  return ` Both were recorded by ${a.providerName} (${a.name} on ${fmt(a.date)}, ${b.name} on ${fmt(b.date)}).`;
}

/** Build a patient-facing call script generalized from the original template. */
function scriptFor(a: MedWithProvenance, b: MedWithProvenance, problem: string): string {
  const target = norm(a.providerName) !== norm(b.providerName) ? b.providerName : a.providerName;
  return (
    `Hi, I’m taking ${a.name} ${a.dose} from ${a.providerName}, and I’m also taking ${b.name} ${b.dose}` +
    `${norm(a.providerName) !== norm(b.providerName) ? ` from ${b.providerName}` : ""}. ` +
    `I’m worried about ${problem} — ${target ? `can we` : "can someone"} review whether these are safe together?`
  );
}

function buildAlert(
  spec: Interaction,
  a: MedWithProvenance,
  b: MedWithProvenance,
  id: string,
): Alert {
  return {
    id,
    severity: spec.severity,
    title: "Two of your medicines may not be safe together",
    summary: spec.summary(a, b),
    explanation: spec.explanation(a, b) + provenanceSentence(a, b),
    whatToDo: [
      ...spec.whatToDo(a, b),
      `Get urgent help if you feel ${spec.warningSigns}.`,
    ],
    script: scriptFor(a, b, spec.problem),
    involved: involvedOf(a, b),
  };
}

/**
 * General, deterministic interaction check. For every unordered pair of meds,
 * emit one Alert per interaction type they trigger. Pure: no network, no I/O.
 *
 * Signature is unchanged: checkConflicts(meds: MedWithProvenance[]): Alert[].
 */
export function checkConflicts(meds: MedWithProvenance[]): Alert[] {
  const alerts: Alert[] = [];
  // De-dupe per (interaction, unordered med pair). Keyed by index pair so two
  // distinct meds with the same name are still treated separately.
  const seen = new Set<string>();
  // Track how many alerts share each base id so we can keep the first stable.
  const idCounts = new Map<string, number>();

  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      const m1 = meds[i];
      const m2 = meds[j];
      for (const spec of INTERACTIONS) {
        // Try both orientations: which med fills side `a` vs side `b`.
        let a: MedWithProvenance | null = null;
        let b: MedWithProvenance | null = null;
        if (matchesClass(m1, spec.a) && matchesClass(m2, spec.b)) {
          a = m1;
          b = m2;
        } else if (matchesClass(m2, spec.a) && matchesClass(m1, spec.b)) {
          a = m2;
          b = m1;
        }
        if (!a || !b) continue;

        const pairKey = `${spec.id}::${Math.min(i, j)}-${Math.max(i, j)}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        // Stable id: first occurrence of a base id keeps the clean base id
        // (so getAlert("serotonin-syndrome") keeps working); later collisions
        // get a deterministic suffix from the two ingredient slugs.
        const count = idCounts.get(spec.id) ?? 0;
        idCounts.set(spec.id, count + 1);
        const id =
          count === 0
            ? spec.id
            : `${spec.id}-${slug(a.name)}-${slug(b.name)}`;

        alerts.push(buildAlert(spec, a, b, id));
      }
    }
  }

  // High severity first; stable, deterministic tie-break by id.
  return alerts.sort((x, y) => {
    const s = SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity];
    return s !== 0 ? s : x.id.localeCompare(y.id);
  });
}
