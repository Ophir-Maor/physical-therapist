import type { Landmark } from "./engine";
import {
  armElevation,
  clamp,
  kneeFlexion,
} from "./geometry";

/**
 * Prototype form weights. These are coaching defaults, not clinical thresholds.
 * Control 40%, selected-target range 30%, observable alignment 20%, consistency 10%.
 */
export const FORM_WEIGHTS = {
  control: 0.4,
  range: 0.3,
  alignment: 0.2,
  consistency: 0.1,
} as const;

export type ExerciseId = "arm-raises" | "squats";
export type FormWeights = { [K in keyof typeof FORM_WEIGHTS]: number };
export type PhaseName =
  | "preparing"
  | "raising"
  | "target"
  | "lowering"
  | "completed";

export type FormMetric = {
  id: keyof FormWeights;
  label: string;
  score: number | null;
  weight: number;
  note: string;
};

export type RepEvaluation = {
  valid: boolean;
  scored: boolean;
  confidence: number;
  quality: number | null;
  metrics: FormMetric[];
  feedback: string;
  reasons: string[];
  peak: number;
  durationMs: number;
  rushed: boolean;
};

export type LiveForm = {
  phase: PhaseName;
  progress: number;
  confidence: number;
  tracking: boolean;
  pastTarget: boolean;
};

type Sample = {
  t: number;
  value: number;
  left: number;
  right: number;
  confidence: number;
};

const LABELS: Record<keyof FormWeights, string> = {
  control: "Movement control",
  range: "Target range",
  alignment: "Observable alignment",
  consistency: "Consistency",
};

export const FALLBACK_TARGET: Record<ExerciseId, number> = {
  "arm-raises": 65,
  squats: 30,
};

const visible = (p: Landmark | undefined, confidence: number) =>
  !!p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  (p.visibility ?? 1) >= confidence;

function readSignal(
  exercise: ExerciseId,
  landmarks: Landmark[],
  confidence: number,
): Omit<Sample, "t"> | null {
  if (exercise === "arm-raises") {
    const leftOk =
      visible(landmarks[11], confidence) && visible(landmarks[15], confidence);
    const rightOk =
      visible(landmarks[12], confidence) && visible(landmarks[16], confidence);
    if (!leftOk && !rightOk) return null;
    const left = leftOk ? armElevation(landmarks[11], landmarks[15]) : Number.NaN;
    const right = rightOk
      ? armElevation(landmarks[12], landmarks[16])
      : Number.NaN;
    const sides = [11, 15, 12, 16]
      .filter((index, place) => (place < 2 ? leftOk : rightOk))
      .map((index) => landmarks[index]);
    return {
      value: leftOk && rightOk ? (left + right) / 2 : leftOk ? left : right,
      left,
      right,
      confidence: meanVisibility(sides),
    };
  }
  const leftOk = [23, 25, 27].every((index) =>
    visible(landmarks[index], confidence),
  );
  const rightOk = [24, 26, 28].every((index) =>
    visible(landmarks[index], confidence),
  );
  if (!leftOk && !rightOk) return null;
  const left = leftOk
    ? kneeFlexion(landmarks[23], landmarks[25], landmarks[27])
    : Number.NaN;
  const right = rightOk
    ? kneeFlexion(landmarks[24], landmarks[26], landmarks[28])
    : Number.NaN;
  const sides = [23, 25, 27, 24, 26, 28]
    .filter((index, place) => (place < 3 ? leftOk : rightOk))
    .map((index) => landmarks[index]);
  return {
    value: leftOk && rightOk ? (left + right) / 2 : leftOk ? left : right,
    left,
    right,
    confidence: Math.min(0.8, meanVisibility(sides)),
  };
}

function meanVisibility(points: Landmark[]) {
  return (
    points.reduce((sum, p) => sum + (p.visibility ?? 1), 0) / points.length
  );
}

