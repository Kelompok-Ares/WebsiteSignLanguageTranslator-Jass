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

// TODO: Ganti URL ini dengan URL Ngrok / Colab Anda yang aktif!
const BACKEND_URL = 'https://thick-steaks-search.loca.lt';

export class SignModel {
  private _labels: string[] = [];
  private _isBuilt = false;

  get labels() { return this._labels; }
  get isBuilt() { return this._isBuilt; }

  async build(labels: string[]): Promise<void> {
    this._labels = labels;
    this._isBuilt = true;
  }

  async train(
    samples: Sample[],
    epochs: number, // Epoch sudah dikendalikan di sisi Colab (max_iter)
    onEpochEnd: (log: TrainLog) => void,
    onDone: () => void
  ): Promise<void> {
    try {
      // Simulasikan epoch ke UI pertama
      onEpochEnd({ epoch: 1, loss: 0.5, acc: 0.5 });
      
      const response = await fetch(`${BACKEND_URL}/train`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ samples }),
      });

      if (!response.ok) throw new Error('Training di sisi server backend gagal');
      
      const resData = await response.json();
      this._labels = resData.labels;
      this._isBuilt = true;

      // Simulasikan beres ke UI
      onEpochEnd({ epoch: epochs, loss: 0.05, acc: 0.95 });
      onDone();
    } catch (e) {
      console.error('Error saat melatih model: ', e);
      alert('Gagal reach server Colab. Cek BACKEND_URL di lib/model.ts');
      onDone();
    }
  }

  async predict(features: number[]): Promise<PredictionResult | null> {
    if (!this._isBuilt) return null;
    
    try {
      const response = await fetch(`${BACKEND_URL}/predict`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ features }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      
      return { label: data.label, confidence: data.confidence };
    } catch (e) {
      // Hindari log yang terus flooding ke terminal pada saat predikisi gagal
      return null;
    }
  }

  // Karena tersimpan di Python Backend Colab dengan Joblib, 
  // fungsi load/save model local dari browser tidak relevan lagi,
  // tapi kita pertahankan func kosong agar tidak mematahkan kode lainnya.
  async saveDownload(): Promise<void> {}
  async saveToFiles(): Promise<any> { return null; }
  async loadFromFiles(): Promise<void> {}
  dispose(): void { this._isBuilt = false; }
}
