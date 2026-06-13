import { providers, encounters } from "./seed-data";
import { Alert, Encounter, MedWithProvenance, Provider } from "./model";
import { checkConflicts } from "./conflicts";

export * from "./model";
export { providers };
export { getLog as getRepoLog } from "./repo";
export type { RepoCommit } from "./repo";

export type TimelineItem = Encounter & { provider: Provider };

const asc = () => [...encounters].sort((a, b) => a.date.localeCompare(b.date));

export function getTimeline(): TimelineItem[] {
  return [...encounters]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({ ...e, provider: providers[e.providerId] }));
}

export function getVisit(id: string): TimelineItem | null {
  const e = encounters.find((x) => x.id === id);
  return e ? { ...e, provider: providers[e.providerId] } : null;
}

export function getMedications(): MedWithProvenance[] {
  const out: MedWithProvenance[] = [];
  for (const e of asc()) {
    const prov = providers[e.providerId];
    for (const m of e.addMedications ?? []) {
      out.push({ ...m, providerName: prov.name, providerRole: prov.role, date: e.date });
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
