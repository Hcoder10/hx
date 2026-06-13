import { Alert, MedWithProvenance } from "./model";

const SSRIS = ["sertraline", "fluoxetine", "citalopram", "escitalopram", "paroxetine"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

// Small curated safety set for the demo. The real product reasons with Grok
// across the whole record; here we deterministically catch the planted combo.
export function checkConflicts(meds: MedWithProvenance[]): Alert[] {
  const alerts: Alert[] = [];
  const ssri = meds.find((m) => SSRIS.some((s) => m.name.toLowerCase().includes(s)));
  const tramadol = meds.find((m) => m.name.toLowerCase().includes("tramadol"));

  if (ssri && tramadol) {
    alerts.push({
      id: "serotonin-syndrome",
      severity: "high",
      title: "Two of your medicines may not be safe together",
      summary: `${cap(tramadol.name)} and ${cap(ssri.name)} can interact.`,
      explanation:
        `Taking ${ssri.name} (an antidepressant) together with ${tramadol.name} (a pain medicine) raises the risk ` +
        `of a serious reaction called serotonin syndrome. ${ssri.providerName} started your ${ssri.name} on ` +
        `${fmt(ssri.date)}, and ${tramadol.providerName} added ${tramadol.name} on ${fmt(tramadol.date)} — ` +
        `neither record showed the other.`,
      whatToDo: [
        "Don’t stop any medicine on your own.",
        `Call ${tramadol.providerName} or your regular doctor today and mention both medicines.`,
        "Get urgent help if you feel agitation, a fast heartbeat, shivering, muscle twitching, or confusion.",
      ],
      script:
        `Hi, I’m taking ${ssri.name} ${ssri.dose} from ${ssri.providerName}, and I was just prescribed ` +
        `${tramadol.name} ${tramadol.dose}. I’m worried about serotonin syndrome — can we review whether these are safe together?`,
      involved: [
        { name: `${tramadol.name} ${tramadol.dose}`, provider: tramadol.providerName, date: tramadol.date },
        { name: `${ssri.name} ${ssri.dose}`, provider: ssri.providerName, date: ssri.date },
      ],
    });
  }
  return alerts;
}
