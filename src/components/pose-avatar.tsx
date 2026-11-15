import { armElevation, kneeFlexion } from "@/lib/geometry";
import type { Landmark } from "@/lib/engine";
import type { ExerciseId, PhaseName } from "@/lib/form";

type Props = {
  pose: Landmark[] | null;
  exercise: ExerciseId;
  target: number | null;
  tracking: boolean;
  progress: number;
  pastTarget: boolean;
  phase: PhaseName;
  calibrating: boolean;
  name: string;
};

const LIMBS = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
] as const;

const visible = (pose: Landmark[], index: number) =>
  Boolean(pose[index]) && (pose[index].visibility ?? 1) >= 0.5;

const point = (pose: Landmark[], index: number) => ({
  x: pose[index].x * 100,
  y: pose[index].y * 100,
});

function measuredAngle(pose: Landmark[], exercise: ExerciseId) {
  if (exercise === "arm-raises") {
    const values = [
      visible(pose, 11) && visible(pose, 15)
        ? armElevation(pose[11], pose[15])
        : null,
      visible(pose, 12) && visible(pose, 16)
        ? armElevation(pose[12], pose[16])
        : null,
    ].filter((value): value is number => value != null);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }
  const values = [
    visible(pose, 23) && visible(pose, 25) && visible(pose, 27)
      ? kneeFlexion(pose[23], pose[25], pose[27])
      : null,
    visible(pose, 24) && visible(pose, 26) && visible(pose, 28)
      ? kneeFlexion(pose[24], pose[26], pose[28])
      : null,
  ].filter((value): value is number => value != null);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function targetHands(pose: Landmark[], target: number) {
  if (![11, 12, 15, 16, 23, 24].every((index) => visible(pose, index))) return [];
  const torsoCenter = (pose[11].x + pose[12].x + pose[23].x + pose[24].x) / 4;
  return [
    [11, 15],
    [12, 16],
  ].map(([shoulderIndex, wristIndex]) => {
    const shoulder = pose[shoulderIndex];
    const wrist = pose[wristIndex];
    const length = Math.min(
      0.3,
      Math.max(0.12, Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y)),
    );
    const side = shoulder.x < torsoCenter ? -1 : 1;
    const radians = (target * Math.PI) / 180;
    return {
      x: (shoulder.x + Math.sin(radians) * length * side) * 100,
      y: (shoulder.y + Math.cos(radians) * length) * 100,
    };
  });
}

export default function PoseAvatar({
  pose,
  exercise,
  target,
  tracking,
  progress,
  pastTarget,
  phase,
  calibrating,
  name,
}: Props) {
  const angle = pose ? measuredAngle(pose, exercise) : null;
  const reached = !calibrating && !pastTarget && progress >= 0.97;
  const state = !tracking
    ? "lost"
    : pastTarget
      ? "past"
      : reached
        ? "reached"
        : calibrating
          ? "calibrating"
          : "moving";
  const message =
    state === "lost"
      ? "STEP INTO VIEW"
      : state === "past"
        ? exercise === "arm-raises"
          ? "TOO HIGH · LOWER SLIGHTLY"
          : "TOO DEEP · RETURN TOWARD TARGET"
        : state === "reached"
          ? "TARGET REACHED · START LOWERING"
          : state === "calibrating"
            ? "MIRRORING · SHOW A COMFORTABLE RANGE"
            : phase === "lowering"
              ? "CONTROL THE RETURN"
              : `KEEP MOVING · ${Math.round(progress * 100)}%`;
  const handTargets =
    pose && target != null && exercise === "arm-raises"
      ? targetHands(pose, target)
      : [];
  const torso =
    pose && [11, 12, 23, 24].every((index) => visible(pose, index))
      ? [point(pose, 11), point(pose, 12), point(pose, 24), point(pose, 23)]
      : [];

  return (
    <section
      className={`pose-avatar pose-avatar-${state}`}
      aria-label={`${name} movement avatar`}
      data-state={state}
    >
      <header>
        <span>LIVE MOVEMENT AVATAR</span>
        <strong>{name}</strong>
      </header>
      <div className="pose-avatar-stage">
        {state === "past" && <div className="pose-avatar-alert">!</div>}
        <svg viewBox="0 0 100 100" role="img" aria-label={message}>
          {handTargets.map((hand, index) => (
            <g className="avatar-target" key={index}>
              <circle cx={hand.x} cy={hand.y} r="4.4" />
              <circle cx={hand.x} cy={hand.y} r="1.5" />
            </g>
          ))}
          {pose && (
            <>
              {torso.length === 4 && (
                <polygon
                  className="avatar-torso"
                  points={torso.map(({ x, y }) => `${x},${y}`).join(" ")}
                />
              )}
              {LIMBS.map(([from, to]) =>
                visible(pose, from) && visible(pose, to) ? (
                  <line
                    className="avatar-limb"
                    key={`${from}-${to}`}
                    x1={point(pose, from).x}
                    y1={point(pose, from).y}
                    x2={point(pose, to).x}
                    y2={point(pose, to).y}
                  />
                ) : null,
              )}
              {visible(pose, 0) && (
                <circle
                  className="avatar-head"
                  cx={point(pose, 0).x}
                  cy={point(pose, 0).y}
                  r="5.5"
                />
              )}
              {[15, 16, 27, 28].map((index) =>
                visible(pose, index) ? (
                  <circle
                    className="avatar-joint"
                    key={index}
                    cx={point(pose, index).x}
                    cy={point(pose, index).y}
                    r="2.4"
                  />
                ) : null,
              )}
            </>
          )}
        </svg>
      </div>
      <div className="pose-avatar-readout">
        <strong data-testid="avatar-guidance">{message}</strong>
        <span>
          {angle == null ? "Waiting for a clear pose" : `Current ${Math.round(angle)}°`}
          {target == null ? "" : ` · Stop at ${Math.round(target)}°`}
        </span>
      </div>
    </section>
  );
}
