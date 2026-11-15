import { z } from "zod";
import { type BoardChallenge, type BoardExperience } from "../../../lib/boards";
import { databaseConfigured, getSql } from "../../../lib/db";
import { allowsSameSite } from "../../../lib/same-origin";

export const runtime = "nodejs";

const exercises = z.enum(["arm-raises", "squats", "jumping-jacks"]);
const challenges = z.enum([
  "practice",
  "form",
  "consistency",
  "personal-best",
  "reps",
]);
const schema = z
  .object({
    nickname: z.string().trim().min(1).max(24),
    exercise: exercises,
    challenge: challenges,
    experience: z.enum(["coach", "arcade"]),
    average: z.number().min(0).max(100).nullable(),
    reps: z.number().int().min(0).max(200),
    target: z.number().min(0).max(180).nullable(),
    durationSec: z.number().int().min(0).max(600),
    goalReps: z.number().int().min(1).max(99).nullable().optional(),
    consistency: z.number().min(0).max(100).nullable().optional(),
    submissionKey: z.string().uuid(),
    consent: z.literal(true),
    demo: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.experience === "coach" && (value.average == null || value.average <= 0))
      ctx.addIssue({
        code: "custom",
        message: "A quality score is required.",
        path: ["average"],
      });
    if (value.experience === "arcade" && value.reps < 1)
      ctx.addIssue({
        code: "custom",
        message: "At least one counted rep is required.",
        path: ["reps"],
      });
    if (value.experience === "coach" && value.challenge === "reps")
      ctx.addIssue({ code: "custom", message: "Coach sessions use quality challenges.", path: ["challenge"] });
    if (value.experience === "arcade" && value.challenge !== "reps")
      ctx.addIssue({ code: "custom", message: "Arcade sessions use the rep board.", path: ["challenge"] });
  });

let windowStart = 0;
let requests = 0;

export type BoardEntry = {
  nickname: string;
  exercise: string;
  challenge: string;
  experience: string;
  average: number | null;
  consistency: number | null;
  reps: number;
  target: number | null;
  goalReps: number | null;
  durationSec: number | null;
  createdAt: string;
  rank: number;
  yours?: boolean;
};

function disabled(message: string, status = 200) {
  return Response.json({ enabled: false, entries: [], message, submitted: false }, { status });
}

function mapRow(entry: Record<string, unknown>, rank: number, yours = false): BoardEntry {
  return {
    nickname: String(entry.nickname),
    exercise: String(entry.exercise),
    challenge: String(entry.challenge),
    experience: String(entry.experience),
    average: entry.average == null ? null : Number(entry.average),
    consistency: entry.consistency == null ? null : Number(entry.consistency),
    reps: Number(entry.reps),
    target: entry.target_deg == null ? null : Number(entry.target_deg),
    goalReps: entry.goal_reps == null ? null : Number(entry.goal_reps),
    durationSec: entry.duration_sec == null ? null : Number(entry.duration_sec),
    createdAt: new Date(String(entry.created_at)).toISOString(),
    rank,
    yours,
  };
}

type Filters = {
  exercise: string;
  challenge: BoardChallenge;
  experience: BoardExperience;
};

async function topTen(filters: Filters, highlight: string | null) {
  const sql = getSql();
  const rows =
    filters.experience === "arcade"
      ? await sql`
          select nickname, exercise, challenge, experience, average, consistency, reps,
                 target_deg, goal_reps, duration_sec, created_at, submission_key
          from leaderboard
          where exercise = ${filters.exercise}
            and challenge = 'reps'
            and experience = 'arcade'
            and reps >= 1
          order by reps desc, created_at asc, id asc
          limit 10`
      : filters.challenge === "consistency"
        ? await sql`
            select nickname, exercise, challenge, experience, average, consistency, reps,
                   target_deg, goal_reps, duration_sec, created_at, submission_key
            from leaderboard
            where exercise = ${filters.exercise}
              and challenge = 'consistency'
              and experience = 'coach'
              and average is not null
              and scoring_version = 'form-v1'
            order by average desc, consistency desc nulls last, created_at asc, id asc
            limit 10`
        : await sql`
            select nickname, exercise, challenge, experience, average, consistency, reps,
                   target_deg, goal_reps, duration_sec, created_at, submission_key
            from leaderboard
            where exercise = ${filters.exercise}
              and challenge = 'form'
              and experience = 'coach'
              and average is not null
              and scoring_version = 'form-v1'
            order by average desc, consistency desc nulls last, created_at asc, id asc
            limit 10`;
  return rows.map((entry, index) =>
    mapRow(entry, index + 1, highlight != null && entry.submission_key === highlight),
  );
}

