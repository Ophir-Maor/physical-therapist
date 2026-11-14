export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
export type Mode = "jumping-jacks" | "arm-raises";
export type ActivityEvent = { type: "REP_COMPLETED" };
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
  private options: DetectorOptions;
  private smooth: Landmark[] | null = null;
  private lastSeen = -Infinity;
  private lastTime = -Infinity;
  private candidate = "";
  private candidateSince = 0;
  private cycleSince = 0;
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
  }
  update(landmarks: Landmark[], timestamp: number): ActivityEvent[] {
    if (!Number.isFinite(timestamp) || timestamp <= this.lastTime) return [];
    this.lastTime = timestamp;
    const ids =
      this.mode === "jumping-jacks"
        ? [11, 12, 15, 16, 23, 24, 27, 28]
        : [11, 12, 15, 16];
    if (!ids.every((i) => valid(landmarks[i], this.options.confidence))) {
      this.candidate = "";
      if (timestamp - this.lastSeen > this.options.missingResetMs) {
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
    if (pose !== this.candidate) {
      this.candidate = pose;
      this.candidateSince = timestamp;
      return [];
    }
    if (timestamp - this.candidateSince < this.options.holdMs) return [];
    if (pose === "closed" && this.state === "seeking-closed") {
      this.state = "closed";
      this.cycleSince = timestamp;
    } else if (pose === "open" && this.state === "closed") this.state = "open";
    else if (pose === "closed" && this.state === "open") {
      this.state = "closed";
      const elapsed = timestamp - this.cycleSince;
      this.cycleSince = timestamp;
      if (elapsed >= this.options.minimumCycleMs)
        return [{ type: "REP_COMPLETED" }];
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
  timestamp: number;
};
export class GameEngine {
  state: "idle" | "active" | "complete" = "idle";
  scores: number[];
  events: GameEvent[] = [];
  remaining: number;
  winner: number | null = null;
  private startedAt = 0;
  private lastTime = 0;
  private half = false;
  private finalTen = false;
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
    this.remaining = this.duration;
  }
  private emit(type: GameEventType, timestamp: number, player?: number) {
    this.events.push({
      id: `${this.events.length}-${type}`,
      type,
      timestamp,
      scores: [...this.scores],
      ...(player === undefined ? {} : { player }),
    });
  }
  start(timestamp: number) {
    if (this.state !== "idle" || !Number.isFinite(timestamp)) return;
    this.state = "active";
    this.startedAt = this.lastTime = timestamp;
    this.emit("MATCH_STARTED", timestamp);
  }
  tick(timestamp: number) {
    if (
      this.state !== "active" ||
      !Number.isFinite(timestamp) ||
      timestamp < this.lastTime
    )
      return;
    this.lastTime = timestamp;
    this.remaining = Math.max(
      0,
      this.duration - (timestamp - this.startedAt) / 1000,
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
  rep(player: number, timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp < this.lastTime) return;
    this.tick(timestamp);
    if (
      this.state !== "active" ||
      !Number.isInteger(player) ||
      player < 0 ||
      player >= this.scores.length
    )
      return;
    const previous =
      this.scores.length === 2 ? Math.sign(this.scores[0] - this.scores[1]) : 0;
    this.scores[player]++;
    this.emit("REP_COMPLETED", timestamp, player);
    if (this.scores[player] % 5 === 0)
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
    this.events = [];
    this.remaining = this.duration;
    this.winner = null;
    this.half = false;
    this.finalTen = false;
    this.startedAt = this.lastTime = 0;
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
