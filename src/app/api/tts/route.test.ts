import { afterEach, describe, expect, it, vi } from "vitest";
const { convert } = vi.hoisted(() => ({ convert: vi.fn() }));
vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    textToSpeech = { convert };
  },
}));
import { POST } from "./route";
const request = (body: unknown) =>
  new Request("http://localhost:3000/api/tts", {
    method: "POST",
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("speech API", () => {
  it("validates text length, unknown fields, and personalities", async () => {
    for (const body of [
      { text: "" },
      { text: "x".repeat(401) },
      { text: "Hello", personality: "bad" },
      { text: "Hello", apiKey: "no" },
    ])
      expect((await POST(request(body))).status).toBe(400);
  });
  it("rejects malformed and oversized bodies", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost/api/tts", {
            method: "POST",
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(request({ text: "x".repeat(3000) }))).status).toBe(413);
  });
  it("rejects requests from another origin", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost/api/tts", {
            method: "POST",
            headers: { origin: "https://example.com" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("explicitly identifies unavailable credentials", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const response = await POST(request({ text: "Hello" }));
    expect(response.status).toBe(503);
    expect((await response.json()).fallback).toBe(true);
  });
  it("returns an MP3 using the configured SDK", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-secret");
    convert.mockResolvedValue(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([1, 2, 3]));
          c.close();
        },
      }),
    );
    const response = await POST(
      request({ text: "Hello", personality: "hype" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(convert).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: "Hello", modelId: "eleven_flash_v2_5" }),
      expect.objectContaining({ maxRetries: 0 }),
    );
  });
  it("handles upstream failures without exposing secrets", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-secret");
    convert.mockRejectedValue(new Error("secret provider error"));
    const response = await POST(request({ text: "Hello" }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret provider error");
  });
  it("limits provider spending during request bursts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120000);
    vi.stubEnv("ELEVENLABS_API_KEY", "test-secret");
    convert.mockImplementation(
      async () =>
        new ReadableStream({
          start(c) {
            c.close();
          },
        }),
    );
    for (let i = 0; i < 30; i++)
      expect((await POST(request({ text: "Hello" }))).status).toBe(200);
    expect((await POST(request({ text: "Hello" }))).status).toBe(429);
    vi.setSystemTime(Date.now() + 60001);
    expect((await POST(request({ text: "Hello" }))).status).toBe(200);
  });
});
