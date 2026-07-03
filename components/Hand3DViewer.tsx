'use client';
import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useMediaPipe } from '@/contexts/MediaPipeContext';
import { HAND_CONNECTIONS } from '@/lib/utils';

/**
 * Hand3DViewer — renders a stylized 3D hand skeleton driven by MediaPipe landmarks.
 * Joints are spheres, bones are cylinders. Fingertips = yellow, others = blue.
 * Idle auto-rotation when no hand is detected.
 */

const JOINT_COUNT = 42; // 21 per hand
const FINGERTIP_IDS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky tips
const WRIST_ID = 0;

// Wireframe colors matching the light theme (Blue, Yellow, Red)
const COL_BLUE = new THREE.Color('#2563EB');
const COL_YELLOW = new THREE.Color('#F59E0B');
const COL_RED = new THREE.Color('#EF4444');


// Conversion: MediaPipe normalised coords → 3D scene coords
function landmarkToVec3(lm: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(
    -(lm.x - 0.5) * 6,  // Inverted X (mirror effect)
    -(lm.y - 0.5) * 6,   // Inverted Y
    -lm.z * 3            // Inverted Z
  );
}

export default function Hand3DViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { landmarksRef, isHandDetected } = useMediaPipe();

  // Three.js objects refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const jointMeshesRef = useRef<THREE.Mesh[]>([]);
  const boneMeshesRef = useRef<THREE.Mesh[]>([]);

  // Material refs for explicit opacity control
  const matJointRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const matFingertipRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const matWristRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const matBoneRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Pre-allocated reusable Vector3 for bone direction calculations (avoids GC pressure)
  const _tmpDir = useRef(new THREE.Vector3());

  const targetPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3(0, 0, 0))
  );
  const currentPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3(0, 0, 0))
  );
  const handGroupRef = useRef<THREE.Group | null>(null);
  const idleRotRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastActiveHandsRef = useRef<boolean[]>([false, false]);
  const handVisibleProgress = useRef(0); // 0-1 for fade-in/out

  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // transparent
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Turn off antialiasing for raw wireframe look & better performance
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(1); // Force 1x pixel ratio for maximum performance (no retina rendering overhead)
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0x000000, 0); // Transparent to blend with light theme

    // Clear any existing canvas (React 18 Strict Mode double mount protection)
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Hand group
    const handGroup = new THREE.Group();
    scene.add(handGroup);
    handGroupRef.current = handGroup;

    // Ultra-lightweight Basic materials (No lighting calculations required!)
    const matJoint = new THREE.MeshBasicMaterial({ color: COL_BLUE, transparent: true, opacity: 0.6 });
    const matFingertip = new THREE.MeshBasicMaterial({ color: COL_YELLOW, transparent: true, opacity: 0.8 });
    const matWrist = new THREE.MeshBasicMaterial({ color: COL_RED, transparent: true, opacity: 0.7 });
    const matBone = new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.25 });

    matJointRef.current = matJoint;
    matFingertipRef.current = matFingertip;
    matWristRef.current = matWrist;
    matBoneRef.current = matBone;

    // Create joint meshes (42 joints for 2 hands) with very low polycount
    const joints: THREE.Mesh[] = [];
    for (let i = 0; i < JOINT_COUNT; i++) {
      const localIndex = i % 21;
      const radius = localIndex === WRIST_ID ? 0.2 : 0.14;

      // Drastically reduced segment count for spheres (8x8 instead of 16x16)
      const geo = new THREE.SphereGeometry(radius, 6, 6);
      const mat = localIndex === WRIST_ID ? matWrist : FINGERTIP_IDS.includes(localIndex) ? matFingertip : matJoint;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      handGroup.add(mesh);
      joints.push(mesh);
    }
    jointMeshesRef.current = joints;

    // Create bone meshes (for both hands) with very low polycount
    const bones: THREE.Mesh[] = [];
    for (let handIdx = 0; handIdx < 2; handIdx++) {
      for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
        // Drastically reduced segment count for cylinders (5 instead of 16)
        const geo = new THREE.CylinderGeometry(0.06, 0.08, 1, 5);
        geo.translate(0, 0.5, 0);
        const mesh = new THREE.Mesh(geo, matBone);
        mesh.visible = false;
        handGroup.add(mesh);
        bones.push(mesh);
      }
    }
    boneMeshesRef.current = bones;

    // Subtle grid for light theme
    const grid = new THREE.GridHelper(12, 24, 0x60a5fa, 0xe2e8f0);
    grid.position.y = -3.5;
    scene.add(grid);

  }, []);

  // Update loop
  const animate = useCallback(() => {
    rafRef.current = requestAnimationFrame(animate);

    const lm = landmarksRef.current;
    const hasHand = lm !== null && lm.length === 42;
    const now = Date.now(); // Cache once per frame

    const hand1Active = hasHand && lm[0].x !== -99.0;
    const hand2Active = hasHand && lm[21].x !== -99.0;
    const anyHandActive = hand1Active || hand2Active;

    if (anyHandActive) {
      lastActiveHandsRef.current[0] = hand1Active;
      lastActiveHandsRef.current[1] = hand2Active;
    }

    const targetVisible = anyHandActive ? 1 : 0;
    handVisibleProgress.current += (targetVisible - handVisibleProgress.current) * 0.08;
    const alpha = handVisibleProgress.current;

    // Update target positions from landmarks
    if (hasHand && lm) {
      for (let i = 0; i < JOINT_COUNT; i++) {
        if (lm[i].x !== -99.0) {
          const target = landmarkToVec3(lm[i]);

          // Snap if it was previously missing (target was 0,0,0) to prevent flying hands
          if (targetPositions.current[i].x === 0 && targetPositions.current[i].y === 0 && targetPositions.current[i].z === 0) {
            currentPositions.current[i].copy(target);
          }
          targetPositions.current[i].copy(target);
        } else {
          // Hand is missing, reset to 0,0,0 so it snaps next time it appears
          targetPositions.current[i].set(0, 0, 0);
        }
      }
    } else {
      // All hands missing, reset targets
      for (let i = 0; i < JOINT_COUNT; i++) {
        targetPositions.current[i].set(0, 0, 0);
      }
    }

    // Lerp current positions toward targets
    if (alpha > 0.01) {
      for (let i = 0; i < JOINT_COUNT; i++) {
        if (hasHand && lm && lm[i].x !== -99.0) {
          currentPositions.current[i].lerp(targetPositions.current[i], 0.25);
        }
      }

      // Calculate dynamic scale for each hand based on the distance from wrist (0) to middle MCP (9)
      const handScales = [1, 1];
      for (let handIdx = 0; handIdx < 2; handIdx++) {
        const offset = handIdx * 21;
        if (hasHand && lm && lm[offset].x !== -99.0 && lm[offset + 9].x !== -99.0) {
          const dist = currentPositions.current[offset].distanceTo(currentPositions.current[offset + 9]);
          // Base distance is roughly 1.5 when hand is medium size. We scale relative to 1.5.
          handScales[handIdx] = Math.max(0.1, dist / 1.5);
        }
      }

      // Update joint meshes
      const joints = jointMeshesRef.current;
      for (let i = 0; i < joints.length; i++) {
        const handIdx = i >= 21 ? 1 : 0;

        // A joint should be visible if its hand is currently active, 
        // OR if NO hands are active but this hand was the last active one (so it fades out).
        const shouldBeVisible = anyHandActive
          ? (handIdx === 0 ? hand1Active : hand2Active)
          : lastActiveHandsRef.current[handIdx];

        const mesh = joints[i];

        if (!shouldBeVisible) {
          mesh.visible = false;
        } else {
          mesh.position.copy(currentPositions.current[i]);
          mesh.visible = true;

          mesh.lookAt(cameraRef.current!.position);

          const scaleMultiplier = handScales[handIdx];
          let finalScale = scaleMultiplier;

          if (alpha > 0.5) {
            const pulse = 1 + Math.sin(now * 0.003 + i) * 0.05;
            finalScale *= pulse;
          }
          mesh.scale.setScalar(finalScale);
        }
      }

      // Update bones
      const bones = boneMeshesRef.current;
      for (let handIdx = 0; handIdx < 2; handIdx++) {
        const offset = handIdx * 21;
        const shouldBeVisible = anyHandActive
          ? (handIdx === 0 ? hand1Active : hand2Active)
          : lastActiveHandsRef.current[handIdx];

        for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
          const mesh = bones[handIdx * HAND_CONNECTIONS.length + bi];
          if (!shouldBeVisible) {
            mesh.visible = false;
            continue;
          }

          const [a, b] = HAND_CONNECTIONS[bi];
          const posA = currentPositions.current[offset + a];
          const posB = currentPositions.current[offset + b];

          const dir = _tmpDir.current.subVectors(posB, posA);
          const length = dir.length();

          if (length > 0.001) {
            mesh.visible = true;
            mesh.position.copy(posA);
            // Scale thickness dynamically based on hand size
            const thicknessScale = handScales[handIdx];
            mesh.scale.set(thicknessScale, length, thicknessScale);
            mesh.lookAt(posB);
            mesh.rotateX(Math.PI / 2);
          } else {
            mesh.visible = false;
          }
        }
      }

      // Explicit Opacity control using explicit material references
      if (matWristRef.current) matWristRef.current.opacity = alpha * 0.7;
      if (matJointRef.current) matJointRef.current.opacity = alpha * 0.6;
      if (matFingertipRef.current) matFingertipRef.current.opacity = alpha * 0.8;
      if (matBoneRef.current) matBoneRef.current.opacity = alpha * 0.25;

    } else {
      jointMeshesRef.current.forEach(m => m.visible = false);
      boneMeshesRef.current.forEach(m => m.visible = false);
    }

    // Idle rotation
    const handGroup = handGroupRef.current;
    if (handGroup) {
      if (!anyHandActive) {
        idleRotRef.current += 0.003;
        handGroup.rotation.y += (Math.sin(idleRotRef.current) * 0.3 - handGroup.rotation.y) * 0.02;
        handGroup.rotation.x += (Math.sin(idleRotRef.current * 0.7) * 0.1 - handGroup.rotation.x) * 0.02;
      } else {
        handGroup.rotation.y += (0 - handGroup.rotation.y) * 0.05;
        handGroup.rotation.x += (0 - handGroup.rotation.x) * 0.05;
      }
    }

    // Render
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [landmarksRef]);

  // Robust Resize Observer (handles layout shifts gracefully)
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;

        if (cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = width / height;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(width, height);
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Init + animate
  useEffect(() => {
    initScene();
    rafRef.current = requestAnimationFrame(animate);

    const container = containerRef.current;

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (rendererRef.current) {
        if (sceneRef.current) {
          sceneRef.current.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => m.dispose());
              } else {
                mesh.material.dispose();
              }
            }
          });
        }
        rendererRef.current.dispose();
        if (container && rendererRef.current.domElement.parentElement === container) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initScene, animate]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        contain: 'layout style paint',
      }}
    >
      {/* Hand detection status pill */}
      <div className="hand-status">
        <div className={`status-dot ${isHandDetected ? 'online' : 'offline'}`} />
        <span>{isHandDetected ? 'Hand Detected' : 'Show your hand to the camera'}</span>
      </div>
    </div>
  );
}
