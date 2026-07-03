export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/**
 * Normalization Engine
 * 1. Translation Invariance: subtract wrist (landmark 0) → origin at (0,0,0)
 * 2. Scale Invariance: divide by max Euclidean distance
 * 3. Flatten: 21 points → 63-value 1D array
 */
export function normalizeLandmarks(landmarks: Landmark[]): number[] | null {
  if (!landmarks || landmarks.length !== 21) return null;
  const wrist = landmarks[0];

  // Step 1: Translate
  const translated = landmarks.map((lm) => ({
    x: lm.x - wrist.x,
    y: lm.y - wrist.y,
    z: lm.z - wrist.z,
  }));

  // Step 2: Scale — use bounding-box max dimension (matching backend's _normalize_single_hand)
  const xs = translated.map(lm => lm.x);
  const ys = translated.map(lm => lm.y);
  const zs = translated.map(lm => lm.z);
  const maxDist = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
  );
  if (maxDist < 1e-4) return new Array(63).fill(0);

  const scaled = translated.map((lm) => ({
    x: lm.x / maxDist,
    y: lm.y / maxDist,
    z: lm.z / maxDist,
  }));

  // Step 3: Flatten
  return scaled.flatMap((lm) => [lm.x, lm.y, lm.z]);
}

/**
 * Parse external JSON datasets into normalized feature arrays.
 * Supports flat arrays of {keypoints, label} and COCO-style annotations.
 */
export function parseExternalJSON(
  raw: unknown,
  labelKey = 'label'
): Array<{ features: number[][]; label: string }> | null {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const results: Array<{ features: number[][]; label: string }> = [];

    const processSample = (item: Record<string, unknown>) => {
      const label = String(item[labelKey] ?? item['class'] ?? item['gesture'] ?? '');
      if (!label) return;

      // Accept keypoints as array of {x,y,z} or flat number[]
      let kps: unknown[] | undefined =
        (item['keypoints'] as unknown[]) ??
        (item['landmarks'] as unknown[]) ??
        (item['points'] as unknown[]);
      if (!kps && Array.isArray(item['data'])) kps = item['data'] as unknown[];

      if (!kps || kps.length === 0) return;

      let landmarks: Landmark[];
      if (typeof kps[0] === 'number') {
        // Flat array [x0,y0,z0, x1,y1,z1, ...]
        const flat = kps as number[];
        if (flat.length < 63) return;
        landmarks = [];
        for (let i = 0; i < 21; i++) {
          landmarks.push({ x: flat[i * 3], y: flat[i * 3 + 1], z: flat[i * 3 + 2] });
        }
      } else {
        landmarks = (kps as Record<string, number>[]).slice(0, 21).map((p) => ({
          x: p.x ?? p[0] ?? 0,
          y: p.y ?? p[1] ?? 0,
          z: p.z ?? p[2] ?? 0,
        }));
      }

      const features = normalizeLandmarks(landmarks);
      if (features) {
        // Pad to 126-dim (two-hand format) with mask values for right hand
        const TWO_HAND_DIM = 126;
        const padded = features.length < TWO_HAND_DIM
          ? [...features, ...new Array(TWO_HAND_DIM - features.length).fill(-99.0)]
          : features;
        // Wrap as a single-frame sequence for LSTM compatibility
        results.push({ features: [padded], label });
      }
    };

    if (Array.isArray(data)) {
      data.forEach((item) => processSample(item as Record<string, unknown>));
    } else if (data && typeof data === 'object') {
      // COCO-style: { annotations: [...] }
      const ann = (data as Record<string, unknown>)['annotations'];
      if (Array.isArray(ann)) {
        ann.forEach((item) => processSample(item as Record<string, unknown>));
      } else {
        processSample(data as Record<string, unknown>);
      }
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}
