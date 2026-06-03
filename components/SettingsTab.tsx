'use client';
import { useState } from 'react';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import { createEmptyDataset, importDatasetJSON, exportDatasetJSON, type DatasetState } from '@/lib/dataset';
import { readFileAsText } from '@/lib/utils';
import type { SignModel, HealthStatus } from '@/lib/model';

interface Props {
  dataset: DatasetState;
  onDatasetChange: (d: DatasetState) => void;
  model: SignModel;
  modelTrained: boolean;
  onModelTrained: () => void;
  backendUrl: string;
  onBackendUrlChange: (url: string) => void;
  backendConnected: boolean;
}

export default function SettingsTab({
  dataset, onDatasetChange, model, modelTrained, onModelTrained,
  backendUrl, onBackendUrlChange, backendConnected,
}: Props) {
  const {
    minDetectionConfidence, setMinDetectionConfidence,
  } = useMediaPipe();

  const [toast, setToast] = useState('');
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [healthInfo, setHealthInfo] = useState<HealthStatus | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const handleTestConnection = async () => {
    const url = urlInput.trim().replace(/\/+$/, '');
    if (!url) { showToast('❌ Enter backend URL first'); return; }

    setIsTesting(true);
    onBackendUrlChange(url);

    // Small delay to let the model update its URL
    await new Promise(r => setTimeout(r, 100));

    const health = await model.checkHealth();
    setIsTesting(false);

    if (health) {
      setHealthInfo(health);
      showToast('✅ Backend connected!');
      if (health.model_trained) {
        onModelTrained();
      }
    } else {
      setHealthInfo(null);
      showToast('❌ Failed to connect to backend. Check Colab & URL.');
    }
  };

  const handleExportDataset = () => {
    const json = exportDatasetJSON(dataset);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'signlang-dataset.json' }).click();
    URL.revokeObjectURL(url);
    showToast('✅ Dataset exported');
  };

  const handleImportDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    const imported = importDatasetJSON(text);
    if (imported) {
      onDatasetChange(imported);
      showToast(`✅ Dataset imported: ${imported.samples.length} samples, ${imported.labels.length} labels`);
    } else {
      showToast('❌ Failed to import dataset — check format');
    }
    e.target.value = '';
  };

  const handleClearDataset = () => {
    if (!confirm('Clear all dataset data? This action cannot be undone.')) return;
    onDatasetChange(createEmptyDataset());
    showToast('✅ Dataset cleared');
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 24 }}>
      <span className="section-title" style={{ display: 'block', marginBottom: 12, paddingLeft: 4 }}>{title}</span>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        {children}
      </div>
    </div>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
      <div>{children}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column' }} className="fade-in">

      {toast && (
        <div style={{ padding: '10px 14px', background: 'var(--accent-blue-light)', borderRadius: 10, fontSize: 13, color: 'var(--accent-blue)', fontWeight: 500, marginBottom: 16 }}>
          {toast}
        </div>
      )}

      {/* ── Backend Server ── */}
      <Section title="🌐 Backend Server (Colab)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label-text">Backend URL (e.g. http://12.34.56.78:5000)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestConnection()}
                placeholder="http://12.34.56.78:5000"
              />
              <button
                className="btn btn-primary"
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? '⏳ ...' : '🔗 Connect'}
              </button>
            </div>
          </div>

          {/* Connection status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderRadius: 10,
            background: backendConnected ? 'var(--accent-green-light)' : 'var(--accent-red-light)',
            border: `1px solid ${backendConnected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)',
              boxShadow: backendConnected ? '0 0 10px rgba(16,185,129,0.5)' : '0 0 10px rgba(239,68,68,0.5)',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {backendConnected ? 'Connected' : 'Disconnected'}
              </div>
              {healthInfo && backendConnected && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 500 }}>
                  Model: {healthInfo.model_trained ? `Trained (${healthInfo.labels.join(', ')})` : 'Not trained'}
                  {healthInfo.last_train_samples > 0 && ` • ${healthInfo.last_train_samples} samples`}
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 8 }}>
            💡 Run the <b>SignLanguage_Backend.ipynb</b> notebook in Google Colab, then paste the URL above.
          </div>
        </div>
      </Section>

      {/* ── Sensitivity ── */}
      <Section title="🎚 Model Sensitivity">
        <Row label={`Minimum Detection Confidence: ${(minDetectionConfidence * 100).toFixed(0)}%`}>
          <input
            type="range" min={0.3} max={0.99} step={0.01}
            value={minDetectionConfidence}
            onChange={(e) => setMinDetectionConfidence(+e.target.value)}
            className="slider"
            style={{ width: 180, '--pct': `${((minDetectionConfidence - 0.3) / 0.69) * 100}%` } as React.CSSProperties}
          />
        </Row>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Higher values reduce false positives but require clearer hand visibility.</p>
      </Section>

      {/* ── Model Status ── */}
      <Section title="🧠 Model Info">
        <div style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text-secondary)', padding: '6px 0' }}>
          <span style={{ fontWeight: 500 }}>Status: </span>
          <span style={{ color: modelTrained ? 'var(--accent-green)' : 'var(--accent-yellow)', fontWeight: 600 }}>
            {modelTrained ? '✓ Model trained and ready' : 'Model not trained'}
          </span>
        </div>
        {modelTrained && model.labels.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 500 }}>
            Labels: {model.labels.join(', ')}
          </div>
        )}
      </Section>

      {/* ── Dataset ── */}
      <Section title="💾 Local Dataset">
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, padding: '16px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-blue)' }}>{dataset.samples.length}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Samples</div>
          </div>
          <div style={{ flex: 1, padding: '16px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-purple)' }}>{dataset.labels.length}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Labels</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={handleExportDataset} style={{ flex: 1 }}>📤 Export JSON</button>
          <label className="btn btn-ghost" style={{ flex: 1, cursor: 'pointer' }}>
            📥 Import JSON
            <input type="file" accept=".json" onChange={handleImportDataset} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-danger" onClick={handleClearDataset} style={{ flex: 1 }}>🗑 Clear Data</button>
        </div>
      </Section>
    </div>
  );
}
