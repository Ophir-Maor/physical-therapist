import { describe, expect, it } from "vitest";
import { CommentaryQueue, coachCommentary, commentaryFor } from "./commentary";
import type { GameEvent } from "./engine";
const event = (type: string, scores = [5, 4]): GameEvent => ({
  id: "1",
  type: type as GameEvent["type"],
  scores,
  timestamp: 1000,
  player: 0,
});
describe("commentary queue", () => {
  it("prioritizes important events and deduplicates event IDs", () => {
    const queue = new CommentaryQueue();
    expect(queue.push("rep", 1, "rep-1", 0)).toBe(true);
    expect(queue.push("rep again", 1, "rep-1", 0)).toBe(false);
    queue.push("lead", 5, "lead", 100);
    expect(queue.pop(200)?.text).toBe("lead");
    expect(queue.pop(200)?.text).toBe("rep");
  });
  it("drops stale routine commentary and clears everything for a winner", () => {
    const queue = new CommentaryQueue();
    queue.push("stale", 1, "a", 0);
    expect(queue.pop(8000)).toBeUndefined();
    queue.push("lead", 5, "b", 8000);
    queue.push("victory", 10, "c", 8100);
    expect(queue.pop(8200)?.text).toBe("victory");
    expect(queue.pop(8200)).toBeUndefined();
  });
  it("resets deduplication on a new match", () => {
    const queue = new CommentaryQueue();
    queue.push("a");
    queue.clear();
    expect(queue.push("a")).toBe(true);
  });
});
describe("event commentary", () => {
  it("only narrates milestone reps", () => {
    expect(
      commentaryFor(event("REP_COMPLETED", [4, 2]), ["Ada", "Max"], "hype"),
    ).toBeNull();
    expect(
      commentaryFor(event("REP_COMPLETED"), ["Ada", "Max"], "hype"),
    ).toContain("Ada reaches 5");
  });
  it("uses actual winners and ties", () => {
    expect(
      commentaryFor(event("MATCH_FINISHED", [2, 3]), ["Ada", "Max"], "dry"),
    ).toContain("Max wins");
    expect(
      commentaryFor(event("MATCH_FINISHED", [3, 3]), ["Ada", "Max"], "dry"),
    ).toContain("draw");
  });
});

// Use mocked browser primitives to verify serialization and cancellation, not provider audio quality.
describe("coach personalities", () => {
  it("uses the measured cue and never tells someone to ignore pain", () => {
    for (const personality of ["supportive", "drill", "hype", "calm"] as const) {
      const intro = coachCommentary({
        type: "intro",
        personality,
        name: "Alex",
      });
      const rep = coachCommentary({
        type: "rep",
        personality,
        name: "Alex",
        quality: 92,
        feedback: "Try lowering a little more slowly.",
      });
      expect(intro.toLowerCase()).toMatch(/stop|pain/);
      expect(`${intro} ${rep}`.toLowerCase()).not.toMatch(
        /ignore pain|push through|no pain no gain/,
      );
      expect(rep).toContain("92");
      expect(rep.toLowerCase()).toContain("slowly");
      expect(rep.length).toBeLessThan(240);
      expect(`${intro} ${rep}`.toLowerCase()).not.toMatch(
        /idiot|pathetic|weakling|useless|shut up/,
      );
      expect(
        coachCommentary({
          type: "preview",
          personality,
          name: "Alex",
        }).toLowerCase(),
      ).toMatch(/stop|pain/);
    }
    const previews = (["supportive", "drill", "hype", "calm"] as const).map((personality) =>
      coachCommentary({
        type: "preview",
        personality,
        name: "Alex",
      }),
    );
    expect(new Set(previews).size).toBe(4);
    expect(previews[0]).toMatch(/supportive coach/i);
    expect(previews[1]).toMatch(/Drill sergeant/i);
    expect(previews[2]).toMatch(/Hype commentator/i);
    expect(previews[3]).toMatch(/Calm instructor/i);
    expect(previews[0]).toMatch(/Sarah/);
    expect(previews[1]).toMatch(/Callum/);
    expect(previews[2]).toMatch(/Charlie/);
    expect(previews[3]).toMatch(/River/);
    expect(
      coachCommentary({
        type: "rep",
        personality: "hype",
        name: "Alex",
        quality: 96,
        feedback: "Keep the arms smooth.",
      }),
    ).toContain("96");
    expect(
      coachCommentary({
        type: "rep",
        personality: "supportive",
        name: "Alex",
        quality: 84,
        feedback: "Keep the range comfortable.",
        trend: "improved",
      }),
    ).toMatch(/smoother/i);
    for (const line of previews) {
      expect(line.toLowerCase()).not.toMatch(/living room|crowd goes wild|making history/);
    }
    expect(
      coachCommentary({
        type: "rep",
        personality: "supportive",
        name: "Alex",
        quality: 84,
        feedback: "Nice control.",
        consistency: "steady",
      }),
    ).toContain("lining up");
    expect(
      coachCommentary({
        type: "rep",
        personality: "calm",
        name: "Alex",
        quality: null,
        feedback: "I couldn't clearly see the required landmarks.",
      }),
    ).toMatch(/Not scored/);
  });
});
describe("voice playback lifecycle", () => {
  it("does not overlap clips and interrupts stale speech for the result", async () => {
    const { vi } = await import("vitest");
    const { BroadcastVoice } = await import("./commentary");
    vi.useFakeTimers();
    const instances: FakeAudio[] = [];
    class FakeAudio {
      src = "";
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onplaying: (() => void) | null = null;
      play = vi.fn(async () => {
        this.onplaying?.();
      });
      pause = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("window", {
      speechSynthesis: { cancel: vi.fn(), resume: vi.fn() },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["audio"], { type: "audio/mpeg" }),
      })),
    );
    const caption = vi.fn();
    const voice = new BroadcastVoice(caption, vi.fn());
    try {
      voice.enqueue("First", 1, "first");
      await vi.advanceTimersByTimeAsync(10);
      voice.enqueue("Second", 1, "second");
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(caption).toHaveBeenCalledWith("First");
      voice.enqueue("Winner", 10, "winner");
      await vi.advanceTimersByTimeAsync(10);
      expect(instances[0].pause).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(caption).toHaveBeenLastCalledWith("Winner");
      instances[0].onended?.();
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetch).toHaveBeenCalledTimes(2);
      voice.enqueue("Another line", 1, "another");
      await vi.advanceTimersByTimeAsync(10);
      voice.muted = true;
      expect(instances[0].pause).toHaveBeenCalledTimes(2);
      const calls = vi.mocked(fetch).mock.calls.length;
      voice.enqueue("Caption while muted");
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetch).toHaveBeenCalledTimes(calls);
      expect(caption).toHaveBeenLastCalledWith("Caption while muted");
    } finally {
      voice.stop();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
