'use client';
import { useMediaPipe } from '@/contexts/MediaPipeContext';

/**
 * WebcamPanel — headless camera processor.
 * The video element is hidden but still feeds frames to MediaPipe.
 * No visible UI — the 3D hand viewer provides the visual feedback.
 */
export default function WebcamPanel({ showPreview = false }: { showPreview?: boolean }) {
  const { videoRef } = useMediaPipe();

  // If showPreview is false, hide it far away.
  // If true, show it as a Picture-in-Picture at the bottom left of the screen.
  const style: React.CSSProperties = showPreview 
    ? {
        position: 'fixed',
        bottom: 24,
        left: 24,
        width: 320,
        height: 240,
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        border: '2px solid rgba(255,255,255,0.8)',
        zIndex: 100,
        objectFit: 'cover',
        transform: 'scaleX(-1)', // Mirror effect
        pointerEvents: 'none',
        opacity: 0.9,
      }
    : {
        position: 'fixed',
        top: -9999,
        left: -9999,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
      };

  return (
    <>
      <video
        ref={videoRef}
        style={style}
        playsInline
        muted
      />
    </>
  );
}
