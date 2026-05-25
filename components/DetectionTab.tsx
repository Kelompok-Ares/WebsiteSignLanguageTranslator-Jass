'use client';
import { useEffect, useRef, useState } from 'react';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import { normalizeLandmarks } from '@/lib/normalization';
import { PredictionSmoother } from '@/lib/utils';
import type { SignModel } from '@/lib/model';
import type { PredictionResult } from '@/lib/model';

interface Props { model: SignModel; modelTrained: boolean; }

const smoother = new PredictionSmoother(12, 0.55);

export default function DetectionTab({ model, modelTrained }: Props) {
  const { frameCallbackRef, isHandDetected } = useMediaPipe();
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const predRef = useRef(prediction);
  predRef.current = prediction;

  useEffect(() => {
    if (!modelTrained) { frameCallbackRef.current = null; return; }

    frameCallbackRef.current = async (lm) => {
      if (!lm) {
        const smoothed = smoother.push(null);
        setPrediction(smoothed);
        return;
      }
      const features = normalizeLandmarks(lm);
      if (!features) return;
      const raw = await model.predict(features);
      const smoothed = smoother.push(raw);
      setPrediction(smoothed);
    };

    return () => { frameCallbackRef.current = null; };
  }, [modelTrained, model, frameCallbackRef]);

  // Add confirmed prediction to sentence history
  useEffect(() => {
    if (!prediction) return;
    setHistory((h) => {
      if (h[h.length - 1] === prediction.label) return h;
      return [...h.slice(-19), prediction.label];
    });
  }, [prediction?.label]);

  const confPct = prediction ? Math.round(prediction.confidence * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }} className="fade-in">
      {!modelTrained && (
        <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p style={{ fontSize: 13, color: 'var(--accent-amber)' }}>
            Model belum dilatih. Buka tab <b>Pelatih</b> untuk merekam sampel.
          </p>
        </div>
      )}

      {/* ── Prediction card ── */}
      <div className="prediction-bar">
        <span className="section-title" style={{ display: 'block', marginBottom: 8 }}>Detected</span>

        <div className={`prediction-word ${!prediction ? 'empty' : ''}`} style={{ marginBottom: 16, minHeight: 40, transition: 'all 0.25s' }}>
          {prediction ? prediction.label : (isHandDetected ? 'Analyzing...' : 'Put your hand on the camera')}
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
          <div style={{ fontSize: 13, fontWeight: 500, color: isHandDetected ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
            {isHandDetected ? 'Terdeteksi' : 'Tidak Ada'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Model Status</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: modelTrained ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
            {modelTrained ? 'Aktif' : 'Tidak Aktif'}
          </div>
        </div>
      </div>

      {/* ── Sentence builder ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 8px' }}>
          <span className="section-title">History</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setHistory([])}>
            Hapus
          </button>
        </div>
        <div style={{
          flex: 1, padding: 16, borderRadius: 8,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          fontSize: 16, fontWeight: 400, lineHeight: 1.6,
          color: history.length ? 'var(--text-primary)' : 'var(--text-muted)',
        }}>
          {history.length ? history.join(' · ') : 'Kata yang terdeteksi akan muncul di sini...'}
        </div>
      </div>
    </div>
  );
}