export function scoreControl(samples: Sample[], durationMs: number) {
  const speeds: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt <= 0 || dt > 450) continue;
    speeds.push(
      Math.abs(samples[i].value - samples[i - 1].value) / (dt / 1000),
    );
  }
  const active = speeds.filter((speed) => speed > 12);
  if (active.length < 2)
    return {
      score: null as number | null,
      rushed: false,
      note: "Not enough of the repetition was visible to judge control.",
    };
  const sorted = [...active].sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const median = sorted[Math.floor(sorted.length / 2)];
  let score = 96;
  if (p90 > 150) score -= Math.min(50, (p90 - 150) * 0.22);
  if (median > 130) score -= Math.min(20, (median - 130) * 0.15);
  if (durationMs < 1100) score -= Math.min(45, (1100 - durationMs) / 16);
  const mean = active.reduce((a, b) => a + b, 0) / active.length;
  const variance =
    active.reduce((sum, speed) => sum + (speed - mean) ** 2, 0) / active.length;
  const cv = Math.sqrt(variance) / (mean || 1);
  if (cv > 1) score -= Math.min(18, (cv - 1) * 20);
  const rushed = durationMs < 900 || p90 > 240;
  return {
    score: clamp(Math.round(score), 0, 100),
    rushed,
    note: rushed
      ? "Try lowering a little more slowly. Control matters more than speed."
      : "The pace looks controlled.",
  };
}

/** Reaching the selected target scores 100. Going past it does not score higher. */
export function scoreRange(peak: number, target: number) {
  if (!(target > 0) || !Number.isFinite(peak))
    return { score: null as number | null, note: "No selected target to compare." };
  const ratio = peak / target;
  if (ratio < 0.97)
    return {
      score: clamp(Math.round((ratio / 0.97) * 100), 0, 100),
      note: "Move toward your selected target. You do not need to go past it.",
    };
  if (ratio <= 1.1)
    return { score: 100, note: "You reached your selected target." };
  return {
    score: clamp(Math.round(100 - (ratio - 1.1) * 180), 30, 100),
    note: "That went past the selected target. Match it instead of going farther.",
  };
}

export function scoreAlignment(samples: Sample[]) {
  const diffs = samples
    .map((sample) => Math.abs(sample.left - sample.right))
    .filter((diff) => Number.isFinite(diff));
  if (diffs.length < Math.max(3, samples.length * 0.7))
    return {
      score: null as number | null,
      note: "Both sides were not visible enough to judge alignment.",
    };
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return {
    score: clamp(Math.round(100 - Math.max(0, mean - 8) * 2.5), 0, 100),
    note:
      mean <= 12
        ? "Both sides are moving together."
        : "Try to keep both sides moving together.",
  };
}

export function scoreConsistency(
  peak: number,
  durationMs: number,
  history: { peak: number; duration: number }[],
  target: number,
) {
  if (!history.length)
    return {
      score: null as number | null,
      note: "Your first scored repetition sets the baseline.",
    };
  const previous = history[history.length - 1];
  const peakDelta = Math.abs(peak - previous.peak) / Math.max(target, 1);
  const timeDelta =
    Math.abs(durationMs - previous.duration) / Math.max(previous.duration, 1);
  return {
    score: clamp(Math.round(100 - peakDelta * 150 - timeDelta * 35), 0, 100),
    note:
      peakDelta < 0.08
        ? "Nice consistency. You're keeping a steady pattern."
        : "Stay close to the same comfortable range on each repetition.",
  };
}

export function combineQuality(metrics: FormMetric[]) {
  const required = metrics.filter(
    (metric) => metric.id === "control" || metric.id === "range",
  );
  if (required.some((metric) => metric.score == null)) return null;
  const usable = metrics.filter(
    (metric) => metric.score != null && metric.weight > 0,
  );
  const weight = usable.reduce((sum, metric) => sum + metric.weight, 0);
  if (!weight) return null;
  return clamp(
    Math.round(
      usable.reduce((sum, metric) => sum + metric.score! * metric.weight, 0) /
        weight,
    ),
    0,
    100,
  );
}

