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

type TF = typeof import('@tensorflow/tfjs');

export class SignModel {
  private tf: TF | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any = null;
  private _labels: string[] = [];

  get labels() { return this._labels; }
  get isBuilt() { return this.model !== null; }

  private async getTF(): Promise<TF> {
    if (!this.tf) this.tf = await import('@tensorflow/tfjs');
    return this.tf;
  }

  async build(labels: string[]): Promise<void> {
    const tf = await this.getTF();
    this._labels = labels;
    const n = labels.length;

    this.model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [63], units: 256, activation: 'relu' }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dense({ units: n, activation: 'softmax' }),
      ],
    });

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
  }

  async train(
    samples: Sample[],
    epochs: number,
    onEpochEnd: (log: TrainLog) => void,
    onDone: () => void
  ): Promise<void> {
    const tf = await this.getTF();
    if (!this.model) throw new Error('Model not built');

    const xs = tf.tensor2d(samples.map((s) => s.features));
    const indices = samples.map((s) => this._labels.indexOf(s.label));
    const ys = tf.oneHot(tf.tensor1d(indices, 'int32'), this._labels.length);

    await this.model.fit(xs, ys, {
      epochs,
      batchSize: 32,
      validationSplit: 0.15,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch: number, logs: Record<string, number>) => {
          onEpochEnd({
            epoch: epoch + 1,
            loss: +(logs.loss ?? 0).toFixed(4),
            acc: +(logs.acc ?? logs.accuracy ?? 0).toFixed(4),
            valLoss: logs.val_loss !== undefined ? +logs.val_loss.toFixed(4) : undefined,
            valAcc:
              logs.val_acc !== undefined
                ? +logs.val_acc.toFixed(4)
                : logs.val_accuracy !== undefined
                ? +logs.val_accuracy.toFixed(4)
                : undefined,
          });
        },
      },
    });

    xs.dispose();
    ys.dispose();
    onDone();
  }

  async predict(features: number[]): Promise<PredictionResult | null> {
    const tf = await this.getTF();
    if (!this.model || this._labels.length === 0) return null;

    const input = tf.tensor2d([features]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = this.model.predict(input) as any;
    const probs: Float32Array = await output.data();
    input.dispose();
    output.dispose();

    let maxIdx = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[maxIdx]) maxIdx = i;

    return { label: this._labels[maxIdx], confidence: probs[maxIdx] };
  }

  async saveDownload(): Promise<void> {
    if (!this.model) return;
    await this.model.save('downloads://sign-language-model');
  }

  async saveToFiles(): Promise<{ topology: string; weights: ArrayBuffer } | null> {
    if (!this.model) return null;
    const tf = await this.getTF();
    let topology = '';
    let weights: ArrayBuffer = new ArrayBuffer(0);
    await this.model.save(
      tf.io.withSaveHandler(async (artifacts: import('@tensorflow/tfjs').io.ModelArtifacts) => {
        topology = JSON.stringify(artifacts.modelTopology);
        weights = artifacts.weightData as ArrayBuffer;
        return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' as const } };
      })
    );
    return { topology, weights };
  }

  async loadFromFiles(topologyFile: File, weightsFile: File, labels: string[]): Promise<void> {
    const tf = await this.getTF();
    this.model = await tf.loadLayersModel(tf.io.browserFiles([topologyFile, weightsFile]));
    this._labels = labels;
  }

  dispose(): void {
    this.model?.dispose();
    this.model = null;
  }
}
