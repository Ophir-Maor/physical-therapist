import { neon } from "@neondatabase/serverless";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z
  .object({
    nickname: z.string().trim().min(1).max(24),
    exercise: z.enum(["arm-raises", "squats"]),
    challenge: z.enum(["practice", "form", "consistency", "personal-best"]),
    average: z.number().min(0).max(100),
    reps: z.number().int().min(1).max(50),
    consent: z.literal(true),
    demo: z.boolean(),
  })
  .strict();
let windowStart = 0;
let requests = 0;

function disabled(message: string, status = 200) {
  return Response.json({ enabled: false, entries: [], message }, { status });
}

async function board(exercise?: string | null) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    create table if not exists leaderboard (
      id bigserial primary key,
      nickname text not null,
      exercise text not null,
      challenge text not null,
      average numeric not null,
      reps integer not null,
      created_at timestamptz default now()
    )`;
  const entries = exercise
    ? await sql`
        select nickname, exercise, challenge, average, reps
        from leaderboard
        where exercise = ${exercise}
        order by average desc, created_at desc
        limit 10`
    : await sql`
        select nickname, exercise, challenge, average, reps
        from leaderboard
        order by created_at desc
        limit 10`;
  return entries.map((entry) => ({
    nickname: String(entry.nickname),
    exercise: String(entry.exercise),
    challenge: String(entry.challenge),
    average: Number(entry.average),
    reps: Number(entry.reps),
  }));
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL)
    return disabled("Leaderboard is local-only until DATABASE_URL is configured.");
  try {
    const exercise = new URL(request.url).searchParams.get("exercise");
    return Response.json({ enabled: true, entries: await board(exercise) });
  } catch {
    return disabled("Leaderboard could not be read. Local progress still works.", 200);
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL)
    return disabled("No database is configured. The score remains on this device.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Cross-origin submissions are not allowed." }, { status: 403 });
  let data: z.infer<typeof schema>;
  try {
    const body = await request.text();
    if (body.length > 2048)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json({ error: "Nickname, exercise, and score are required." }, { status: 400 });
    data = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  if (data.demo)
    return Response.json(
      { enabled: true, entries: [], message: "Synthetic scores are not added to the shared board." },
      { status: 200 },
    );
  if (!/^[\p{L}\p{N} .'_-]+$/u.test(data.nickname))
    return Response.json({ error: "Use a short display name." }, { status: 400 });
  if (Date.now() - windowStart >= 60000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (++requests > 10)
    return Response.json({ error: "Leaderboard rate limit reached." }, { status: 429 });
  try {
    const sql = neon(process.env.DATABASE_URL);
    await board(data.exercise);
    await sql`
      insert into leaderboard (nickname, exercise, challenge, average, reps)
      values (${data.nickname}, ${data.exercise}, ${data.challenge}, ${data.average}, ${data.reps})`;
    return Response.json({
      enabled: true,
      entries: await board(data.exercise),
      message: "Score shared. It was computed in the browser and is not cheat-proof.",
    });
  } catch {
    return disabled("The score could not be saved remotely. It remains on this device.");
  }
}
