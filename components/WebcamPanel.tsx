'use client';
import { useMediaPipe } from '@/contexts/MediaPipeContext';

export default function WebcamPanel() {
  const { videoRef, canvasRef, isLoading, error } = useMediaPipe();

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Loading */}
      {isLoading && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          }}
        >
          <div className="spinner" />
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Memuat Kamera...</p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="glass" style={{ padding: 24, textAlign: 'center', maxWidth: 400 }}>
            <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
          </div>
        </div>
      )}

      {/* Video — mirrored */}
      <video
        ref={videoRef}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', transform: 'scaleX(-1)',
        }}
        playsInline
        muted
      />

      {/* Canvas overlay — mirrored to match video */}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', transform: 'scaleX(-1)',
        }}
      />
    </div>
  );
}
