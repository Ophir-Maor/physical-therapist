"use client";

import { memo, useEffect, useRef } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { demoFrame } from "@/lib/demo-motion";
import {
  PlayerTracker,
  syntheticPose,
  type Landmark,
  type Mode,
} from "@/lib/engine";
import type { ExerciseId } from "@/lib/form";

type Props = {
  demo: boolean;
  players: number;
  mode: Mode;
  running: boolean;
  onPoses: (poses: Landmark[][], timestamp: number) => void;
  onStatus: (message: string, ready: boolean) => void;
  exercise?: ExerciseId | "jumping-jacks";
  demoMotion?: "arcade" | "coach";
  demoPlaying?: boolean;
  ghost?: Landmark[] | null;
  ghostRef?: { current: Landmark[] | null };
  overlay?: () => (Landmark[] | null)[] | null;
};

const CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [28, 30],
  [30, 32],
];
const COLORS = ["#59baff", "#ff655f"];

function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: Landmark[],
  color: string,
  demo: boolean,
  mirror = false,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const visible = (i: number) => pose[i] && (pose[i].visibility ?? 1) >= 0.5;
  const xAt = (point: Landmark) => (mirror ? 1 - point.x : point.x) * width;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = demo ? 6 : 3;
  ctx.lineCap = "round";
  for (const [a, b] of CONNECTIONS) {
    if (!visible(a) || !visible(b)) continue;
    ctx.beginPath();
    ctx.moveTo(xAt(pose[a]), pose[a].y * height);
    ctx.lineTo(xAt(pose[b]), pose[b].y * height);
    ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (!visible(i)) continue;
    ctx.beginPath();
    ctx.arc(xAt(pose[i]), pose[i].y * height, demo ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (demo && visible(0)) {
    if (visible(11) && visible(12)) {
      ctx.beginPath();
      ctx.moveTo(xAt(pose[0]), pose[0].y * height + 24);
      ctx.lineTo(
        (xAt(pose[11]) + xAt(pose[12])) / 2,
        ((pose[11].y + pose[12].y) * height) / 2,
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(xAt(pose[0]), pose[0].y * height, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCourt(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const background = ctx.createLinearGradient(0, 0, 0, h);
  background.addColorStop(0, "#07121b");
  background.addColorStop(1, "#14232a");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(140,190,210,.12)";
  ctx.lineWidth = 1;
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * 45, h * 0.5);
    ctx.lineTo(w / 2 + i * 220, h);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const y = h * 0.5 + Math.pow(i / 7, 1.7) * h * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.18);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Camera frames stay in this component and never leave the browser. */
function VisionStage({
  demo,
  players,
  mode,
  running,
  onPoses,
  onStatus,
  exercise,
  demoMotion = "arcade",
  demoPlaying = false,
  ghost = null,
  ghostRef,
  overlay,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({
    onPoses,
    onStatus,
    running,
    mode,
    exercise,
    demoMotion,
    demoPlaying,
    ghost,
    ghostRef,
    overlay,
  });
  useEffect(() => {
    live.current = {
      onPoses,
      onStatus,
      running,
      mode,
      exercise,
      demoMotion,
      demoPlaying,
      ghost,
      ghostRef,
      overlay,
    };
  }, [
    onPoses,
    onStatus,
    running,
    mode,
    exercise,
    demoMotion,
    demoPlaying,
    ghost,
    ghostRef,
    overlay,
  ]);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let stream: MediaStream | undefined;
    let model: PoseLandmarker | undefined;
    let lastFrame = -Infinity;
    let lastVideoTime = -1;
    let lastStatus = "";
    let demoStart = performance.now();
    let wasRunning = false;
    let coachElapsed = 0;
    let coachStamp = performance.now();
    const overlayTracker = new PlayerTracker(players);
    const report = (message: string, ready: boolean) => {
      if (!disposed && message !== lastStatus) {
        lastStatus = message;
        live.current.onStatus(message, ready);
      }
    };
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      report("Canvas unavailable. Try a modern desktop browser.", false);
      return;
    }

    const court = document.createElement("canvas");
    const openPoses = [0.5, 0.29, 0.71].map((center) => syntheticPose(true, center));
    const closedPoses = [0.5, 0.29, 0.71].map((center) => syntheticPose(false, center));
    const loop = (time: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const budget = demo ? 33 : 80;
      if (time - lastFrame < budget) return;
      lastFrame = time;
      if (demo) {
        if (canvas.width !== 960) {
          canvas.width = 960;
          canvas.height = 540;
          court.width = 960;
          court.height = 540;
          const courtCtx = court.getContext("2d");
          if (courtCtx) drawCourt(courtCtx);
        }
        if (live.current.running && !wasRunning) demoStart = time;
        wasRunning = live.current.running;
        const coach = live.current.demoMotion === "coach";
        if (coach && live.current.demoPlaying) coachElapsed += time - coachStamp;
        coachStamp = time;
        const exerciseId =
          live.current.exercise === "squats" ? "squats" : "arm-raises";
        const poses = coach
          ? Array.from(
              { length: players },
              (_, i) => demoFrame(exerciseId, coachElapsed, i).pose,
            )
          : Array.from({ length: players }, (_, i) => {
              const period = i === 0 ? 2000 : 2700;
              const phase = ((time - demoStart) % period) / period;
              const slot = players === 1 ? 0 : i + 1;
              const moving =
                live.current.running && phase > 0.28 && phase < 0.68;
              const pose = (moving ? openPoses : closedPoses)[slot];
              if (live.current.mode !== "arm-raises") return pose;
              const closed = closedPoses[slot];
              const mixed = pose.slice();
              for (let joint = 23; joint < mixed.length; joint++)
                mixed[joint] = closed[joint];
              return mixed;
            });
        ctx.drawImage(court, 0, 0);
        live.current.onPoses(poses, time);
        const painted = live.current.overlay?.() ?? poses;
        painted.forEach((pose, i) => {
          if (pose) drawPose(ctx, pose, COLORS[i] || COLORS[0], true);
        });
        const ghostPose = live.current.ghostRef?.current ?? live.current.ghost;
        if (ghostPose) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          drawPose(ctx, ghostPose, "#ddfa51", false);
          ctx.restore();
        }
        report(
          coach
            ? "Synthetic coaching athletes · controlled and rushed examples"
            : "Synthetic poses ready · no webcam in use",
          true,
        );
        return;
      }
      if (!model || video.readyState < 2 || video.currentTime === lastVideoTime)
        return;
      lastVideoTime = video.currentTime;
      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      try {
        const result = model.detectForVideo(video, time);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sorted = [...result.landmarks].sort((a, b) => b[23].x - a[23].x);
        // Screen coordinates make player one the person on the left of the mirrored preview.
        const poses = sorted.map((pose) =>
          pose.map((point) => ({ ...point, x: 1 - point.x })),
        );
        live.current.onPoses(poses, time);
        const painted =
          live.current.overlay?.() ?? overlayTracker.update(poses, time);
        painted.forEach((pose, i) => {
          if (pose) drawPose(ctx, pose, COLORS[i] || COLORS[0], false, true);
        });
        const ghostPose = live.current.ghostRef?.current ?? live.current.ghost;
        if (ghostPose) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          drawPose(ctx, ghostPose, "#ddfa51", false, true);
          ctx.restore();
        }
        const required =
          live.current.exercise === "squats"
            ? [23, 24, 25, 26, 27, 28]
            : live.current.exercise === "arm-raises"
              ? [11, 12, 15, 16]
              : live.current.mode === "arm-raises"
                ? [11, 12, 15, 16, 23, 24]
                : [11, 12, 15, 16, 23, 24, 27, 28];
        const valid = poses.filter((pose) =>
          required.every((i) => (pose[i]?.visibility ?? 0) >= 0.55),
        ).length;
        report(
          valid >= players
            ? `${valid} player${valid === 1 ? "" : "s"} tracked · ready`
            : valid > 0
              ? `${valid}/${players} players ready. Separate into left and right lanes, or switch to practice.`
              : live.current.exercise === "squats"
                ? "Step back until hips, knees, and feet are visible."
                : live.current.exercise === "arm-raises"
                ? "Show both shoulders and hands to the camera."
                : live.current.mode === "arm-raises"
                  ? "Step back until shoulders, hands, and hips are visible."
                  : "Step back until shoulders, hands, hips and feet are visible.",
          valid >= players,
        );
      } catch {
        cancelAnimationFrame(raf);
        stream?.getTracks().forEach((track) => track.stop());
        model?.close();
        model = undefined;
        live.current.onPoses([], time);
        report(
          "Tracking stopped. Return to setup and retry, or choose Demo Mode.",
          false,
        );
      }
    };

    const start = async () => {
      if (demo) {
        raf = requestAnimationFrame(loop);
        return;
      }
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("UNSUPPORTED");
        report("Waiting for camera permission…", false);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
            frameRate: { ideal: 24, max: 30 },
          },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (disposed) return;
        report("Loading local pose model…", false);
        const { FilesetResolver, PoseLandmarker } =
          await import("@mediapipe/tasks-vision");
        const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        if (disposed) return;
        const options = {
          baseOptions: {
            modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
            delegate: "GPU" as const,
          },
          runningMode: "VIDEO" as const,
          numPoses: players,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        };
        try {
          model = await PoseLandmarker.createFromOptions(files, options);
        } catch {
          if (disposed) return;
          report("GPU unavailable · loading CPU fallback…", false);
          model = await PoseLandmarker.createFromOptions(files, {
            ...options,
            baseOptions: { ...options.baseOptions, delegate: "CPU" },
          });
        }
        if (disposed) {
          model.close();
          model = undefined;
          return;
        }
        report("Camera ready. Step into the frame.", false);
        raf = requestAnimationFrame(loop);
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        const name = error instanceof Error ? error.name : "";
        const message =
          name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access in your browser, then retry."
            : name === "NotFoundError"
              ? "No camera found. Connect a webcam or choose Demo Mode."
              : name === "NotReadableError"
                ? "Camera is busy. Close other camera apps and retry."
                : "Camera or pose model could not start. Check local model assets, retry, or choose Demo Mode.";
        report(message, false);
      }
    };
    void start();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      model?.close();
      video.srcObject = null;
    };
  }, [demo, players]);

  return (
    <div
      className="vision-stage"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 300,
        overflow: "hidden",
        background: "#07121b",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Local mirrored camera preview"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: "scaleX(-1)",
          visibility: demo ? "hidden" : "visible",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-label={
          demo ? "Synthetic demonstration athletes" : "Body landmark overlay"
        }
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: demo ? undefined : "scaleX(-1)",
        }}
      />
    </div>
  );
}

export default memo(VisionStage);
