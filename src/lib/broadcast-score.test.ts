import { describe, expect, it } from "vitest";
import { gradeCycle, livePace, samplePose } from "./broadcast-score";
import { syntheticPose } from "./engine";

describe("broadcast form", () => {
  it("scores a full synthetic jack as a perfect 2", () => {
    const grade = gradeCycle(
      "jumping-jacks",
      samplePose(syntheticPose(true), "jumping-jacks"),
      samplePose(syntheticPose(false), "jumping-jacks"),
    );
    expect(grade.form).toBe(100);
    expect(grade.points).toBe(2);
    expect(grade.weakest).toBe("clean");
  });

  it("scores a barely legal jack near 40 form", () => {
    const open = syntheticPose(false);
    const close = syntheticPose(false);
    const width = 0.11;
    open[15].y = open[11].y - width * 0.35;
    open[16].y = open[12].y - width * 0.35;
    open[27].x = 0.5 - (width * 1.8) / 2;
    open[28].x = 0.5 + (width * 1.8) / 2;
    close[15].y = close[11].y + width * 0.3;
    close[16].y = close[12].y + width * 0.3;
    close[27].x = 0.5 - (width * 1.25) / 2;
    close[28].x = 0.5 + (width * 1.25) / 2;
    const grade = gradeCycle(
      "jumping-jacks",
      samplePose(open, "jumping-jacks"),
      samplePose(close, "jumping-jacks"),
    );
    expect(grade.form).toBe(40);
    expect(grade.points).toBe(1.4);
  });

  it("lets lean remove at most 15 and skips it when the hips are missing", () => {
    const open = samplePose(syntheticPose(true), "arm-raises");
    const close = samplePose(syntheticPose(false), "arm-raises");
    const leaned = gradeCycle(
      "arm-raises",
      { ...open, lean: 15 },
      close,
    );
    const hidden = gradeCycle("arm-raises", { ...open, lean: null }, close);
    expect(leaned.form).toBe(85);
    expect(leaned.weakest).toBe("lean");
    expect(hidden.form).toBe(100);
  });

  it("takes arm-raise points away when the lift is rushed", () => {
    const open = samplePose(syntheticPose(true), "arm-raises");
    const close = samplePose(syntheticPose(false), "arm-raises");
    const controlled = gradeCycle("arm-raises", open, close, 1500);
    const rushed = gradeCycle("arm-raises", open, close, 500);
    const jacks = gradeCycle(
      "jumping-jacks",
      samplePose(syntheticPose(true), "jumping-jacks"),
      samplePose(syntheticPose(false), "jumping-jacks"),
      500,
    );
    expect(controlled.form).toBe(100);
    expect(controlled.points).toBe(2);
    expect(rushed.form).toBe(70);
    expect(rushed.points).toBe(1.7);
    expect(rushed.weakest).toBe("pace");
    expect(jacks.form).toBe(100);
  });

  it("labels a live arm raise that is too fast, too slow, or holding still", () => {
    expect(livePace(220)).toBe("fast");
    expect(livePace(20)).toBe("slow");
    expect(livePace(80)).toBe("good");
    expect(livePace(0)).toBe("idle");
  });
});
