import {
  coachPayload,
  type CoachDecision,
  type SessionContext,
} from "./session-context";

export async function requestCoachLine(
  context: SessionContext,
  decision: CoachDecision,
  signal: AbortSignal,
) {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coachPayload(context, decision)),
    signal,
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { line?: unknown };
  return typeof body.line === "string" ? body.line : null;
}
