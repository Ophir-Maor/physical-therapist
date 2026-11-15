"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronUp, Pause, Play } from "lucide-react";
import ExerciseDemo from "@/components/exercise-demo";
import LeaderboardSubmit from "@/components/leaderboard-submit";
import PoseAvatar from "@/components/pose-avatar";
import VisionStage from "@/components/vision-stage";
import { BroadcastVoice, coachCommentary, duelResultLine } from "@/lib/commentary";
import { requestCoachLine } from "@/lib/coach-client";
import { PlayerTracker, type Landmark } from "@/lib/engine";
import {
  CHALLENGES,
  COACHES,
  EXERCISES,
  type ChallengeId,
  type CoachId,
} from "@/lib/exercises";
import {
  FALLBACK_TARGET,
  FormEvaluator,
  RangeCalibrator,
  pickWinner,
  summarizeReps,
  type ExerciseId,
  type FormMetric,
  type PhaseName,
  type RepEvaluation,
} from "@/lib/form";
import { IdentityRegistrar } from "@/lib/identity";
import {
  builtInWorkouts,
  localNextWorkouts,
  readShownWorkouts,
  replaceShownWorkouts,
  sectionsFromReps,
  type NextWorkout,
  type SectionScores,
} from "@/lib/next-workout";
import {
  applyRep,
  applyTracking,
  completeSession,
  createSession,
  decide,
  isStale,
  renderFixed,
  renderLine,
  type SessionContext,
} from "@/lib/session-context";
import {
  achievementsFor,
  loadSessions,
  personalBest,
  saveSession,
  type SessionRecord,
} from "@/lib/progress";

type Step = "setup" | "demo" | "arena" | "recommend" | "results" | "progress";
type Arena = "register" | "calibrate" | "countdown" | "active" | "paused" | "handoff";
type AvatarSnapshot = {
  pose: Landmark[] | null;
  tracking: boolean;
  progress: number;
  pastTarget: boolean;
  phase: PhaseName;
};
type Settings = {
  exercise: ExerciseId;
  players: 1 | 2;
  names: [string, string];
  personality: CoachId;
  challenge: ChallengeId;
  goal: number;
  demo: boolean;
  scale: number;
  age: number | null;
};

const PHASES: PhaseName[] = [
  "preparing",
  "raising",
  "target",
  "lowering",
  "completed",
];

const initial: Settings = {
  exercise: "arm-raises",
  players: 1,
  names: ["Alex", "Jordan"],
  personality: "supportive",
  challenge: "practice",
  goal: 4,
  demo: true,
  scale: 1,
  age: null,
};

const emptyAvatar = (): AvatarSnapshot => ({
  pose: null,
  tracking: false,
  progress: 0,
  pastTarget: false,
  phase: "preparing",
});

const avatarCanTrack = (pose: Landmark[] | null, exercise: ExerciseId) => {
  if (!pose) return false;
  const required =
    exercise === "squats"
      ? [23, 24, 25, 26, 27, 28]
      : [11, 12, 15, 16];
  return required.every((index) => (pose[index]?.visibility ?? 0) >= 0.55);
};

