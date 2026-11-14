"use client";

import { useEffect, useRef } from "react";
import { demoOpenAmount } from "@/lib/demo-motion";
import type { ExerciseId } from "@/lib/form";

type Point = { x: number; y: number };

/** Front-view demonstration figure. This is not the scoring landmark model. */
function figure(exercise: ExerciseId, open: number) {
  const cx = 210;
  const footY = 468;
  const squat = exercise === "squats" ? open : 0;
  const lift = exercise === "arm-raises" ? open : 0.12;
  const hipY = 292 + squat * 78;
  const shoulderY = hipY - 118 + squat * 16;
  const head = { x: cx, y: shoulderY - 58 };
  const shoulders = [
    { x: cx - 46, y: shoulderY },
    { x: cx + 46, y: shoulderY },
  ];
  const hips = [
    { x: cx - 24, y: hipY },
    { x: cx + 24, y: hipY },
  ];
  const feet = [
    { x: cx - 58, y: footY },
    { x: cx + 58, y: footY },
  ];
  const knees = hips.map((hip, index) => {
    const side = index === 0 ? -1 : 1;
    const foot = feet[index];
    return {
      x: foot.x + side * (4 + squat * 6),
      y: hip.y + (foot.y - hip.y) * (0.5 - squat * 0.06),
    };
  });
  const arms = shoulders.map((shoulder, index) =>
    raiseArm(shoulder, index === 0 ? -1 : 1, lift),
  );
  return { head, shoulders, hips, knees, feet, arms };
}

function raiseArm(shoulder: Point, side: number, lift: number) {
  const upper = 2.45 * lift;
  const elbow = {
    x: shoulder.x + side * (Math.sin(upper) * 76 + 10 * (1 - lift)),
    y: shoulder.y + Math.cos(upper) * 76,
  };
  const forearm = upper + 0.38 * (1 - lift * 0.65);
  const wrist = {
    x: elbow.x + side * Math.sin(forearm) * 68,
    y: elbow.y + Math.cos(forearm) * 68,
  };
  return { elbow, wrist };
}

function stroke(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  width: number,
) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function joint(ctx: CanvasRenderingContext2D, point: Point, radius: number) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export default function ExerciseDemo({ exercise }: { exercise: ExerciseId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = 420;
    canvas.height = 520;
    let frame = 0;
    const started = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const backdrop = ctx.createLinearGradient(0, 0, 0, canvas.height);
    backdrop.addColorStop(0, "#121816");
    backdrop.addColorStop(1, "#0c1211");
    let last = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!reduced && now - last < 33) return;
      last = now;
      const open = reduced
        ? 0.45
        : demoOpenAmount(now - started, "controlled", 3200);
      const body = figure(exercise, open);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(221,250,81,.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(70, 470);
      ctx.lineTo(350, 470);
      ctx.stroke();
      ctx.strokeStyle = "#ddfa51";
      ctx.fillStyle = "#ddfa51";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const neck = { x: 210, y: body.shoulders[0].y - 16 };
      const midShoulder = { x: 210, y: body.shoulders[0].y };
      const midHip = { x: 210, y: body.hips[0].y };
      stroke(ctx, body.head, neck, 5);
      stroke(ctx, neck, midShoulder, 6);
      stroke(ctx, midShoulder, midHip, 7);
      stroke(ctx, body.shoulders[0], body.shoulders[1], 7);
      stroke(ctx, body.hips[0], body.hips[1], 6);
      body.arms.forEach((arm, index) => {
        stroke(ctx, body.shoulders[index], arm.elbow, 6);
        stroke(ctx, arm.elbow, arm.wrist, 5);
        stroke(
          ctx,
          arm.wrist,
          {
            x: arm.wrist.x + (index === 0 ? -12 : 12),
            y: arm.wrist.y + 8,
          },
          3,
        );
      });
      body.knees.forEach((knee, index) => {
        stroke(ctx, body.hips[index], knee, 7);
        stroke(ctx, knee, body.feet[index], 6);
        stroke(
          ctx,
          { x: body.feet[index].x - 16, y: body.feet[index].y },
          { x: body.feet[index].x + 14, y: body.feet[index].y },
          4,
        );
      });
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(body.head.x, body.head.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      [
        body.shoulders,
        body.hips,
        body.knees,
        body.arms.flatMap((arm) => [arm.elbow, arm.wrist]),
      ]
        .flat()
        .forEach((point) => joint(ctx, point, 4.5));
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [exercise]);
  return (
    <canvas
      ref={canvasRef}
      className="exercise-demo"
      width={420}
      height={520}
      aria-label="Animated skeleton demonstrating the exercise"
    />
  );
}
