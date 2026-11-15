import { z } from "zod";
import { allowsSameSite } from "../../../lib/same-origin";
import {
  localNextWorkouts,
  workoutsFromModel,
  type NextWorkout,
  type SectionScores,
} from "../../../lib/next-workout";

export const runtime = "nodejs";

const score = z.number().min(0).max(100).nullable();
const schema = z
  .object({
    exercise: z.enum(["arm-raises", "squats"]),
    age: z.number().int().min(10).max(99),
    sections: z
      .object({
        control: score,
        range: score,
        alignment: score,
        consistency: score,
      })
      .strict(),
    avoid: z.array(z.string().trim().min(1).max(60)).max(9).optional(),
  })
  .strict();

let windowStart = 0;
let requests = 0;

function reply(workouts: NextWorkout[], source: "gemini" | "local") {
  return Response.json({
    source,
    workouts,
    notice:
      "Practice ideas from this session's scores and age. Not a medical recommendation.",
  });
}

export async function POST(request: Request) {
  if (!allowsSameSite(request))
    return Response.json({ error: "Cross-origin workout requests are not allowed." }, { status: 403 });
  let data: z.infer<typeof schema>;
  try {
    const body = await request.text();
    if (body.length > 2048)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json({ error: "Exercise and section scores are required." }, { status: 400 });
    data = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  const avoid = data.avoid ?? [];
  const fallback = localNextWorkouts(
    data.exercise,
    data.sections as SectionScores,
    data.age,
    avoid,
  );
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return reply(fallback, "local");
  if (Date.now() - windowStart >= 60000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (++requests > 10) return reply(fallback, "local");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const prompt = `Using only this JSON, suggest three different next practices for a ${data.age}-year-old. ${JSON.stringify({
    exercise: data.exercise,
    age: data.age,
    sections: data.sections,
    avoid,
  })}
Return JSON {"workouts":[...]} with exactly three objects. Each object has title, movement, focus, and reason.
The title is a new practice name, not a diagnosis. movement is only "arm-raises" or "squats", because those are the only camera-scored movements.
Do not reuse a title from avoid. Every title must be different from that list and from the other titles you return.
Make one workout for a clearly lower section with focus "weakness". Make one that builds on a stronger section with focus "strength", using the other movement when that fits. Make one paced for this age: slower and smaller for an older age, steady for a younger age.
Use age only to choose a comfortable pace. The person must stop at a target they choose. Do not tell them to go farther than a selected target.
The reason is one or two short sentences and mentions the score or the age. Do not diagnose, name an injury, mention pain, or prescribe rehab.`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: avoid.length ? 0.8 : 0.3,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                workouts: {
                  type: "ARRAY",
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: "OBJECT",
                    properties: {
                      title: { type: "STRING" },
                      movement: { type: "STRING", enum: ["arm-raises", "squats"] },
                      focus: { type: "STRING", enum: ["weakness", "strength"] },
                      reason: { type: "STRING" },
                    },
                    required: ["title", "movement", "focus", "reason"],
                  },
                },
              },
              required: ["workouts"],
            },
          },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) return reply(fallback, "local");
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.find((part) => part.text?.includes("{"))?.text;
    const parsed = workoutsFromModel(text ? JSON.parse(text) : null, fallback, avoid);
    const chosen = [...(parsed ?? [])];
    for (const item of fallback) {
      if (chosen.length >= 3) break;
      if (chosen.some((existing) => existing.title.toLowerCase() === item.title.toLowerCase())) continue;
      chosen.push(item);
    }
    return reply(chosen.slice(0, 3), parsed ? "gemini" : "local");
  } catch {
    return reply(fallback, "local");
  }
}
