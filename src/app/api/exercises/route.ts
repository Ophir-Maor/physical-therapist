import { allowsSameSite } from "../../../lib/same-origin";
import {
  EXERCISE_COUNT,
  FALLBACK_EXERCISES,
  catalogFromModel,
} from "../../../lib/exercise-catalog";

export const runtime = "nodejs";

let windowStart = 0;
let requests = 0;

const prompt = `Return ${EXERCISE_COUNT} general movement-practice ideas as a JSON array.
This is coaching for a webcam prototype, not physical therapy, diagnosis, or rehab.
Every idea is standing and uses no chair or equipment. It must be performable as controlled arm raises or controlled squats, because those are the only movements the camera can score.
The person stops at a comfortable target they choose. Do not say deep, maximum, or as far as possible.
Use movement "arm-raises" or "squats" only.
Vary ageMin and ageMax so ages 8–12, 13–17, 18–64, and 65–90 each match at least one idea. Ages are inclusive whole years from 8 to 90.
Each object has title, summary, ageMin, ageMax, and movement.
The summary is one short sentence about the movement. Do not mention injury, pain, therapy, rehab, medicine, or diagnosis.`;

function local(message: string) {
  return Response.json({
    source: "local",
    exercises: FALLBACK_EXERCISES,
    message,
  });
}

export async function GET(request: Request) {
  if (!allowsSameSite(request))
    return Response.json({ error: "Cross-origin exercise requests are not allowed." }, { status: 403 });
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey)
    return local("Gemini is not configured. Showing the built-in exercise list.");
  if (Date.now() - windowStart >= 60000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (++requests > 10)
    return local("Exercise list rate limit reached. Showing the built-in list.");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
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
            temperature: 0.4,
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  summary: { type: "STRING" },
                  ageMin: { type: "INTEGER" },
                  ageMax: { type: "INTEGER" },
                  movement: { type: "STRING", enum: ["arm-raises", "squats"] },
                },
                required: ["title", "summary", "ageMin", "ageMax", "movement"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) return local("Gemini did not return a list. Showing the built-in exercises.");
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const text =
      [...parts].reverse().find((part) => part.text?.trim().startsWith("["))?.text ??
      parts.find((part) => part.text)?.text;
    const exercises = catalogFromModel(text ? JSON.parse(text) : null);
    if (exercises.length === 0)
      return local("Gemini returned nothing usable. Showing the built-in exercises.");
    return Response.json({
      source: "gemini",
      exercises,
      message:
        "General practice ideas for the age you enter. Not a medical recommendation. The camera scores them as arm raises or squats.",
    });
  } catch {
    return local("Gemini could not be reached. Showing the built-in exercises.");
  }
}
