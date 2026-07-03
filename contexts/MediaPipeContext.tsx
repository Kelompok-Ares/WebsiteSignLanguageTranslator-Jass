'use client';
import React, {
  createContext, useContext, useEffect, useRef, useState, type MutableRefObject, useCallback,
} from 'react';
import { type Landmark } from '@/lib/normalization';

type FrameCallback = (lm: Landmark[] | null) => void;

export interface MediaPipeCtx {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  landmarksRef: MutableRefObject<Landmark[] | null>;
  /** Register a per-frame callback — supports multiple subscribers */
  subscribeFrameCallback: (cb: FrameCallback) => () => void;
  isHandDetected: boolean;
  isLoading: boolean;
  error: string | null;
  cameras: MediaDeviceInfo[];
  selectedCameraId: string;
  setSelectedCameraId: (id: string) => void;
  minDetectionConfidence: number;
  setMinDetectionConfidence: (v: number) => void;
}

const Ctx = createContext<MediaPipeCtx | null>(null);

export function MediaPipeProvider({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const frameCallbacksRef = useRef<Set<FrameCallback>>(new Set());
  const detectedRef = useRef(false);
  // Pre-allocated sentinel array for "no hand" state (avoids 42 object allocations per frame)
  const SENTINEL_LM: Landmark = { x: -99.0, y: -99.0, z: -99.0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handsRef = useRef<any>(null);

  const [isHandDetected, setIsHandDetected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [minDetectionConfidence, setMinDetectionConfidence] = useState(0.7);

  const subscribeFrameCallback = useCallback((cb: FrameCallback) => {
    frameCallbacksRef.current.add(cb);
    return () => { frameCallbacksRef.current.delete(cb); };
  }, []);

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
        if (!active || !videoRef.current) return;

        // Variables for Crossover Resilience Tracker
        let prevLeftWrist: Landmark | null = null;
        let prevRightWrist: Landmark | null = null;

        hands = new Hands({
          locateFile: (f: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
        });
        handsRef.current = hands;
        hands.setOptions({
          maxNumHands: 2, // Bisindo requires 2 hands
          modelComplexity: 0, 
          minDetectionConfidence,
          minTrackingConfidence: 0.5,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hands.onResults((res: any) => {
          let lm: Landmark[] | null = null;
          if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
            lm = Array.from({ length: 42 }, () => ({ ...SENTINEL_LM }));
            
            let leftIdx = -1;
            let rightIdx = -1;

            if (res.multiHandLandmarks.length === 2 && prevLeftWrist && prevRightWrist) {
              const wristA = res.multiHandLandmarks[0][0];
              const wristB = res.multiHandLandmarks[1][0];
              
              const distALeft = Math.hypot(wristA.x - prevLeftWrist.x, wristA.y - prevLeftWrist.y);
              const distARight = Math.hypot(wristA.x - prevRightWrist.x, wristA.y - prevRightWrist.y);
              const distBLeft = Math.hypot(wristB.x - prevLeftWrist.x, wristB.y - prevLeftWrist.y);
              const distBRight = Math.hypot(wristB.x - prevRightWrist.x, wristB.y - prevRightWrist.y);
              
              if (distALeft + distBRight > distARight + distBLeft) {
                leftIdx = 1;
                rightIdx = 0;
              } else {
                leftIdx = 0;
                rightIdx = 1;
              }
            } else if (res.multiHandLandmarks.length === 2) {
              leftIdx = res.multiHandedness[0].label === 'Left' ? 0 : 1;
              rightIdx = res.multiHandedness[0].label === 'Left' ? 1 : 0;
            } else if (res.multiHandLandmarks.length === 1) {
              if (res.multiHandedness[0].label === 'Left') leftIdx = 0;
              else rightIdx = 0;
            }

            let currentLeftWrist: Landmark | null = null;
            let currentRightWrist: Landmark | null = null;

            res.multiHandLandmarks.forEach((landmarks: any, index: number) => {
              let label = '';
              if (index === leftIdx) label = 'Left';
              else if (index === rightIdx) label = 'Right';
              else return;

              const offset = label === 'Left' ? 0 : 21;
              
              if (label === 'Left') currentLeftWrist = landmarks[0];
              if (label === 'Right') currentRightWrist = landmarks[0];

              for (let i = 0; i < 21; i++) {
                if (landmarks[i]) {
                  lm![offset + i] = landmarks[i];
                }
              }
            });
            
            // Update tracking history
            if (currentLeftWrist) prevLeftWrist = currentLeftWrist;
            if (currentRightWrist) prevRightWrist = currentRightWrist;

          } else {
            // Hand lost, reset tracker
            prevLeftWrist = null;
            prevRightWrist = null;
          }

          landmarksRef.current = lm;
          const detected = lm !== null;
          if (detected !== detectedRef.current) {
            detectedRef.current = detected;
            setIsHandDetected(detected);
          }
          
          frameCallbacksRef.current.forEach(cb => cb(lm));
        });

        let isProcessing = false;
        let frameCallbackId = 0;
        
        // 1. Setup direct hardware stream requesting 60fps
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : {}),
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 60, max: 60 }
          }
        });
        
        if (!active || !videoRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // 2. High-performance native frame processing loop
        const processFrame = async () => {
          if (!active || !videoRef.current || !hands) return;
          
          if (!isProcessing && videoRef.current.readyState >= 2) {
            isProcessing = true;
            try {
              // Direct video element processing (zero-copy hardware accelerated)
              await hands.send({ image: videoRef.current });
            } catch (err) {
              console.error("MediaPipe processing error:", err);
            } finally {
              isProcessing = false;
            }
          }
          
          // Schedule next frame native callback (Chrome 83+), fallback to RAF
          if ('requestVideoFrameCallback' in videoRef.current) {
            // @ts-ignore
            frameCallbackId = videoRef.current.requestVideoFrameCallback(processFrame);
          } else {
            frameCallbackId = requestAnimationFrame(processFrame);
          }
        };
        
        processFrame();
        
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
      if (videoRef.current) {
        // @ts-ignore
        if ('cancelVideoFrameCallback' in videoRef.current) videoRef.current.cancelVideoFrameCallback(frameCallbackId);
        // @ts-ignore
        else cancelAnimationFrame(frameCallbackId);
        
        const stream = videoRef.current.srcObject as MediaStream;
        if (stream) stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      hands?.close();
      handsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraId]);

  // Update detection confidence without full camera teardown
  useEffect(() => {
    if (handsRef.current) {
      handsRef.current.setOptions({
        minDetectionConfidence,
      });
    }
  }, [minDetectionConfidence]);

  return (
    <Ctx.Provider
      value={{
        videoRef, landmarksRef, subscribeFrameCallback,
        isHandDetected, isLoading, error,
        cameras, selectedCameraId, setSelectedCameraId,
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
