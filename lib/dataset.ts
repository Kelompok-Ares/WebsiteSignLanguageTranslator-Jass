export interface Sample {
  features: number[]; // 63-element normalized landmark array
  label: string;
}

export interface DatasetState {
  samples: Sample[];
  labels: string[];
}

const STORAGE_KEY = 'sl_dataset_v1';

export function createEmptyDataset(): DatasetState {
  return { samples: [], labels: [] };
}

export function addSample(state: DatasetState, sample: Sample): DatasetState {
  const labels = state.labels.includes(sample.label)
    ? state.labels
    : [...state.labels, sample.label].sort();
  return { samples: [...state.samples, sample], labels };
}

export function addSamples(state: DatasetState, newSamples: Sample[]): DatasetState {
  let next = state;
  for (const s of newSamples) next = addSample(next, s);
  return next;
}

export function removeLabel(state: DatasetState, label: string): DatasetState {
  return {
    samples: state.samples.filter((s) => s.label !== label),
    labels: state.labels.filter((l) => l !== label),
  };
}

export function getSampleCountByLabel(state: DatasetState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of state.samples) counts[s.label] = (counts[s.label] ?? 0) + 1;
  return counts;
}

export function exportDatasetJSON(state: DatasetState): string {
  return JSON.stringify({ version: 1, labels: state.labels, samples: state.samples }, null, 2);
}

export function importDatasetJSON(json: string): DatasetState | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.samples && Array.isArray(parsed.samples)) {
      const samples: Sample[] = parsed.samples.filter(
        (s: unknown) =>
          s &&
          typeof (s as Sample).label === 'string' &&
          Array.isArray((s as Sample).features) &&
          (s as Sample).features.length === 63
      );
      const labels: string[] = parsed.labels ?? Array.from(new Set(samples.map((s) => s.label))).sort();
      return { samples, labels };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveToStorage(state: DatasetState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function loadFromStorage(): DatasetState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DatasetState;
  } catch {
    return null;
  }
}
