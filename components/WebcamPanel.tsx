'use client';
import { useMediaPipe } from '@/contexts/MediaPipeContext';

/**
 * WebcamPanel — headless camera processor.
 * The video element is hidden but still feeds frames to MediaPipe.
 * No visible UI — the 3D hand viewer provides the visual feedback.
 */
export default function WebcamPanel() {
  const { videoRef } = useMediaPipe();

  return (
    <>
      {/* Hidden video — still needed for MediaPipe frame processing */}
      <video
        ref={videoRef}
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
        playsInline
        muted
      />
    </>
  );
}
