import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const payload = {
  exercise: "arm-raises",
  age: 34,
  sections: { control: 90, range: 50, alignment: 80, consistency: 75 },
};

describe("workout recommendation", () => {
  it("uses a local recommendation when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await POST(
      new Request("http://localhost/api/recommend", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source).toBe("local");
    expect(body.workouts).toHaveLength(3);
    expect(body.workouts[0].focus).toBe("weakness");
    expect(body.workouts[0].movement).toBe("arm-raises");
    expect(body.workouts[2].reason).toContain("34");
  });

  it("rejects pose data and a clinical Gemini reply", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    workouts: [
                      {
                        title: "Rehab plan",
                        movement: "squats",
                        focus: "weakness",
                        reason: "Treat the injury.",
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const leaked = await POST(
      new Request("http://localhost/api/recommend", {
        method: "POST",
        body: JSON.stringify({ ...payload, landmarks: [1, 2, 3] }),
      }),
    );
    expect(leaked.status).toBe(400);
    const response = await POST(
      new Request("http://localhost/api/recommend", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    const body = await response.json();
    expect(body.source).toBe("local");
    expect(JSON.stringify(body.workouts)).not.toMatch(/rehab/i);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("drops a Gemini title that was already shown", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      workouts: [
                        {
                          title: "Quiet shoulder lifts",
                          movement: "arm-raises",
                          focus: "weakness",
                          reason: "Already shown. Stop at the target you choose.",
                        },
                        {
                          title: "New shoulder pause",
                          movement: "arm-raises",
                          focus: "weakness",
                          reason: "Control was the lower score. Stop at the target you choose.",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    const response = await POST(
      new Request("http://localhost/api/recommend", {
        method: "POST",
        body: JSON.stringify({ ...payload, avoid: ["Quiet shoulder lifts"] }),
      }),
    );
    const body = await response.json();
    expect(body.workouts.map((workout: { title: string }) => workout.title)).not.toContain(
      "Quiet shoulder lifts",
    );
    expect(body.workouts.map((workout: { title: string }) => workout.title)).toContain(
      "New shoulder pause",
    );
  });
});
