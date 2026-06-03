'use client';
import { useState, useEffect, useRef } from 'react';
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
  const { frameCallbackRef, isHandDetected } = useMediaPipe();

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

  const sequenceRef = useRef<number[][]>([]);

  // Recording frame callback
  useEffect(() => {
    if (!isRecording) {
      frameCallbackRef.current = null;
      sequenceRef.current = [];
      return;
    }
    frameCallbackRef.current = (lm) => {
      if (!lm || !recordingRef.current || !selectedLabelRef.current) return;
      const features = normalizeLandmarks(lm);
      if (!features) return;
      
      sequenceRef.current.push(features);
      if (sequenceRef.current.length === 30) {
        const sample: Sample = { features: sequenceRef.current, label: selectedLabelRef.current };
        onDatasetChange(addSample(datasetRef.current, sample));
        setRecordCount((c) => c + 1);
        sequenceRef.current = []; // reset for next sequence
      }
    };
    return () => { frameCallbackRef.current = null; sequenceRef.current = []; };
  }, [isRecording, frameCallbackRef, onDatasetChange]);

  const toggleRecording = () => {
    if (!selectedLabel) { showToast('Please select or add a label first!'); return; }
    const next = !isRecording;
    setIsRecording(next);
    recordingRef.current = next;
    if (next) setRecordCount(0);
  };

  const addLabel = () => {
    const l = newLabel.trim().toUpperCase();
    if (!l) return;
    if (dataset.labels.includes(l)) { showToast('Label already exists'); return; }
    onDatasetChange({ ...dataset, labels: [...dataset.labels, l].sort() });
    setSelectedLabel(l);
    setNewLabel('');
    showToast(`Label "${l}" added`);
  };

  const deleteLabel = (label: string) => {
    if (isRecording && selectedLabel === label) { setIsRecording(false); recordingRef.current = false; }
    onDatasetChange(removeLabel(dataset, label));
    if (selectedLabel === label) setSelectedLabel('');
    showToast(`Label "${label}" deleted`);
  };

  const handleTrain = async () => {
    if (!backendConnected) { showToast('⚠️ Backend not connected! Check Settings.'); return; }
    if (dataset.samples.length < 5) { showToast('Need at least 5 samples to train!'); return; }
    if (dataset.labels.length < 2) { showToast('Need at least 2 labels!'); return; }
    setIsTraining(true);
    setTrainLogs([]);
    await model.build(dataset.labels);
    await model.train(
      dataset.samples,
      50, // max epochs — backend handles actual training
      (log) => setTrainLogs((l) => [...l, log]),
      () => { setIsTraining(false); onModelTrained(); showToast('✅ Model trained successfully!'); }
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
      showToast(`✅ ${imported.samples.length} samples imported`);
    } else {
      const parsed = parseExternalJSON(JSON.parse(text));
      if (parsed) {
        onDatasetChange(addSamples(dataset, parsed));
        showToast(`✅ ${parsed.length} samples imported from external JSON`);
      } else {
        showToast('❌ Unrecognized JSON format');
      }
    }
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="fade-in">

      {/* Toast */}
      {toast && (
        <div style={{ padding: '10px 14px', background: 'var(--accent-blue-light)', borderRadius: 10, fontSize: 13, color: 'var(--accent-blue)', fontWeight: 500 }}>
          {toast}
        </div>
      )}

      {/* Backend warning */}
      {!backendConnected && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--accent-red-light)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 13, color: 'var(--accent-red)' }}>
            ⚠️ Backend not connected. Training requires a connection to Google Colab. Open <b>Settings</b> to configure.
          </p>
        </div>
      )}

      {/* ── Add Label ── */}
      <div style={{ padding: '0 4px' }}>
        <span className="section-title" style={{ display: 'block', marginBottom: 10 }}>Add Label</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input" value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
            placeholder="Gesture name, e.g., HELLO, THANKS..."
          />
          <button className="btn btn-primary" onClick={addLabel} style={{ whiteSpace: 'nowrap' }}>
            Add
          </button>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

      {/* ── Label List ── */}
      <div style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="section-title">Labels ({dataset.labels.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>
              📥 Import JSON
              <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 10px', borderRadius: 6 }}
              onClick={() => { const j = exportDatasetJSON(dataset); const b = new Blob([j],{type:'application/json'}); const u = URL.createObjectURL(b); Object.assign(document.createElement('a'),{href:u,download:'dataset.json'}).click(); }}>
              📤 Export
            </button>
          </div>
        </div>

        {dataset.labels.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border)' }}>
             <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No labels yet. Add a label above.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
            {dataset.labels.map((label) => (
              <div
                key={label}
                className={`label-chip ${selectedLabel === label ? 'selected' : ''}`}
                onClick={() => setSelectedLabel(label)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
                  <span className="stat-badge">{counts[label] ?? 0} samples</span>
                </div>
                <button
                  className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6 }}
                  onClick={(e) => { e.stopPropagation(); deleteLabel(label); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

      {/* ── Recording ── */}
      <div style={{ padding: '0 4px' }}>
        <span className="section-title" style={{ display: 'block', marginBottom: 10 }}>Record Samples</span>

        {selectedLabel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Active label: <b style={{ color: 'var(--accent-blue)' }}>{selectedLabel}</b>
              </div>
              {isRecording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent-red-light)', padding: '4px 10px', borderRadius: 20 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-red)', animation: 'pulse-red 1s infinite' }} />
                  <span style={{ fontSize: 12, color: 'var(--accent-red)', fontWeight: 600 }}>RECORDING — {recordCount} samples</span>
                </div>
              )}
            </div>

            {!isHandDetected && (
              <p style={{ fontSize: 12, color: '#d97706', background: 'var(--accent-yellow-light)', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>⚠️ No hand detected in camera</p>
            )}

            <button
              className={`btn btn-record ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              {isRecording ? '⏹ Stop Recording' : '⏺ Start Recording'}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            Select a label from the list above to start recording.
          </p>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

      {/* ── Training ── */}
      <div style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span className="section-title">Train Model</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)',
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {backendConnected ? 'Server Ready' : 'Server Offline'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: '12px', textAlign: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-blue)' }}>{dataset.samples.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>Samples</div>
          </div>
          <div style={{ flex: 1, padding: '12px', textAlign: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-purple)' }}>{dataset.labels.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>Labels</div>
          </div>
          <div style={{ flex: 1, padding: '12px', textAlign: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-yellow)' }}>{trainLogs.length || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>Epochs</div>
          </div>
        </div>

        <button
          className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 14, fontWeight: 600, borderRadius: 12 }}
          onClick={handleTrain} disabled={isTraining || dataset.samples.length < 5 || !backendConnected}
        >
          {isTraining ? `⏳ Training on Server...` : '🚀 Train Model'}
        </button>

        {/* Training progress */}
        {isTraining && (
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))',
                width: '100%',
                animation: 'pulse-width 1.5s ease-in-out infinite',
              }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center', fontWeight: 500 }}>
              Waiting for response from Google Colab...
            </p>
          </div>
        )}

        {/* Charts */}
        {trainLogs.length > 0 && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
              <span className="section-title" style={{ display: 'block', marginBottom: 12 }}>Loss</span>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={trainLogs} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="loss" stroke="var(--accent-blue)" dot={false} strokeWidth={2.5} name="Train Loss" />
                  <Line type="monotone" dataKey="valLoss" stroke="var(--accent-purple)" dot={false} strokeWidth={2.5} name="Val Loss" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ padding: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
              <span className="section-title" style={{ display: 'block', marginBottom: 12 }}>Accuracy</span>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={trainLogs} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="acc" stroke="var(--accent-green)" dot={false} strokeWidth={2.5} name="Train Acc" />
                  <Line type="monotone" dataKey="valAcc" stroke="var(--accent-yellow)" dot={false} strokeWidth={2.5} name="Val Acc" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
