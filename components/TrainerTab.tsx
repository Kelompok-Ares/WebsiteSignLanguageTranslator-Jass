'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import { normalizeLandmarks } from '@/lib/normalization';
import { parseExternalJSON } from '@/lib/normalization';
import { readFileAsText } from '@/lib/utils';
import {
  addSample, addSamples, removeLabel, getSampleCountByLabel,
  importDatasetJSON, exportDatasetJSON, type DatasetState, type Sample,
} from '@/lib/dataset';
import type { SignModel, TrainLog } from '@/lib/model';

interface Props {
  dataset: DatasetState;
  onDatasetChange: (d: DatasetState) => void;
  model: SignModel;
  onModelTrained: () => void;
  backendConnected: boolean;
}

export default function TrainerTab({ dataset, onDatasetChange, model, onModelTrained, backendConnected }: Props) {
  const { frameCallbackRef, isHandDetected, landmarksRef } = useMediaPipe();

  const [newLabel, setNewLabel] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [trainLogs, setTrainLogs] = useState<TrainLog[]>([]);
  const [toast, setToast] = useState('');

  const recordingRef = useRef(false);
  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;
  const datasetRef = useRef(dataset);
  datasetRef.current = dataset;

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const counts = getSampleCountByLabel(dataset);

  // Recording frame callback
  useEffect(() => {
    if (!isRecording) {
      frameCallbackRef.current = null;
      return;
    }
    frameCallbackRef.current = (lm) => {
      if (!lm || !recordingRef.current || !selectedLabelRef.current) return;
      const features = normalizeLandmarks(lm);
      if (!features) return;
      const sample: Sample = { features, label: selectedLabelRef.current };
      onDatasetChange(addSample(datasetRef.current, sample));
      setRecordCount((c) => c + 1);
    };
    return () => { frameCallbackRef.current = null; };
  }, [isRecording, frameCallbackRef, onDatasetChange]);

  const toggleRecording = () => {
    if (!selectedLabel) { showToast('Pilih atau tambahkan label dulu!'); return; }
    const next = !isRecording;
    setIsRecording(next);
    recordingRef.current = next;
    if (next) setRecordCount(0);
  };

  const addLabel = () => {
    const l = newLabel.trim().toUpperCase();
    if (!l) return;
    if (dataset.labels.includes(l)) { showToast('Label sudah ada'); return; }
    onDatasetChange({ ...dataset, labels: [...dataset.labels, l].sort() });
    setSelectedLabel(l);
    setNewLabel('');
    showToast(`Label "${l}" ditambahkan`);
  };

  const deleteLabel = (label: string) => {
    if (isRecording && selectedLabel === label) { setIsRecording(false); recordingRef.current = false; }
    onDatasetChange(removeLabel(dataset, label));
    if (selectedLabel === label) setSelectedLabel('');
    showToast(`Label "${label}" dihapus`);
  };

  const handleTrain = async () => {
    if (!backendConnected) { showToast('⚠️ Backend tidak terkoneksi! Cek Settings.'); return; }
    if (dataset.samples.length < 5) { showToast('Butuh minimal 5 sampel untuk melatih!'); return; }
    if (dataset.labels.length < 2) { showToast('Butuh minimal 2 label!'); return; }
    setIsTraining(true);
    setTrainLogs([]);
    await model.build(dataset.labels);
    await model.train(
      dataset.samples,
      50, // max epochs — backend handles actual training
      (log) => setTrainLogs((l) => [...l, log]),
      () => { setIsTraining(false); onModelTrained(); showToast('✅ Model berhasil dilatih!'); }
    );
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    // Try dataset format first, then external format
    const imported = importDatasetJSON(text);
    if (imported) {
      onDatasetChange(addSamples(dataset, imported.samples));
      showToast(`✅ ${imported.samples.length} sampel diimpor`);
    } else {
      const parsed = parseExternalJSON(JSON.parse(text));
      if (parsed) {
        onDatasetChange(addSamples(dataset, parsed));
        showToast(`✅ ${parsed.length} sampel dari JSON eksternal`);
      } else {
        showToast('❌ Format JSON tidak dikenali');
      }
    }
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="fade-in">

      {/* Toast */}
      {toast && (
        <div className="glass" style={{ padding: '10px 14px', borderColor: 'rgba(0,212,255,0.3)', fontSize: 13, color: 'var(--accent-cyan)' }}>
          {toast}
        </div>
      )}

      {/* Backend warning */}
      {!backendConnected && (
        <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 13, color: '#f87171' }}>
            ⚠️ Backend belum terkoneksi. Training membutuhkan koneksi ke Google Colab. Buka tab <b>Settings</b> untuk mengatur.
          </p>
        </div>
      )}

      {/* ── Add Label ── */}
      <div className="glass" style={{ padding: 16 }}>
        <span className="section-title" style={{ display: 'block', marginBottom: 10 }}>Tambah Label</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input" value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
            placeholder="Nama gestur, cth: HALO, TERIMA KASIH..."
          />
          <button className="btn btn-primary" onClick={addLabel} style={{ whiteSpace: 'nowrap' }}>
            + Tambah
          </button>
        </div>
      </div>

      {/* ── Label List ── */}
      <div className="glass" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="section-title">Label ({dataset.labels.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="btn btn-ghost" style={{ fontSize: 12, cursor: 'pointer' }}>
              📥 Impor JSON
              <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={() => { const j = exportDatasetJSON(dataset); const b = new Blob([j],{type:'application/json'}); const u = URL.createObjectURL(b); Object.assign(document.createElement('a'),{href:u,download:'dataset.json'}).click(); }}>
              📤 Ekspor
            </button>
          </div>
        </div>

        {dataset.labels.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            Belum ada label. Tambahkan label di atas.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {dataset.labels.map((label) => (
              <div
                key={label}
                className={`label-chip ${selectedLabel === label ? 'selected' : ''}`}
                onClick={() => setSelectedLabel(label)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{label}</span>
                  <span className="stat-badge">{counts[label] ?? 0} sampel</span>
                </div>
                <button
                  className="btn btn-danger" style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={(e) => { e.stopPropagation(); deleteLabel(label); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recording ── */}
      <div className="glass" style={{ padding: 16 }}>
        <span className="section-title" style={{ display: 'block', marginBottom: 10 }}>Rekam Sampel</span>

        {selectedLabel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Label aktif: <b style={{ color: 'var(--accent-cyan)' }}>{selectedLabel}</b>
              </div>
              {isRecording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse-red 1s infinite' }} />
                  <span style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>MEREKAM — {recordCount} sampel</span>
                </div>
              )}
            </div>

            {!isHandDetected && (
              <p style={{ fontSize: 12, color: 'var(--accent-amber)' }}>⚠️ Tidak ada tangan terdeteksi di kamera</p>
            )}

            <button
              className={`btn btn-record ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              {isRecording ? '⏹ Stop Rekam' : '⏺ Mulai Rekam'}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            Pilih label dari daftar di atas untuk mulai merekam.
          </p>
        )}
      </div>

      {/* ── Training ── */}
      <div className="glass" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span className="section-title">Latih Model</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: backendConnected ? '#10b981' : '#ef4444',
            }} />
            <span style={{ fontSize: 11, color: backendConnected ? '#10b981' : '#ef4444' }}>
              {backendConnected ? 'Server Ready' : 'Server Offline'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div className="glass" style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-cyan)' }}>{dataset.samples.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total Sampel</div>
          </div>
          <div className="glass" style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-purple)' }}>{dataset.labels.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total Label</div>
          </div>
          <div className="glass" style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-amber)' }}>{trainLogs.length || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Epoch</div>
          </div>
        </div>

        <button
          className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600 }}
          onClick={handleTrain} disabled={isTraining || dataset.samples.length < 5 || !backendConnected}
        >
          {isTraining ? `⏳ Melatih di Server...` : '🚀 Latih Model'}
        </button>

        {/* Training progress */}
        {isTraining && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
                width: '100%',
                animation: 'pulse-width 1.5s ease-in-out infinite',
              }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, textAlign: 'center' }}>
              Menunggu respons dari Google Colab...
            </p>
          </div>
        )}

        {/* Charts */}
        {trainLogs.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <span className="section-title" style={{ display: 'block', marginBottom: 8 }}>Loss</span>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={trainLogs} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ background: '#0d1421', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="loss" stroke="#00d4ff" dot={false} strokeWidth={2} name="Train Loss" />
                  <Line type="monotone" dataKey="valLoss" stroke="#7c3aed" dot={false} strokeWidth={2} name="Val Loss" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <span className="section-title" style={{ display: 'block', marginBottom: 8 }}>Akurasi</span>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={trainLogs} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ background: '#0d1421', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="acc" stroke="#22c55e" dot={false} strokeWidth={2} name="Train Acc" />
                  <Line type="monotone" dataKey="valAcc" stroke="#f59e0b" dot={false} strokeWidth={2} name="Val Acc" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
