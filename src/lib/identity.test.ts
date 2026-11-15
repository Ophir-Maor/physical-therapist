import { describe, expect, it } from "vitest";
import { syntheticPose } from "./engine";
import { IdentityRegistrar } from "./identity";

describe("sequential registration", () => {
  it("enrolls player 1 alone, then player 2, and keeps them through reordering", () => {
    const registrar = new IdentityRegistrar(2);
    const left = syntheticPose(false, 0.25);
    const right = syntheticPose(false, 0.75);
    expect(registrar.update([left, right], 0).readyToConfirm).toBe(false);
    expect(registrar.update([left], 100).readyToConfirm).toBe(true);
    expect(registrar.confirm(100)).toBe(true);
    expect(registrar.stage).toBe("await-2");
    const second = registrar.update([right, left], 200);
    expect(second.readyToConfirm).toBe(true);
    expect(registrar.confirm(200)).toBe(true);
    expect(registrar.update([right, left], 300).assigned).toEqual([left, right]);
    expect(registrar.update([left, right], 360).assigned).toEqual([left, right]);
  });
  it("keeps a short disappearance from swapping identities", () => {
    const registrar = new IdentityRegistrar(2);
    const left = syntheticPose(false, 0.25);
    const right = syntheticPose(false, 0.75);
    registrar.update([left], 0);
    registrar.confirm(0);
    registrar.update([left, right], 100);
    registrar.confirm(100);
    expect(registrar.update([right], 200).assigned[1]).toBe(right);
    expect(registrar.update([], 400).assigned).toEqual([null, null]);
    expect(registrar.update([right, left], 700).assigned).toEqual([left, right]);
  });
  it("suspends scoring when the two people overlap", () => {
    const registrar = new IdentityRegistrar(2);
    const left = syntheticPose(false, 0.25);
    const right = syntheticPose(false, 0.75);
    registrar.update([left], 0);
    registrar.confirm(0);
    registrar.update([left, right], 100);
    registrar.confirm(100);
    const crowded = registrar.update(
      [syntheticPose(false, 0.5), syntheticPose(false, 0.52)],
      200,
    );
    expect(crowded.ambiguous).toBe(true);
    expect(crowded.assigned).toEqual([null, null]);
    registrar.reregister();
    expect(registrar.stage).toBe("await-1");
  });
  it("still confirms for a few seconds after the player leans out", () => {
    const registrar = new IdentityRegistrar(2);
    const left = syntheticPose(false, 0.25);
    registrar.update([left], 1000);
    expect(registrar.update([], 2000).readyToConfirm).toBe(true);
    expect(registrar.confirm(2000)).toBe(true);
    expect(registrar.stage).toBe("await-2");
    expect(registrar.update([], 12000).readyToConfirm).toBe(false);
  });
  it("supports one player", () => {
    const registrar = new IdentityRegistrar(1);
    expect(registrar.update([], 0).readyToConfirm).toBe(false);
    expect(registrar.update([syntheticPose(false, 0.5)], 50).readyToConfirm).toBe(
      true,
    );
    expect(registrar.confirm(50)).toBe(true);
    expect(registrar.stage).toBe("tracking");
  });
});
