import { describe, expect, it } from "vitest";
import { builtInWorkouts, localNextWorkout, localNextWorkouts, sectionsFromReps, workoutFromModel, workoutsFromModel } from "./next-workout";
import type { RepEvaluation } from "./form";

const rep = (scores: Partial<Record<"control" | "range" | "alignment" | "consistency", number>>): RepEvaluation => ({
  valid: true,
  scored: true,
  confidence: 0.9,
  quality: 80,
  metrics: (Object.entries(scores) as [keyof typeof scores, number][]).map(([id, score]) => ({
    id,
    label: id,
    score,
    weight: 0.25,
    note: "",
  })),
  feedback: "",
  reasons: [],
  peak: 60,
  durationMs: 1000,
  rushed: false,
});

describe("next workout", () => {
  it("lists the two scored movements when no age is available", () => {
    const workouts = builtInWorkouts();
    expect(workouts.map((workout) => workout.title)).toEqual([
      "Controlled arm raises",
      "Controlled squats",
    ]);
    expect(workouts.every((workout) => !/age/i.test(workout.reason))).toBe(true);
  });

  it("repeats the same movement when one section is clearly lower", () => {
    const next = localNextWorkout("arm-raises", {
      control: 90,
      range: 55,
      alignment: 80,
      consistency: 78,
    });
    expect(next.focus).toBe("weakness");
    expect(next.movement).toBe("arm-raises");
    expect(next.reason).toContain("target range");
  });

  it("switches movement when the sections are close", () => {
    const next = localNextWorkout("squats", {
      control: 82,
      range: 84,
      alignment: 80,
      consistency: 83,
    });
    expect(next.focus).toBe("strength");
    expect(next.movement).toBe("arm-raises");
  });

  it("rejects a clinical model reply and averages scored sections", () => {
    const fallback = localNextWorkout("arm-raises", {
      control: null,
      range: null,
      alignment: null,
      consistency: null,
    });
    expect(
      workoutFromModel(
        {
          title: "Rehab plan",
          movement: "squats",
          focus: "weakness",
          reason: "This therapy treats the injury.",
        },
        fallback,
      ),
    ).toEqual(fallback);
    const sections = sectionsFromReps([
      rep({ control: 70, range: 90 }),
      rep({ control: 90, range: 80 }),
    ]);
    expect(sections.control).toBe(80);
    expect(sections.range).toBe(85);
  });

  it("builds three age-aware ideas and drops a clinical model workout", () => {
    const sections = { control: 90, range: 50, alignment: 80, consistency: 70 };
    const older = localNextWorkouts("arm-raises", sections, 72);
    const younger = localNextWorkouts("arm-raises", sections, 16);
    expect(older).toHaveLength(3);
    expect(older.map((item) => item.title)).toContain("Easy arm-raise practice");
    expect(younger.map((item) => item.title)).toContain("Steady arm-raise tempo");
    expect(older[2].reason).toContain("72");
    const first = localNextWorkouts("arm-raises", sections, 34);
    const second = localNextWorkouts(
      "arm-raises",
      sections,
      34,
      first.map((item) => item.title),
    );
    expect(second.map((item) => item.title).some((title) => first.some((item) => item.title === title))).toBe(
      false,
    );
    const parsed = workoutsFromModel(
      {
        workouts: [
          { title: "Rehab plan", movement: "squats", focus: "weakness", reason: "Treat the injury." },
          {
            title: "Quiet shoulder lifts",
            movement: "arm-raises",
            focus: "weakness",
            reason: "The range score was the low one. Stop at the target you choose.",
          },
        ],
      },
      older,
    );
    expect(parsed).toEqual([
      {
        title: "Quiet shoulder lifts",
        movement: "arm-raises",
        focus: "weakness",
        reason: "The range score was the low one. Stop at the target you choose.",
      },
    ]);
  });
});
