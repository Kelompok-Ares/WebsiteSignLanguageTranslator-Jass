'use client';
import { useState } from 'react';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import type { SignModel, HealthStatus } from '@/lib/model';
import { logger } from '@/lib/logger';
import { Globe, Link, Hourglass, Sliders, Brain, Upload, Download, Camera, AlertTriangle, CheckCircle2, XCircle, Check, Minus } from 'lucide-react';

const settingsLog = logger;

interface Props {
  model: SignModel;
  modelTrained: boolean;
  onModelTrained: () => void;
  backendUrl: string;
  onBackendUrlChange: (url: string) => void;
  backendConnected: boolean;
}

export default function SettingsTab({
  model, modelTrained, onModelTrained,
  backendUrl, onBackendUrlChange, backendConnected,
}: Props) {
  const {
    minDetectionConfidence, setMinDetectionConfidence,
    cameras, selectedCameraId, setSelectedCameraId
  } = useMediaPipe();

  const [toast, setToast] = useState<React.ReactNode>('');
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [healthInfo, setHealthInfo] = useState<HealthStatus | null>(null);

  const showToast = (msg: React.ReactNode) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const handleTestConnection = async () => {
    const url = urlInput.trim().replace(/\/+$/, '');
    if (!url) { showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={14} /> Enter backend URL first</div>); return; }

    setIsTesting(true);
    onBackendUrlChange(url);
    settingsLog.info('Testing backend connection', { url });

    // Small delay to let the model update its URL
    await new Promise(r => setTimeout(r, 100));

    const health = await model.checkHealth();
    setIsTesting(false);

    if (health) {
      setHealthInfo(health);
      showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={14} /> Backend connected!</div>);
      if (health.model_trained) {
        onModelTrained();
      }
    } else {
      setHealthInfo(null);
      settingsLog.warn('Backend connection failed', { url });
      showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><XCircle size={14} /> Failed to connect to backend. Check Colab & URL.</div>);
    }
  };



  const handleExportModel = async () => {
    try {
      await model.exportModel();
      showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={14} /> Model exported</div>);
    } catch (e: any) {
      settingsLog.error('Model export failed', e);
      showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><XCircle size={14} /> {e.message || 'Export failed'}</div>);
    }
  };

  const handleImportModel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Hourglass size={14} /> Importing model...</div>);
    
    try {
      const success = await model.importModel(file);
      if (success) {
        onModelTrained();
        showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={14} /> Model imported successfully</div>);
      } else {
        showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><XCircle size={14} /> Failed to import model</div>);
      }
    } catch (e: any) {
      settingsLog.error('Model import failed', e);
      showToast(<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><XCircle size={14} /> {e.message || 'Import failed'}</div>);
    }
    e.target.value = '';
  };

  return (
    <div className="flex-col gap-xl fade-in">

      {toast && <div className="toast">{toast}</div>}

      {/* ── Backend Server ── */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={18} /> Backend Server</div>
        <div className="settings-card">
          <div className="flex-col gap-md">
            <div>
              <label className="label-text">Backend URL (e.g. http://12.34.56.78:5000)</label>
              <div className="input-group">
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
                  style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {isTesting ? <><Hourglass size={16} /> ...</> : <><Link size={16} /> Connect</>}
                </button>
              </div>
            </div>

            {/* Connection status */}
            <div className={`connection-card ${backendConnected ? 'connected' : 'disconnected'}`}>
              <div className={`connection-dot ${backendConnected ? 'connected' : 'disconnected'}`} />
              <div style={{ flex: 1 }}>
                <div className="connection-label" style={{ color: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {backendConnected ? 'Connected' : 'Disconnected'}
                </div>
                {healthInfo && backendConnected && (
                  <div className="connection-detail">
                    Model: {healthInfo.model_trained ? `Trained (${healthInfo.labels.join(', ')})` : 'Not trained'}
                    {healthInfo.last_train_samples > 0 && ` • ${healthInfo.last_train_samples} samples`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Camera Device ── */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Camera size={18} /> Camera Device</div>
        <div className="settings-card">
          <div className="flex-col gap-sm">
            <label className="label-text">Select Input Device</label>
            <select 
              className="input" 
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              style={{ cursor: 'pointer', appearance: 'auto' } as React.CSSProperties}
            >
              {cameras.length === 0 && <option value="">No cameras found</option>}
              {cameras.map(cam => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label || `Camera (${cam.deviceId.slice(0, 5)}...)`}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Note: Changing the camera will automatically restart the video stream.
            </p>
          </div>
        </div>
      </div>

      {/* ── Sensitivity ── */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Sliders size={18} /> Model Sensitivity</div>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">
              Min Detection Confidence: {(minDetectionConfidence * 100).toFixed(0)}%
            </span>
            <input
              type="range" min={0.3} max={0.99} step={0.01}
              value={minDetectionConfidence}
              onChange={(e) => setMinDetectionConfidence(+e.target.value)}
              className="slider"
              style={{ width: 160, '--pct': `${((minDetectionConfidence - 0.3) / 0.69) * 100}%` } as React.CSSProperties}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Higher values reduce false positives but require clearer hand visibility.
          </p>
        </div>
      </div>

      {/* ── Model Status ── */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Brain size={18} /> Model Info</div>
        <div className="settings-card">
          <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)', alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>Status:</span>
            <span style={{
              color: modelTrained ? 'var(--accent-green)' : 'var(--accent-yellow)',
              fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              {modelTrained ? <><Check size={14} /> Model trained and ready</> : <><Minus size={14} /> Model not trained</>}
            </span>
          </div>
          {modelTrained && model.labels.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, fontWeight: 500 }}>
              Labels: {model.labels.join(', ')}
            </div>
          )}
          <div className="action-bar" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={handleExportModel} style={{ display: 'flex', alignItems: 'center', gap: 6 }} disabled={!modelTrained}>
              <Upload size={14} /> Export Model
            </button>
            <label className="btn btn-ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <Download size={14} /> Import Model
              <input type="file" accept=".zip" onChange={handleImportModel} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </div>

    </div>
  );
}
