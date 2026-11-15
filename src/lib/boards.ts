import { SCORING_VERSION } from "./session-context";

export const ARCADE_DURATIONS = [15, 30, 60] as const;
export const COACH_GOALS = [4, 6, 8] as const;

export type BoardExperience = "arcade" | "coach";
export type BoardChallenge = "timed" | "form" | "consistency";

export type Activity = {
  exercise: "jumping-jacks" | "arm-raises" | "squats";
  experience: BoardExperience;
  label: string;
  challenges: readonly BoardChallenge[];
  targets: readonly number[];
};

export const ACTIVITIES: Activity[] = [
  {
    exercise: "jumping-jacks",
    experience: "arcade",
    label: "Jumping jacks",
    challenges: ["timed"],
    targets: [],
  },
  {
    exercise: "arm-raises",
    experience: "arcade",
    label: "Arm raises",
    challenges: ["timed"],
    targets: [],
  },
  {
    exercise: "arm-raises",
    experience: "coach",
    label: "Controlled arm raises",
    challenges: ["form", "consistency"],
    targets: [45, 60, 75, 90],
  },
  {
    exercise: "squats",
    experience: "coach",
    label: "Controlled squats",
    challenges: ["form", "consistency"],
    targets: [25, 35, 45, 60],
  },
];

export const CHALLENGE_LABELS: Record<BoardChallenge, string> = {
  timed: "Arcade Championship",
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

/** Same 10% window the app already uses for personal-best comparisons. */
export function sameTarget(left: number, right: number) {
  if (left <= 0 || right <= 0) return false;
  return Math.abs(left - right) / left <= 0.1;
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
  durationSec?: number;
  goalReps?: number;
  target?: number;
  scoringVersion?: string;
};

export function metric(row: ScoreRow, challenge: BoardChallenge) {
  if (challenge === "timed") return row.reps;
  if (challenge === "consistency") return row.consistency;
  return row.average;
}

export function inCategory(row: ScoreRow, filter: BoardFilter) {
  if (row.exercise !== filter.exercise || row.experience !== filter.experience)
    return false;
  if (row.challenge !== filter.challenge) return false;
  if (filter.challenge === "timed") return row.durationSec === filter.durationSec && row.reps >= 1;
  if (filter.goalReps == null || filter.target == null) return false;
  if (row.goalReps !== filter.goalReps || row.target == null) return false;
  if (row.reps < filter.goalReps) return false;
  if (!sameTarget(row.target, filter.target)) return false;
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
      if (filter.challenge === "form") {
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
