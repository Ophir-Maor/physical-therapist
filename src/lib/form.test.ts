import { describe, expect, it } from "vitest";
import type { Landmark } from "./engine";
import { demoFrame } from "./demo-motion";
import { armElevation } from "./geometry";
import { armPose, squatPose } from "./geometry";
import {
  FormEvaluator,
  RangeCalibrator,
  pickWinner,
  scoreRange,
  summarizeReps,
  type RepEvaluation,
} from "./form";

function frames(
  start: number,
  peak: number,
  riseMs: number,
  lowerMs: number,
) {
  const out: { t: number; value: number }[] = [];
  let t = start;
  for (let i = 0; i < 6; i++) {
    out.push({ t, value: 4 });
    t += 40;
  }
  const up = 10;
  for (let i = 1; i <= up; i++) {
    out.push({ t, value: 4 + ((peak - 4) * i) / up });
    t += riseMs / up;
  }
  for (let i = 0; i < 4; i++) {
    out.push({ t, value: peak });
    t += 40;
  }
  const down = 10;
  for (let i = 1; i <= down; i++) {
    out.push({ t, value: peak - ((peak - 4) * i) / down });
    t += lowerMs / down;
  }
  for (let i = 0; i < 6; i++) {
    out.push({ t, value: 4 });
    t += 40;
  }
  return { frames: out, end: t };
}

function run(
  evaluator: FormEvaluator,
  motion: { t: number; value: number }[],
  poseFor: (value: number) => Landmark[] = (value) =>
    evaluator.exercise === "squats" ? squatPose(value) : armPose(value),
  edit?: (pose: Landmark[], index: number) => void,
) {
  const reps: RepEvaluation[] = [];
  let livePhase = "";
  motion.forEach((frame, index) => {
    const pose = poseFor(frame.value);
    edit?.(pose, index);
    const result = evaluator.update(pose, frame.t);
    livePhase = result.live.phase;
    if (result.rep) reps.push(result.rep);
  });
  return { reps, livePhase };
}

describe("geometry targets", () => {
  it("builds the arm angle it was asked for", () => {
    const pose = armPose(140);
    expect(armElevation(pose[11], pose[15])).toBeCloseTo(140, 0);
  });
  it("does not score past a selected target higher than meeting it", () => {
    expect(scoreRange(90, 90).score).toBe(100);
    expect(scoreRange(150, 90).score!).toBeLessThan(100);
    expect(scoreRange(50, 90).score!).toBeLessThan(scoreRange(90, 90).score!);
  });
});

describe("arm-raise form", () => {
  it("scores a controlled repetition above a rushed one", () => {
    const slow = new FormEvaluator("arm-raises", { target: 140 });
    const fast = new FormEvaluator("arm-raises", { target: 140 });
    const calm = run(slow, frames(0, 140, 900, 900).frames);
    const rush = run(fast, frames(0, 140, 120, 120).frames);
    expect(calm.reps[0]?.scored).toBe(true);
    expect(rush.reps[0]?.scored).toBe(true);
    expect(calm.reps[0].quality!).toBeGreaterThan(rush.reps[0].quality! + 12);
    expect(rush.reps[0].rushed).toBe(true);
  });
  it("lets fewer high-quality reps beat more rushed reps", () => {
    const good: RepEvaluation[] = [];
    const bad: RepEvaluation[] = [];
    const careful = new FormEvaluator("arm-raises", { target: 140 });
    const sloppy = new FormEvaluator("arm-raises", { target: 140 });
    let t = 0;
    for (let i = 0; i < 10; i++) {
      const motion = frames(t, 140, 900, 900);
      good.push(...run(careful, motion.frames).reps);
      t = motion.end + 50;
    }
    t = 0;
    for (let i = 0; i < 20; i++) {
      const motion = frames(t, 140, 120, 120);
      bad.push(...run(sloppy, motion.frames).reps);
      t = motion.end + 30;
    }
    const winner = pickWinner("form", [summarizeReps(good, 140), summarizeReps(bad, 140)]);
    expect(winner.index).toBe(0);
    expect(winner.reason).toMatch(/fewer/i);
  });
  it("counts a full cycle once and ignores a spike", () => {
    const evaluator = new FormEvaluator("arm-raises", { target: 140 });
    const first = frames(0, 140, 800, 800);
    const second = frames(first.end + 40, 140, 800, 800);
    const reps = run(evaluator, [...first.frames, ...second.frames]).reps;
    expect(reps.filter((rep) => rep.valid)).toHaveLength(2);
    const spike = new FormEvaluator("arm-raises", { target: 140 });
    expect(
      run(spike, [
        ...Array.from({ length: 8 }, (_, i) => ({ t: i * 40, value: 4 })),
        { t: 400, value: 120 },
        ...Array.from({ length: 8 }, (_, i) => ({ t: 440 + i * 40, value: 4 })),
      ]).reps.filter((rep) => rep.scored),
    ).toHaveLength(0);
  });
  it("withholds a score when landmarks disappear or confidence is low", () => {
    const missing = new FormEvaluator("arm-raises", { target: 140 });
    const motion = frames(0, 140, 800, 800);
    const result = run(missing, motion.frames, (value) => armPose(value), (pose, index) => {
      if (index > 8 && index < 28) {
        pose[15].visibility = 0.1;
        pose[16].visibility = 0.1;
      }
    });
    expect(result.reps.some((rep) => rep.scored)).toBe(false);
    expect(result.reps.every((rep) => rep.quality == null)).toBe(true);
    const dim = new FormEvaluator("arm-raises", { target: 140 });
    const hidden = run(dim, motion.frames, (value) => armPose(value), (pose) => {
      for (const index of [11, 12, 15, 16]) pose[index].visibility = 0.2;
    });
    expect(hidden.reps.filter((rep) => rep.scored)).toHaveLength(0);
  });
  it("keeps a noisy but complete repetition scorable", () => {
    const evaluator = new FormEvaluator("arm-raises", { target: 140 });
    const motion = frames(0, 140, 800, 800);
    const reps = run(evaluator, motion.frames, (value) => armPose(value), (pose, index) => {
      const shift = ((index % 5) - 2) * 0.002;
      pose[15].x += shift;
      pose[16].y += shift;
    }).reps;
    expect(reps[0]?.scored).toBe(true);
    expect(reps[0].quality).toBeGreaterThan(60);
  });
  it("uses a calibrated target and does not treat a larger range as automatically better", () => {
    const calibrator = new RangeCalibrator();
    const calibration = new FormEvaluator("arm-raises", {
      mode: "calibrate",
      target: 160,
    });
    const sample = run(calibration, frames(0, 100, 800, 800).frames).reps[0];
    calibrator.note(sample);
    expect(calibrator.target(1)).toBeCloseTo(sample.peak, 0);
    const selected = calibrator.target(0.8)!;
    const matched = new FormEvaluator("arm-raises", { target: selected });
    const beyond = new FormEvaluator("arm-raises", { target: selected });
    const matchedScore = run(matched, frames(0, selected, 800, 800).frames).reps[0];
    const beyondScore = run(beyond, frames(0, selected * 1.5, 800, 800).frames).reps[0];
    expect(matchedScore.quality!).toBeGreaterThan(beyondScore.quality!);
  });
  it("marks alignment unavailable rather than inventing it when one arm is hidden", () => {
    const evaluator = new FormEvaluator("arm-raises", { target: 140 });
    const reps = run(evaluator, frames(0, 140, 800, 800).frames, (value) => armPose(value), (pose) => {
      pose[15].visibility = 0.1;
    }).reps;
    expect(reps[0]?.scored).toBe(true);
    const alignment = reps[0]?.metrics.find((metric) => metric.id === "alignment");
    expect(alignment?.score).toBeNull();
  });
});

