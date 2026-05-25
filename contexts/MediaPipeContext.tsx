'use client';
import React, {
  createContext, useContext, useEffect, useRef, useState, type MutableRefObject,
} from 'react';
import { type Landmark } from '@/lib/normalization';
import { drawHandSkeleton } from '@/lib/utils';

export interface MediaPipeCtx {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  landmarksRef: MutableRefObject<Landmark[] | null>;
  /** Register a per-frame callback — only one at a time */
  frameCallbackRef: MutableRefObject<((lm: Landmark[] | null) => void) | null>;
  isHandDetected: boolean;
  isLoading: boolean;
  error: string | null;
  cameras: MediaDeviceInfo[];
  selectedCameraId: string;
  setSelectedCameraId: (id: string) => void;
  drawOverlay: boolean;
  setDrawOverlay: (v: boolean) => void;
  minDetectionConfidence: number;
  setMinDetectionConfidence: (v: number) => void;
}

const Ctx = createContext<MediaPipeCtx | null>(null);

export function MediaPipeProvider({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const frameCallbackRef = useRef<((lm: Landmark[] | null) => void) | null>(null);
  const detectedRef = useRef(false);

  const [isHandDetected, setIsHandDetected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [drawOverlay, setDrawOverlay] = useState(true);
  const [minDetectionConfidence, setMinDetectionConfidence] = useState(0.7);

  // Request camera permission and enumerate devices
  useEffect(() => {
    let active = true;
    const initCameras = async () => {
      try {
        // Request camera permission first to ensure device labels and IDs are unmasked
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter((d) => d.kind === 'videoinput');
        
        setCameras(cams);
        if (cams.length > 0) {
          setSelectedCameraId(cams[0].deviceId);
        } else {
          setError('Tidak ada kamera yang ditemukan.');
          setIsLoading(false);
        }

        // Stop the temporary stream
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        if (active) {
          setError(`Izin kamera ditolak atau error: ${err instanceof Error ? err.message : String(err)}`);
          setIsLoading(false);
        }
      }
    };
    initCameras();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedCameraId) return;
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cam: any, hands: any;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const { Hands } = await import('@mediapipe/hands');
        const { Camera } = await import('@mediapipe/camera_utils');
        if (!active || !videoRef.current) return;

        hands = new Hands({
          locateFile: (f: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
        });
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence,
          minTrackingConfidence: 0.5,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hands.onResults((res: any) => {
          const lm: Landmark[] | null = res.multiHandLandmarks?.[0] ?? null;
          landmarksRef.current = lm;
          const detected = lm !== null;
          if (detected !== detectedRef.current) {
            detectedRef.current = detected;
            setIsHandDetected(detected);
          }
          // Draw overlay
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx2d = canvas.getContext('2d');
            if (ctx2d) {
              ctx2d.clearRect(0, 0, canvas.width, canvas.height);
              if (lm && drawOverlay) drawHandSkeleton(ctx2d, lm, canvas.width, canvas.height);
            }
          }
          frameCallbackRef.current?.(lm);
        });

        cam = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && hands) await hands.send({ image: videoRef.current });
          },
          width: 640,
          height: 480,
          ...(selectedCameraId ? { deviceId: selectedCameraId } : {}),
        });
        await cam.start();
        if (active) setIsLoading(false);
      } catch (e) {
        if (active) {
          setError(`Gagal memulai kamera: ${e instanceof Error ? e.message : String(e)}`);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      cam?.stop();
      hands?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraId, minDetectionConfidence]);

  return (
    <Ctx.Provider
      value={{
        videoRef, canvasRef, landmarksRef, frameCallbackRef,
        isHandDetected, isLoading, error,
        cameras, selectedCameraId, setSelectedCameraId,
        drawOverlay, setDrawOverlay,
        minDetectionConfidence, setMinDetectionConfidence,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMediaPipe(): MediaPipeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMediaPipe must be used inside <MediaPipeProvider>');
  return ctx;
}
