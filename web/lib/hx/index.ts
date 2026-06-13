import { allEncounters, allProviders } from "./store";
import { Alert, Encounter, MedWithProvenance, Provider } from "./model";
import { checkConflicts } from "./conflicts";

export * from "./model";
export { getLog as getRepoLog, commitEncounter } from "./repo";
export type { RepoCommit } from "./repo";
export { addEncounter, ensureProvider, allProviders, allEncounters } from "./store";

export type TimelineItem = Encounter & { provider: Provider };

function withProvider(e: Encounter): TimelineItem {
  const provider =
    allProviders()[e.providerId] ?? { id: e.providerId, name: "Unknown", role: "", org: "", email: "" };
  return { ...e, provider };
}

export function getTimeline(): TimelineItem[] {
  return [...allEncounters()].sort((a, b) => b.date.localeCompare(a.date)).map(withProvider);
}

export function getVisit(id: string): TimelineItem | null {
  const e = allEncounters().find((x) => x.id === id);
  return e ? withProvider(e) : null;
}

export function getMedications(): MedWithProvenance[] {
  const out: MedWithProvenance[] = [];
  for (const e of [...allEncounters()].sort((a, b) => a.date.localeCompare(b.date))) {
    const prov = allProviders()[e.providerId];
    for (const m of e.addMedications ?? []) {
      out.push({ ...m, providerName: prov?.name ?? "Unknown", providerRole: prov?.role ?? "", date: e.date });
    }
  }
  return out;
}

export function getAlerts(): Alert[] {
  return checkConflicts(getMedications());
}

export function getAlert(id: string): Alert | null {
  return getAlerts().find((a) => a.id === id) ?? null;
}
