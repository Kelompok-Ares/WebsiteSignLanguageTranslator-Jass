import type { PredictionResult } from './model';

/**
 * Sliding-window majority-vote smoother.
 * Prevents flickering by only emitting a prediction when it appears
 * in at least `threshold` fraction of the last `windowSize` frames.
 */
export class PredictionSmoother {
  private history: Array<PredictionResult | null> = [];
  private windowSize: number;
  private threshold: number;

  constructor(windowSize = 10, threshold = 0.6) {
    this.windowSize = windowSize;
    this.threshold = threshold;
  }

  push(result: PredictionResult | null): PredictionResult | null {
    this.history.push(result);
    if (this.history.length > this.windowSize) this.history.shift();

    const valid = this.history.filter(Boolean) as PredictionResult[];
    if (valid.length === 0) return null;

    // Count by label
    const counts: Record<string, { count: number; totalConf: number }> = {};
    for (const r of valid) {
      if (!counts[r.label]) counts[r.label] = { count: 0, totalConf: 0 };
      counts[r.label].count++;
      counts[r.label].totalConf += r.confidence;
    }

    let bestLabel = '';
    let bestCount = 0;
    for (const [label, { count }] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; bestLabel = label; }
    }

    if (bestCount / this.windowSize < this.threshold) return null;

    return {
      label: bestLabel,
      confidence: counts[bestLabel].totalConf / counts[bestLabel].count,
    };
  }

  reset() { this.history = []; }
  setWindowSize(n: number) { this.windowSize = n; }
}

/** Hand skeleton connections (MediaPipe 21-point layout) */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],           // Index
  [5, 9], [9, 10], [10, 11], [11, 12],      // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],    // Ring
  [13, 17], [17, 18], [18, 19], [19, 20],   // Pinky
  [0, 17],                                   // Palm base
];

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number }>,
  width: number,
  height: number
): void {
  // Draw connections
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00d4ff';
  ctx.shadowBlur = 8;

  for (const [a, b] of HAND_CONNECTIONS) {
    const la = landmarks[a], lb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(la.x * width, la.y * height);
    ctx.lineTo(lb.x * width, lb.y * height);
    ctx.stroke();
  }

  // Draw joint dots
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const isFingerTip = [4, 8, 12, 16, 20].includes(i);
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, isFingerTip ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isFingerTip ? '#7c3aed' : '#00d4ff';
    ctx.shadowColor = isFingerTip ? '#7c3aed' : '#00d4ff';
    ctx.shadowBlur = 12;
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