export default function CoachFlow({
  onExit,
  initialStep = "setup",
  initialPersonality = "supportive",
}: {
  onExit: () => void;
  initialStep?: "setup" | "progress";
  initialPersonality?: CoachId;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [arena, setArena] = useState<Arena>("register");
  const [settings, setSettings] = useState<Settings>({
    ...initial,
    personality: initialPersonality,
  });
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Step into the frame.");
  const [reg, setReg] = useState({
    message: "Player 1, stand on the left side of the preview.",
    ready: false,
  });
  const [peaks, setPeaks] = useState<(number | null)[]>([null, null]);
  const [targets, setTargets] = useState<(number | null)[]>([null, null]);
  const [usedFallback, setUsedFallback] = useState<boolean[]>([false, false]);
  const [counts, setCounts] = useState([0, 0]);
  const [lastScores, setLastScores] = useState<(number | null)[]>([null, null]);
  const [averages, setAverages] = useState<(number | null)[]>([null, null]);
  const [avatars, setAvatars] = useState<AvatarSnapshot[]>([
    emptyAvatar(),
    emptyAvatar(),
  ]);
  const [cue, setCue] = useState("Quality matters more than speed.");
  const [metrics, setMetrics] = useState<FormMetric[]>([]);
  const [caption, setCaption] = useState("Stop any time, especially if something hurts.");
  const [voiceStatus, setVoiceStatus] = useState("Coach voice starts with the session");
  const [countdown, setCountdown] = useState(3);
  const [turn, setTurn] = useState(0);
  const [summary, setSummary] = useState<{
    record: SessionRecord;
    badges: ReturnType<typeof achievementsFor>;
    best: ReturnType<typeof personalBest>;
    reason: string;
    winner: number | null;
    consistencies: Array<number | null>;
    suggestion: string | null;
    strongest: string | null;
    improvement: number | null;
    sections: SectionScores;
    repScores: Array<Array<number | null>>;
  } | null>(null);
  const [history, setHistory] = useState<SessionRecord[]>(() => loadSessions());
  const [nextWorkouts, setNextWorkouts] = useState<NextWorkout[]>([]);
  const [nextSource, setNextSource] = useState<"gemini" | "local" | "checking" | null>(null);
  const [ageDraft, setAgeDraft] = useState("");
  const settingsRef = useRef(settings);
  const arenaRef = useRef(arena);
  const voice = useRef<BroadcastVoice | null>(null);
  const evaluators = useRef<FormEvaluator[]>([]);
  const calibrators = useRef<RangeCalibrator[]>([]);
  const tracker = useRef<PlayerTracker | null>(null);
  const registrar = useRef<IdentityRegistrar | null>(null);
  const reps = useRef<RepEvaluation[][]>([[], []]);
  const sessions = useRef<SessionContext[]>([createSession({}), createSession({})]);
  const targetsRef = useRef<(number | null)[]>([null, null]);
  const started = useRef(0);
  const pausedMs = useRef(0);
  const pauseBegan = useRef(0);
  const phaseNodes = useRef<(HTMLSpanElement | null)[]>([]);
  const confidenceNode = useRef<HTMLElement | null>(null);
  const lastUi = useRef(0);
  const lastMiss = useRef(0);
  const finished = useRef(false);
  const turnRef = useRef(0);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    arenaRef.current = arena;
  }, [arena]);
  useEffect(() => {
    voice.current = new BroadcastVoice(setCaption, setVoiceStatus);
    return () => voice.current?.stop();
  }, []);
  useEffect(() => {
    if (step !== "recommend" || !summary) return;
    const exercise = summary.record.exercise === "squats" ? "squats" : "arm-raises";
    if (settings.age == null) {
      setNextWorkouts(builtInWorkouts());
      setNextSource("local");
      return;
    }
    const age = settings.age;
    const avoid = readShownWorkouts();
    const fallback = localNextWorkouts(exercise, summary.sections, age, avoid);
    const controller = new AbortController();
    setNextWorkouts(fallback);
    setNextSource("checking");
    void (async () => {
      try {
        const response = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exercise,
            age,
            sections: summary.sections,
            avoid,
          }),
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          workouts?: NextWorkout[];
          source?: "gemini" | "local";
        };
        if (controller.signal.aborted) return;
        const workouts = body.workouts?.length ? body.workouts : fallback;
        setNextWorkouts(workouts);
        setNextSource(body.workouts?.length && body.source === "gemini" ? "gemini" : "local");
        replaceShownWorkouts(workouts.map((workout) => workout.title));
      } catch {
        if (controller.signal.aborted) return;
        setNextWorkouts(fallback);
        setNextSource("local");
        replaceShownWorkouts(fallback.map((workout) => workout.title));
      }
    })();
    return () => controller.abort();
  }, [step, summary, settings.age]);
  useEffect(() => {
    if (arena !== "countdown") return;
    let count = 3;
    const id = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count === 0) {
        clearInterval(id);
        if (finished.current) return;
        evaluators.current.forEach((evaluator) => evaluator.reset());
        started.current = Date.now();
        pausedMs.current = 0;
        finished.current = false;
        const current = settingsRef.current;
        sessions.current = [0, 1].map((index) =>
          createSession({
            exercise: current.exercise,
            personality: current.personality,
            name: current.names[index] || current.names[0],
            goal: current.goal,
          }),
        );
        arenaRef.current = "active";
        setArena("active");
        if (turnRef.current === 0) {
          voice.current?.enqueue(
            coachCommentary({
              type: "intro",
              personality: current.personality,
              name: current.names[0],
            }),
            6,
            "coach-intro",
          );
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [arena]);

  const finish = useCallback((reason: "done" | "stop") => {
    if (finished.current) return;
    finished.current = true;
    const current = settingsRef.current;
    const chosen = targetsRef.current.map(
      (target) => target ?? FALLBACK_TARGET[current.exercise],
    );
    const summaries = reps.current
      .slice(0, current.players)
      .map((list, index) => summarizeReps(list, chosen[index]));
    const decision =
      current.players === 2 &&
      (current.challenge === "form" || current.challenge === "consistency")
        ? pickWinner(current.challenge, summaries)
        : { index: null, reason: "This set is scored against your own target." };
    const primary = summaries[0];
    const record: SessionRecord = {
      id: `${Date.now()}`,
      at: new Date().toISOString(),
      experience: "coach",
      exercise: current.exercise,
      challenge: current.challenge,
      personality: current.personality,
      names: current.names.slice(0, current.players),
      reps: summaries.map((item) => item.scored),
      qualities: reps.current[0].flatMap((rep) =>
        rep.quality == null ? [] : [rep.quality],
      ),
      average: primary.average,
      consistency: primary.consistency,
      target: chosen[0],
      durationSec: started.current
        ? Math.max(
            1,
            Math.round((Date.now() - started.current - pausedMs.current) / 1000),
          )
        : 1,
      demo: current.demo,
    };
    const prior = loadSessions();
    saveSession(record);
    setHistory(loadSessions());
    const player = decision.index ?? 0;
    const report = completeSession(sessions.current[player] ?? createSession({
      name: current.names[player] || current.names[0],
      personality: current.personality,
      exercise: current.exercise,
      goal: current.goal,
    }));
    const recap = renderLine(report, decide(report));
    const duelCall =
      current.players === 2
        ? duelResultLine(
            current.names,
            decision.index,
            summaries.map((item) => item.scored),
          )
        : null;
    setSummary({
      record,
      badges: achievementsFor(prior, record),
      best: personalBest(prior, record),
      reason: decision.reason,
      winner: decision.index,
      consistencies: summaries.map((item) => item.consistency),
      suggestion: report.suggestion,
      strongest: report.strongestLabel,
      improvement: report.improvement,
      sections: sectionsFromReps(reps.current[player] ?? []),
      repScores: reps.current.slice(0, current.players).map((list) =>
        list.map((rep) => (rep.scored ? rep.quality : null)),
      ),
    });
    setAverages(summaries.map((item) => item.average));
    voice.current?.enqueue(
      duelCall ??
        (reason === "stop" ? renderFixed(current.personality, "stop", report.name) : recap),
      10,
      duelCall ? "coach-duel" : reason === "stop" ? "coach-stop" : "coach-recap",
    );
    arenaRef.current = "paused";
    setArena("paused");
    setStep("recommend");
  }, []);

  const onVisionStatus = useCallback((message: string, isReady: boolean) => {
    setStatus(message);
    setReady(isReady);
  }, []);
  const onPoses = useCallback(
    (poses: Landmark[][], timestamp: number) => {
      const phase = arenaRef.current;
      const current = settingsRef.current;
      const evaluating = phase === "calibrate" || phase === "active";
      let assigned: (Landmark[] | null)[];
      if (!current.demo && registrar.current) {
        const observed = registrar.current.update(poses, timestamp);
        if (phase === "register") {
          setReg((previous) =>
            previous.message === observed.message &&
            previous.ready === observed.readyToConfirm
              ? previous
              : { message: observed.message, ready: observed.readyToConfirm },
          );
          return;
        }
        if (registrar.current.stage !== "tracking" || observed.ambiguous) {
          if (observed.ambiguous) setCue(observed.message);
          return;
        }
        assigned = observed.assigned;
      } else {
        if (phase === "register") return;
        assigned = tracker.current?.update(poses, timestamp) ?? [];
      }
      if (current.players === 2) {
        const pose = assigned[0] ?? null;
        assigned = [null, null];
        assigned[turnRef.current] = pose;
      }

      if (!evaluating) {
        setAvatars((previous) =>
          previous.map((avatar, index) => {
            if (index >= current.players) return avatar;
            const pose = assigned[index] ?? null;
            return {
              ...avatar,
              pose,
              tracking: avatarCanTrack(pose, current.exercise),
            };
          }),
        );
        return;
      }

      const avatarUpdates: Array<AvatarSnapshot | null> = Array.from(
        { length: current.players },
        () => null,
      );
      Array.from(
        { length: current.players },
        (_, index) => assigned[index] ?? null,
      ).forEach((pose, index) => {
        if (current.players === 2 && index !== turnRef.current) return;
        const evaluator = evaluators.current[index];
        if (!evaluator) return;
        const result = evaluator.update(pose ?? [], timestamp);
        avatarUpdates[index] = {
          pose,
          tracking: result.live.tracking,
          progress: result.live.progress,
          pastTarget: result.live.pastTarget,
          phase: result.live.phase,
        };
        if (phase === "calibrate" && result.rep?.valid) {
          calibrators.current[index]?.note(result.rep);
          setPeaks((previous) => {
            const next = [...previous];
            next[index] = calibrators.current[index]?.observed() ?? null;
            return next;
          });
        }
        if (phase === "active" && result.rep) {
          reps.current[index].push(result.rep);
          const scored = reps.current.map(
            (list) => list.filter((rep) => rep.scored).length,
          );
          setCounts(scored);
          setLastScores(
            reps.current.map((list) => {
              const recent = [...list].reverse().find((rep) => rep.scored);
              return recent?.quality ?? null;
            }),
          );
          setAverages(
            reps.current.map((list, player) =>
              summarizeReps(list, targetsRef.current[player] ?? 1).average,
            ),
          );
          setCue(result.rep.feedback);
          setMetrics(result.rep.metrics);
          const measured = {
            scored: result.rep.scored,
            quality: result.rep.quality,
            confidence: result.rep.confidence,
            rushed: result.rep.rushed,
            feedback: result.rep.feedback,
            metrics: result.rep.metrics.map((metric) => ({
              id: metric.id,
              label: metric.label,
              score: metric.score,
              note: metric.note,
            })),
          };
          let context = applyRep(sessions.current[index], measured);
          const decision = decide(context, measured);
          if (decision.speak) {
            const line = renderLine(context, decision);
            context = {
              ...context,
              spokenKeys: [...context.spokenKeys, decision.key].slice(-12),
              recentComments: [...context.recentComments, line].slice(-4),
            };
            const stamp = context.repNumber;
            if (decision.safety) voice.current?.enqueue(line, decision.priority, decision.key);
            else {
              const controller = new AbortController();
              const timer = window.setTimeout(() => controller.abort(), 1200);
              void requestCoachLine(context, decision, controller.signal)
                .catch(() => null)
                .then((optional) => {
                  window.clearTimeout(timer);
                  if (isStale(sessions.current[index], { ...decision, repNumber: stamp })) return;
                  voice.current?.enqueue(optional || line, decision.priority, `${decision.key}-${stamp}`);
                });
            }
          }
          sessions.current[index] = context;
          if (
            current.players === 2 &&
            turnRef.current === 0 &&
            scored[0] >= current.goal
          ) {
            if (arenaRef.current === "active") {
              arenaRef.current = "handoff";
              setArena("handoff");
              setCue(
                `${current.names[0]} is done. ${current.names[1]}, step in alone when you're ready.`,
              );
              voice.current?.stop();
            }
          } else if (
            scored.slice(0, current.players).every((count) => count >= current.goal)
          ) {
            finish("done");
          }
        }
        if (!result.live.tracking && timestamp - lastMiss.current > 8000) {
          lastMiss.current = timestamp;
          const feedback =
            current.exercise === "squats"
              ? "I couldn't clearly see your hips and knees. Step back a little."
              : "I couldn't clearly see your shoulders and hands. Step back a little.";
          setCue(feedback);
          let context = applyTracking(sessions.current[index], false);
          context = { ...context, feedback };
          const decision = decide(context);
          if (decision.speak) {
            const line = renderLine(context, decision);
            context = {
              ...context,
              spokenKeys: [...context.spokenKeys, decision.key].slice(-12),
              recentComments: [...context.recentComments, line].slice(-4),
            };
            voice.current?.enqueue(line, decision.priority, decision.key);
          }
          sessions.current[index] = context;
        }
        if (index === 0) {
          if (timestamp - lastUi.current > 160) {
            lastUi.current = timestamp;
            phaseNodes.current.forEach((node, place) =>
              node?.classList.toggle("on", PHASES[place] === result.live.phase),
            );
            if (confidenceNode.current)
              confidenceNode.current.textContent = `Tracking confidence ${Math.round(result.live.confidence * 100)}%.${result.live.pastTarget ? " Past the selected target." : ""} Weights: control 40, range 30, alignment 20, consistency 10. Missing camera information stays unscored.`;
          }
        }
      });
      setAvatars((previous) =>
        previous.map((avatar, index) => avatarUpdates[index] ?? avatar),
      );
    },
    [finish],
  );

  function changeAge(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setAgeDraft(digits);
    const next = Number(digits);
    const age = digits.length === 2 && next >= 10 && next <= 99 ? next : null;
    setSettings((current) => (current.age === age ? current : { ...current, age }));
  }
  function cleanSettings(next: Settings): Settings {
    return {
      ...next,
      names: [
        next.names[0].trim().slice(0, 24) || "Player 1",
        next.names[1].trim().slice(0, 24) || "Player 2",
      ],
    };
  }
  function enterDemoStep() {
    const next = cleanSettings(settings);
    setSettings(next);
    if (voice.current) {
      voice.current.personality = next.personality;
      voice.current.unlock();
    }
    setStep("demo");
  }
  function enterArena() {
    const next = cleanSettings(settings);
    setSettings(next);
    settingsRef.current = next;
    voice.current?.stop();
    if (voice.current) voice.current.personality = next.personality;
    const calibrationTarget = next.exercise === "arm-raises" ? 160 : 80;
    evaluators.current = Array.from(
      { length: next.players },
      () =>
        new FormEvaluator(next.exercise, {
          mode: "calibrate",
          target: calibrationTarget,
        }),
    );
    calibrators.current = Array.from({ length: next.players }, () => new RangeCalibrator());
    tracker.current = new PlayerTracker(1);
    registrar.current =
      !next.demo && next.players === 1 ? new IdentityRegistrar(1) : null;
    turnRef.current = 0;
    setTurn(0);
    reps.current = [[], []];
    finished.current = false;
    setPeaks([null, null]);
    setTargets([null, null]);
    setCounts([0, 0]);
    setLastScores([null, null]);
    setAverages([null, null]);
    setAvatars([emptyAvatar(), emptyAvatar()]);
    setMetrics([]);
    setReady(false);
    const registerFirst = !next.demo && next.players === 1;
    const nextArena: Arena = registerFirst ? "register" : "calibrate";
    arenaRef.current = nextArena;
    setArena(nextArena);
    setCue(
      next.players === 2
        ? `${next.names[0]} goes first. ${next.names[1]} starts after this set. Do one or two slow, comfortable repetitions.`
        : registerFirst
          ? "Player 1, stand alone in the preview."
          : "Do one or two slow, comfortable repetitions. This sets your target, not a medical maximum.",
    );
    setStep("arena");
  }
  function confirmRegistration() {
    if (settings.demo) {
      arenaRef.current = "calibrate";
      setArena("calibrate");
      return;
    }
    const accepted = registrar.current?.confirm(performance.now());
    if (!accepted) return;
    if (registrar.current?.stage === "tracking") {
      arenaRef.current = "calibrate";
      setArena("calibrate");
      setCue("Do one or two slow, comfortable repetitions. Then set a target you can match.");
    } else {
      setReg({
        message: "Player 2, step into the open side. Player 1 can stay on the left.",
        ready: false,
      });
      setCue("Player 2, step into the open side of the preview.");
    }
  }
  function startSecondAthlete() {
    const next = settingsRef.current;
    turnRef.current = 1;
    setTurn(1);
    const calibrationTarget = next.exercise === "arm-raises" ? 160 : 80;
    evaluators.current[1] = new FormEvaluator(next.exercise, {
      mode: "calibrate",
      target: calibrationTarget,
    });
    calibrators.current[1] = new RangeCalibrator();
    setPeaks((previous) => [previous[0], null]);
    arenaRef.current = "calibrate";
    setArena("calibrate");
    setCue(
      `${next.names[1]} is up. Do one or two slow reps, then set your own target.`,
    );
  }
  useEffect(() => {
    if (arena !== "handoff" || !settings.demo) return;
    const id = window.setTimeout(() => startSecondAthlete(), 600);
    return () => window.clearTimeout(id);
  }, [arena, settings.demo]);
  function recalibrate() {
    const index = turnRef.current;
    const next = settingsRef.current;
    const calibrationTarget = next.exercise === "arm-raises" ? 160 : 80;
    evaluators.current[index] = new FormEvaluator(next.exercise, {
      mode: "calibrate",
      target: calibrationTarget,
    });
    calibrators.current[index] = new RangeCalibrator();
    setPeaks((previous) => previous.map((peak, place) => (place === index ? null : peak)));
    const chosen = [...targetsRef.current];
    chosen[index] = null;
    targetsRef.current = chosen;
    setTargets(chosen);
    reps.current[index] = [];
    setCounts((previous) => previous.map((count, place) => (place === index ? 0 : count)));
    setLastScores((previous) => previous.map((score, place) => (place === index ? null : score)));
    setAverages((previous) => previous.map((score, place) => (place === index ? null : score)));
    setMetrics([]);
    sessions.current[index] = createSession({
      exercise: next.exercise,
      personality: next.personality,
      name: next.names[index] || next.names[0],
      goal: next.goal,
    });
    setCue(
      "Do one or two slow, comfortable repetitions. This sets your target, not a medical maximum.",
    );
    arenaRef.current = "calibrate";
    setArena("calibrate");
  }
  function acceptTarget(fallback: boolean) {
    const index = turnRef.current;
    const measured = calibrators.current[index]?.target(settings.scale);
    const target =
      !fallback && measured != null
        ? measured
        : (measured ?? FALLBACK_TARGET[settings.exercise]);
    const chosen = [...targetsRef.current];
    chosen[index] = target;
    targetsRef.current = chosen;
    setTargets(chosen);
    setUsedFallback((previous) => {
      const next = [...previous];
      next[index] = fallback && calibrators.current[index]?.observed() == null;
      return next;
    });
    evaluators.current[index] = new FormEvaluator(settings.exercise, {
      mode: "score",
      target,
    });
    setAvatars((previous) =>
      previous.map((avatar) => ({
        ...avatar,
        progress: 0,
        pastTarget: false,
        phase: "preparing",
      })),
    );
    setCountdown(3);
    arenaRef.current = "countdown";
    setArena("countdown");
  }
  function pause() {
    pauseBegan.current = Date.now();
    arenaRef.current = "paused";
    setArena("paused");
    voice.current?.stop();
  }
  function resume() {
    pausedMs.current += Date.now() - pauseBegan.current;
    arenaRef.current = "active";
    setArena("active");
  }
  const guide = EXERCISES[settings.exercise];
  const phaseLabels =
    settings.exercise === "squats"
      ? ["Preparing", "Lowering", "Target", "Rising", "Rep done"]
      : ["Preparing", "Raising", "Target", "Lowering", "Rep done"];
  const measuredReady = peaks[turn] != null;

  return (
    <section className="coach-shell">
      {step === "setup" && (
        <div className="setup-wrap">
          <nav className="setup-nav" aria-label="Leave guided training">
            <button className="text-button" onClick={onExit}>
              <ChevronLeft size={16} /> Back to the network
            </button>
            <a className="text-button" href="/leaderboard">
              Championship board
            </a>
          </nav>
          <div className="eyebrow">GUIDED MOVEMENT COACH</div>
          <h2>
            TRAIN THE <em>REP.</em>
          </h2>
          <p className="muted">
            Points follow control, your selected range, and consistency. Twenty
            rushed repetitions should lose to ten smooth ones.
          </p>
          <div className="setup-grid">
            <div className="panel settings">
              <label className="field-label">01 / EXERCISE</label>
              <div className="choice-row">
                {(Object.keys(EXERCISES) as ExerciseId[]).map((exercise) => (
                  <button
                    key={exercise}
                    className={`choice ${settings.exercise === exercise ? "selected" : ""}`}
                    onClick={() => setSettings({ ...settings, exercise })}
                  >
                    <strong>{EXERCISES[exercise].name}</strong>
                    <small>{EXERCISES[exercise].areas}</small>
                  </button>
                ))}
              </div>
              <label className="field-label">02 / WHO IS PRACTICING</label>
              <div className="choice-row">
                {[1, 2].map((count) => (
                  <button
                    key={count}
                    className={`choice ${settings.players === count ? "selected" : ""}`}
                    onClick={() =>
                      setSettings({ ...settings, players: count as 1 | 2 })
                    }
                  >
                    <strong>{count === 1 ? "Solo practice" : "Two athletes"}</strong>
                    <small>
                      {count === 1
                        ? "Calibrate your own range."
                        : "One at a time. The camera follows whoever is up."}
                    </small>
                  </button>
                ))}
              </div>
              <label className="field-label">
                Player 1
                <input
                  aria-label="Coach player 1 name"
                  maxLength={24}
                  value={settings.names[0]}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      names: [event.target.value, settings.names[1]],
                    })
                  }
                />
              </label>
              {settings.players === 2 && (
                <label className="field-label">
                  Player 2
                  <input
                    aria-label="Coach player 2 name"
                    maxLength={24}
                    value={settings.names[1]}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        names: [settings.names[0], event.target.value],
                      })
                    }
                  />
                </label>
              )}
              <label className="field-label">
                Age
                <input
                  aria-label="Age"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="10–99"
                  value={ageDraft}
                  onChange={(event) => changeAge(event.target.value)}
                />
              </label>
            </div>
            <div className="panel settings">
              <label className="field-label">
                03 / COACH
                <select
                  aria-label="Coach"
                  value={settings.personality}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      personality: event.target.value as CoachId,
                    })
                  }
                >
                  {COACHES.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary coach-preview"
                onClick={() => {
                  voice.current?.unlock();
                  voice.current!.personality = settings.personality;
                  voice.current?.preview(
                    coachCommentary({
                      type: "preview",
                      personality: settings.personality,
                      name: settings.names[0] || "Player",
                    }),
                  );
                }}
              >
                Hear {COACHES.find((coach) => coach.id === settings.personality)?.voiceName}&apos;s intro
              </button>
              <label className="field-label">
                04 / CHALLENGE
                <select
                  aria-label="Challenge"
                  value={settings.challenge}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      challenge: event.target.value as ChallengeId,
                    })
                  }
                >
                  {CHALLENGES.map((challenge) => (
                    <option key={challenge.id} value={challenge.id}>
                      {challenge.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">05 / SCORED REPS</label>
              <div className="rep-stepper">
                <div className="rep-stepper-box">
                  <input
                    aria-label="Scored reps"
                    type="number"
                    min={1}
                    max={99}
                    inputMode="numeric"
                    value={settings.goal}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isInteger(next)) return;
                      setSettings({
                        ...settings,
                        goal: Math.min(99, Math.max(1, next)),
                      });
                    }}
                  />
                  <div className="rep-stepper-arrows">
                    <button
                      type="button"
                      aria-label="Increase scored reps"
                      disabled={settings.goal >= 99}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          goal: Math.min(99, settings.goal + 1),
                        })
                      }
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Decrease scored reps"
                      disabled={settings.goal <= 1}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          goal: Math.max(1, settings.goal - 1),
                        })
                      }
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                </div>
                <span>quality reps</span>
              </div>
              <div className="coach-actions">
                <button className="primary" onClick={enterDemoStep}>
                  Continue to demonstration <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {step === "demo" && (
        <div className="setup-wrap">
          <button className="text-button" onClick={() => setStep("setup")}>
            <ChevronLeft size={16} /> Change the session
          </button>
          <div className="eyebrow">WATCH THE PATTERN</div>
          <h2>{guide.name}</h2>
          <div className="split-demo">
            <ExerciseDemo exercise={settings.exercise} />
            <div className="panel">
              <div className="pattern-notes">
                <p>
                  <b>Focus:</b> {guide.areas}
                </p>
                <p>
                  <b>Start:</b> {guide.start}
                </p>
                <ul>
                  {guide.steps.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="pattern-misses">
                  <p>
                    <b>Visible misses:</b>
                  </p>
                  <ul>
                    {guide.mistakes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="choice-row">
                <button
                  type="button"
                  className={`choice ${settings.demo ? "selected" : ""}`}
                  onClick={() => setSettings({ ...settings, demo: true })}
                >
                  <strong>Demo Mode</strong>
                </button>
                <button
                  type="button"
                  className={`choice ${settings.demo ? "" : "selected"}`}
                  onClick={() => setSettings({ ...settings, demo: false })}
                >
                  <strong>Live webcam</strong>
                </button>
              </div>
              <button className="primary" onClick={enterArena}>
                {settings.demo ? "Enter coach demo" : "Enable coach camera"}{" "}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
      {step === "arena" && (
        <div className="broadcast">
          <div className="broadcast-head">
            <div>
              <span className="eyebrow">
                {settings.demo ? "SYNTHETIC COACHING DEMO" : "LOCAL CAMERA"}
              </span>
              <h2>{guide.name}</h2>
            </div>
            <button
              className="text-button"
              onClick={() => {
                voice.current?.stop();
                setStep("setup");
              }}
            >
              End session
            </button>
          </div>
          <div className="scoreboard">
            <div className="player blue">
              <span>LAST QUALITY</span>
              <strong>{settings.names[0]}</strong>
              <b data-testid="quality-score">{lastScores[0] ?? "—"}</b>
            </div>
            <div className="score-focus">
              <span>{counts[0]}/{settings.goal} SCORED</span>
              <b>{averages[0] ?? "—"}</b>
              <small>AVERAGE QUALITY</small>
            </div>
            {settings.players === 2 ? (
              <div className="player red">
                <span>
                  {turn === 1 ? "NOW · " : "NEXT · "}
                  {counts[1]}/{settings.goal} SCORED
                </span>
                <strong>{settings.names[1]}</strong>
                <b data-testid="quality-score-2">{lastScores[1] ?? "—"}</b>
              </div>
            ) : (
              <div className="solo-card">
                <span>YOUR TARGET, NOT A UNIVERSAL IDEAL</span>
              </div>
            )}
          </div>
          <div className="broadcast-grid coach-broadcast">
            <div className="camera-shell">
              <div className={`coach-motion-split ${arena === "register" ? "camera-only" : ""}`}>
                <div className="coach-camera-pane">
                  <VisionStage
                    demo={settings.demo}
                    players={1}
                    demoPlayer={turn}
                    mode="arm-raises"
                    exercise={settings.exercise}
                    demoMotion="coach"
                    demoPlaying={arena === "calibrate" || arena === "active"}
                    running={arena === "active"}
                    onPoses={onPoses}
                    onStatus={onVisionStatus}
                    showPoseOverlay={settings.demo}
                  />
                </div>
                {arena !== "register" && (
                  <div className="coach-avatar-pane">
                    {avatars.slice(turn, turn + 1).map((avatar, index) => (
                      <PoseAvatar
                        key={index}
                        pose={avatar.pose}
                        exercise={settings.exercise}
                        target={arena === "calibrate" ? peaks[turn] : targets[turn]}
                        tracking={avatar.tracking}
                        progress={avatar.progress}
                        pastTarget={avatar.pastTarget}
                        phase={avatar.phase}
                        calibrating={arena === "calibrate"}
                        name={settings.names[turn + index]}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="phase-rail" aria-label="Movement phase">
                {phaseLabels.map((label, index) => (
                  <span
                    key={label}
                    ref={(node) => {
                      phaseNodes.current[index] = node;
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              {arena === "countdown" && (
                <div className="countdown-overlay">
                  <span>QUALITY STARTS IN</span>
                  <b>{countdown}</b>
                </div>
              )}
              <div className="caption">
                <span>COACH</span>
                <p aria-live="polite">{caption}</p>
              </div>
            </div>
            <aside className="panel commentary">
              {arena === "register" && (
                <>
                  <h3>Register in order.</h3>
                  <p role="status">
                    {settings.demo
                      ? "Synthetic athletes are already on the left and right. Confirming them does not use a camera."
                      : reg.message || status}
                  </p>
                  <small>
                    One person in the frame. The other waits until this set is
                    finished.
                  </small>
                  <button
                    className="primary"
                    disabled={!settings.demo && !reg.ready}
                    onClick={confirmRegistration}
                  >
                    {settings.demo ? "Confirm demo athletes" : "Confirm player"}
                  </button>
                </>
              )}
              {arena === "handoff" && (
                <>
                  <h3>{settings.names[1]} is up.</h3>
                  <p>
                    {settings.names[0]} finished this set. Step in alone so the
                    camera can follow one person.
                  </p>
                  {!settings.demo && (
                    <button className="primary" onClick={startSecondAthlete}>
                      Start {settings.names[1]}
                    </button>
                  )}
                </>
              )}
              {arena === "calibrate" && (
                <>
                  <h3>Set a comfortable target.</h3>
                  <p role="status">{status}</p>
                  <p>
                    {peaks[turn] == null
                      ? `${settings.names[turn]}: still watching`
                      : `${settings.names[turn]}: about ${Math.round(peaks[turn]!)}° observed`}
                  </p>
                  <small>
                    This is a target chosen from what the camera could see. It
                    is not a diagnosis or a required maximum.
                  </small>
                  <div className="coach-actions">
                    <button
                      className="primary"
                      disabled={!measuredReady}
                      onClick={() => acceptTarget(false)}
                    >
                      Accept target
                    </button>
                    <button
                      className="secondary"
                      disabled={!measuredReady}
                      onClick={recalibrate}
                    >
                      Recalibrate
                    </button>
                    <button
                      className="secondary"
                      disabled={!ready}
                      onClick={() => acceptTarget(true)}
                    >
                      Use conservative fallback
                    </button>
                  </div>
                </>
              )}
              {(arena === "active" || arena === "paused" || arena === "countdown") && (
                <>
              <h3>Live quality</h3>
              <p className="coach-cue">{cue}</p>
              <p className="voice-status">{voiceStatus}</p>
              <div className="metric-list">
                {(metrics.length
                  ? metrics
                  : [
                      "Movement control",
                      "Target range",
                      "Observable alignment",
                      "Consistency",
                    ].map((label) => ({ label, score: null, note: "Waiting for a full repetition." }))
                ).map((metric) => (
                  <div key={metric.label} className="metric-row">
                    <span>{metric.label}</span>
                    <b>{metric.score == null ? "n/a" : metric.score}</b>
                    <i
                      style={{
                        width: `${metric.score ?? 0}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <small ref={confidenceNode}>
                Tracking confidence 0%. Weights: control 40, range 30, alignment
                20, consistency 10. Missing camera information stays unscored.
              </small>
                </>
              )}
              <div className="coach-actions">
                {arena === "active" ? (
                  <button className="secondary" onClick={pause}>
                    <Pause size={16} /> Pause
                  </button>
                ) : arena === "paused" ? (
                  <button className="secondary" onClick={resume}>
                    <Play size={16} /> Resume
                  </button>
                ) : null}
                {(arena === "active" || arena === "paused" || arena === "countdown") && (
                  <button className="secondary" onClick={recalibrate}>
                    Recalibrate
                  </button>
                )}
                <button className="primary" onClick={() => finish("stop")}>
                  Stop session
                </button>
              </div>
              <p className="disclaimer">
                Stop immediately if you feel pain. The coach will not ask you
                to push through it.
              </p>
            </aside>
          </div>
        </div>
      )}
      {step === "recommend" && summary && (
        <div className="setup-wrap">
          <div className="eyebrow">AFTER THIS SESSION</div>
          <h2>Next workout</h2>
          {settings.age != null && nextSource === "gemini" && (
            <p className="muted">
              Gemini suggested these from the section scores and age {settings.age}.
            </p>
          )}
          <div className="choice-row next-workouts">
            {nextWorkouts.map((workout, index) => (
              <div key={`${settings.age}-${workout.title}-${index}`} className="choice">
                <strong>{workout.title}</strong>
                <small>{workout.reason}</small>
              </div>
            ))}
          </div>
          <div className="result-actions">
            <button className="primary" onClick={() => setStep("results")}>
              See Results
            </button>
          </div>
        </div>
      )}
      {step === "results" && summary && (
        <div className="results">
          {summary.record.names.length > 1 ? (
            <h2>
              {summary.winner == null
                ? summary.record.reps.some((count) => count > 0)
                  ? "Even set."
                  : "Session stopped."
                : `${summary.record.names[summary.winner]} wins.`}
            </h2>
          ) : (
            <>
              <div className="eyebrow">
                {summary.record.demo ? "DEMO SESSION · " : ""}QUALITY REPORT
              </div>
              <h2>Session Results</h2>
              <p className="result-subtitle">{summary.reason}</p>
            </>
          )}
          <div className="final-scores">
            {summary.record.names.map((name, index) => (
              <div key={name} className={index === 0 ? "blue" : "red"}>
                <span>
                  {summary.record.names.length > 1 && summary.winner === index
                    ? "WINNER · "
                    : ""}
                  {name}
                </span>
                <b>{averages[index] ?? "—"}</b>
                <small>
                  {summary.record.reps[index] || counts[index]} scored reps
                  {usedFallback[index] ? " · fallback target" : ""}
                  {targets[index] ? ` · target ${Math.round(targets[index]!)}°` : ""}
                </small>
              </div>
            ))}
          </div>
          <div className="rep-tables">
            {summary.repScores.map((rows, index) => (
              <table key={`${summary.record.names[index]}-${index}`} className="rep-table">
                <caption>
                  {summary.record.names[index]} · score per rep
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rep</th>
                    <th scope="col">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={2}>No completed repetitions.</td>
                    </tr>
                  ) : (
                    rows.map((score, repIndex) => (
                      <tr key={repIndex}>
                        <th scope="row">{repIndex + 1}</th>
                        <td>{score == null ? "Unscored" : score}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ))}
          </div>
          <LeaderboardSubmit
            demo={summary.record.demo}
            experience="coach"
            exercise={settings.exercise}
            exerciseLabel={EXERCISES[settings.exercise].name}
            challenge={summary.record.challenge}
            challengeLabel={
              CHALLENGES.find((item) => item.id === summary.record.challenge)?.name ||
              summary.record.challenge
            }
            average={
              averages[summary.winner ?? 0] ?? summary.record.average
            }
            reps={summary.record.reps[summary.winner ?? 0] || 0}
            target={targets[summary.winner ?? 0] ?? summary.record.target}
            durationSec={summary.record.durationSec}
            goalReps={settings.goal}
            consistency={
              summary.consistencies[summary.winner ?? 0] ??
              summary.record.consistency
            }
            suggestedName={
              summary.record.names[summary.winner ?? 0] || summary.record.names[0]
            }
            companion={
              <button className="primary" onClick={enterArena}>
                Practice again
              </button>
            }
          />
          <div className="result-actions">
            <button className="secondary" onClick={() => setStep("setup")}>
              Exit
            </button>
            <button className="secondary" onClick={() => setStep("progress")}>
              Progress
            </button>
            <a className="secondary" href="/leaderboard">
              Championship board
            </a>
          </div>
        </div>
      )}
      {step === "progress" && (
        <div className="setup-wrap">
          <button className="text-button" onClick={onExit}>
            <ChevronLeft size={16} /> Back
          </button>
          <div className="eyebrow">ON THIS DEVICE</div>
          <h2>
            YOUR <em>TRAIL.</em>
          </h2>
          <div className="history-list">
            {history.length === 0 && (
              <p>No sessions yet. A coached set or an arcade match will land here.</p>
            )}
            {history.map((session) => (
              <article key={session.id} className="panel history-card">
                <span>
                  {session.demo ? "DEMO · " : ""}
                  {session.exercise} · {session.challenge}
                </span>
                <strong>
                  {session.average == null ? `${session.reps.join(" / ")} reps` : session.average}
                </strong>
                <small>
                  {new Date(session.at).toLocaleString()} · {session.names.join(" & ")}
                  {session.target ? ` · target ${Math.round(session.target)}°` : ""}
                  {session.consistency != null
                    ? ` · consistency ${session.consistency}`
                    : ""}
                </small>
              </article>
            ))}
          </div>
          <button className="primary progress-start" onClick={() => setStep("setup")}>
            Start a coached session
          </button>
        </div>
      )}
    </section>
  );
}
