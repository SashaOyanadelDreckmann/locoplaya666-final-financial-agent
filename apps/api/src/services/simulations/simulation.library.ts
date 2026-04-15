import type { SimulationArtifact } from './simulation.service';

const ARTIFACT_INDEX = new Map<string, SimulationArtifact[]>();

export function readIndex(userId: string): { artifacts: SimulationArtifact[] } {
  return { artifacts: [...(ARTIFACT_INDEX.get(userId) ?? [])] };
}

export function upsertArtifact(userId: string, artifact: SimulationArtifact) {
  const current = ARTIFACT_INDEX.get(userId) ?? [];
  const next = current.filter((item) => item.id !== artifact.id);
  next.unshift(artifact);
  ARTIFACT_INDEX.set(userId, next);
}

export function markSaved(userId: string, id: string, saved: boolean) {
  const current = ARTIFACT_INDEX.get(userId) ?? [];
  const next = current.map((item) => (item.id === id ? { ...item, saved } : item));
  ARTIFACT_INDEX.set(userId, next);
  return next.find((item) => item.id === id);
}
