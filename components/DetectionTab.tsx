'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import { PredictionSmoother } from '@/lib/utils';
import type { SignModel } from '@/lib/model';
import type { PredictionResult } from '@/lib/model';
import { AlertTriangle, Check, Minus, X, List } from 'lucide-react';

interface Props { model: SignModel; modelTrained: boolean; backendConnected: boolean; }

export default function DetectionTab({ model, modelTrained, backendConnected }: Props) {
  const { subscribeFrameCallback, isHandDetected } = useMediaPipe();
  const smoother = useMemo(() => new PredictionSmoother(12, 0.55), []);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const predRef = useRef(prediction);
  predRef.current = prediction;

  const frameBuffer = useRef<{ timestamp: number; landmarks: number[]; tracked: boolean }[]>([]);
  const frameCount = useRef(0);
  const isPredicting = useRef(false);
  const WS_SEND_EVERY_N = 3; // Only send every Nth frame to reduce WebSocket + JSON.stringify load

  useEffect(() => {
    if (!modelTrained || !backendConnected) {
      setPrediction(null);
      return;
    }

    // Connect WebSocket when component mounts
    model.connectWS((result) => {
      if (result) {
        const isRejected = (result as any).rejected || result.label.includes('Idle');
        const smoothed = smoother.push(isRejected ? null : result);
        setPrediction(smoothed);
      } else {
        const smoothed = smoother.push(null);
        setPrediction(smoothed);
      }
    });

    const unsubscribe = subscribeFrameCallback((lm) => {
      const now = Date.now();
      frameCount.current++;

      // Throttle: only send every Nth frame to reduce WebSocket + serialization load
      if (frameCount.current % WS_SEND_EVERY_N !== 0) return;

      let rawFeatures: number[] = [];
      let tracked = false;

      if (lm) {
        rawFeatures = lm.flatMap(l => [l.x, l.y, l.z]);
        tracked = true;
      }

      // Send the frame to the backend buffer via WebSocket
      // The backend handles the buffer, cold start, and stride logic natively and efficiently.
      model.sendFrame({
        timestamp: now,
        landmarks: rawFeatures,
        tracked
      });
    });

    return () => {
      unsubscribe();
      model.disconnectWS();
      smoother.reset();
    };
  }, [modelTrained, backendConnected, model, subscribeFrameCallback, smoother]);
  // Add confirmed prediction to sentence history
  useEffect(() => {
    if (!prediction) return;
    setHistory((h) => {
      if (h[h.length - 1] === prediction.label) return h;
      return [...h.slice(-19), prediction.label];
    });
  }, [prediction]);

  const confPct = prediction ? Math.round(prediction.confidence * 100) : 0;

  return (
    <div className="flex-col gap-lg fade-in">

      {/* Backend disconnected warning */}
      {!backendConnected && (
        <div className="alert alert-error" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertTriangle size={16} />
          <span>Backend tidak terkoneksi. Buka tab <b>Settings</b> untuk mengatur URL backend.</span>
        </div>
      )}

      {!modelTrained && backendConnected && (
        <div className="alert alert-warning" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertTriangle size={16} />
          <span>Model belum dilatih. Silahkan latih model dari Dashboard Google Colab terlebih dahulu.</span>
        </div>
      )}

      {/* ── Prediction card ── */}
      <div className="prediction-bar">
        <span className="section-title" style={{ display: 'block', marginBottom: 10 }}>Detected Sign</span>

        <div
          className={`prediction-word ${!prediction ? 'empty' : ''}`}
          style={{ marginBottom: 16, minHeight: 38 }}
        >
          {prediction ? prediction.label : (isHandDetected ? 'Analyzing...' : 'Waiting for hand...')}
        </div>

        {/* Confidence bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="conf-track" style={{ flex: 1 }}>
            <div className="conf-fill" style={{ width: `${confPct}%` }} />
          </div>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: confPct > 80 ? 'var(--accent-green)' : confPct > 50 ? 'var(--accent-blue)' : 'var(--text-secondary)',
            minWidth: 40, textAlign: 'right',
            transition: 'color 0.3s ease',
          }}>
            {prediction ? `${confPct}%` : '—'}
          </span>
        </div>
      </div>

      {/* ── Status indicators ── */}
      <div className="info-grid">
        <div className="info-item">
          <span className="info-label">Hand</span>
          <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isHandDetected ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
            {isHandDetected ? <><Check size={14} /> Detected</> : <><Minus size={14} /> None</>}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">Model</span>
          <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: modelTrained ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
            {modelTrained ? <><Check size={14} /> Active</> : <><Minus size={14} /> Inactive</>}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">Backend</span>
          <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {backendConnected ? <><Check size={14} /> Online</> : <><X size={14} /> Offline</>}
          </span>
        </div>
      </div>

      {/* ── Translation History ── */}
      <div className="flex-col">
        <div className="section-header">
          <span className="section-title">Translation History</span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}
            onClick={() => setHistory([])}
          >
            Clear
          </button>
        </div>
        <div className="history-container">
          {history.length ? (
            history.map((word, i) => (
              <span key={`${i}-${word}`} className="history-word">{word}</span>
            ))
          ) : (
            <div className="history-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, opacity: 0.7, padding: '16px 0' }}>
              <List size={24} color="var(--text-muted)" />
              <span>Translation history is empty.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
