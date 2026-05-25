'use client';
import { useState, useRef } from 'react';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import { createEmptyDataset, importDatasetJSON, exportDatasetJSON, type DatasetState } from '@/lib/dataset';
import { readFileAsText } from '@/lib/utils';
import type { SignModel } from '@/lib/model';

interface Props {
  dataset: DatasetState;
  onDatasetChange: (d: DatasetState) => void;
  model: SignModel;
  modelTrained: boolean;
  onModelTrained: () => void;
}

export default function SettingsTab({ dataset, onDatasetChange, model, modelTrained, onModelTrained }: Props) {
  const {
    cameras, selectedCameraId, setSelectedCameraId,
    drawOverlay, setDrawOverlay,
    minDetectionConfidence, setMinDetectionConfidence,
  } = useMediaPipe();

  const [toast, setToast] = useState('');
  const topoFileRef = useRef<HTMLInputElement>(null);
  const weightsFileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const handleExportModel = async () => {
    if (!modelTrained) { showToast('Model belum dilatih'); return; }
    await model.saveDownload();
    showToast('✅ Model diunduh (topology + weights)');
  };

  const handleImportModel = async () => {
    const topoFile = topoFileRef.current?.files?.[0];
    const weightsFile = weightsFileRef.current?.files?.[0];
    if (!topoFile || !weightsFile) { showToast('Pilih file topology (.json) dan weights (.bin)'); return; }
    const labelsRaw = prompt('Masukkan label model (pisahkan dengan koma):');
    if (!labelsRaw) return;
    const labels = labelsRaw.split(',').map((l) => l.trim().toUpperCase()).filter(Boolean);
    await model.loadFromFiles(topoFile, weightsFile, labels);
    onModelTrained();
    showToast('✅ Model berhasil dimuat');
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

      {/* ── Model Export/Import ── */}
      <Section title="🧠 Model">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleExportModel} disabled={!modelTrained}>
              📤 Ekspor Model
            </button>
          </div>
          <div className="glass" style={{ padding: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label className="label-text">File Topology (.json)</label>
                <input ref={topoFileRef} type="file" accept=".json" className="input" style={{ padding: '6px 10px' }} />
              </div>
              <div>
                <label className="label-text">File Weights (.bin)</label>
                <input ref={weightsFileRef} type="file" accept=".bin" className="input" style={{ padding: '6px 10px' }} />
              </div>
              <button className="btn btn-ghost" onClick={handleImportModel}>
                📥 Muat Model
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-secondary)', padding: '6px 0' }}>
            <span>Status: </span>
            <span style={{ color: modelTrained ? 'var(--accent-green)' : 'var(--accent-amber)', fontWeight: 600 }}>
              {modelTrained ? '✓ Model terlatih dan siap digunakan' : 'Model belum dilatih'}
            </span>
          </div>
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
