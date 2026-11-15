import {
  gradeCycle,
  livePace,
  samplePose,
  type BroadcastGrade,
  type LiveMeters,
} from "./broadcast-score";

export type { BroadcastGrade, LiveMeters };

export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
export type Mode = "jumping-jacks" | "arm-raises";
export type ActivityEvent = {
  type: "REP_COMPLETED";
  grade: BroadcastGrade;
};
export type DetectorOptions = {
  confidence: number;
  holdMs: number;
  minimumCycleMs: number;
  missingResetMs: number;
  smoothing: number;
  openArmRatio: number;
  closedArmRatio: number;
  openLegRatio: number;
  closedLegRatio: number;
};
const defaults: DetectorOptions = {
  confidence: 0.55,
  holdMs: 100,
  minimumCycleMs: 500,
  missingResetMs: 700,
  smoothing: 0.55,
  openArmRatio: 0.35,
  closedArmRatio: 0.3,
  openLegRatio: 1.8,
  closedLegRatio: 1.25,
};
const valid = (p: Landmark | undefined, confidence = 0.55): p is Landmark =>
  !!p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  (p.visibility ?? 1) >= confidence;

/** A full, held closed → open → closed cycle. Times are monotonic milliseconds. */
export class ActivityDetector {
  state = "seeking-closed";
  meters: LiveMeters = {
    arms: null,
    feet: null,
    bestArms: 0,
    bestFeet: 0,
    covered: false,
    pace: "idle",
  };
  private armTrail: { t: number; arms: number }[] = [];
  private options: DetectorOptions;
  private smooth: Landmark[] | null = null;
  private lastSeen = -Infinity;
  private lastTime = -Infinity;
  private candidate = "";
  private candidateSince = 0;
  private cycleSince = 0;
  private neutralAt = -1;
  private peakArms = 0;
  private peakFeet: number | null = null;
  private peakLean: number | null = null;
  private peakScore = -1;
  private openedAt = -1;
  constructor(
    public mode: Mode,
    options: Partial<DetectorOptions> = {},
  ) {
    this.options = { ...defaults, ...options };
  }
  reset() {
    this.state = "seeking-closed";
    this.smooth = null;
    this.lastSeen = -Infinity;
    this.lastTime = -Infinity;
    this.candidate = "";
    this.cycleSince = 0;
    this.neutralAt = -1;
    this.peakArms = 0;
    this.peakFeet = null;
    this.peakLean = null;
    this.peakScore = -1;
    this.openedAt = -1;
    this.armTrail = [];
    this.meters = {
      arms: null,
      feet: null,
      bestArms: 0,
      bestFeet: 0,
      covered: false,
      pace: "idle",
    };
  }
  private notePace(arms: number | null, timestamp: number) {
    if (this.mode !== "arm-raises" || arms == null) {
      this.armTrail = [];
      this.meters.pace = "idle";
      return;
    }
    this.armTrail.push({ t: timestamp, arms });
    this.armTrail = this.armTrail.filter((sample) => timestamp - sample.t <= 400);
    const first = this.armTrail[0];
    const elapsed = timestamp - first.t;
    const delta = Math.abs(arms - first.arms);
    if (this.armTrail.length < 2 || elapsed < 80 || delta < 12) {
      this.meters.pace = "idle";
      return;
    }
    this.meters.pace = livePace(delta / (elapsed / 1000));
  }
  private rememberPeak(sample: ReturnType<typeof samplePose>) {
    const openScore = (sample.arms ?? 0) + (sample.feet ?? 0);
    if (sample.arms != null && openScore >= this.peakScore) {
      this.peakScore = openScore;
      this.peakArms = sample.arms;
      this.peakFeet = sample.feet;
      this.peakLean = sample.lean;
    }
    if (sample.arms != null)
      this.meters.bestArms = Math.max(this.meters.bestArms, sample.arms);
    if (sample.feet != null)
      this.meters.bestFeet = Math.max(this.meters.bestFeet, sample.feet);
  }
  update(landmarks: Landmark[], timestamp: number): ActivityEvent[] {
    if (!Number.isFinite(timestamp) || timestamp <= this.lastTime) return [];
    this.lastTime = timestamp;
    const ids =
      this.mode === "jumping-jacks"
        ? [11, 12, 15, 16, 23, 24, 27, 28]
        : [11, 12, 15, 16];
    if (!ids.every((i) => valid(landmarks[i], this.options.confidence))) {
      const gap = timestamp - this.lastSeen;
      this.meters = { ...this.meters, covered: false, pace: "idle" };
      if (gap <= 200) return [];
      this.candidate = "";
      if (gap > this.options.missingResetMs) {
        this.state = "seeking-closed";
        this.smooth = null;
      }
      return [];
    }
    if (timestamp - this.lastSeen > this.options.missingResetMs) {
      this.state = "seeking-closed";
      this.smooth = null;
      this.candidate = "";
    }
    this.lastSeen = timestamp;
    const alpha = this.options.smoothing;
    this.smooth = landmarks.map((p, i) => ({
      ...p,
      x: this.smooth?.[i] ? alpha * p.x + (1 - alpha) * this.smooth[i].x : p.x,
      y: this.smooth?.[i] ? alpha * p.y + (1 - alpha) * this.smooth[i].y : p.y,
    }));
    const p = this.smooth;
    const sample = samplePose(p, this.mode);
    this.meters = {
      ...this.meters,
      arms: sample.arms,
      feet: this.mode === "jumping-jacks" ? sample.feet : null,
      covered: sample.covered,
    };
    this.notePace(sample.arms, timestamp);
    if (this.state === "closed" || this.state === "open") this.rememberPeak(sample);
    const shoulderWidth = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y);
    if (shoulderWidth < 0.035) {
      this.candidate = "";
      return [];
    }
    const armsOpen =
      p[15].y < p[11].y - shoulderWidth * this.options.openArmRatio &&
      p[16].y < p[12].y - shoulderWidth * this.options.openArmRatio;
    const armsClosed =
      p[15].y > p[11].y + shoulderWidth * this.options.closedArmRatio &&
      p[16].y > p[12].y + shoulderWidth * this.options.closedArmRatio;
    const legSpread =
      this.mode === "jumping-jacks"
        ? Math.abs(p[27].x - p[28].x) / shoulderWidth
        : 0;
    const upright =
      this.mode !== "jumping-jacks" ||
      (p[23].y > p[11].y &&
        p[24].y > p[12].y &&
        p[27].y > p[23].y &&
        p[28].y > p[24].y);
    const pose =
      upright &&
      armsOpen &&
      (this.mode === "arm-raises" || legSpread > this.options.openLegRatio)
        ? "open"
        : upright &&
            armsClosed &&
            (this.mode === "arm-raises" ||
              legSpread < this.options.closedLegRatio)
          ? "closed"
          : "neutral";
    if (
      pose === "neutral" &&
      (this.candidate === "open" || this.candidate === "closed")
    ) {
      if (this.neutralAt < 0) this.neutralAt = timestamp;
      if (timestamp - this.neutralAt < 120) return [];
    } else this.neutralAt = -1;
    const opening = pose === "open" && this.state === "closed";
    if (pose !== this.candidate) {
      this.candidate = pose;
      this.candidateSince = timestamp;
      if (!opening) return [];
    }
    if (opening) {
      this.state = "open";
      this.openedAt = timestamp;
      this.rememberPeak(sample);
      return [];
    }
    if (timestamp - this.candidateSince < this.options.holdMs) return [];
    if (pose === "closed" && this.state === "seeking-closed") {
      this.state = "closed";
      this.cycleSince = timestamp;
    } else if (pose === "closed" && this.state === "open") {
      this.state = "closed";
      const elapsed = timestamp - this.cycleSince;
      this.cycleSince = timestamp;
      if (elapsed >= this.options.minimumCycleMs) {
        const grade = gradeCycle(
          this.mode,
          {
            arms: this.peakArms,
            feet: this.mode === "jumping-jacks" ? this.peakFeet : null,
            lean: this.peakLean,
          },
          { armsReturn: sample.armsReturn, feetReturn: sample.feetReturn },
          this.openedAt > 0 ? timestamp - this.openedAt : undefined,
        );
        this.peakArms = 0;
        this.peakFeet = null;
        this.peakLean = null;
        this.peakScore = -1;
        this.openedAt = -1;
        this.meters.bestArms = 0;
        this.meters.bestFeet = 0;
        return [{ type: "REP_COMPLETED", grade }];
      }
    }
    return [];
  }
}

