import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z
  .object({
    text: z.string().trim().min(1).max(400),
    personality: z
      .enum(["hype", "dry", "documentary", "supportive", "drill", "calm"])
      .default("hype"),
  })
  .strict();
// Local demo protection, not a distributed production rate limiter.
let windowStart = 0;
let requests = 0;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "Cross-origin speech requests are not allowed." },
      { status: 403 },
    );
  let data: z.infer<typeof schema>;
  try {
    if (Number(request.headers.get("content-length") || 0) > 2048)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const body = await request.text();
    if (body.length > 2048)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const result = schema.safeParse(JSON.parse(body));
    if (!result.success)
      return Response.json(
        { error: "Provide 1–400 characters and a supported personality." },
        { status: 400 },
      );
    data = result.data;
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey)
    return Response.json(
      {
        error:
          "ElevenLabs is not configured. Use demo browser speech or captions.",
        fallback: true,
      },
      { status: 503 },
    );
  if (Date.now() - windowStart >= 60000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (++requests > 30)
    return Response.json(
      { error: "Commentary rate limit reached.", fallback: true },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const voiceId =
    process.env[`ELEVENLABS_VOICE_${data.personality.toUpperCase()}`] ||
    process.env.ELEVENLABS_VOICE_ID ||
    "JBFqnCBsd6RMkjVDRZzb";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const client = new ElevenLabsClient({ apiKey });
    const audio = await client.textToSpeech.convert(
      voiceId,
      {
        text: data.text,
        modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
        outputFormat: "mp3_44100_128",
      },
      { abortSignal: controller.signal, maxRetries: 0, timeoutInSeconds: 8 },
    );
    // Buffer a short clip to avoid exposing a successful response before generation finishes.
    const buffer = await new Response(audio).arrayBuffer();
    return new Response(buffer, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error: "Speech service unavailable. Demo voice remains available.",
        fallback: true,
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
