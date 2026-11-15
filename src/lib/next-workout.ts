import type { ExerciseId, RepEvaluation } from "./form";

export type SectionScores = {
  control: number | null;
  range: number | null;
  alignment: number | null;
  consistency: number | null;
};

export type NextWorkout = {
  title: string;
  movement: ExerciseId;
  focus: "weakness" | "strength";
  reason: string;
};

const titles: Record<ExerciseId, string> = {
  "arm-raises": "Controlled arm raises",
  squats: "Controlled squats",
};

const sectionLabels: Record<keyof SectionScores, string> = {
  control: "movement control",
  range: "target range",
  alignment: "observable alignment",
  consistency: "consistency",
};

const blocked =
  /diagnos|injur|rehab|therap|pain|fracture|torn|prescri|medical|clinical|push through/i;

export function sectionsFromReps(reps: RepEvaluation[]): SectionScores {
  const scored = reps.filter((rep) => rep.scored);
  const average = (id: keyof SectionScores) => {
    const values = scored.flatMap((rep) => {
      const metric = rep.metrics.find((item) => item.id === id);
      return metric?.score == null ? [] : [metric.score];
    });
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  return {
    control: average("control"),
    range: average("range"),
    alignment: average("alignment"),
    consistency: average("consistency"),
  };
}

function sameTitle(title: string, others: string[]) {
  const key = title.trim().toLowerCase();
  return others.some((item) => item.trim().toLowerCase() === key);
}

function pickTitle(options: string[], avoid: string[]) {
  return options.find((title) => !sameTitle(title, avoid)) ?? options[0];
}

export function localNextWorkouts(
  exercise: ExerciseId,
  sections: SectionScores,
  age: number,
  avoid: string[] = [],
): NextWorkout[] {
  const primary = localNextWorkout(exercise, sections);
  const other: ExerciseId = exercise === "squats" ? "arm-raises" : "squats";
  const older = age >= 65;
  const younger = age <= 17;
  const pace = older
    ? "Keep the motion small and slow."
    : younger
      ? "Keep a steady tempo."
      : "Keep an even pace.";
  const used = [...avoid];
  const firstTitle = pickTitle(
    primary.focus === "weakness"
      ? exercise === "squats"
        ? ["Depth control practice", "Slow squat practice", "Even depth practice"]
        : ["Smooth raise practice", "Quiet arm lifts", "Steady shoulder raises"]
      : exercise === "squats"
        ? ["Squat control practice", "Balanced squat practice", "Upright squat practice"]
        : ["Raise control practice", "Level arm practice", "Matched raise practice"],
    used,
  );
  used.push(firstTitle);
  const secondTitle = pickTitle(
    other === "squats"
      ? ["Squat transfer practice", "Fresh squat practice", "New squat practice"]
      : ["Raise transfer practice", "Fresh raise practice", "New raise practice"],
    used,
  );
  used.push(secondTitle);
  const thirdTitle = pickTitle(
    older
      ? exercise === "squats"
        ? ["Easy squat practice", "Small squat practice", "Unhurried squat practice"]
        : ["Easy arm-raise practice", "Small-range arm raises", "Unhurried arm raises"]
      : younger
        ? exercise === "squats"
          ? ["Steady squat tempo", "Even squat tempo", "Patient squat tempo"]
          : ["Steady arm-raise tempo", "Even arm-raise tempo", "Patient arm-raise tempo"]
        : exercise === "squats"
          ? ["Even squat practice", "Measured squat practice", "Composed squat practice"]
          : ["Even arm-raise practice", "Measured arm-raise practice", "Composed arm-raise practice"],
    used,
  );
  return [
    {
      ...primary,
      title: firstTitle,
    },
    {
      title: secondTitle,
      movement: other,
      focus: "strength",
      reason: `Carry the stronger part of this set into ${other === "squats" ? "squats" : "arm raises"}. Stop at the target you choose.`,
    },
    {
      title: thirdTitle,
      movement: exercise,
      focus: primary.focus,
      reason: `${pace} Age ${age} only sets a comfortable pace. Stop at the target you choose.`,
    },
  ];
}

/** The two movements the camera can score, used when no age was entered. */
export function builtInWorkouts(): NextWorkout[] {
  return (["arm-raises", "squats"] as const).map((movement) => ({
    title: titles[movement],
    movement,
    focus: "strength",
    reason: "This movement is scored in the app. Stop at the target you choose.",
  }));
}

export function localNextWorkout(
  exercise: ExerciseId,
  sections: SectionScores,
): NextWorkout {
  const scored = (Object.entries(sections) as [keyof SectionScores, number | null][])
    .flatMap(([id, score]) => (score == null ? [] : [[id, score] as const]));
  const other: ExerciseId = exercise === "squats" ? "arm-raises" : "squats";
  if (!scored.length) {
    return {
      title: titles[other],
      movement: other,
      focus: "strength",
      reason:
        "This set did not have enough scored repetitions to compare sections. The other built-in movement is a fresh practice.",
    };
  }
  const ordered = [...scored].sort((a, b) => a[1] - b[1]);
  const [weakId, weakScore] = ordered[0];
  const [strongId, strongScore] = ordered[ordered.length - 1];
  if (strongScore - weakScore >= 8) {
    return {
      title: titles[exercise],
      movement: exercise,
      focus: "weakness",
      reason: `${sectionLabels[weakId]} was the lower section at ${weakScore}. Repeat this movement and give that part a little more attention. Stop at the target you choose.`,
    };
  }
  return {
    title: titles[other],
    movement: other,
    focus: "strength",
    reason: `${sectionLabels[strongId]} was the stronger section at ${strongScore}. Carry that control into ${titles[other].toLowerCase()}.`,
  };
}

export function workoutFromModel(raw: unknown, fallback: NextWorkout): NextWorkout {
  if (!raw || typeof raw !== "object") return fallback;
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const reason = typeof row.reason === "string" ? row.reason.trim() : "";
  const movement = row.movement === "squats" || row.movement === "arm-raises" ? row.movement : null;
  const focus = row.focus === "weakness" || row.focus === "strength" ? row.focus : null;
  if (!title || title.length > 60 || !reason || reason.length > 240) return fallback;
  if (!movement || !focus) return fallback;
  if (blocked.test(`${title} ${reason}`)) return fallback;
  return { title, movement, focus, reason };
}

export function workoutsFromModel(
  raw: unknown,
  fallback: NextWorkout[],
  avoid: string[] = [],
): NextWorkout[] | null {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(raw) ? raw : Array.isArray(record?.workouts) ? record.workouts : [];
  const kept: NextWorkout[] = [];
  for (const item of list) {
    const parsed = workoutFromModel(item, fallback[0]);
    if (parsed === fallback[0]) continue;
    if (sameTitle(parsed.title, [...avoid, ...kept.map((workout) => workout.title)])) continue;
    kept.push(parsed);
    if (kept.length === 3) break;
  }
  return kept.length ? kept : null;
}

const shownKey = "el-shown-workouts";

export function readShownWorkouts(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(shownKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim().slice(0, 60)] : []))
      .slice(0, 9);
  } catch {
    return [];
  }
}

export function replaceShownWorkouts(titles: string[]) {
  if (typeof localStorage === "undefined") return;
  const next = titles
    .flatMap((item) => (item.trim() ? [item.trim().slice(0, 60)] : []))
    .slice(0, 9);
  localStorage.setItem(shownKey, JSON.stringify(next));
}