async function placeOf(filters: Filters, highlight: string) {
  const sql = getSql();
  const found = await sql`
    select id, reps, average, consistency, created_at, exercise, challenge, experience,
           duration_sec, goal_reps, target_deg
    from leaderboard
    where submission_key = ${highlight}
    limit 1`;
  const row = found[0];
  if (!row) return null;
  const sameBoard =
    String(row.exercise) === filters.exercise &&
    String(row.challenge) === filters.challenge &&
    String(row.experience) === filters.experience;
  const eligible =
    sameBoard &&
    (filters.experience === "arcade"
      ? Number(row.reps) >= 1
      : row.average != null);
  if (!eligible) return { rank: null as number | null, inTop10: false };
  const better =
    filters.experience === "arcade"
      ? await sql`
          select count(*)::int as n
          from leaderboard
          where exercise = ${filters.exercise}
            and challenge = 'reps'
            and experience = 'arcade'
            and reps >= 1
            and (
              reps > ${row.reps}
              or (reps = ${row.reps} and created_at < ${row.created_at})
              or (reps = ${row.reps} and created_at = ${row.created_at} and id < ${row.id})
            )`
      : filters.challenge === "consistency"
        ? await sql`
            select count(*)::int as n
            from leaderboard
            where exercise = ${filters.exercise}
              and challenge = 'consistency'
              and experience = 'coach'
              and average is not null
              and scoring_version = 'form-v1'
              and (
                average > ${row.average}
                or (average = ${row.average} and coalesce(consistency, -1) > coalesce(${row.consistency}::numeric, -1))
                or (
                  average = ${row.average}
                  and coalesce(consistency, -1) = coalesce(${row.consistency}::numeric, -1)
                  and created_at < ${row.created_at}
                )
                or (
                  average = ${row.average}
                  and coalesce(consistency, -1) = coalesce(${row.consistency}::numeric, -1)
                  and created_at = ${row.created_at}
                  and id < ${row.id}
                )
              )`
        : await sql`
            select count(*)::int as n
            from leaderboard
            where exercise = ${filters.exercise}
              and challenge = 'form'
              and experience = 'coach'
              and average is not null
              and scoring_version = 'form-v1'
              and (
                average > ${row.average}
                or (average = ${row.average} and coalesce(consistency, -1) > coalesce(${row.consistency}::numeric, -1))
                or (
                  average = ${row.average}
                  and coalesce(consistency, -1) = coalesce(${row.consistency}::numeric, -1)
                  and created_at < ${row.created_at}
                )
                or (
                  average = ${row.average}
                  and coalesce(consistency, -1) = coalesce(${row.consistency}::numeric, -1)
                  and created_at = ${row.created_at}
                  and id < ${row.id}
                )
              )`;
  const rank = Number(better[0]?.n ?? 0) + 1;
  return { rank, inTop10: rank <= 10 };
}

function filtersFrom(url: URL): Filters | null {
  const exercise = exercises.safeParse(url.searchParams.get("exercise"));
  const challenge = z
    .enum(["reps", "form", "consistency"])
    .safeParse(url.searchParams.get("challenge"));
  const experience = z.enum(["coach", "arcade"]).safeParse(url.searchParams.get("experience"));
  if (!exercise.success || !challenge.success || !experience.success) return null;
  if (experience.data === "arcade") {
    if (challenge.data !== "reps") return null;
    return {
      exercise: exercise.data,
      challenge: "reps",
      experience: "arcade",
    };
  }
  if (challenge.data === "reps") return null;
  return {
    exercise: exercise.data,
    challenge: challenge.data,
    experience: "coach",
  };
}

