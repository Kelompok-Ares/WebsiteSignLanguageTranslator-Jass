import { logger } from './logger';

const modelLog = logger;

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
const DEFAULT_URL = 'https://finite-maximum-unroll.ngrok-free.dev';

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
        modelLog.warn('Health check failed', { status: response.status });
        return null;
      }
      const data: HealthStatus = await response.json();
      this._isConnected = true;

      // Sync model state from backend
      if (data.model_trained) {
        this._labels = data.labels;
        this._isBuilt = true;
      }

      modelLog.debug('Health check OK', { trained: data.model_trained, labels: data.labels });
      return data;
    } catch (e) {
      this._isConnected = false;
      modelLog.error('Health check error', e);
      return null;
    }
  }

  async build(labels: string[]): Promise<void> {
    this._labels = labels;
    this._isBuilt = true;
  }

  private ws: WebSocket | null = null;
  private onPrediction: ((result: PredictionResult) => void) | null = null;
  private wsReconnectAttempts = 0;
  private wsMaxReconnectAttempts = 3;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _wsIntentionalClose = false;

  connectWS(onPred: (res: PredictionResult) => void) {
    if (!this._backendUrl) return;
    
    this._wsIntentionalClose = false;
    this.onPrediction = onPred;
    this._connectWSInternal();
  }

  private _connectWSInternal() {
    // Convert http/https to ws/wss
    const wsUrl = this._backendUrl.replace(/^http/, 'ws') + '/ws/predict';
    
    if (this.ws) {
      this.ws.close();
    }
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.wsReconnectAttempts = 0;
      modelLog.info('WebSocket connected', { url: wsUrl });
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (this.onPrediction) this.onPrediction(data);
      } catch (err) {
        modelLog.error('Failed to parse WS message', err);
      }
    };

    this.ws.onerror = (e) => {
      modelLog.error('WebSocket error', e);
    };

    this.ws.onclose = () => {
      if (this._wsIntentionalClose) return;

      if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 8000);
        this.wsReconnectAttempts++;
        modelLog.info(`WebSocket closed, reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})`);
        this.wsReconnectTimer = setTimeout(() => this._connectWSInternal(), delay);
      } else {
        modelLog.warn('WebSocket max reconnect attempts reached');
      }
    };
  }

  sendFrame(frame: { timestamp: number; landmarks: number[]; tracked: boolean }) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  disconnectWS() {
    this._wsIntentionalClose = true;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onPrediction = null;
    this.wsReconnectAttempts = 0;
  }

  async predict(buffer: { timestamp: number; landmarks: number[]; tracked: boolean }[]): Promise<PredictionResult | null> {
    // Kept for backward compatibility if needed
    if (!this._backendUrl) return null;
    try {
      const response = await fetch(`${this._backendUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buffer })
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      modelLog.error('Predict error', e);
      return null;
    }
  }

  // Model tersimpan di backend (Colab) via joblib,
  // fungsi-fungsi ini dipertahankan agar tidak mematahkan kode lain
  async saveDownload(): Promise<void> {}
  async saveToFiles(): Promise<any> { return null; }
  async loadFromFiles(..._args: any[]): Promise<void> {}

  async exportModel(): Promise<void> {
    if (!this._backendUrl) {
      throw new Error('Backend URL belum diatur!');
    }
    const response = await fetch(`${this._backendUrl}/model/export`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Gagal mengunduh model' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importModel(file: File): Promise<boolean> {
    if (!this._backendUrl) {
      throw new Error('Backend URL belum diatur!');
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${this._backendUrl}/model/import`, {
      method: 'POST',
      headers: {
        'X-Train-Secret': process.env.NEXT_PUBLIC_TRAIN_SECRET || 'change-this-secret'
      },
      body: formData,
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Gagal mengimpor model' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    
    const resData = await response.json();
    if (resData.success) {
      this._labels = resData.labels;
      this._isBuilt = true;
      return true;
    }
    return false;
  }
  dispose(): void { 
    this._isBuilt = false; 
  }
}
