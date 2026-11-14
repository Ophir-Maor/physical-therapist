import { syntheticPose, type Landmark } from "./engine";

/** MediaPipe image coordinates: y grows downward. Angles are degrees. */
export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (mag < 1e-6) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
}

/** 0° arms down, 90° horizontal, 180° overhead. Scale-free. */
export function armElevation(shoulder: Landmark, wrist: Landmark): number {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

/** 0° is a straight knee. Larger means more bend. Single-camera and approximate. */
export function kneeFlexion(hip: Landmark, knee: Landmark, ankle: Landmark): number {
  return 180 - jointAngle(hip, knee, ankle);
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const point = (
  pose: Landmark[],
  index: number,
  x: number,
  y: number,
  visibility = 0.99,
) => {
  pose[index] = { x, y, z: 0, visibility };
};

/** Deterministic arm pose. `elevation` is the intended shoulder-to-wrist angle. */
export function armPose(
  elevation: number,
  centerX = 0.5,
  asymmetry = 0,
): Landmark[] {
  const pose = syntheticPose(false, centerX);
  const length = 0.2;
  ([-1, 1] as const).forEach((side) => {
    const shoulder = side < 0 ? 11 : 12;
    const elbow = side < 0 ? 13 : 14;
    const wrist = side < 0 ? 15 : 16;
    const extra = side < 0 ? asymmetry : 0;
    const angle = ((elevation + extra) * Math.PI) / 180;
    const sx = pose[shoulder].x;
    const sy = pose[shoulder].y;
    const dx = Math.sin(angle) * length * side;
    const dy = Math.cos(angle) * length;
    point(pose, elbow, sx + dx * 0.5, sy + dy * 0.5);
    point(pose, wrist, sx + dx, sy + dy);
  });
  return pose;
}

/**
 * Deterministic squat pose. Flexion is approximate in the image plane;
 * a webcam cannot see true depth.
 */
export function squatPose(flexion: number, centerX = 0.5): Landmark[] {
  const pose = syntheticPose(false, centerX);
  const bend = (clamp(flexion, 0, 120) * Math.PI) / 180;
  const hipDrop = (1 - Math.cos(bend)) * 0.09;
  const kneeForward = Math.sin(bend) * 0.11;
  ([-1, 1] as const).forEach((side) => {
    const hip = side < 0 ? 23 : 24;
    const knee = side < 0 ? 25 : 26;
    const ankle = side < 0 ? 27 : 28;
    const hx = centerX + side * 0.045;
    const hy = 0.52 + hipDrop;
    point(pose, hip, hx, hy);
    point(pose, knee, hx + side * kneeForward, hy + 0.16);
    point(pose, ankle, hx + side * 0.012, hy + 0.34);
  });
  point(pose, 11, centerX - 0.06, 0.3 + hipDrop * 0.35);
  point(pose, 12, centerX + 0.06, 0.3 + hipDrop * 0.35);
  return pose;
}
