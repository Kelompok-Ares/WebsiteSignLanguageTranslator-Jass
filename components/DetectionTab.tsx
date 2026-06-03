'use client';
import { useEffect, useRef, useState } from 'react';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import { normalizeLandmarks } from '@/lib/normalization';
import { PredictionSmoother } from '@/lib/utils';
import type { SignModel } from '@/lib/model';
import type { PredictionResult } from '@/lib/model';

interface Props { model: SignModel; modelTrained: boolean; backendConnected: boolean; }

const smoother = new PredictionSmoother(12, 0.55);

export default function DetectionTab({ model, modelTrained, backendConnected }: Props) {
  const { frameCallbackRef, isHandDetected } = useMediaPipe();
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const predRef = useRef(prediction);
  predRef.current = prediction;

  const sequenceRef = useRef<number[][]>([]);

  useEffect(() => {
    if (!modelTrained || !backendConnected) { frameCallbackRef.current = null; return; }

    frameCallbackRef.current = async (lm) => {
      if (!lm) {
        sequenceRef.current = []; // reset sequence on hand loss
        const smoothed = smoother.push(null);
        setPrediction(smoothed);
        return;
      }
      const features = normalizeLandmarks(lm);
      if (!features) return;
      
      sequenceRef.current.push(features);
      if (sequenceRef.current.length > 30) {
        sequenceRef.current.shift(); // maintain sliding window of 30 frames
      }
      
      if (sequenceRef.current.length === 30) {
        const raw = await model.predict(sequenceRef.current);
        const smoothed = smoother.push(raw);
        setPrediction(smoothed);
      }
    };

    return () => { frameCallbackRef.current = null; };
  }, [modelTrained, backendConnected, model, frameCallbackRef]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }} className="fade-in">
      {/* Backend disconnected warning */}
      {!backendConnected && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--accent-red-light)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 13, color: 'var(--accent-red)' }}>
            ⚠️ Backend tidak terkoneksi. Buka tab <b>Settings</b> untuk mengatur URL backend.
          </p>
        </div>
      )}

      {!modelTrained && backendConnected && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--accent-yellow-light)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p style={{ fontSize: 13, color: '#d97706' }}>
            Model belum dilatih. Buka tab <b>Train</b> untuk merekam sampel.
          </p>
        </div>
      )}

      {/* ── Prediction card ── */}
      <div className="prediction-bar">
        <span className="section-title" style={{ display: 'block', marginBottom: 8 }}>Detected Sign</span>

        <div className={`prediction-word ${!prediction ? 'empty' : ''}`} style={{ marginBottom: 16, minHeight: 40, transition: 'all 0.25s' }}>
          {prediction ? prediction.label : (isHandDetected ? 'Analyzing...' : 'Waiting for hand...')}
        </div>

        {/* Confidence bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="conf-track" style={{ flex: 1 }}>
            <div className="conf-fill" style={{ width: `${confPct}%` }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>
            {prediction ? `${confPct}%` : '—'}
          </span>
        </div>
      </div>

      {/* ── Hand status ── */}
      <div style={{ display: 'flex', gap: 24, padding: '4px 8px' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Hand Sign</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: isHandDetected ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
            {isHandDetected ? 'Detected' : 'None'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Model Status</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: modelTrained ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
            {modelTrained ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Backend</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {backendConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* ── Sentence builder ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 8px' }}>
          <span className="section-title">Translation History</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }} onClick={() => setHistory([])}>
            Clear
          </button>
        </div>
        <div style={{
          flex: 1, padding: 16, borderRadius: 14,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          fontSize: 15, fontWeight: 500, lineHeight: 1.6,
          color: history.length ? 'var(--text-primary)' : 'var(--text-muted)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
        }}>
          {history.length ? history.join(' · ') : 'Detected words will appear here...'}
        </div>
      </div>
    </div>
  );
}
