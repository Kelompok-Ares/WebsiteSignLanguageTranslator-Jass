'use client';
import { useState, useRef } from 'react';
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
    cameras, selectedCameraId, setSelectedCameraId,
    drawOverlay, setDrawOverlay,
    minDetectionConfidence, setMinDetectionConfidence,
  } = useMediaPipe();

  const [toast, setToast] = useState('');
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [healthInfo, setHealthInfo] = useState<HealthStatus | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const handleTestConnection = async () => {
    const url = urlInput.trim().replace(/\/+$/, '');
    if (!url) { showToast('❌ Masukkan URL backend terlebih dahulu'); return; }

    setIsTesting(true);
    onBackendUrlChange(url);

    // Small delay to let the model update its URL
    await new Promise(r => setTimeout(r, 100));

    const health = await model.checkHealth();
    setIsTesting(false);

    if (health) {
      setHealthInfo(health);
      showToast('✅ Backend terkoneksi!');
      if (health.model_trained) {
        onModelTrained();
      }
    } else {
      setHealthInfo(null);
      showToast('❌ Gagal terkoneksi ke backend. Pastikan Colab berjalan dan URL benar.');
    }
  };

  const handleExportDataset = () => {
    const json = exportDatasetJSON(dataset);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'signlang-dataset.json' }).click();
    URL.revokeObjectURL(url);
    showToast('✅ Dataset diekspor');
  };

  const handleImportDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    const imported = importDatasetJSON(text);
    if (imported) {
      onDatasetChange(imported);
      showToast(`✅ Dataset diimpor: ${imported.samples.length} sampel, ${imported.labels.length} label`);
    } else {
      showToast('❌ Gagal mengimpor dataset — pastikan format benar');
    }
    e.target.value = '';
  };

  const handleClearDataset = () => {
    if (!confirm('Hapus semua data dataset? Tindakan ini tidak bisa dibatalkan.')) return;
    onDatasetChange(createEmptyDataset());
    showToast('✅ Dataset dihapus');
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="glass" style={{ padding: 18 }}>
      <span className="section-title" style={{ display: 'block', marginBottom: 14 }}>{title}</span>
      {children}
    </div>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <div>{children}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }} className="fade-in">

      {toast && (
        <div className="glass" style={{ padding: '10px 14px', borderColor: 'rgba(0,212,255,0.3)', fontSize: 13, color: 'var(--accent-cyan)' }}>
          {toast}
        </div>
      )}

      {/* ── Backend Server ── */}
      <Section title="🌐 Backend Server (Google Colab)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label-text">URL Backend (contoh: http://12.34.56.78:5000)</label>
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
                style={{ whiteSpace: 'nowrap' }}
              >
                {isTesting ? '⏳ ...' : '🔗 Test'}
              </button>
            </div>
          </div>

          {/* Connection status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 6,
            background: backendConnected ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${backendConnected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: backendConnected ? '#10b981' : '#ef4444',
              boxShadow: backendConnected ? '0 0 8px #10b981' : '0 0 8px #ef4444',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: backendConnected ? '#10b981' : '#f87171' }}>
                {backendConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
              {healthInfo && backendConnected && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Model: {healthInfo.model_trained ? `Terlatih (${healthInfo.labels.join(', ')})` : 'Belum dilatih'}
                  {healthInfo.last_train_samples > 0 && ` • ${healthInfo.last_train_samples} sampel terakhir`}
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            💡 Jalankan notebook <b>SignLanguage_Backend.ipynb</b> di Google Colab, lalu paste URL di atas.
          </div>
        </div>
      </Section>

      {/* ── Camera ── */}
      <Section title="🎥 Kamera">
        <Row label="Pilih Kamera">
          <select
            className="input" style={{ width: 220 }}
            value={selectedCameraId}
            onChange={(e) => setSelectedCameraId(e.target.value)}
          >
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Kamera ${i + 1}`}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Tampilkan Overlay Landmark">
          <button
            className={`btn ${drawOverlay ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDrawOverlay(!drawOverlay)}
            style={{ minWidth: 80 }}
          >
            {drawOverlay ? 'Aktif' : 'Nonaktif'}
          </button>
        </Row>
      </Section>

      {/* ── Sensitivity ── */}
      <Section title="🎚 Sensitivitas Model">
        <Row label={`Keyakinan Minimum Deteksi: ${(minDetectionConfidence * 100).toFixed(0)}%`}>
          <input
            type="range" min={0.3} max={0.99} step={0.01}
            value={minDetectionConfidence}
            onChange={(e) => setMinDetectionConfidence(+e.target.value)}
            className="slider"
            style={{ width: 160, '--pct': `${((minDetectionConfidence - 0.3) / 0.69) * 100}%` } as React.CSSProperties}
          />
        </Row>
      </Section>

      {/* ── Model Status ── */}
      <Section title="🧠 Model">
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-secondary)', padding: '6px 0' }}>
          <span>Status: </span>
          <span style={{ color: modelTrained ? 'var(--accent-green)' : 'var(--accent-amber)', fontWeight: 600 }}>
            {modelTrained ? '✓ Model terlatih dan siap digunakan' : 'Model belum dilatih'}
          </span>
        </div>
        {modelTrained && model.labels.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Labels: {model.labels.join(', ')}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          💡 Model disimpan di server Google Colab. Selama notebook berjalan, model akan tetap tersedia.
        </div>
      </Section>

      {/* ── Dataset ── */}
      <Section title="💾 Dataset">
        <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
          <div className="glass" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-cyan)' }}>{dataset.samples.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sampel</div>
          </div>
          <div className="glass" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-purple)' }}>{dataset.labels.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Label</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={handleExportDataset}>📤 Ekspor Dataset</button>
          <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
            📥 Impor Dataset
            <input type="file" accept=".json" onChange={handleImportDataset} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-danger" onClick={handleClearDataset}>🗑 Hapus Dataset</button>
        </div>
      </Section>
    </div>
  );
}
