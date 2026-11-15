import { describe, expect, it } from "vitest";
import {
  catalogFromModel,
  exercisesForAge,
  parseAge,
  FALLBACK_EXERCISES,
} from "./exercise-catalog";

describe("exercise catalog", () => {
  it("filters the built-in list by age and shows every exercise when age is blank", () => {
    expect(exercisesForAge(FALLBACK_EXERCISES, null)).toHaveLength(6);
    expect(exercisesForAge(FALLBACK_EXERCISES, 10).map((item) => item.id)).toEqual([
      "arm-raises",
      "short-arm-lifts",
    ]);
    expect(exercisesForAge(FALLBACK_EXERCISES, 70).every((item) => item.ageMax >= 70)).toBe(
      true,
    );
  });

  it("accepts a whole age from 8 to 99", () => {
    expect(parseAge("")).toBeNull();
    expect(parseAge("7")).toBeNull();
    expect(parseAge("16")).toBe(16);
    expect(parseAge("100")).toBeNull();
  });

  it("drops clinical wording and keeps a usable Gemini list", () => {
    const rejected = catalogFromModel([
      {
        title: "Shoulder rehab raises",
        summary: "A therapy plan for pain.",
        ageMin: 18,
        ageMax: 64,
        movement: "arm-raises",
      },
    ]);
    expect(rejected).toEqual([]);
    const accepted = catalogFromModel(
      [8, 13, 30, 70].map((age, index) => ({
        title: `Practice ${index + 1}`,
        summary: "Move to a comfortable target and return with control.",
        ageMin: age,
        ageMax: age + 5,
        movement: index % 2 === 0 ? "arm-raises" : "squats",
      })),
    );
    expect(accepted).toHaveLength(4);
    expect(accepted[1]?.movement).toBe("squats");
  });
});
