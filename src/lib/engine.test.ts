import { describe, expect, it } from "vitest";
import {
  ActivityDetector,
  GameEngine,
  PlayerTracker,
  syntheticPose,
  type Mode,
} from "./engine";

function hold(
  detector: ActivityDetector,
  open: boolean,
  from: number,
  duration = 400,
) {
  let reps = 0;
  for (let t = from; t < from + duration; t += 40)
    reps += detector.update(syntheticPose(open), t).length;
  return reps;
}
for (const mode of ["jumping-jacks", "arm-raises"] as Mode[])
  describe(mode, () => {
    it("counts only a complete held closed-open-closed cycle", () => {
      const d = new ActivityDetector(mode);
      expect(hold(d, true, 0)).toBe(0);
      expect(hold(d, false, 400)).toBe(0);
      expect(hold(d, true, 800)).toBe(0);
      expect(hold(d, false, 1200)).toBe(1);
      expect(hold(d, false, 1600)).toBe(0);
    });
    it("ignores alternating noise and isolated open frames", () => {
      const d = new ActivityDetector(mode);
      hold(d, false, 0);
      let reps = 0;
      for (let t = 400; t < 2400; t += 40)
        reps += d.update(syntheticPose(t % 80 === 0), t).length;
      expect(reps).toBe(0);
    });
    it("resets after missing landmarks and must establish a fresh cycle", () => {
      const d = new ActivityDetector(mode);
      hold(d, false, 0);
      hold(d, true, 400);
      expect(d.update([], 1600)).toEqual([]);
      expect(d.state).toBe("seeking-closed");
      expect(hold(d, false, 1640)).toBe(0);
      hold(d, true, 2040);
      expect(hold(d, false, 2440)).toBe(1);
    });
    it("rejects low confidence and resets explicitly", () => {
      const d = new ActivityDetector(mode);
      hold(d, false, 0);
      hold(d, true, 400);
      const bad = syntheticPose(false);
      bad[15].visibility = 0.1;
      expect(d.update(bad, 800)).toEqual([]);
      d.reset();
      expect(d.state).toBe("seeking-closed");
      expect(hold(d, false, 0)).toBe(0);
    });
  });
it("jumping jacks require separated ankles; arm raises do not require legs", () => {
  const jack = new ActivityDetector("jumping-jacks");
  hold(jack, false, 0);
  const arm = new ActivityDetector("arm-raises");
  hold(arm, false, 0);
  const upper = syntheticPose(true);
  upper[27].x = 0.47;
  upper[28].x = 0.53;
  for (let t = 400; t < 800; t += 40) {
    jack.update(upper, t);
    arm.update(upper.slice(0, 17), t);
  }
  expect(hold(jack, false, 800)).toBe(0);
  expect(hold(arm, false, 800)).toBe(1);
});
describe("rep-goal game scoring", () => {
  it("scores, emits lead changes, ties and milestones", () => {
    const g = new GameEngine({ goal: 10, players: ["A", "B"] });
    g.start(1000);
    g.rep(0, 1100);
    g.rep(1, 1200);
    g.rep(1, 1300);
    expect(g.scores).toEqual([1, 2]);
    expect(
      g.events
        .filter((e) => e.type === "PLAYER_TAKES_LEAD")
        .map((e) => e.player),
    ).toEqual([0, 1]);
    expect(g.events.filter((e) => e.type === "SCORE_TIED")).toHaveLength(1);
    g.rep(1, 1400);
    g.rep(1, 1500);
    g.rep(1, 1600);
    expect(g.events.filter((e) => e.type === "MILESTONE")).toHaveLength(1);
  });
  it("ends as soon as a player reaches the repetition goal", () => {
    const g = new GameEngine({ goal: 3, players: ["A", "B"] });
    g.start(1000);
    g.rep(0, 2000);
    g.rep(1, 3000);
    g.rep(0, 4000);
    expect(g.events.filter((e) => e.type === "HALFWAY_TO_GOAL")).toHaveLength(1);
    g.rep(0, 5000);
    g.rep(1, 6000);
    expect(g.state).toBe("complete");
    expect(g.scores).toEqual([3, 1]);
    expect(g.winner).toBe(0);
    expect(g.events.filter((e) => e.type === "MATCH_FINISHED")).toHaveLength(1);
  });
  it("handles solo practice, reset and stale timestamps", () => {
    const g = new GameEngine({ goal: 1, players: ["A", "B"] });
    g.start(0);
    g.rep(0, 1000);
    expect(g.winner).toBe(0);
    g.reset();
    expect(g.events).toEqual([]);
    g.start(2000);
    g.rep(0, 2100);
    g.rep(1, 2050);
    expect(g.scores).toEqual([1, 0]);
    const solo = new GameEngine({ goal: 1, players: ["A"] });
    solo.start(0);
    solo.rep(0, 1000);
    expect(solo.winner).toBe(0);
  });
  it("lets two players finish one at a time and ties equal goals", () => {
    const g = new GameEngine({ goal: 2, players: ["A", "B"], sequential: true });
    g.start(1000);
    g.rep(0, 1100);
    g.rep(0, 1200);
    g.rep(0, 1300);
    expect(g.state).toBe("active");
    expect(g.scores).toEqual([2, 0]);
    g.rep(1, 1400);
    g.rep(1, 1500);
    expect(g.state).toBe("complete");
    expect(g.scores).toEqual([2, 2]);
    expect(g.winner).toBeNull();
  });
  it("snapshots event scores without subsequent mutation", () => {
    const g = new GameEngine({ goal: 5, players: ["A"] });
    g.start(0);
    g.rep(0, 1);
    expect(g.events[0].scores).toEqual([0]);
  });
});
describe("spatial association", () => {
  it("keeps identity despite reversed pose ordering", () => {
    const tracker = new PlayerTracker(2);
    const left = syntheticPose(false, 0.25);
    const right = syntheticPose(true, 0.75);
    expect(tracker.update([right, left], 0)).toEqual([left, right]);
    expect(tracker.update([left, right], 50)).toEqual([left, right]);
    expect(tracker.update([right], 100)).toEqual([null, right]);
    expect(tracker.update([], 150)).toEqual([null, null]);
    expect(tracker.update([right, left], 200)).toEqual([left, right]);
  });
  it("supports one player and ignores unreliable centers", () => {
    const tracker = new PlayerTracker(1);
    const p = syntheticPose(false);
    expect(tracker.update([p], 0)).toEqual([p]);
    expect(tracker.update([[]], 20)).toEqual([null]);
    tracker.reset();
    expect(tracker.update([p], 40)).toEqual([p]);
  });
});