const center = (pose: Landmark[]) => {
  const points = [11, 12, 23, 24].map((i) => pose[i]).filter((p) => valid(p));
  return points.length >= 2
    ? points.reduce((sum, p) => sum + p.x, 0) / points.length
    : null;
};
/** Spatial identity, not biometric identity. Crossing/occlusion remains ambiguous. */
export class PlayerTracker {
  private centers: (number | null)[];
  private seen: number[];
  constructor(public count: number) {
    this.count = Math.max(1, Math.min(2, count));
    this.centers = Array(this.count).fill(null);
    this.seen = Array(this.count).fill(-Infinity);
  }
  reset() {
    this.centers.fill(null);
    this.seen.fill(-Infinity);
  }
  update(poses: Landmark[][], timestamp: number): (Landmark[] | null)[] {
    const candidates = poses
      .map((pose) => ({ pose, x: center(pose) }))
      .filter((p): p is { pose: Landmark[]; x: number } => p.x !== null)
      .sort((a, b) => a.x - b.x)
      .slice(0, this.count);
    const result: (Landmark[] | null)[] = Array(this.count).fill(null);
    if (!candidates.length) return result;
    // Retain last position through brief occlusion; after 2s use the original lane.
    const anchors = this.centers.map((x, i) =>
      x !== null && timestamp - this.seen[i] < 2000
        ? x
        : this.count === 1
          ? 0.5
          : i === 0
            ? 0.28
            : 0.72,
    );
    let assignments: number[];
    if (this.count === 1) assignments = [0];
    else if (candidates.length === 1)
      assignments = [
        Math.abs(candidates[0].x - anchors[0]) <=
        Math.abs(candidates[0].x - anchors[1])
          ? 0
          : 1,
      ];
    else
      assignments =
        Math.abs(candidates[0].x - anchors[0]) +
          Math.abs(candidates[1].x - anchors[1]) <=
        Math.abs(candidates[0].x - anchors[1]) +
          Math.abs(candidates[1].x - anchors[0])
          ? [0, 1]
          : [1, 0];
    candidates.forEach((candidate, j) => {
      const i = assignments[j];
      if (Math.abs(candidate.x - anchors[i]) > 0.42) return;
      result[i] = candidate.pose;
      this.centers[i] = candidate.x;
      this.seen[i] = timestamp;
    });
    return result;
  }
}
export type GameEventType =
  | "MATCH_STARTED"
  | "REP_COMPLETED"
  | "PLAYER_TAKES_LEAD"
  | "SCORE_TIED"
  | "MILESTONE"
  | "HALF_TIME"
  | "FINAL_TEN_SECONDS"
  | "MATCH_FINISHED";
