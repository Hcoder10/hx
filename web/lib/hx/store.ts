import { Encounter, Provider } from "./model";
import { providers as seedProviders, encounters as seedEncounters } from "./seed-data";

// Runtime additions (e.g. a visit added by the voice agent). In-memory: persists
// for the life of the server process — enough for the demo. (Production: Hx Hub.)
const runtimeProviders: Record<string, Provider> = {};
const runtimeEncs: Encounter[] = [];

export function allProviders(): Record<string, Provider> {
  return { ...seedProviders, ...runtimeProviders };
}

export function ensureProvider(input: { name: string; role?: string; org?: string }): string {
  const existing = Object.entries(allProviders()).find(
    ([, p]) => p.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (existing) return existing[0];
  const id = "rt-" + (Object.keys(runtimeProviders).length + 1);
  runtimeProviders[id] = {
    id,
    name: input.name,
    role: input.role || "Provider",
    org: input.org || "",
    email: `${id}@hx.local`,
  };
  return id;
}

export function addEncounter(e: Encounter) {
  runtimeEncs.push(e);
}

export function allEncounters(): Encounter[] {
  return [...seedEncounters, ...runtimeEncs];
}
