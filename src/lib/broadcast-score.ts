import type { Landmark, Mode } from "./engine";

const CONFIDENCE = 0.55;
/** Old minimum open or return. With a full upright bonus, the rep lands near 40. */
const MID = (25 / 85) * 100;
const OPEN_ARM = 0.35;
const CLOSED_ARM = 0.3;
const OPEN_LEG = 1.8;
const CLOSED_LEG = 1.25;
const PERFECT_LEG = 2;
const TOGETHER_LEG = 0.8;
const PERFECT_DROP = 1;

export type BroadcastGrade = {
  form: number;
  points: number;
  weakest: string;
};

export type LivePace = "fast" | "slow" | "good" | "idle";

export type LiveMeters = {
  arms: number | null;
  feet: number | null;
  bestArms: number;
  bestFeet: number;
  covered: boolean;
  pace: LivePace;
};

/** Arm-score units per second while the arms are between the bottom and the top. */
export function livePace(speedPerSecond: number | null): LivePace {
  if (speedPerSecond == null || !Number.isFinite(speedPerSecond)) return "idle";
  if (speedPerSecond < 8) return "idle";
  if (speedPerSecond >= 160) return "fast";
  if (speedPerSecond <= 40) return "slow";
  return "good";
}

export type PoseSample = {
  covered: boolean;
  arms: number | null;
  feet: number | null;
  armsReturn: number | null;
  feetReturn: number | null;
  lean: number | null;
};

const seen = (p: Landmark | undefined) =>
  !!p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  (p.visibility ?? 1) >= CONFIDENCE;

export function requiredJoints(mode: Mode) {
  return mode === "jumping-jacks"
    ? [11, 12, 15, 16, 23, 24, 27, 28]
    : [11, 12, 15, 16, 23, 24];
}

export function bodyCovered(
  landmarks: Landmark[] | null | undefined,
  mode: Mode,
) {
  if (!landmarks) return false;
  return requiredJoints(mode).every((index) => seen(landmarks[index]));
}

function rampUp(value: number, zero: number, mid: number, perfect: number) {
  if (value <= zero) return 0;
  if (value >= perfect) return 100;
  if (value <= mid) return (MID * (value - zero)) / (mid - zero);
  return MID + ((100 - MID) * (value - mid)) / (perfect - mid);
}

function rampDown(value: number, worst: number, mid: number, perfect: number) {
  if (value >= worst) return 0;
  if (value <= perfect) return 100;
  if (value >= mid) return (MID * (worst - value)) / (worst - mid);
  return MID + ((100 - MID) * (mid - value)) / (mid - perfect);
}

/** Live arm and foot position, plus the return and lean samples used when a rep closes. */
export function samplePose(
  landmarks: Landmark[] | null | undefined,
  mode: Mode,
): PoseSample {
  const empty: PoseSample = {
    covered: false,
    arms: null,
    feet: null,
    armsReturn: null,
    feetReturn: null,
    lean: null,
  };
  if (!landmarks) return empty;
  const shoulder =
    seen(landmarks[11]) && seen(landmarks[12]) ? landmarks : null;
  if (!shoulder) return empty;
  const width = Math.hypot(
    landmarks[11].x - landmarks[12].x,
    landmarks[11].y - landmarks[12].y,
  );
  if (width < 0.035) return empty;
  const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
  const head = landmarks[0];
  const headRise =
    seen(head) && head.y < shoulderY ? (shoulderY - head.y) / width : 1.5;
  const perfectRise = Math.max(OPEN_ARM + 0.15, headRise);
  const arms =
    seen(landmarks[15]) && seen(landmarks[16])
      ? rampUp(
          Math.min(
            (landmarks[11].y - landmarks[15].y) / width,
            (landmarks[12].y - landmarks[16].y) / width,
          ),
          0,
          OPEN_ARM,
          perfectRise,
        )
      : null;
  const armsReturn =
    seen(landmarks[15]) && seen(landmarks[16])
      ? rampUp(
          Math.min(
            (landmarks[15].y - landmarks[11].y) / width,
            (landmarks[16].y - landmarks[12].y) / width,
          ),
          0,
          CLOSED_ARM,
          PERFECT_DROP,
        )
      : null;
  const feet =
    mode === "jumping-jacks" && seen(landmarks[27]) && seen(landmarks[28])
      ? rampUp(
          Math.abs(landmarks[27].x - landmarks[28].x) / width,
          1,
          OPEN_LEG,
          PERFECT_LEG,
        )
      : mode === "jumping-jacks"
        ? null
        : null;
  const feetReturn =
    mode === "jumping-jacks" && seen(landmarks[27]) && seen(landmarks[28])
      ? rampDown(
          Math.abs(landmarks[27].x - landmarks[28].x) / width,
          OPEN_LEG,
          CLOSED_LEG,
          TOGETHER_LEG,
        )
      : null;
  let lean: number | null = null;
  if (seen(landmarks[23]) && seen(landmarks[24])) {
    const shift =
      Math.abs(
        (landmarks[11].x + landmarks[12].x) / 2 -
          (landmarks[23].x + landmarks[24].x) / 2,
      ) / width;
    const tilt = Math.abs(landmarks[11].y - landmarks[12].y) / width;
    lean = Math.min(15, (Math.max(shift, tilt) / 0.5) * 15);
  }
  return {
    covered: bodyCovered(landmarks, mode),
    arms,
    feet,
    armsReturn,
    feetReturn,
    lean,
  };
}

