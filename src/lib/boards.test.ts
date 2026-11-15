import { describe, expect, it } from "vitest";
import { rankTop, type ScoreRow } from "./boards";

const row = (extra: Partial<ScoreRow>): ScoreRow => ({
  id: 1,
  nickname: "A",
  reps: 5,
  average: 80,
  consistency: 70,
  createdAt: "2026-01-01T00:00:00.000Z",
  exercise: "jumping-jacks",
  challenge: "reps",
  experience: "arcade",
  durationSec: 30,
  goalReps: null,
  target: null,
  scoringVersion: "form-v1",
  ...extra,
});

describe("championship rankings", () => {
  it("combines legacy durations on one repetition board", () => {
    const rows = [
      row({ id: 1, nickname: "short", durationSec: 15, reps: 8 }),
      row({ id: 2, nickname: "mid", durationSec: 30, reps: 20 }),
      row({ id: 3, nickname: "long", durationSec: 60, reps: 40 }),
    ];
    expect(
      rankTop(rows, {
        exercise: "jumping-jacks",
        experience: "arcade",
        challenge: "reps",
      }).map((item) => item.nickname),
    ).toEqual(["long", "mid", "short"]);
  });

  it("ranks arcade by reps and lets the earlier tie rank first", () => {
    const rows = [
      row({ id: 2, nickname: "later", reps: 12, createdAt: "2026-01-02T00:00:00.000Z" }),
      row({ id: 1, nickname: "earlier", reps: 12, createdAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: 3, nickname: "more", reps: 13 }),
    ];
    const ranked = rankTop(rows, {
      exercise: "jumping-jacks",
      experience: "arcade",
      challenge: "reps",
    });
    expect(ranked.map((item) => item.nickname)).toEqual(["more", "earlier", "later"]);
  });

  it("ranks form by quality, not extra reps, and limits the list to 10", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row({
        id: index + 1,
        nickname: `p${index}`,
        exercise: "arm-raises",
        experience: "coach",
        challenge: "form",
        durationSec: null,
        goalReps: 4,
        target: 60,
        reps: 4 + (index % 3),
        average: 50 + index,
        consistency: index,
        scoringVersion: "form-v1",
      }),
    );
    const ranked = rankTop(rows, {
      exercise: "arm-raises",
      experience: "coach",
      challenge: "form",
    });
    expect(ranked).toHaveLength(10);
    expect(ranked[0].average).toBe(61);
    expect(ranked[0].reps).toBeLessThanOrEqual(6);
  });

  it("keeps challenges separate while combining targets and repetition goals", () => {
    const rows = [
      row({
        id: 1,
        nickname: "steady",
        exercise: "squats",
        experience: "coach",
        challenge: "consistency",
        goalReps: 6,
        reps: 6,
        target: 35,
        durationSec: null,
        consistency: 96,
        average: 70,
      }),
      row({
        id: 2,
        nickname: "other-range",
        exercise: "squats",
        experience: "coach",
        challenge: "consistency",
        goalReps: 8,
        reps: 8,
        target: 60,
        durationSec: null,
        consistency: 10,
      }),
      row({
        id: 3,
        nickname: "form-only",
        exercise: "squats",
        experience: "coach",
        challenge: "form",
        goalReps: 6,
        target: 35,
        durationSec: null,
        average: 99,
        consistency: 10,
      }),
    ];
    expect(
      rankTop(rows, {
        exercise: "squats",
        experience: "coach",
        challenge: "consistency",
      }).map((item) => item.nickname),
    ).toEqual(["other-range", "steady"]);
  });

  it("does not require repetition-goal metadata or a minimum rep count", () => {
    const rows = [
      row({
        id: 1,
        nickname: "legacy",
        exercise: "arm-raises",
        experience: "coach",
        challenge: "form",
        goalReps: null,
        reps: 1,
        target: 60,
        durationSec: null,
        average: 99,
      }),
    ];
    expect(
      rankTop(rows, {
        exercise: "arm-raises",
        experience: "coach",
        challenge: "form",
      }).map((item) => item.nickname),
    ).toEqual(["legacy"]);
  });

  it("breaks an equal quality score with consistency and keeps another scoring version off the board", () => {
    const rows = [
      row({
        id: 1,
        nickname: "shaky",
        exercise: "arm-raises",
        experience: "coach",
        challenge: "form",
        durationSec: null,
        goalReps: 4,
        reps: 4,
        target: 60,
        average: 90,
        consistency: 40,
      }),
      row({
        id: 2,
        nickname: "steady",
        exercise: "arm-raises",
        experience: "coach",
        challenge: "form",
        durationSec: null,
        goalReps: 4,
        reps: 4,
        target: 60,
        average: 90,
        consistency: 80,
      }),
      row({
        id: 3,
        nickname: "other-version",
        exercise: "arm-raises",
        experience: "coach",
        challenge: "form",
        durationSec: null,
        goalReps: 4,
        reps: 4,
        target: 60,
        average: 99,
        scoringVersion: "form-v0",
      }),
    ];
    expect(
      rankTop(rows, {
        exercise: "arm-raises",
        experience: "coach",
        challenge: "form",
      }).map((item) => item.nickname),
    ).toEqual(["steady", "shaky"]);
  });
});
