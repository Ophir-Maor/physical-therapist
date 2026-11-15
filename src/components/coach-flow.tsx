"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, Pause, Play } from "lucide-react";
import ExerciseDemo from "@/components/exercise-demo";
import LeaderboardSubmit from "@/components/leaderboard-submit";
import VisionStage from "@/components/vision-stage";
import { BroadcastVoice, coachCommentary } from "@/lib/commentary";
import { requestCoachLine } from "@/lib/coach-client";
import { ghostFrame } from "@/lib/demo-motion";
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

type Step = "setup" | "demo" | "arena" | "results" | "progress";
type Arena = "register" | "calibrate" | "countdown" | "active" | "paused";
type Settings = {
  exercise: ExerciseId;
  players: 1 | 2;
  names: [string, string];
  personality: CoachId;
  challenge: ChallengeId;
  goal: number;
  demo: boolean;
  scale: number;
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
};

export default function CoachFlow({
  onExit,
  onArcade,
  initialStep = "setup",
  initialPersonality = "supportive",
}: {
  onExit: () => void;
  onArcade: () => void;
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
  const [cue, setCue] = useState("Quality matters more than speed.");
  const [metrics, setMetrics] = useState<FormMetric[]>([]);
  const [caption, setCaption] = useState("Stop any time, especially if something hurts.");
  const [voiceStatus, setVoiceStatus] = useState("Coach voice starts with the session");
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
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
  } | null>(null);
  const [history, setHistory] = useState<SessionRecord[]>(() => loadSessions());
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
  const ghostRef = useRef<Landmark[] | null>(null);
  const phaseNodes = useRef<(HTMLSpanElement | null)[]>([]);
  const confidenceNode = useRef<HTMLElement | null>(null);
  const lastUi = useRef(0);
  const lastMiss = useRef(0);
  const finished = useRef(false);
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
    if (arena !== "active") return;
    const id = setInterval(() => {
      setElapsed(
        Math.max(0, Math.round((Date.now() - started.current - pausedMs.current) / 1000)),
      );
    }, 250);
    return () => clearInterval(id);
  }, [arena]);
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
    });
    setAverages(summaries.map((item) => item.average));
    voice.current?.enqueue(
      reason === "stop" ? renderFixed(current.personality, "stop", report.name) : recap,
      10,
      reason === "stop" ? "coach-stop" : "coach-recap",
    );
    arenaRef.current = "paused";
    setArena("paused");
    setStep("results");
  }, []);

  const onVisionStatus = useCallback((message: string, isReady: boolean) => {
    setStatus(message);
    setReady(isReady);
  }, []);
  const onPoses = useCallback(
    (poses: Landmark[][], timestamp: number) => {
      const phase = arenaRef.current;
      const current = settingsRef.current;
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
        if (phase !== "calibrate" && phase !== "active") return;
        if (registrar.current.stage !== "tracking" || observed.ambiguous) {
          if (observed.ambiguous) setCue(observed.message);
          return;
        }
        assigned = observed.assigned;
      } else {
        if (phase !== "calibrate" && phase !== "active") return;
        assigned = tracker.current?.update(poses, timestamp) ?? [];
      }
      assigned.slice(0, current.players).forEach((pose, index) => {
        const evaluator = evaluators.current[index];
        if (!evaluator) return;
        const result = evaluator.update(pose ?? [], timestamp);
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
          if (scored.slice(0, current.players).every((count) => count >= current.goal))
            finish("done");
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
          ghostRef.current =
            phase === "active"
              ? ghostFrame(current.exercise, result.live.progress)
              : null;
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
    },
    [finish],
  );

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
    tracker.current = new PlayerTracker(next.players);
    registrar.current = next.demo ? null : new IdentityRegistrar(next.players);
    reps.current = [[], []];
    finished.current = false;
    setPeaks([null, null]);
    setTargets([null, null]);
    setCounts([0, 0]);
    setLastScores([null, null]);
    setAverages([null, null]);
    setMetrics([]);
    setReady(false);
    const skip = next.demo && next.players === 1;
    const nextArena: Arena = skip ? "calibrate" : "register";
    arenaRef.current = nextArena;
    setArena(nextArena);
    setCue(
      skip
        ? "Do one or two slow, comfortable repetitions. This sets your target, not a medical maximum."
        : next.demo
          ? "Demo athletes stay on the left and right. This is not live identity registration."
          : "Player 1, stand alone on the left side of the preview.",
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
  function acceptTarget(fallback: boolean) {
    const chosen = Array.from({ length: settings.players }, (_, index) => {
      const measured = calibrators.current[index]?.target(settings.scale);
      if (measured != null && !fallback) return measured;
      return measured ?? FALLBACK_TARGET[settings.exercise];
    });
    targetsRef.current = chosen;
    setTargets(chosen);
    setUsedFallback(
      chosen.map(
        (_, index) => fallback && calibrators.current[index]?.observed() == null,
      ),
    );
    evaluators.current = chosen.map(
      (target) =>
        new FormEvaluator(settings.exercise, { mode: "score", target }),
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
  const measuredReady = peaks
    .slice(0, settings.players)
    .every((peak) => peak != null);

  return (
    <section className="coach-shell">
      {step === "setup" && (
        <div className="setup-wrap">
          <button className="text-button" onClick={onExit}>
            <ChevronLeft size={16} /> Back to the network
          </button>
          <a className="text-button" href="/leaderboard">
            Championship board
          </a>
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
                        : "Register one person at a time."}
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
            </div>
            <div className="panel settings">
              <label className="field-label">03 / COACH</label>
              <div className="choice-row">
                {COACHES.map((coach) => (
                  <button
                    key={coach.id}
                    className={`choice ${settings.personality === coach.id ? "selected" : ""}`}
                    onClick={() =>
                      setSettings({ ...settings, personality: coach.id })
                    }
                  >
                    <strong>{coach.name}</strong>
                    <small>{coach.detail}</small>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="secondary"
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
                Preview this coach
              </button>
              <label className="field-label">04 / CHALLENGE</label>
              <div className="choice-row">
                {CHALLENGES.map((challenge) => (
                  <button
                    key={challenge.id}
                    className={`choice ${settings.challenge === challenge.id ? "selected" : ""}`}
                    onClick={() =>
                      setSettings({ ...settings, challenge: challenge.id })
                    }
                  >
                    <strong>{challenge.name}</strong>
                    <small>{challenge.detail}</small>
                  </button>
                ))}
              </div>
              <label className="field-label">05 / SCORED REPS</label>
              <div className="choice-row">
                {[4, 6, 8].map((goal) => (
                  <button
                    key={goal}
                    className={`choice ${settings.goal === goal ? "selected" : ""}`}
                    onClick={() => setSettings({ ...settings, goal })}
                  >
                    <strong>{goal} quality reps</strong>
                  </button>
                ))}
              </div>
              <p className="disclaimer">
                Experimental movement coaching, not a medical device. It does
                not diagnose injuries, prescribe rehab, or measure clinical
                recovery. Stop if you feel pain.
              </p>
              <div className="coach-actions">
                <button className="primary" onClick={enterDemoStep}>
                  Continue to demonstration <ArrowRight size={18} />
                </button>
                <button className="secondary" onClick={onArcade}>
                  Switch to arcade
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
              <p>{guide.summary}</p>
              <p>
                <b>Focus:</b> {guide.areas}
              </p>
              <p>
                <b>Start:</b> {guide.start}
              </p>
              <p>
                <b>Pattern:</b> {guide.pattern}
              </p>
              <ul>
                {guide.steps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p>
                <b>Visible misses:</b> {guide.mistakes.join(" · ")}
              </p>
              <p>{guide.camera}</p>
              <div className="option-row">
                <label>
                  <input
                    type="radio"
                    name="coach-source"
                    checked={settings.demo}
                    onChange={() => setSettings({ ...settings, demo: true })}
                  />{" "}
                  Demo Mode
                </label>
                <label>
                  <input
                    type="radio"
                    name="coach-source"
                    checked={!settings.demo}
                    onChange={() => setSettings({ ...settings, demo: false })}
                  />{" "}
                  Live webcam
                </label>
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
            <div className="timer">
              <span>{counts[0]}/{settings.goal} SCORED</span>
              <b>{averages[0] ?? "—"}</b>
              <small>AVERAGE · {elapsed}s</small>
            </div>
            {settings.players === 2 ? (
              <div className="player red">
                <span>
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
              <VisionStage
                demo={settings.demo}
                players={settings.players}
                mode="arm-raises"
                exercise={settings.exercise}
                demoMotion="coach"
                demoPlaying={arena === "calibrate" || arena === "active"}
                running={arena === "active"}
                ghostRef={ghostRef}
                onPoses={onPoses}
                onStatus={onVisionStatus}
              />
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
                    Blue follows player 1, red follows player 2. Identity is
                    spatial. If you cross, scoring pauses.
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
              {arena === "calibrate" && (
                <>
                  <h3>Set a comfortable target.</h3>
                  <p role="status">{status}</p>
                  <p>
                    {peaks
                      .slice(0, settings.players)
                      .map((peak, index) =>
                        peak == null
                          ? `${settings.names[index]}: still watching`
                          : `${settings.names[index]}: about ${Math.round(peak)}° observed`,
                      )
                      .join(" · ")}
                  </p>
                  <label className="field-label">
                    Use {Math.round(settings.scale * 100)}% of the range you
                    just showed
                    <input
                      aria-label="Target range"
                      type="range"
                      min={60}
                      max={100}
                      value={Math.round(settings.scale * 100)}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          scale: Number(event.target.value) / 100,
                        })
                      }
                    />
                  </label>
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
      {step === "results" && summary && (
        <div className="results">
          <div className="eyebrow">
            {summary.record.demo ? "DEMO SESSION · " : ""}QUALITY REPORT
          </div>
          <h2>Session results</h2>
          <p className="result-subtitle">{summary.reason}</p>
          <div className="final-scores">
            {summary.record.names.map((name, index) => (
              <div key={name} className={index === 0 ? "blue" : "red"}>
                <span>
                  {summary.winner === index ? "QUALITY LEAD · " : ""}
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
          <div className="recap panel">
            <p>{cue}</p>
            <p>
              Average {averages[summary.winner ?? 0] ?? "unscored"}. Scored reps{" "}
              {summary.record.reps[summary.winner ?? 0] || 0}. Consistency{" "}
              {summary.consistencies[summary.winner ?? 0] ?? "not enough reps"}.
              {summary.improvement == null
                ? ""
                : ` Change across the set: ${summary.improvement > 0 ? "+" : ""}${summary.improvement}.`}
            </p>
            {summary.strongest && <p>Strongest measure: {summary.strongest}.</p>}
            {summary.suggestion && <p>Next time: {summary.suggestion}</p>}
            <p className="disclaimer">These quality estimates are experimental, not a clinical grade.</p>
            {summary.best.improved && (
              <p>Personal best. This beat your previous comparable session.</p>
            )}
            {summary.best.comparableCount === 0 &&
              summary.record.challenge === "personal-best" && (
                <p>
                  No earlier session on this device used the same exercise,
                  challenge, and target. This one becomes the baseline.
                </p>
              )}
            <div className="badge-row">
              {summary.badges.map((badge) => (
                <span key={badge.id}>
                  <b>{badge.title}</b>
                  {badge.detail}
                </span>
              ))}
            </div>
          </div>
          <p className="disclaimer">
            Scores are approximate, camera-dependent, and not a clinical
            assessment. A larger movement is not automatically a better one.
          </p>
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
          />
          <div className="result-actions">
            <button className="primary" onClick={enterArena}>
              Practice again
            </button>
            <button className="secondary" onClick={() => setStep("progress")}>
              Progress
            </button>
            <a className="text-button" href="/leaderboard">
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
          <button className="primary" onClick={() => setStep("setup")}>
            Start a coached session
          </button>
        </div>
      )}
    </section>
  );
}
