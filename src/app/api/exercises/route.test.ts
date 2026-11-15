import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("exercise list", () => {
  it("returns the built-in list when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await GET(new Request("http://localhost/api/exercises"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source).toBe("local");
    expect(body.exercises.length).toBeGreaterThan(1);
  });

  it("uses a Gemini list and ignores a clinical reply", async () => {
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
                    text: JSON.stringify([
                      {
                        title: "Injury rehab plan",
                        summary: "Therapy for pain.",
                        ageMin: 18,
                        ageMax: 40,
                        movement: "arm-raises",
                      },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    const response = await GET(new Request("http://localhost/api/exercises"));
    const body = await response.json();
    expect(body.source).toBe("local");
    expect(body.exercises.some((item: { title: string }) => /injury/i.test(item.title))).toBe(
      false,
    );
  });
});
