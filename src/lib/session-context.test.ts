import { describe, expect, it } from "vitest";
import {
  applyRep,
  applyTracking,
  createSession,
  decide,
  isStale,
  rememberComment,
  renderLine,
  type MeasuredRep,
} from "./session-context";

const rep = (extra: Partial<MeasuredRep> = {}): MeasuredRep => ({
  scored: true,
  quality: 80,
  confidence: 0.9,
  rushed: false,
  feedback: "The pace looks controlled.",
  metrics: [
    { id: "control", label: "Movement control", score: 90, note: "The pace looks controlled." },
    { id: "range", label: "Target range", score: 100, note: "You reached your selected target." },
    { id: "alignment", label: "Observable alignment", score: 88, note: "Both sides are moving together." },
  ],
  ...extra,
});

describe("session coaching", () => {
  it("speaks on the first scored rep and stays quiet when nothing changes", () => {
    let session = createSession({ name: "Alex", personality: "calm" });
    session = applyRep(session, rep());
    const first = decide(session, rep());
    expect(first.speak).toBe(true);
    expect(first.focus).toBe("first");
    expect(renderLine(session, first)).not.toContain("Alex");
    session = rememberComment(session, first.key, renderLine(session, first));
    session = applyRep(session, rep({ quality: 82 }));
    expect(decide(session, rep({ quality: 82 })).speak).toBe(false);
  });

  it("uses the measured control note after repeated fast reps and does not repeat it", () => {
    let session = createSession({ name: "Alex", personality: "drill" });
    const fast = rep({
      rushed: true,
      quality: 64,
      feedback: "Try lowering a little more slowly. Control matters more than speed.",
      metrics: [
        {
          id: "control",
          label: "Movement control",
          score: 60,
          note: "Try lowering a little more slowly. Control matters more than speed.",
        },
      ],
    });
    session = applyRep(session, fast);
    session = rememberComment(session, "first", "first");
    session.spokenKeys = ["first"];
    session = applyRep(session, fast);
    const decision = decide(session, fast);
    expect(decision.focus).toBe("control");
    expect(renderLine(session, decision)).toContain("slowly");
    expect(renderLine(session, decision)).not.toContain("Alex");
    expect(renderLine(session, decision).toLowerCase()).not.toMatch(/living room|crowd|history/);
    session = rememberComment(session, decision.key, renderLine(session, decision));
    session = applyRep(session, fast);
    expect(decide(session, fast).speak).toBe(false);
  });

  it("drops a line after the session has moved on", () => {
    let session = createSession({ name: "Alex" });
    session = applyRep(session, rep({ quality: 70 }));
    const decision = decide(session, rep({ quality: 70 }));
    session = applyRep(session, rep({ quality: 88 }));
    expect(isStale(session, decision)).toBe(true);
  });

  it("asks for the camera only from a tracking loss", () => {
    let session = applyTracking(createSession({ name: "Alex", personality: "calm" }), false);
    session = { ...session, feedback: "I couldn't clearly see your shoulders and hands." };
    const decision = decide(session);
    expect(decision.safety).toBe(true);
    expect(renderLine(session, decision)).toContain("shoulders");
    expect(renderLine(session, decision)).not.toContain("Alex");
  });
});