export type GameEvent = {
  id: string;
  type: GameEventType;
  player?: number;
  scores: number[];
  reps: number[];
  averages: number[];
  timestamp: number;
  form?: number;
  points?: number;
  weakest?: string;
};
export class GameEngine {
  state: "idle" | "active" | "complete" = "idle";
  scores: number[];
  repCounts: number[];
  events: GameEvent[] = [];
  remaining: number;
  winner: number | null = null;
  paused = false;
  private startedAt = 0;
  private lastTime = 0;
  private half = false;
  private finalTen = false;
  private formSums: number[];
  private pausedTotal = 0;
  private pauseStarted = 0;
  readonly duration: number;
  readonly players: string[];
  constructor(options: { duration: number; players: string[] }) {
    this.duration = Math.max(
      1,
      Number.isFinite(options.duration) ? options.duration : 30,
    );
    this.players = options.players.slice(0, 2);
    if (!this.players.length) this.players = ["Player 1"];
    this.scores = this.players.map(() => 0);
    this.repCounts = this.players.map(() => 0);
    this.formSums = this.players.map(() => 0);
    this.remaining = this.duration;
  }
  get averages() {
    return this.repCounts.map((count, index) =>
      count ? this.formSums[index] / count : 0,
    );
  }
  private emit(
    type: GameEventType,
    timestamp: number,
    player?: number,
    detail?: { form?: number; points?: number; weakest?: string },
  ) {
    this.events.push({
      id: `${this.events.length}-${type}`,
      type,
      timestamp,
      scores: [...this.scores],
      reps: [...this.repCounts],
      averages: this.averages,
      ...(player === undefined ? {} : { player }),
      ...detail,
    });
  }
  start(timestamp: number) {
    if (this.state !== "idle" || !Number.isFinite(timestamp)) return;
    this.state = "active";
    this.startedAt = this.lastTime = timestamp;
    this.emit("MATCH_STARTED", timestamp);
  }
  pause(timestamp: number) {
    if (this.state !== "active" || this.paused || !Number.isFinite(timestamp))
      return;
    this.paused = true;
    this.pauseStarted = timestamp;
  }
  resume(timestamp: number) {
    if (!this.paused || !Number.isFinite(timestamp)) return;
    this.pausedTotal += Math.max(0, timestamp - this.pauseStarted);
    this.paused = false;
    this.lastTime = timestamp;
  }
  tick(timestamp: number) {
    if (
      this.state !== "active" ||
      this.paused ||
      !Number.isFinite(timestamp) ||
      timestamp < this.lastTime
    )
      return;
    this.lastTime = timestamp;
    this.remaining = Math.max(
      0,
      this.duration - (timestamp - this.startedAt - this.pausedTotal) / 1000,
    );
    if (!this.half && this.remaining <= this.duration / 2) {
      this.half = true;
      this.emit("HALF_TIME", timestamp);
    }
    if (!this.finalTen && this.remaining <= 10) {
      this.finalTen = true;
      this.emit("FINAL_TEN_SECONDS", timestamp);
    }
    if (this.remaining === 0) {
      this.state = "complete";
      this.winner =
        this.scores.length === 1
          ? 0
          : this.scores[0] === this.scores[1]
            ? null
            : this.scores[0] > this.scores[1]
              ? 0
              : 1;
      this.emit("MATCH_FINISHED", timestamp, this.winner ?? undefined);
    }
  }
  rep(
    player: number,
    timestamp: number,
    detail?: { form?: number; weakest?: string },
  ) {
    if (!Number.isFinite(timestamp) || timestamp < this.lastTime) return;
    this.tick(timestamp);
    if (
      this.state !== "active" ||
      this.paused ||
      !Number.isInteger(player) ||
      player < 0 ||
      player >= this.scores.length
    )
      return;
    const form = Math.max(0, Math.min(100, detail?.form ?? 0));
    const points = Math.round((1 + form / 100) * 100) / 100;
    const previous =
      this.scores.length === 2 ? Math.sign(this.scores[0] - this.scores[1]) : 0;
    this.repCounts[player] += 1;
    this.formSums[player] += form;
    this.scores[player] =
      Math.round((this.scores[player] + points) * 100) / 100;
    this.emit("REP_COMPLETED", timestamp, player, {
      form,
      points,
      weakest: detail?.weakest,
    });
    if (this.repCounts[player] % 5 === 0)
      this.emit("MILESTONE", timestamp, player);
    if (this.scores.length === 2) {
      const next = Math.sign(this.scores[0] - this.scores[1]);
      if (next === 0) this.emit("SCORE_TIED", timestamp);
      else if (next !== previous)
        this.emit("PLAYER_TAKES_LEAD", timestamp, next > 0 ? 0 : 1);
    }
  }
  reset() {
    this.state = "idle";
    this.scores = this.players.map(() => 0);
    this.repCounts = this.players.map(() => 0);
    this.formSums = this.players.map(() => 0);
    this.events = [];
    this.remaining = this.duration;
    this.winner = null;
    this.paused = false;
    this.half = false;
    this.finalTen = false;
    this.startedAt = this.lastTime = this.pausedTotal = this.pauseStarted = 0;
  }
}
/** Normalized, explicitly synthetic body fixture shared by demo and tests. */
export function syntheticPose(open: boolean, centerX = 0.5): Landmark[] {
  const pose = Array.from({ length: 33 }, () => ({
    x: centerX,
    y: 0.2,
    z: 0,
    visibility: 0.99,
  }));
  const put = (i: number, dx: number, y: number) => {
    pose[i] = { x: centerX + dx, y, z: 0, visibility: 0.99 };
  };
  put(0, 0, 0.16);
  put(11, -0.055, 0.32);
  put(12, 0.055, 0.32);
  put(13, open ? -0.11 : -0.075, open ? 0.2 : 0.43);
  put(14, open ? 0.11 : 0.075, open ? 0.2 : 0.43);
  put(15, open ? -0.08 : -0.08, open ? 0.08 : 0.54);
  put(16, 0.08, open ? 0.08 : 0.54);
  put(23, -0.04, 0.56);
  put(24, 0.04, 0.56);
  put(25, open ? -0.09 : -0.035, 0.72);
  put(26, open ? 0.09 : 0.035, 0.72);
  put(27, open ? -0.14 : -0.035, 0.88);
  put(28, open ? 0.14 : 0.035, 0.88);
  put(29, open ? -0.14 : -0.035, 0.9);
  put(30, open ? 0.14 : 0.035, 0.9);
  put(31, open ? -0.16 : -0.055, 0.91);
  put(32, open ? 0.16 : 0.055, 0.91);
  return pose;
}