describe("demo trajectories", () => {
  it("scores the controlled synthetic athlete above the rushed one", () => {
    const calm = new FormEvaluator("arm-raises", { target: 130 });
    const rush = new FormEvaluator("arm-raises", { target: 130 });
    const collected: RepEvaluation[][] = [[], []];
    for (let t = 0; t < 12000; t += 50) {
      const slow = calm.update(demoFrame("arm-raises", t, 0).pose, t).rep;
      const fast = rush.update(demoFrame("arm-raises", t, 1).pose, t).rep;
      if (slow) collected[0].push(slow);
      if (fast) collected[1].push(fast);
    }
    const left = summarizeReps(collected[0], 130);
    const right = summarizeReps(collected[1], 130);
    expect(left.scored).toBeGreaterThan(0);
    expect(right.scored).toBeGreaterThan(left.scored);
    expect(left.average!).toBeGreaterThan(right.average! + 8);
  });
});

describe("squats", () => {
  it("counts a conservative squat cycle without claiming clinical depth", () => {
    const evaluator = new FormEvaluator("squats", { target: 50 });
    const reps = run(evaluator, frames(0, 50, 900, 900).frames).reps;
    expect(reps[0]?.valid).toBe(true);
    expect(reps[0].reasons.join(" ")).toMatch(/approximate/i);
  });
});

describe("challenges", () => {
  it("picks the steadier player without rewarding a bigger range", () => {
    const steady = summarizeReps(
      [0, 1, 2, 3].map((index) => ({
        valid: true,
        scored: true,
        confidence: 0.9,
        quality: 80,
        metrics: [],
        feedback: "",
        reasons: [],
        peak: 40,
        durationMs: 2000,
        rushed: false,
        id: index,
      })) as unknown as RepEvaluation[],
      40,
    );
    const wider = summarizeReps(
      [70, 40, 90, 30].map((peak) => ({
        valid: true,
        scored: true,
        confidence: 0.9,
        quality: 80,
        metrics: [],
        feedback: "",
        reasons: [],
        peak,
        durationMs: 2000,
        rushed: false,
      })) as RepEvaluation[],
      60,
    );
    expect(pickWinner("consistency", [wider, steady]).index).toBe(1);
  });
  it("refuses a winner when every repetition was unscored", () => {
    const empty = summarizeReps([
      {
        valid: false,
        scored: false,
        confidence: 0.2,
        quality: null,
        metrics: [],
        feedback: "hidden",
        reasons: ["hidden"],
        peak: 0,
        durationMs: 0,
        rushed: false,
      },
    ]);
    expect(pickWinner("form", [empty, empty]).index).toBeNull();
  });
});
