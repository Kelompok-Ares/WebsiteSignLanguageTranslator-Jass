import type { Sample } from './dataset';

export interface TrainLog {
  epoch: number;
  loss: number;
  acc: number;
  valLoss?: number;
  valAcc?: number;
}

export interface PredictionResult {
  label: string;
  confidence: number;
}

export interface HealthStatus {
  status: string;
  model_trained: boolean;
  labels: string[];
  last_train_samples: number;
}

const STORAGE_KEY_URL = 'sl_backend_url';
const DEFAULT_URL = '';

function getStoredUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

function storeUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_URL, url);
  } catch {}
}

export class SignModel {
  private _labels: string[] = [];
  private _isBuilt = false;
  private _backendUrl: string;
  private _isConnected = false;

  get labels() { return this._labels; }
  get isBuilt() { return this._isBuilt; }
  get backendUrl() { return this._backendUrl; }
  get isConnected() { return this._isConnected; }

  constructor() {
    this._backendUrl = getStoredUrl();
  }

  setBackendUrl(url: string): void {
    // Remove trailing slash
    this._backendUrl = url.replace(/\/+$/, '');
    storeUrl(this._backendUrl);
  }

  async checkHealth(): Promise<HealthStatus | null> {
    if (!this._backendUrl) {
      this._isConnected = false;
      return null;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${this._backendUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        this._isConnected = false;
        return null;
      }
      const data: HealthStatus = await response.json();
      this._isConnected = true;

      // Sync model state from backend
      if (data.model_trained) {
        this._labels = data.labels;
        this._isBuilt = true;
      }

      return data;
    } catch {
      this._isConnected = false;
      return null;
    }
  }

  async build(labels: string[]): Promise<void> {
    this._labels = labels;
    this._isBuilt = true;
  }

  async train(
    samples: Sample[],
    epochs: number,
    onEpochEnd: (log: TrainLog) => void,
    onDone: () => void
  ): Promise<void> {
    if (!this._backendUrl) {
      alert('Backend URL belum diatur! Buka tab Settings untuk mengaturnya.');
      onDone();
      return;
    }

    try {
      const response = await fetch(`${this._backendUrl}/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ samples, epochs }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const resData = await response.json();
      this._labels = resData.labels;
      this._isBuilt = true;
      this._isConnected = true;

      // Emit real training logs from backend
      const logs: TrainLog[] = resData.logs || [];
      for (const log of logs) {
        onEpochEnd(log);
      }

      onDone();
    } catch (e) {
      console.error('Error saat melatih model: ', e);
      this._isConnected = false;
      alert(
        `Gagal melatih model di server backend.\n\n` +
        `Error: ${e instanceof Error ? e.message : String(e)}\n\n` +
        `Pastikan:\n` +
        `1. Notebook Google Colab sedang berjalan\n` +
        `2. URL backend benar (cek di Settings)`
      );
      onDone();
    }
  }

  async predict(features: number[]): Promise<PredictionResult | null> {
    if (!this._isBuilt || !this._backendUrl) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this._backendUrl}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ features }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;
      const data = await response.json();

      this._isConnected = true;
      return { label: data.label, confidence: data.confidence };
    } catch {
      // Silently fail on predict — avoid flooding console during real-time detection
      return null;
    }
  }

  // Model tersimpan di backend (Colab) via joblib,
  // fungsi-fungsi ini dipertahankan agar tidak mematahkan kode lain
  async saveDownload(): Promise<void> {}
  async saveToFiles(): Promise<any> { return null; }
  async loadFromFiles(..._args: any[]): Promise<void> {}
  dispose(): void { this._isBuilt = false; }
}
