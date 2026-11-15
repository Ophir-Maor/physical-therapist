import { SCORING_VERSION } from "./session-context";

export type BoardExperience = "arcade" | "coach";
export type BoardChallenge = "reps" | "form" | "consistency";

export type Activity = {
  exercise: "jumping-jacks" | "arm-raises" | "squats";
  experience: BoardExperience;
  label: string;
  challenges: readonly BoardChallenge[];
};

export const ACTIVITIES: Activity[] = [
  {
    exercise: "jumping-jacks",
    experience: "arcade",
    label: "Jumping jacks",
    challenges: ["reps"],
  },
  {
    exercise: "arm-raises",
    experience: "arcade",
    label: "Arm raises",
    challenges: ["reps"],
  },
  {
    exercise: "arm-raises",
    experience: "coach",
    label: "Controlled arm raises",
    challenges: ["form", "consistency"],
  },
  {
    exercise: "squats",
    experience: "coach",
    label: "Controlled squats",
    challenges: ["form", "consistency"],
  },
];

export const CHALLENGE_LABELS: Record<BoardChallenge, string> = {
  reps: "Arcade Championship",
  form: "Form Challenge",
  consistency: "Consistency Challenge",
};

export function activityKey(activity: Pick<Activity, "exercise" | "experience">) {
  return `${activity.exercise}:${activity.experience}`;
}

export function findActivity(exercise: string, experience: string) {
  return ACTIVITIES.find(
    (item) => item.exercise === exercise && item.experience === experience,
  );
}

export type ScoreRow = {
  id: number;
  nickname: string;
  reps: number;
  average: number | null;
  consistency: number | null;
  createdAt: string;
  exercise: string;
  challenge: string;
  experience: string;
  durationSec: number | null;
  goalReps: number | null;
  target: number | null;
  scoringVersion: string | null;
};

export type BoardFilter = {
  exercise: string;
  experience: BoardExperience;
  challenge: BoardChallenge;
  scoringVersion?: string;
};

export function metric(row: ScoreRow, challenge: BoardChallenge) {
  if (challenge === "reps") return row.reps;
  return row.average;
}

export function inCategory(row: ScoreRow, filter: BoardFilter) {
  if (row.exercise !== filter.exercise || row.experience !== filter.experience)
    return false;
  if (row.challenge !== filter.challenge) return false;
  if (filter.challenge === "reps") return row.reps >= 1;
  if ((row.scoringVersion ?? "") !== (filter.scoringVersion ?? SCORING_VERSION)) return false;
  return metric(row, filter.challenge) != null;
}

/**
 * Higher score first. Equal scores keep the earlier submission ahead.
 * This mirrors the SQL `ORDER BY score DESC, created_at ASC, id ASC LIMIT 10`.
 */
export function rankTop(rows: ScoreRow[], filter: BoardFilter) {
  return rows
    .filter((row) => inCategory(row, filter))
    .sort((a, b) => {
      if (filter.challenge !== "reps") {
        const quality = (b.average ?? -1) - (a.average ?? -1);
        if (quality !== 0) return quality;
        const steadiness = (b.consistency ?? -1) - (a.consistency ?? -1);
        if (steadiness !== 0) return steadiness;
      } else {
        const score = (metric(b, filter.challenge) ?? 0) - (metric(a, filter.challenge) ?? 0);
        if (score !== 0) return score;
      }
      const time = a.createdAt.localeCompare(b.createdAt);
      if (time !== 0) return time;
      return a.id - b.id;
    })
    .slice(0, 10)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
