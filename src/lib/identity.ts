import type { Landmark } from "./engine";

const visible = (p: Landmark | undefined) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= 0.5;

function centerOf(pose: Landmark[]) {
  const points = [11, 12, 23, 24].map((index) => pose[index]).filter(visible);
  if (points.length < 2) return null;
  return points.reduce((sum, point) => sum + point.x, 0) / points.length;
}

/**
 * Sequential registration and spatial continuity.
 * This is not face recognition or biometric identity.
 * Crossing or long overlap stays ambiguous instead of swapping names.
 */
export class IdentityRegistrar {
  stage: "await-1" | "await-2" | "tracking" = "await-1";
  ambiguous = false;
  private anchors: (number | null)[] = [null, null];
  private seen = [-Infinity, -Infinity];
  private lastReady = false;
  private lastCenters: number[] = [];
  private heldUntil = -Infinity;
  private heldCenters: number[] = [];
  constructor(public count: 1 | 2) {}
  reset() {
    this.stage = "await-1";
    this.ambiguous = false;
    this.anchors = [null, null];
    this.seen = [-Infinity, -Infinity];
    this.lastReady = false;
    this.lastCenters = [];
    this.heldUntil = -Infinity;
    this.heldCenters = [];
  }
  private lockReady(timestamp: number) {
    this.lastReady = true;
    this.heldCenters = this.lastCenters.slice();
    this.heldUntil = timestamp + 8000;
  }
  /** Keep the last good enrollment pose so a lean toward the button still confirms. */
  private recallReady(timestamp: number) {
    if (timestamp >= this.heldUntil || !this.heldCenters.length) return false;
    this.lastReady = true;
    this.lastCenters = this.heldCenters.slice();
    return true;
  }
  /** Drop registration and ask both people to enroll again. */
  reregister() {
    this.reset();
  }
  confirm(timestamp = 0) {
    if (!this.lastReady || !this.lastCenters.length) return false;
    if (this.stage === "await-1") {
      this.anchors[0] = this.lastCenters[0];
      this.seen[0] = timestamp;
      this.stage = this.count === 1 ? "tracking" : "await-2";
      this.lastReady = false;
      this.heldUntil = -Infinity;
      this.heldCenters = [];
      return true;
    }
    if (this.stage === "await-2") {
      const far = this.lastCenters.find(
        (x) => Math.abs(x - (this.anchors[0] ?? 0.5)) >= 0.18,
      );
      if (far == null) return false;
      this.anchors[1] = far;
      this.seen[1] = timestamp;
      this.stage = "tracking";
      this.lastReady = false;
      this.heldUntil = -Infinity;
      this.heldCenters = [];
      return true;
    }
    return false;
  }
  update(poses: Landmark[][], timestamp: number) {
    const candidates = poses
      .map((pose) => ({ pose, x: centerOf(pose) }))
      .filter((item): item is { pose: Landmark[]; x: number } => item.x != null)
      .sort((a, b) => a.x - b.x)
      .slice(0, 2);
    this.lastCenters = candidates.map((item) => item.x);
    const assigned: (Landmark[] | null)[] = [null, null];
    this.ambiguous = false;
    this.lastReady = false;
    if (this.stage === "await-1") {
      if (candidates.length === 1) this.lockReady(timestamp);
      else if (candidates.length === 0) this.recallReady(timestamp);
      if (candidates[0]) assigned[0] = candidates[0].pose;
      return {
        assigned,
        ambiguous: candidates.length > 1,
        readyToConfirm: this.lastReady,
        confirmed: 0,
        message:
          candidates.length > 1
            ? "One person at a time. Player 2, step out for a moment."
            : this.lastReady
              ? "Player 1 detected. Confirm the blue registration."
              : "Player 1, step into the frame alone.",
      };
    }
    if (this.stage === "await-2") {
      const anchor = this.anchors[0] ?? 0.3;
      const near = candidates.find((item) => Math.abs(item.x - anchor) < 0.18);
      const far = candidates.filter((item) => Math.abs(item.x - anchor) >= 0.18);
      if (far.length === 1) this.lockReady(timestamp);
      else if (far.length === 0) this.recallReady(timestamp);
      assigned[0] = (near ?? candidates[0])?.pose ?? null;
      assigned[1] = far[0]?.pose ?? null;
      return {
        assigned,
        ambiguous: far.length > 1,
        readyToConfirm: this.lastReady,
        confirmed: 1,
        message: this.lastReady
          ? "Player 2 detected as a separate person. Confirm the red registration."
          : "Player 2, step into the open side of the frame. Player 1 can stay put.",
      };
    }
    if (candidates.length === 2 && this.anchors[0] != null && this.anchors[1] != null) {
      const [a, b] = candidates;
      const direct =
        Math.abs(a.x - this.anchors[0]) + Math.abs(b.x - this.anchors[1]);
      const crossed =
        Math.abs(a.x - this.anchors[1]) + Math.abs(b.x - this.anchors[0]);
      const close = Math.abs(a.x - b.x) < 0.14;
      const unclear = Math.abs(direct - crossed) < 0.05;
      if (close || unclear) {
        this.ambiguous = true;
        return {
          assigned,
          ambiguous: true,
          readyToConfirm: false,
          confirmed: this.count,
          message:
            "Tracking is ambiguous. Scoring is paused. Separate, or re-register.",
        };
      }
      const order = direct <= crossed ? [0, 1] : [1, 0];
      candidates.forEach((candidate, index) => {
        const slot = order[index];
        if (Math.abs(candidate.x - (this.anchors[slot] ?? candidate.x)) > 0.42)
          return;
        assigned[slot] = candidate.pose;
        this.anchors[slot] = candidate.x;
        this.seen[slot] = timestamp;
      });
    } else {
      candidates.forEach((candidate) => {
        let slot = 0;
        if (this.count === 2 && this.anchors[0] != null && this.anchors[1] != null)
          slot =
            Math.abs(candidate.x - this.anchors[0]) <=
            Math.abs(candidate.x - this.anchors[1])
              ? 0
              : 1;
        if (Math.abs(candidate.x - (this.anchors[slot] ?? candidate.x)) > 0.42)
          return;
        assigned[slot] = candidate.pose;
        this.anchors[slot] = candidate.x;
        this.seen[slot] = timestamp;
      });
    }
    const missing =
      this.count === 2 &&
      assigned.some((pose, index) => !pose && timestamp - this.seen[index] > 2000);
    return {
      assigned: assigned.slice(0, this.count),
      ambiguous: false,
      readyToConfirm: false,
      confirmed: this.count,
      message: missing
        ? "A player has been gone for a while. Re-register if the wrong person is highlighted."
        : "Players are registered. Stay separated so the colors stay with you.",
    };
  }
}
