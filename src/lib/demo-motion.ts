import type { Landmark } from "./engine";
import type { ExerciseId } from "./form";
import { armPose, squatPose } from "./geometry";

export type DemoStyle = "controlled" | "rushed" | "shallow";

const ease = (t: number) => t * t * (3 - 2 * t);

/** Open amount from 0 at the start position to 1 at the scripted peak. */
export function demoOpenAmount(timeMs: number, style: DemoStyle, period: number) {
  const p = ((timeMs % period) + period) % period / period;
  if (style === "rushed") {
    if (p < 0.12) return ease(p / 0.12);
    if (p < 0.2) return 1;
    if (p < 0.36) return 1 - ease((p - 0.2) / 0.16);
    return 0;
  }
  if (style === "shallow") {
    const tri = p < 0.5 ? p / 0.5 : (1 - p) / 0.5;
    return ease(tri) * 0.55;
  }
  if (p < 0.1) return 0;
  if (p < 0.46) return ease((p - 0.1) / 0.36);
  if (p < 0.58) return 1;
  if (p < 0.9) return 1 - ease((p - 0.58) / 0.32);
  return 0;
}

export function demoFrame(
  exercise: ExerciseId,
  timeMs: number,
  player = 0,
): { pose: Landmark[]; style: DemoStyle } {
  const style: DemoStyle =
    player === 0 ? "controlled" : player === 1 ? "rushed" : "shallow";
  const period = style === "controlled" ? 2800 : style === "rushed" ? 1500 : 2400;
  const open = demoOpenAmount(timeMs, style, period);
  const center = player === 0 ? 0.3 : 0.7;
  if (exercise === "squats") {
    const peak = style === "shallow" ? 28 : 58;
    return { pose: squatPose(open * peak, center), style };
  }
  const peak = style === "shallow" ? 80 : 140;
  const asymmetry = style === "rushed" ? -24 * open : 0;
  return { pose: armPose(open * peak, center, asymmetry), style };
}
