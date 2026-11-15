import { z } from "zod";
import { allowsSameSite } from "../../../lib/same-origin";

export const runtime = "nodejs";

const schema = z
  .object({
    personality: z.enum(["supportive", "drill", "hype", "calm"]),
    exercise: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(24),
    repNumber: z.number().int().min(0).max(200),
    goal: z.number().int().min(1).max(20),
    recentQualities: z.array(z.number().min(0).max(100)).max(8),
    average: z.number().min(0).max(100).nullable(),
    trend: z.enum(["up", "down", "flat", "unknown"]),
    focus: z.enum([
      "first",
      "improvement",
      "decline",
      "control",
      "range",
      "alignment",
      "streak",
      "unscored",
      "tracking",
      "recap",
    ]),
    tone: z.enum(["corrective", "encouraging", "humorous", "neutral"]),
    fact: z.string().max(240),
    recentComments: z.array(z.string().max(240)).max(4),
    completed: z.boolean(),
    suggestion: z.string().max(240).nullable(),
    strongest: z.string().max(80).nullable(),
    improvement: z.number().min(-100).max(100).nullable(),
  })
  .strict();

let windowStart = 0;
let requests = 0;

const instructions: Record<z.infer<typeof schema>["personality"], string> = {
  supportive:
    "You are a warm, patient coach. Use contractions. Mention a real improvement only when the JSON shows one. Never sound disappointed.",
  drill:
    "You are a demanding but kind coach with dry humor about the measured technique. Sound like a person, not a cartoon. No insults and no all-caps shouting.",
  hype:
    "You are an energetic commentator. Celebrate a high or improved score once, then vary the wording. Do not shout, and do not mention a living room, a crowd, or making history.",
  calm:
    "You are a calm instructor. One practical cue. No hype and no joke.",
};

function provider() {
  const gateway = process.env.NEON_AI_GATEWAY_BASE_URL?.replace(/\/$/, "");
  const gatewayToken = process.env.NEON_AI_GATEWAY_TOKEN;
  if (gateway && gatewayToken)
    return { url: `${gateway}/v1/chat/completions`, key: gatewayToken };
  const openai = process.env.OPENAI_API_KEY;
  if (openai) return { url: "https://api.openai.com/v1/chat/completions", key: openai };
  return null;
}

function acceptable(line: string, fact: string) {
  if (line.length < 2 || line.length > 220) return false;
  if (/push through|ignore pain|no pain no gain|diagnos|injur|torn|fracture/i.test(line))
    return false;
  if (/living room|crowd goes wild|making history|championship nobody/i.test(line)) return false;
  const tokens = fact
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4);
  if (!tokens.length) return true;
  const spoken = line.toLowerCase();
  return tokens.some((word) => spoken.includes(word));
}

export async function POST(request: Request) {
  if (!allowsSameSite(request))
    return Response.json({ error: "Cross-origin coaching requests are not allowed." }, { status: 403 });
  let data: z.infer<typeof schema>;
  try {
    const body = await request.text();
    if (body.length > 4096)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json(
        { enabled: false, fallback: true, error: "Coaching context was not usable." },
        { status: 400 },
      );
    data = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  const upstream = provider();
  if (!upstream)
    return Response.json({
      enabled: false,
      fallback: true,
      message: "No coaching model is configured. Deterministic feedback is used.",
    });
  if (Date.now() - windowStart >= 60000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (++requests > 20)
    return Response.json(
      { enabled: false, fallback: true, error: "Coaching rate limit reached." },
      { status: 429 },
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(upstream.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstream.key}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.COACH_LLM_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 80,
        messages: [
          {
            role: "system",
            content: `${instructions[data.personality]} Use only the JSON measurements. One or two short sentences. Do not say the person's name. Never invent a form fault, injury, or diagnosis. Never tell the person to push through pain. If the fact is empty, stay quiet.`,
          },
          { role: "user", content: JSON.stringify(data) },
        ],
      }),
    });
    if (!response.ok) return Response.json({ enabled: true, fallback: true });
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const line = body.choices?.[0]?.message?.content?.replace(/\s+/g, " ").trim() ?? "";
    if (!acceptable(line, data.fact)) return Response.json({ enabled: true, fallback: true });
    return Response.json({ enabled: true, fallback: false, line, repNumber: data.repNumber });
  } catch {
    return Response.json({ enabled: true, fallback: true });
  } finally {
    clearTimeout(timeout);
  }
}
