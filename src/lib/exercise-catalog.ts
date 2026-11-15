import type { ExerciseId } from "./form";

export type CatalogItem = {
  id: string;
  title: string;
  summary: string;
  ageMin: number;
  ageMax: number;
  movement: ExerciseId;
};

export const EXERCISE_COUNT = 6;

/** Local list used when Gemini is unset or returns nothing usable. */
export const FALLBACK_EXERCISES: CatalogItem[] = [
  {
    id: "arm-raises",
    title: "Controlled arm raises",
    summary: "Lift both arms to a comfortable target and lower them with control.",
    ageMin: 8,
    ageMax: 90,
    movement: "arm-raises",
  },
  {
    id: "squats",
    title: "Controlled squats",
    summary: "Bend the hips and knees to a comfortable depth, then return toward standing.",
    ageMin: 13,
    ageMax: 90,
    movement: "squats",
  },
  {
    id: "short-arm-lifts",
    title: "Short arm lifts",
    summary: "Raise both arms only part of the way, pause, and lower them together.",
    ageMin: 8,
    ageMax: 12,
    movement: "arm-raises",
  },
  {
    id: "steady-squats",
    title: "Steady squats",
    summary: "Lower and rise at an even pace, stopping at the depth you choose.",
    ageMin: 18,
    ageMax: 64,
    movement: "squats",
  },
  {
    id: "easy-arm-raises",
    title: "Easy arm raises",
    summary: "Use a smaller arm target and keep the lowering slow.",
    ageMin: 65,
    ageMax: 90,
    movement: "arm-raises",
  },
  {
    id: "smaller-squats",
    title: "Smaller squat range",
    summary: "Use a shallow squat target and stand back up with control.",
    ageMin: 65,
    ageMax: 90,
    movement: "squats",
  },
];

const blocked =
  /diagnos|injur|rehab|therap|pain|fracture|torn|prescri|medical|clinical/i;

export function exercisesForAge(items: CatalogItem[], age: number | null) {
  if (age == null) return items;
  return items.filter((item) => age >= item.ageMin && age <= item.ageMax);
}

export function parseAge(value: string) {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const age = Number(value);
  if (age < 8 || age > 99) return null;
  return age;
}

function slug(title: string, index: number) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "exercise"}-${index}`;
}

export function catalogFromModel(raw: unknown): CatalogItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CatalogItem[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const summary = typeof row.summary === "string" ? row.summary.trim() : "";
    const ageMin = Number(row.ageMin);
    const ageMax = Number(row.ageMax);
    const movement = row.movement === "squats" ? "squats" : row.movement === "arm-raises" ? "arm-raises" : null;
    if (!title || title.length > 60 || !summary || summary.length > 180) continue;
    if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax)) continue;
    if (ageMin < 8 || ageMax > 90 || ageMin > ageMax) continue;
    if (!movement) continue;
    if (blocked.test(`${title} ${summary}`)) continue;
    items.push({
      id: slug(title, index),
      title,
      summary,
      ageMin,
      ageMax,
      movement,
    });
    if (items.length === EXERCISE_COUNT) break;
  }
  return items.length >= 4 ? items : [];
}
