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

const JOINT_COUNT = 21;
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
  const targetPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3(0, 0, 0))
  );
  const currentPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3(0, 0, 0))
  );
  const handGroupRef = useRef<THREE.Group | null>(null);
  const idleRotRef = useRef(0);
  const rafRef = useRef<number>(0);
  const hasHandRef = useRef(false);
  const handVisibleProgress = useRef(0); // 0-1 for fade-in/out
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);

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
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Lower pixel ratio for max performance
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0x000000, 0); // Transparent to blend with light theme

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Basic lighting for smooth solid materials (very lightweight)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(2, 5, 4);
    scene.add(dirLight);

    // Hand group
    const handGroup = new THREE.Group();
    scene.add(handGroup);
    handGroupRef.current = handGroup;

    // Translucent (hologram/glass) materials without wireframe lines
    const matJoint = new THREE.MeshPhongMaterial({ color: COL_BLUE, transparent: true, opacity: 0.6, shininess: 80 });
    const matFingertip = new THREE.MeshPhongMaterial({ color: COL_YELLOW, transparent: true, opacity: 0.8, shininess: 100 });
    const matWrist = new THREE.MeshPhongMaterial({ color: COL_RED, transparent: true, opacity: 0.7, shininess: 80 });
    const matBone = new THREE.MeshPhongMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.25, shininess: 40 });


    // Create joint meshes
    const joints: THREE.Mesh[] = [];
    for (let i = 0; i < JOINT_COUNT; i++) {
      // Radius for the joint
      const radius = i === WRIST_ID ? 0.2 : 0.14;

      // Smooth solid sphere
      const geo = new THREE.SphereGeometry(radius, 16, 16);

      const mat = i === WRIST_ID ? matWrist : FINGERTIP_IDS.includes(i) ? matFingertip : matJoint;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      handGroup.add(mesh);
      joints.push(mesh);
    }
    jointMeshesRef.current = joints;

    // Create bone meshes
    const bones: THREE.Mesh[] = [];
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      // Smooth minimalist cylinder for bones
      const geo = new THREE.CylinderGeometry(0.06, 0.08, 1, 16);
      geo.translate(0, 0.5, 0); // origin at one end
      const mesh = new THREE.Mesh(geo, matBone);
      mesh.visible = false;
      handGroup.add(mesh);
      bones.push(mesh);
    }
    boneMeshesRef.current = bones;

    // Subtle grid for light theme
    const grid = new THREE.GridHelper(12, 24, 0x60a5fa, 0xe2e8f0);

    grid.position.y = -3.5;
    scene.add(grid);
    gridRef.current = grid;

    // Particles removed for better performance (reducing lag)


  }, []);

  // Update loop
  const animate = useCallback(() => {
    rafRef.current = requestAnimationFrame(animate);

    const lm = landmarksRef.current;
    const hasHand = lm !== null && lm.length === 21;
    hasHandRef.current = hasHand;

    // Smooth fade in/out
    const targetVisible = hasHand ? 1 : 0;
    handVisibleProgress.current += (targetVisible - handVisibleProgress.current) * 0.08;
    const alpha = handVisibleProgress.current;

    // Update target positions from landmarks
    if (hasHand && lm) {
      for (let i = 0; i < JOINT_COUNT; i++) {
        targetPositions.current[i] = landmarkToVec3(lm[i]);
      }
    }

    // Lerp current positions toward targets
    if (alpha > 0.01) {
      for (let i = 0; i < JOINT_COUNT; i++) {
        currentPositions.current[i].lerp(targetPositions.current[i], 0.25);
      }

      // Update joint meshes
      const joints = jointMeshesRef.current;
      for (let i = 0; i < joints.length; i++) {
        const mesh = joints[i];
        mesh.position.copy(currentPositions.current[i]);
        mesh.visible = true;

        // Ensure ring faces the camera slightly or maintains rotation
        mesh.lookAt(cameraRef.current!.position);

        // Subtly scale active rings
        if (alpha > 0.5) {
          const pulse = 1 + Math.sin(Date.now() * 0.003 + i) * 0.05;
          mesh.scale.setScalar(pulse);
        } else {
          mesh.scale.setScalar(1);
        }
      }

      // Update bones
      const bones = boneMeshesRef.current;
      for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
        const [a, b] = HAND_CONNECTIONS[bi];
        const posA = currentPositions.current[a];
        const posB = currentPositions.current[b];
        const mesh = bones[bi];

        mesh.visible = true;

        // Position at start joint, orient toward end joint
        mesh.position.copy(posA);
        const dir = new THREE.Vector3().subVectors(posB, posA);
        const length = dir.length();
        mesh.scale.set(1, length, 1);
        mesh.lookAt(posB);
        mesh.rotateX(Math.PI / 2);
      }
      // Update opacities to match fade-in/out while keeping relative translucent levels
      if (joints.length > 0) {
        (joints[WRIST_ID].material as THREE.Material).opacity = alpha * 0.7;
        (joints[1].material as THREE.Material).opacity = alpha * 0.6; // Joint material
        (joints[4].material as THREE.Material).opacity = alpha * 0.8; // Fingertip material
      }
      if (bones.length > 0) {
        (bones[0].material as THREE.Material).opacity = alpha * 0.25;
      }
    } else {
      // Hide all if alpha is too low
      jointMeshesRef.current.forEach(m => m.visible = false);
      boneMeshesRef.current.forEach(m => m.visible = false);
    }

    // Idle rotation
    const handGroup = handGroupRef.current;
    if (handGroup) {
      if (!hasHand) {
        idleRotRef.current += 0.003;
        handGroup.rotation.y += (Math.sin(idleRotRef.current) * 0.3 - handGroup.rotation.y) * 0.02;
        handGroup.rotation.x += (Math.sin(idleRotRef.current * 0.7) * 0.1 - handGroup.rotation.x) * 0.02;
      } else {
        handGroup.rotation.y += (0 - handGroup.rotation.y) * 0.05;
        handGroup.rotation.x += (0 - handGroup.rotation.x) * 0.05;
      }
    }

    // Animate particles removed

    // Render
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [landmarksRef]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Init + animate
  useEffect(() => {
    initScene();
    rafRef.current = requestAnimationFrame(animate);

    const container = containerRef.current;

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (rendererRef.current) {
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
        borderRadius: 24,
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