function feedbackFor(metrics: FormMetric[], quality: number | null) {
  const ranked = metrics
    .filter((metric) => metric.score != null)
    .sort((a, b) => a.score! - b.score!);
  if (quality != null && quality >= 88 && ranked[0] && ranked[0].score! >= 80)
    return "Great control. Keep that same comfortable pace.";
  return ranked[0]?.note || "Complete the repetition back to your start position.";
}

export class RangeCalibrator {
  peaks: number[] = [];
  note(rep: RepEvaluation) {
    if (rep.valid && Number.isFinite(rep.peak)) this.peaks.push(rep.peak);
  }
  observed() {
    if (!this.peaks.length) return null;
    const sorted = [...this.peaks].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }
  /** Selected target cannot exceed the range the user just demonstrated. */
  target(scale: number) {
    const observed = this.observed();
    if (observed == null) return null;
    return Math.round(observed * clamp(scale, 0.5, 1) * 10) / 10;
  }
}

export class FormEvaluator {
  phase: PhaseName = "preparing";
  public target: number;
  private options: { confidence: number; weights: FormWeights; mode: "score" | "calibrate" };
  private state: "seek" | "ready" | "rise" | "fall" = "seek";
  private holdFrom = 0;
  private holding = "";
  private cycleStart = 0;
  private peak = 0;
  private samples: Sample[] = [];
  private missingFrom = -1;
  private lastT = -Infinity;
  private smooth: number | null = null;
  private history: { peak: number; duration: number }[] = [];
  private flashUntil = 0;
  constructor(
    public exercise: ExerciseId,
    options: {
      target?: number;
      weights?: Partial<FormWeights>;
      confidence?: number;
      mode?: "score" | "calibrate";
    } = {},
  ) {
    this.target = options.target ?? FALLBACK_TARGET[exercise];
    this.options = {
      confidence: options.confidence ?? 0.55,
      weights: { ...FORM_WEIGHTS, ...options.weights },
      mode: options.mode ?? "score",
    };
  }
  reset() {
    this.phase = "preparing";
    this.state = "seek";
    this.holdFrom = 0;
    this.holding = "";
    this.cycleStart = 0;
    this.peak = 0;
    this.samples = [];
    this.missingFrom = -1;
    this.lastT = -Infinity;
    this.smooth = null;
    this.history = [];
    this.flashUntil = 0;
  }
  setTarget(target: number) {
    if (Number.isFinite(target) && target > 0) this.target = target;
  }
  private downLimit() {
    return this.exercise === "arm-raises" ? 22 : 12;
  }
  private minPeak() {
    return this.options.mode === "calibrate"
      ? this.downLimit() + 18
      : Math.max(this.downLimit() + 18, this.target * 0.42);
  }
  private live(confidence: number, tracking: boolean): LiveForm {
    const value = this.smooth ?? 0;
    return {
      phase: this.phase,
      progress: clamp(value / Math.max(this.target, 1), 0, 1),
      confidence,
      tracking,
      pastTarget: value > this.target * 1.1,
    };
  }
  private hold(kind: string, timestamp: number) {
    if (this.holding !== kind) {
      this.holding = kind;
      this.holdFrom = timestamp;
    }
  }
  private held(timestamp: number, ms: number) {
    return this.holding !== "" && timestamp - this.holdFrom >= ms;
  }
  private abort(reason: string): RepEvaluation {
    this.state = "seek";
    this.samples = [];
    this.peak = 0;
    this.smooth = null;
    this.phase = "preparing";
    this.missingFrom = -1;
    return {
      valid: false,
      scored: false,
      confidence: 0,
      quality: null,
      metrics: [],
      feedback: reason,
      reasons: [reason],
      peak: 0,
      durationMs: 0,
      rushed: false,
    };
  }
  private finish(timestamp: number): RepEvaluation {
    const durationMs = Math.max(0, timestamp - this.cycleStart);
    const peak = this.peak;
    const confidentFrames = this.samples.filter((sample) => sample.confidence >= 0.55);
    const confidence = this.samples.length
      ? confidentFrames.reduce((sum, sample) => sum + sample.confidence, 0) /
        this.samples.length
      : 0;
    const reasons: string[] = [];
    if (this.exercise === "squats")
      reasons.push(
        "Squat depth and alignment are approximate from a single camera angle.",
      );
    const tooSmall = peak < this.minPeak();
    const tooShort = durationMs < 340 || this.samples.length < 6;
    if (tooSmall) reasons.push("The movement did not leave the starting position enough to count.");
    if (tooShort) reasons.push("The motion was too brief to count as a complete repetition.");
    const visibility =
      this.samples.length > 0 ? confidentFrames.length / this.samples.length : 0;
    const clear = visibility >= 0.75 && confidence >= 0.62;
    if (!clear)
      reasons.push(
        "The camera could not see the full repetition clearly enough to score it.",
      );
    const valid = !tooSmall && !tooShort;
    const control = scoreControl(this.samples, durationMs);
    const range = scoreRange(peak, this.target);
    const alignment = scoreAlignment(this.samples);
    const consistency =
      this.options.mode === "score"
        ? scoreConsistency(peak, durationMs, this.history, this.target)
        : { score: null, note: "Calibration repetitions set the target. They are not scored." };
    const metrics: FormMetric[] = [
      { id: "control", label: LABELS.control, score: clear ? control.score : null, weight: this.options.weights.control, note: control.note },
      { id: "range", label: LABELS.range, score: clear ? range.score : null, weight: this.options.weights.range, note: range.note },
      { id: "alignment", label: LABELS.alignment, score: clear ? alignment.score : null, weight: this.options.weights.alignment, note: alignment.note },
      { id: "consistency", label: LABELS.consistency, score: clear ? consistency.score : null, weight: this.options.weights.consistency, note: consistency.note },
    ];
    const quality =
      this.options.mode === "score" && valid && clear
        ? combineQuality(metrics)
        : null;
    const scored = quality != null;
    if (scored)
      this.history.push({ peak, duration: durationMs });
    const feedback = !clear
      ? "I couldn't clearly see the required landmarks. Step back so they stay in frame."
      : feedbackFor(metrics, quality);
    return {
      valid,
      scored,
      confidence: Math.round(confidence * 100) / 100,
      quality,
      metrics,
      feedback,
      reasons: scored ? reasons : reasons.length ? reasons : [feedback],
      peak: Math.round(peak * 10) / 10,
      durationMs: Math.round(durationMs),
      rushed: control.rushed,
    };
  }
  update(landmarks: Landmark[], timestamp: number): { live: LiveForm; rep: RepEvaluation | null } {
    if (!Number.isFinite(timestamp) || timestamp <= this.lastT)
      return { live: this.live(0, false), rep: null };
    const gap = timestamp - this.lastT;
    this.lastT = timestamp;
    const raw = readSignal(this.exercise, landmarks, this.options.confidence);
    if (!raw) {
      if (this.state === "rise" || this.state === "fall") {
        if (this.missingFrom < 0) this.missingFrom = timestamp;
        if (timestamp - this.missingFrom > 500)
          return { live: this.live(0, false), rep: this.abort("I lost sight of the required landmarks, so this repetition was not scored.") };
      }
      return { live: this.live(0, false), rep: null };
    }
    this.missingFrom = -1;
    this.smooth =
      this.smooth == null || gap > 450
        ? raw.value
        : 0.45 * raw.value + 0.55 * this.smooth;
    const sample: Sample = { ...raw, value: this.smooth, t: timestamp };
    const down = sample.value <= this.downLimit();
    let rep: RepEvaluation | null = null;
    if (this.state === "seek" || this.state === "ready") {
      this.phase = "preparing";
      if (down) {
        this.hold("down", timestamp);
        if (this.held(timestamp, 100)) {
          this.state = "ready";
          this.peak = sample.value;
          this.samples = [sample];
        }
      } else if (this.state === "ready" && sample.value > this.downLimit() + 12) {
        this.state = "rise";
        this.cycleStart = timestamp;
        this.peak = sample.value;
        this.samples = [sample];
        this.phase = "raising";
        this.holding = "";
      } else this.holding = "";
    } else {
      if (gap <= 450) this.samples.push(sample);
      this.peak = Math.max(this.peak, sample.value);
      if (this.state === "rise") {
        this.phase = sample.value >= this.target * 0.9 ? "target" : "raising";
        if (this.peak >= this.minPeak() && sample.value < this.peak - 6) {
          this.state = "fall";
          this.phase = "lowering";
        }
      } else {
        this.phase = "lowering";
        if (down) {
          this.hold("down", timestamp);
          if (this.held(timestamp, 80)) {
            rep = this.finish(timestamp);
            this.state = "ready";
            this.samples = [sample];
            this.peak = sample.value;
            this.flashUntil = timestamp + 600;
            this.holding = "down";
            this.holdFrom = timestamp;
          }
        } else this.holding = "";
      }
      if (!rep && timestamp - this.cycleStart > 9000)
        rep = this.abort("The repetition did not return to the start, so it was not scored.");
    }
    if (timestamp < this.flashUntil) this.phase = "completed";
    return { live: this.live(sample.confidence, true), rep };
  }
}

