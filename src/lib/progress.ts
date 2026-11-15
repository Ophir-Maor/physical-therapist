import type { ChallengeId, CoachId } from "./exercises";
import type { ExerciseId } from "./form";

export type SessionRecord = {
  id: string;
  at: string;
  experience: "coach" | "arcade";
  exercise: ExerciseId | "jumping-jacks";
  challenge: ChallengeId | "reps";
  personality: CoachId | "hype" | "dry" | "documentary";
  names: string[];
  reps: number[];
  qualities: number[];
  average: number | null;
  consistency: number | null;
  target: number | null;
  durationSec: number;
  demo: boolean;
};

export type Achievement = { id: string; title: string; detail: string };

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const KEY = "el-sessions";

export function sessionTargetComparable(a: SessionRecord, b: SessionRecord) {
  if (
    a.experience !== "coach" ||
    b.experience !== "coach" ||
    a.exercise !== b.exercise ||
    a.challenge !== b.challenge ||
    a.demo !== b.demo ||
    a.target == null ||
    b.target == null ||
    a.target <= 0
  )
    return false;
  return Math.abs(a.target - b.target) / a.target <= 0.1;
}

function valid(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as SessionRecord;
  return (
    typeof item.id === "string" &&
    typeof item.at === "string" &&
    (item.experience === "coach" || item.experience === "arcade") &&
    typeof item.exercise === "string" &&
    Array.isArray(item.names) &&
    item.names.every((name) => typeof name === "string") &&
    Array.isArray(item.reps) &&
    item.reps.every((rep) => typeof rep === "number" && Number.isFinite(rep)) &&
    Array.isArray(item.qualities) &&
    item.qualities.every((score) => typeof score === "number") &&
    typeof item.demo === "boolean"
  );
}

export function loadSessions(store?: Store) {
  try {
    const source = store ?? globalThis.localStorage;
    const parsed = JSON.parse(source?.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(valid).slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function saveSession(record: SessionRecord, store?: Store) {
  const next = [record, ...loadSessions(store)].slice(0, 30);
  try {
    (store ?? globalThis.localStorage)?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode and full storage still leave the in-memory session usable. */
  }
  return next;
}

export function personalBest(sessions: SessionRecord[], latest: SessionRecord) {
  const prior = sessions.filter(
    (session) => session.id !== latest.id && sessionTargetComparable(session, latest),
  );
  const best = prior.reduce<number | null>((top, session) => {
    if (session.average == null) return top;
    return top == null ? session.average : Math.max(top, session.average);
  }, null);
  return {
    best,
    improved:
      latest.average != null && best != null && latest.average > best + 0.5,
    comparableCount: prior.length,
  };
}

export function achievementsFor(
  sessions: SessionRecord[],
  latest: SessionRecord,
): Achievement[] {
  const earned: Achievement[] = [];
  const good = latest.qualities.filter((score) => score >= 80).length;
  if (good >= 5)
    earned.push({
      id: "five-quality",
      title: "Five Quality Reps",
      detail: "Five scored repetitions reached 80 or better.",
    });
  if ((latest.average ?? 0) >= 85 && (latest.consistency ?? 0) >= 80)
    earned.push({
      id: "smooth-operator",
      title: "Smooth Operator",
      detail: "High average quality and a steady pattern in the same session.",
    });
  if ((latest.consistency ?? 0) >= 90)
    earned.push({
      id: "consistency-king",
      title: "Consistency King",
      detail: "The scored repetitions stayed very close to each other.",
    });
  const history = sessions.filter((session) => session.id !== latest.id);
  const best = personalBest(history, latest);
  if (best.improved)
    earned.push({
      id: "personal-best",
      title: "Personal Best",
      detail: "Average quality beat your previous comparable sessions.",
    });
  const previous = history.find((session) =>
    sessionTargetComparable(session, latest),
  );
  if (
    previous?.average != null &&
    latest.average != null &&
    latest.average >= previous.average + 8
  )
    earned.push({
      id: "comeback",
      title: "Comeback Champion",
      detail: "This session improved at least eight points on the previous comparable one.",
    });
  return earned;
}
