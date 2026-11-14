"use client";

import { useEffect, useRef } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  PlayerTracker,
  syntheticPose,
  type Landmark,
  type Mode,
} from "@/lib/engine";

type Props = {
  demo: boolean;
  players: number;
  mode: Mode;
  running: boolean;
  onPoses: (poses: Landmark[][], timestamp: number) => void;
  onStatus: (message: string, ready: boolean) => void;
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
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const visible = (i: number) => pose[i] && (pose[i].visibility ?? 1) >= 0.5;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = demo ? 7 : 4;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = demo ? 22 : 8;
  for (const [a, b] of CONNECTIONS) {
    if (!visible(a) || !visible(b)) continue;
    ctx.beginPath();
    ctx.moveTo(pose[a].x * width, pose[a].y * height);
    ctx.lineTo(pose[b].x * width, pose[b].y * height);
    ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (!visible(i)) continue;
    ctx.beginPath();
    ctx.arc(
      pose[i].x * width,
      pose[i].y * height,
      demo ? 7 : 4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  if (demo && visible(0)) {
    if (visible(11) && visible(12)) {
      ctx.beginPath();
      ctx.moveTo(pose[0].x * width, pose[0].y * height + 24);
      ctx.lineTo(
        ((pose[11].x + pose[12].x) * width) / 2,
        ((pose[11].y + pose[12].y) * height) / 2,
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(pose[0].x * width, pose[0].y * height, 24, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
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
export default function VisionStage({
  demo,
  players,
  mode,
  running,
  onPoses,
  onStatus,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ onPoses, onStatus, running, mode });
  useEffect(() => {
    live.current = { onPoses, onStatus, running, mode };
  }, [onPoses, onStatus, running, mode]);

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

    const loop = (time: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      if (time - lastFrame < 50) return;
      lastFrame = time;
      if (demo) {
        if (live.current.running && !wasRunning) demoStart = time;
        wasRunning = live.current.running;
        const poses = Array.from({ length: players }, (_, i) => {
          const phase =
            ((time - demoStart) % (i === 0 ? 2000 : 2700)) /
            (i === 0 ? 2000 : 2700);
          const center = players === 1 ? 0.5 : 0.29 + i * 0.42;
          const pose = syntheticPose(
            live.current.running && phase > 0.28 && phase < 0.68,
            center,
          );
          if (live.current.mode === "arm-raises") {
            const closed = syntheticPose(false, center);
            for (let joint = 23; joint < pose.length; joint++)
              pose[joint] = closed[joint];
          }
          return pose;
        });
        canvas.width = 1280;
        canvas.height = 720;
        drawCourt(ctx);
        poses.forEach((pose, i) => drawPose(ctx, pose, COLORS[i], true));
        live.current.onPoses(poses, time);
        report("Synthetic poses ready · no webcam in use", true);
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
        overlayTracker.update(poses, time).forEach((pose, i) => {
          if (pose)
            drawPose(
              ctx,
              pose.map((point) => ({ ...point, x: 1 - point.x })),
              COLORS[i],
              false,
            );
        });
        live.current.onPoses(poses, time);
        const required =
          live.current.mode === "arm-raises"
            ? [11, 12, 15, 16]
            : [11, 12, 15, 16, 23, 24, 27, 28];
        const valid = poses.filter((pose) =>
          required.every((i) => (pose[i]?.visibility ?? 0) >= 0.55),
        ).length;
        report(
          valid >= players
            ? `${valid} player${valid === 1 ? "" : "s"} tracked · ready`
            : valid > 0
              ? `${valid}/${players} players ready. Separate into left and right lanes, or switch to practice.`
              : live.current.mode === "arm-raises"
                ? "Show both shoulders and hands to the camera."
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
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
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