export type PlayerSummary = {
  attempted: number;
  scored: number;
  average: number | null;
  consistency: number | null;
  control: number | null;
  points: number;
};

export function summarizeReps(reps: RepEvaluation[], target = 1): PlayerSummary {
  const scored = reps.filter((rep) => rep.scored && rep.quality != null);
  const average = scored.length
    ? Math.round(
        scored.reduce((sum, rep) => sum + (rep.quality ?? 0), 0) / scored.length,
      )
    : null;
  const peaks = scored.map((rep) => rep.peak);
  let consistency: number | null = null;
  if (peaks.length >= 2) {
    const mean = peaks.reduce((a, b) => a + b, 0) / peaks.length;
    const mad =
      peaks.reduce((sum, peak) => sum + Math.abs(peak - mean), 0) / peaks.length;
    consistency = clamp(Math.round(100 - (mad / Math.max(target, 1)) * 220), 0, 100);
  }
  const controls = scored.flatMap((rep) => {
    const metric = rep.metrics.find((item) => item.id === "control");
    return metric?.score == null ? [] : [metric.score];
  });
  return {
    attempted: reps.length,
    scored: scored.length,
    average,
    consistency,
    control: controls.length
      ? Math.round(controls.reduce((a, b) => a + b, 0) / controls.length)
      : null,
    points: scored.reduce((sum, rep) => sum + (rep.quality ?? 0), 0),
  };
}

