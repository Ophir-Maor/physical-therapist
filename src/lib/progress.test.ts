import { describe, expect, it } from "vitest";
import {
  achievementsFor,
  loadSessions,
  personalBest,
  saveSession,
  type SessionRecord,
} from "./progress";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  };
};

const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "a",
  at: "2026-11-14T00:00:00.000Z",
  experience: "coach",
  exercise: "arm-raises",
  challenge: "form",
  personality: "supportive",
  names: ["Alex"],
  reps: [4],
  qualities: [82, 84, 86, 88, 90],
  average: 86,
  consistency: 92,
  target: 100,
  durationSec: 40,
  demo: false,
  ...over,
});

describe("progress", () => {
  it("stores sessions and ignores malformed history", () => {
    const store = memory();
    store.setItem("el-sessions", JSON.stringify([{ nope: true }, session()]));
    expect(loadSessions(store)).toHaveLength(1);
    const saved = saveSession(session({ id: "b", average: 90 }), store);
    expect(saved).toHaveLength(2);
    expect(loadSessions(store)[0].id).toBe("b");
  });
  it("compares personal bests only with similar targets and awards the playful set", () => {
    const older = session({ id: "old", average: 70, at: "2026-11-13T00:00:00.000Z" });
    const latest = session({ id: "new", average: 86 });
    const different = session({ id: "other", target: 40, average: 99 });
    expect(personalBest([older, different, latest], latest).improved).toBe(true);
    expect(personalBest([session({ id: "demo", demo: true, average: 99 })], latest).best).toBeNull();
    const badges = achievementsFor([older], latest);
    expect(badges.map((badge) => badge.id)).toEqual(
      expect.arrayContaining(["five-quality", "smooth-operator", "consistency-king", "personal-best", "comeback"]),
    );
  });
});
