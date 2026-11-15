import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import { getSql } from "../../../lib/db";

function loadLocalEnv() {
  try {
    const text = readFileSync(".env.local", "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      let value = line.slice(index + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
        value = value.slice(1, -1);
      process.env[line.slice(0, index)] = value;
    }
  } catch {
    /* Integration is skipped when the local env file is absent. */
  }
}

const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    nickname: "Ada",
    exercise: "arm-raises",
    challenge: "form",
    experience: "coach",
    average: 88,
    reps: 4,
    target: 70,
    durationSec: 40,
    goalReps: 4,
    submissionKey: "11111111-1111-4111-8111-111111111111",
    consent: true,
    demo: false,
    ...extra,
  });

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("optional leaderboard", () => {
  it("stays local when no database is configured and rejects bad submissions", async () => {
    delete process.env.DATABASE_URL;
    const listed = await GET(new Request("http://localhost:3000/api/leaderboard"));
    expect((await listed.json()).enabled).toBe(false);
    const denied = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: body({ exercise: "nope" }),
      }),
    );
    expect(denied.status).toBe(200);
    expect((await denied.json()).enabled).toBe(false);
    process.env.DATABASE_URL = "postgres://not-used";
    const invalid = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: body({ exercise: "nope" }),
      }),
    );
    expect(invalid.status).toBe(400);
    const foreign = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "localhost:3000" },
        body: body(),
      }),
    );
    expect(foreign.status).toBe(403);
    const local = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
        body: body({ exercise: "nope" }),
      }),
    );
    expect(local.status).toBe(400);
  });

  it("rejects demo results and missing consent before touching the database", async () => {
    process.env.DATABASE_URL = "postgres://not-used";
    const demo = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: body({ demo: true }),
      }),
    );
    expect(demo.status).toBe(403);
    expect((await demo.json()).message).toMatch(/Demo Mode/);
    const consent = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: body({ consent: false }),
      }),
    );
    expect(consent.status).toBe(400);
  });
});

describe("neon leaderboard round trip", () => {
  it("writes a score and reads it back on the matching board", async () => {
    loadLocalEnv();
    if (!process.env.DATABASE_URL) return;
    const submissionKey = crypto.randomUUID();
    const shortKey = crypto.randomUUID();
    const longKey = crypto.randomUUID();
    try {
    const nickname = `el-${submissionKey.slice(0, 8)}`;
    const payload = body({
      nickname,
      submissionKey,
      average: 91,
      reps: 4,
      target: 64,
    });
    const saved = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: payload,
      }),
    );
    const savedBody = await saved.json();
    expect(saved.status).toBe(200);
    expect(savedBody.submitted).toBe(true);
    expect(savedBody.entries.some((entry: { nickname: string }) => entry.nickname === nickname)).toBe(
      true,
    );
    const again = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: payload,
      }),
    );
    const againBody = await again.json();
    expect(againBody.duplicate).toBe(true);
    expect(
      againBody.entries.filter((entry: { nickname: string }) => entry.nickname === nickname),
    ).toHaveLength(1);
    const listed = await GET(
      new Request(
        "http://localhost:3000/api/leaderboard?exercise=arm-raises&challenge=form&experience=coach&goal=4&target=64",
      ),
    );
    const listedBody = await listed.json();
    expect(listedBody.kind).toBe("quality");
    expect(listedBody.entries.length).toBeLessThanOrEqual(10);
    expect(listedBody.entries.some((entry: { nickname: string }) => entry.nickname === nickname)).toBe(
      true,
    );
    const short = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: body({
          nickname: `s-${shortKey.slice(0, 6)}`,
          submissionKey: shortKey,
          exercise: "jumping-jacks",
          challenge: "timed",
          experience: "arcade",
          average: null,
          reps: 7,
          target: null,
          durationSec: 15,
          goalReps: null,
        }),
      }),
    );
    const long = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: body({
          nickname: `l-${longKey.slice(0, 6)}`,
          submissionKey: longKey,
          exercise: "jumping-jacks",
          challenge: "timed",
          experience: "arcade",
          average: null,
          reps: 40,
          target: null,
          durationSec: 30,
          goalReps: null,
        }),
      }),
    );
    expect((await short.json()).submitted).toBe(true);
    expect((await long.json()).submitted).toBe(true);
    const fifteen = await GET(
      new Request(
        "http://localhost:3000/api/leaderboard?exercise=jumping-jacks&challenge=timed&experience=arcade&duration=15",
      ),
    );
    const fifteenBody = await fifteen.json();
    expect(fifteenBody.entries.length).toBeLessThanOrEqual(10);
    expect(fifteenBody.entries.some((entry: { nickname: string }) => entry.nickname.startsWith("l-"))).toBe(
      false,
    );
    } finally {
      const sql = getSql();
      await sql`delete from leaderboard where submission_key = ${submissionKey}`;
      await sql`delete from leaderboard where submission_key = ${shortKey}`;
      await sql`delete from leaderboard where submission_key = ${longKey}`;
    }
  });
});

describe("leaderboard filters", () => {
  it("rejects an incomplete board and reports a read failure", async () => {
    process.env.DATABASE_URL = "postgres://not-used";
    const missing = await GET(
      new Request("http://localhost:3000/api/leaderboard?exercise=jumping-jacks"),
    );
    expect(missing.status).toBe(400);
    process.env.DATABASE_URL = "postgres://invalid:invalid@127.0.0.1:1/none";
    const failed = await GET(
      new Request(
        "http://localhost:3000/api/leaderboard?exercise=jumping-jacks&challenge=timed&experience=arcade&duration=15",
      ),
    );
    const failedBody = await failed.json();
    expect(failedBody.enabled).toBe(false);
    expect(failedBody.entries).toEqual([]);
  });
});