export function pickWinner(
  kind: "form" | "consistency",
  players: PlayerSummary[],
) {
  const scoreOf = (player: PlayerSummary) =>
    kind === "form" ? player.average : player.consistency;
  const eligible = players.map((player, index) => ({ player, index, score: scoreOf(player) }));
  const ready = eligible.filter((item) => item.score != null && item.player.scored > 0);
  if (!ready.length)
    return {
      index: null as number | null,
      reason:
        kind === "form"
          ? "No comparable quality scores. Unclear repetitions were left unscored."
          : "Consistency needs at least two clearly scored repetitions per player.",
    };
  const best = Math.max(...ready.map((item) => item.score ?? 0));
  const leaders = ready.filter((item) => (item.score ?? 0) >= best - 1);
  if (leaders.length !== 1)
    return {
      index: null,
      reason: "The scores are too close to call. Treat this as a shared result.",
    };
  const loser = ready.find((item) => item.index !== leaders[0].index);
  const qualityOverSpeed =
    kind === "form" &&
    loser &&
    leaders[0].player.scored < loser.player.scored &&
    (leaders[0].score ?? 0) > (loser.score ?? 0);
  return {
    index: leaders[0].index,
    reason: qualityOverSpeed
      ? "Higher average quality won, even with fewer repetitions. Speed alone did not decide it."
      : kind === "form"
        ? "Highest average quality score. Unscored repetitions were excluded."
        : "Steadiest match to that player's own target. A larger range was not treated as better.",
  };
}