function deficit(score: number | null, weight: number) {
  if (!weight) return 0;
  if (score == null) return weight;
  return weight - (score / 100) * weight;
}

const CONTROLLED_MS = 1200;
const RUSHED_MS = 600;
const PACE_PENALTY = 30;

/** Arm raises lose up to 30 form points when the lift and lower are rushed. */
export function paceDeduction(mode: Mode, paceMs?: number) {
  if (mode !== "arm-raises" || paceMs == null || !Number.isFinite(paceMs))
    return 0;
  if (paceMs >= CONTROLLED_MS) return 0;
  if (paceMs <= RUSHED_MS) return PACE_PENALTY;
  return (PACE_PENALTY * (CONTROLLED_MS - paceMs)) / (CONTROLLED_MS - RUSHED_MS);
}

/** Turn the best open and the closing return into a 0–100 form grade. */
export function gradeCycle(
  mode: Mode,
  open: Pick<PoseSample, "arms" | "feet" | "lean">,
  close: Pick<PoseSample, "armsReturn" | "feetReturn">,
  paceMs?: number,
): BroadcastGrade {
  const jacks = mode === "jumping-jacks";
  const weights = {
    arms: jacks ? 25 : 50,
    feet: jacks ? 25 : 0,
    armsReturn: jacks ? 18 : 35,
    feetReturn: jacks ? 17 : 0,
  };
  const parts = [
    { name: open.arms == null ? "not visible" : "arms", miss: deficit(open.arms, weights.arms) },
    { name: open.feet == null ? "not visible" : "feet", miss: deficit(open.feet, weights.feet) },
    {
      name:
        close.armsReturn == null || (jacks && close.feetReturn == null)
          ? "not visible"
          : "return",
      miss:
        deficit(close.armsReturn, weights.armsReturn) +
        deficit(close.feetReturn, weights.feetReturn),
    },
    { name: "lean", miss: open.lean ?? 0 },
    { name: "pace", miss: paceDeduction(mode, paceMs) },
  ];
  const earned =
    weights.arms +
    weights.feet +
    weights.armsReturn +
    weights.feetReturn -
    parts
      .filter((part) => part.name !== "lean" && part.name !== "pace")
      .reduce((sum, part) => sum + part.miss, 0);
  const upright = open.lean == null ? 15 : 15 - Math.min(15, open.lean);
  const form = Math.max(
    0,
    Math.min(100, Math.round(earned + upright - paceDeduction(mode, paceMs))),
  );
  const weakest = parts.reduce((worst, part) =>
    part.miss > worst.miss ? part : worst,
  );
  return {
    form,
    points: Math.round((1 + form / 100) * 100) / 100,
    weakest: weakest.miss < 1 ? "clean" : weakest.name,
  };
}
