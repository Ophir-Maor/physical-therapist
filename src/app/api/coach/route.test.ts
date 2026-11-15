import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const payload = {
  personality: "calm",
  exercise: "arm-raises",
  name: "Alex",
  repNumber: 2,
  goal: 4,
  recentQualities: [70, 82],
  average: 76,
  trend: "up",
  focus: "improvement",
  tone: "encouraging",
  fact: "Try lowering a little more slowly. Control matters more than speed.",
  recentComments: [],
  completed: false,
  suggestion: null,
  strongest: "Movement control",
  improvement: 12,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("optional coach model", () => {
  it("falls back when no model is configured and rejects private pose data", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.NEON_AI_GATEWAY_TOKEN;
    const open = await POST(
      new Request("http://localhost/api/coach", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(open.status).toBe(200);
    expect((await open.json()).fallback).toBe(true);
    const leaked = await POST(
      new Request("http://localhost/api/coach", {
        method: "POST",
        body: JSON.stringify({ ...payload, landmarks: [[1, 2, 3]] }),
      }),
    );
    expect(leaked.status).toBe(400);
  });

  it("discards a model line that invents an injury or ignores the measured fact", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: "Your shoulder is injured, push through it." } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/coach", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    const body = await response.json();
    expect(body.fallback).toBe(true);
    expect(body.line).toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });
});
