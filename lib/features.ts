/**
 * @deprecated This module is not imported anywhere in the codebase.
 * Feature extraction (normalization + bone vectors) is now handled entirely by the Python backend.
 * Kept for reference only — safe to delete.
 */

const Config = {
  MASK_VALUE: 0.0,
  JOINT_DIM: 126,
  BONE_DIM: 126,
  FEATURE_DIM: 252
};

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
];

function normalizePair(leftRaw: number[], rightRaw: number[]) {
    const points: number[][] = [];
    if (leftRaw[0] !== Config.MASK_VALUE) {
        for (let i = 0; i < 63; i += 3) points.push([leftRaw[i], leftRaw[i+1], leftRaw[i+2]]);
    }
    if (rightRaw[0] !== Config.MASK_VALUE) {
        for (let i = 0; i < 63; i += 3) points.push([rightRaw[i], rightRaw[i+1], rightRaw[i+2]]);
    }
    
    if (points.length === 0) {
        const masked = new Array(63).fill(Config.MASK_VALUE);
        return { leftNorm: masked, rightNorm: masked };
    }
    
    const leftWrist = leftRaw[0] !== Config.MASK_VALUE ? [leftRaw[0], leftRaw[1], leftRaw[2]] : null;
    const rightWrist = rightRaw[0] !== Config.MASK_VALUE ? [rightRaw[0], rightRaw[1], rightRaw[2]] : null;
    
    let origin;
    if (leftWrist && rightWrist) {
        origin = [(leftWrist[0]+rightWrist[0])/2, (leftWrist[1]+rightWrist[1])/2, (leftWrist[2]+rightWrist[2])/2];
    } else if (leftWrist) {
        origin = leftWrist;
    } else {
        origin = rightWrist!;
    }
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of points) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
    const dx = maxX - minX; const dy = maxY - minY; const dz = maxZ - minZ;
    const scale = Math.max(dx, dy, dz, 0.0001);
    
    const normalize = (handRaw: number[]) => {
        if (handRaw[0] === Config.MASK_VALUE) return new Array(63).fill(Config.MASK_VALUE);
        const normalized = new Array(63).fill(0);
        for (let i = 0; i < 63; i += 3) {
            if (handRaw[i] === Config.MASK_VALUE) {
                normalized[i] = Config.MASK_VALUE;
                normalized[i+1] = Config.MASK_VALUE;
                normalized[i+2] = Config.MASK_VALUE;
            } else {
                normalized[i] = (handRaw[i] - origin[0]) / scale;
                normalized[i+1] = (handRaw[i+1] - origin[1]) / scale;
                normalized[i+2] = (handRaw[i+2] - origin[2]) / scale;
            }
        }
        return normalized;
    };
    
    return { leftNorm: normalize(leftRaw), rightNorm: normalize(rightRaw) };
}

export function extractFeatures(rawLandmarks: number[]): number[] {
    if (!rawLandmarks || rawLandmarks.length !== Config.JOINT_DIM) {
        return new Array(Config.FEATURE_DIM).fill(Config.MASK_VALUE);
    }
    
    const leftRaw = rawLandmarks.slice(0, 63);
    const rightRaw = rawLandmarks.slice(63);
    
    const { leftNorm, rightNorm } = normalizePair(leftRaw, rightRaw);
    
    const joints = [...leftNorm, ...rightNorm];
    const bones = new Array(Config.BONE_DIM).fill(Config.MASK_VALUE);
    
    const computeBones = (normHand: number[], offset: number) => {
        if (normHand[0] === Config.MASK_VALUE) return;
        let idx = 0;
        for (const [start, end] of HAND_CONNECTIONS) {
            const start_i = start * 3;
            const end_i = end * 3;
            if (start_i + 2 >= normHand.length || end_i + 2 >= normHand.length) continue;
            
            bones[offset + idx] = normHand[end_i] - normHand[start_i];
            bones[offset + idx + 1] = normHand[end_i+1] - normHand[start_i+1];
            bones[offset + idx + 2] = normHand[end_i+2] - normHand[start_i+2];
            idx += 3;
        }
    };
    
    computeBones(leftNorm, 0);
    computeBones(rightNorm, 63);
    
    return [...joints, ...bones];
}