function kindOf(filters: Filters) {
  if (filters.challenge === "reps") return { kind: "reps", unit: "reps" };
  return { kind: "quality", unit: "average quality" };
}

export async function GET(request: Request) {
  if (!databaseConfigured())
    return disabled("Leaderboard is local-only until DATABASE_URL is configured.");
  const filters = filtersFrom(new URL(request.url));
  if (!filters)
    return Response.json(
      {
        enabled: true,
        entries: [],
        message: "Choose a supported exercise and challenge.",
      },
      { status: 400 },
    );
  const highlight = new URL(request.url).searchParams.get("submission");
  try {
    const entries = await topTen(filters, highlight);
    const place = highlight ? await placeOf(filters, highlight) : null;
    return Response.json({
      enabled: true,
      entries,
      ...kindOf(filters),
      tieBreak:
        filters.experience === "coach"
          ? "Quality first. Consistency breaks a tie, then the earlier submission."
          : "When scores match, the earlier submission ranks higher.",
      place,
      notice:
        "Self-reported scores from this browser. Not a verified competition and not a medical grade.",
    });
  } catch {
    return disabled("Leaderboard could not be read. Local progress still works.", 200);
  }
}

export async function POST(request: Request) {
  if (!databaseConfigured())
    return disabled("No database is configured. The score remains on this device.");
  if (!allowsSameSite(request))
    return Response.json({ error: "Cross-origin submissions are not allowed." }, { status: 403 });
  let data: z.infer<typeof schema>;
  try {
    const body = await request.text();
    if (body.length > 2048)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Nickname, exercise, score, and consent are required.",
        },
        { status: 400 },
      );
    data = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  if (data.demo)
    return Response.json(
      {
        enabled: true,
        submitted: false,
        entries: [],
        message: "Demo Mode results stay on this device and are not added to the public board.",
      },
      { status: 403 },
    );
  if (!/^[\p{L}\p{N} .'_-]+$/u.test(data.nickname))
    return Response.json({ error: "Use a short display name." }, { status: 400 });
  const publicChallenge =
    data.challenge === "reps" || data.challenge === "form" || data.challenge === "consistency"
      ? data.challenge
      : null;
  const filters: Filters | null = publicChallenge
    ? {
        exercise: data.exercise,
        challenge: publicChallenge,
        experience: data.experience,
      }
    : null;
  try {
    const sql = getSql();
    const existing = await sql`
      select submission_key from leaderboard
      where submission_key = ${data.submissionKey}
      limit 1`;
    if (existing.length === 0) {
      if (Date.now() - windowStart >= 60000) {
        windowStart = Date.now();
        requests = 0;
      }
      if (++requests > 10)
        return Response.json(
          { error: "Leaderboard rate limit reached.", submitted: false },
          { status: 429 },
        );
      await sql`
        insert into leaderboard (
          nickname, exercise, challenge, experience, average, consistency, reps,
          target_deg, duration_sec, goal_reps, scoring_version, submission_key
        )
        values (
          ${data.nickname},
          ${data.exercise},
          ${data.challenge},
          ${data.experience},
          ${data.experience === "coach" ? data.average : null},
          ${data.consistency ?? null},
          ${data.reps},
          ${data.experience === "coach" ? data.target : null},
          ${null},
          ${data.goalReps ?? null},
          ${data.experience === "coach" ? "form-v1" : null},
          ${data.submissionKey}
        )`;
    }
    const entries = filters ? await topTen(filters, data.submissionKey) : [];
    const place = filters ? await placeOf(filters, data.submissionKey) : null;
    return Response.json({
      enabled: true,
      submitted: true,
      duplicate: existing.length > 0,
      entries,
      place,
      ...(filters ? kindOf(filters) : { kind: "quality", unit: "average quality" }),
      message: !publicChallenge
        ? "Saved. Practice and personal-best sessions are not public championship boards."
        : existing.length
          ? "This result was already on the board."
          : place?.inTop10
            ? `Score shared. You are #${place.rank} on this board.`
            : place?.rank
              ? `Score shared. You are #${place.rank}, outside the top 10.`
              : "Score shared. It was computed in the browser and is not a verified competition result.",
    });
  } catch {
    return disabled("The score could not be saved remotely. It remains on this device.");
  }
}
