import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("optional leaderboard", () => {
  it("stays local when no database is configured and rejects bad submissions", async () => {
    delete process.env.DATABASE_URL;
    const listed = await GET(new Request("http://localhost:3000/api/leaderboard"));
    expect((await listed.json()).enabled).toBe(false);
    const denied = await POST(
      new Request("http://localhost:3000/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ nickname: "A", exercise: "nope" }),
      }),
    );
    expect(denied.status).toBe(200);
    expect((await denied.json()).enabled).toBe(false);
  });
});
