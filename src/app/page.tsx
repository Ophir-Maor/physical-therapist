"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Camera,
  ChevronLeft,
  CircleHelp,
  Crosshair,
  Radio,
  RotateCcw,
  Settings2,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import VisionStage from "@/components/vision-stage";
import CoachFlow from "@/components/coach-flow";
import {
  ActivityDetector,
  GameEngine,
  PlayerTracker,
  type Landmark,
  type LiveMeters,
  type Mode,
} from "@/lib/engine";
import { bodyCovered } from "@/lib/broadcast-score";
import { BroadcastVoice, commentaryFor } from "@/lib/commentary";
import { IdentityRegistrar } from "@/lib/identity";
import { saveSession } from "@/lib/progress";

type Phase =
  | "landing"
  | "setup"
  | "calibration"
  | "countdown"
  | "active"
  | "complete"
  | "coach";
type Settings = {
  names: string[];
  players: number;
  duration: number;
  mode: Mode;
  personality: "hype" | "dry" | "documentary";
  demo: boolean;
};
const defaults: Settings = {
  names: ["Alex", "Jordan"],
  players: 2,
  duration: 30,
  mode: "jumping-jacks",
  personality: "hype",
  demo: true,
};
const activity = (mode: Mode) =>
  mode === "jumping-jacks"
    ? "Jumping Jack Championship"
    : "Arm Raise Championship";
export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [coachStep, setCoachStep] = useState<"setup" | "progress">("setup");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [scores, setScores] = useState([0, 0]);
  const [reps, setReps] = useState([0, 0]);
  const [averages, setAverages] = useState([0, 0]);
  const [meters, setMeters] = useState<LiveMeters[]>([]);
  const [flash, setFlash] = useState<{
    id: string;
    player: number;
    points: number;
    weakest: string;
  } | null>(null);
  const [pauseText, setPauseText] = useState("");
  const [winner, setWinner] = useState<number | null>(null);
  const [eventLog, setEventLog] = useState("");
  const [remaining, setRemaining] = useState(30);
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState("Preparing the arena…");
  const [ready, setReady] = useState(false);
  const [startHeld, setStartHeld] = useState(false);
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState(
    "Voice initializes when you start",
  );
  const [caption, setCaption] = useState(
    "Small movements. Unreasonable stakes.",
  );
  const [transcript, setTranscript] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  const [muted, setMuted] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [history, setHistory] = useState<
    {
      names: string[];
      scores: number[];
      reps?: number[];
      averages?: number[];
      demo: boolean;
    }[]
  >([]);
  const gapStarted = useRef(0);
  const engine = useRef<GameEngine | null>(null);
  const detectors = useRef<ActivityDetector[]>([]);
  const tracker = useRef<PlayerTracker | null>(null);
  const registrar = useRef<IdentityRegistrar | null>(null);
  const painted = useRef<(Landmark[] | null)[] | null>(null);
  const voice = useRef<BroadcastVoice | null>(null);
  const processed = useRef(0);
  const phaseRef = useRef(phase);
  const settingsRef = useRef(settings);
  const audio = useRef<AudioContext | null>(null);
  const lastDebug = useRef(0);
  const readySeen = useRef(0);
  const regKey = useRef("");
  const debugRef = useRef(debug);
  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);
  const [enrolled, setEnrolled] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [regStage, setRegStage] = useState<"await-1" | "await-2" | "tracking">(
    "await-1",
  );
  const [regReady, setRegReady] = useState(false);
  const [regMessage, setRegMessage] = useState("");
  const [regAmbiguous, setRegAmbiguous] = useState(false);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    // Local storage is an external system restored after hydration.
    try {
      const saved = JSON.parse(localStorage.getItem("el-settings") || "null");
      if (
        saved &&
        ["jumping-jacks", "arm-raises"].includes(saved.mode) &&
        [1, 2].includes(saved.players) &&
        [15, 30, 60].includes(saved.duration) &&
        ["hype", "dry", "documentary"].includes(saved.personality) &&
        Array.isArray(saved.names) &&
        saved.names.length === 2 &&
        saved.names.every((n: unknown) => typeof n === "string") &&
        typeof saved.demo === "boolean"
      )
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore persisted settings after hydration.
        setSettings(saved);
      const h = JSON.parse(localStorage.getItem("el-history") || "[]");
      if (Array.isArray(h))
        setHistory(
          h
            .filter(
              (v) =>
                v &&
                Array.isArray(v.names) &&
                v.names.every((n: unknown) => typeof n === "string") &&
                Array.isArray(v.scores) &&
                v.scores.every(
                  (n: unknown) => typeof n === "number" && Number.isFinite(n),
                ) &&
                typeof v.demo === "boolean",
            )
            .slice(0, 5),
        );
    } catch {}
    voice.current = new BroadcastVoice((text) => {
      setCaption(text);
      setTranscript((old) => [...old.slice(-49), text]);
    }, setVoiceStatus);
    return () => {
      voice.current?.stop();
      void audio.current?.close();
    };
  }, []);
  const sound = useCallback((frequency: number) => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }, []);
  const consume = useCallback(() => {
    const game = engine.current;
    if (!game) return;
    setScores((previous) =>
      previous.length === game.scores.length &&
      previous.every((score, index) => score === game.scores[index])
        ? previous
        : [...game.scores],
    );
    setReps((previous) =>
      previous.length === game.repCounts.length &&
      previous.every((count, index) => count === game.repCounts[index])
        ? previous
        : [...game.repCounts],
    );
    const averagesNow = game.averages;
    setAverages((previous) =>
      previous.length === averagesNow.length &&
      previous.every(
        (value, index) => Math.round(value) === Math.round(averagesNow[index]),
      )
        ? previous
        : averagesNow,
    );
    setRemaining((previous) =>
      Math.ceil(previous) === Math.ceil(game.remaining)
        ? previous
        : game.remaining,
    );
    for (const event of game.events.slice(processed.current)) {
      const s = settingsRef.current;
      const text = commentaryFor(
        event,
        s.names.slice(0, s.players),
        s.personality,
      );
      if (event.type === "REP_COMPLETED")
        setFlash({
          id: event.id,
          player: event.player ?? 0,
          points: event.points ?? 0,
          weakest: event.weakest ?? "clean",
        });
      if (text)
        voice.current?.enqueue(
          text,
          event.type === "MATCH_FINISHED"
            ? 10
            : event.type === "FINAL_TEN_SECONDS"
              ? 8
              : 2,
          event.id,
        );
    }
    if (processed.current !== game.events.length)
      setEventLog(
        game.events
          .slice(-8)
          .map((e) => `${e.type} ${e.scores.join(":")}`)
          .join("\n"),
      );
    processed.current = game.events.length;
    if (game.state === "complete" && phaseRef.current !== "complete") {
      phaseRef.current = "complete";
      setWinner(game.winner);
      setPhase("complete");
      sound(880);
      const entry = {
        names: settingsRef.current.names.slice(0, settingsRef.current.players),
        scores: [...game.scores],
        reps: [...game.repCounts],
        averages: game.averages,
        demo: settingsRef.current.demo,
      };
      saveSession({
        id: `${Date.now()}`,
        at: new Date().toISOString(),
        experience: "arcade",
        exercise: settingsRef.current.mode,
        challenge: "timed",
        personality: settingsRef.current.personality,
        names: entry.names,
        reps: entry.reps,
        qualities: entry.averages.map((value) => Math.round(value)),
        average: entry.averages[0] == null ? null : Math.round(entry.averages[0]),
        consistency: null,
        target: null,
        durationSec: settingsRef.current.duration,
        demo: entry.demo,
      });
      setHistory((old) => {
        const next = [entry, ...old].slice(0, 5);
        try {
          localStorage.setItem("el-history", JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [sound]);
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => {
      engine.current?.tick(performance.now());
      consume();
    }, 80);
    const visibility = () => {
      if (document.hidden) {
        voice.current?.stop();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [phase, consume]);
  useEffect(() => {
    if (phase !== "countdown") return;
    let count = 3;
    sound(440);
    const id = setInterval(() => {
      count--;
      setCountdown(count);
      sound(count === 0 ? 880 : 440);
      if (count === 0) {
        clearInterval(id);
        detectors.current.forEach((d) => d.reset());
        gapStarted.current = 0;
        setPauseText("");
        setFlash(null);
        setMeters([]);
        engine.current?.start(performance.now());
        phaseRef.current = "active";
        setPhase("active");
        consume();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, consume, sound]);
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1700);
    return () => window.clearTimeout(id);
  }, [flash]);
  const overlay = useCallback(() => painted.current, []);
  const onPoses = useCallback(
    (poses: Landmark[][], timestamp: number) => {
      let assigned = tracker.current?.update(poses, timestamp) || [];
      if (registrar.current) {
        const observed = registrar.current.update(poses, timestamp);
        assigned = observed.assigned;
        const key = `${registrar.current.stage}|${observed.readyToConfirm}|${observed.ambiguous}|${observed.message}`;
        if (regKey.current !== key) {
          regKey.current = key;
          setRegMessage(observed.message);
          setRegReady(observed.readyToConfirm);
          setRegAmbiguous(observed.ambiguous);
          setRegStage(registrar.current.stage);
          setEnrolled(registrar.current.stage === "tracking");
        }
        if (
          phaseRef.current === "active" &&
          (registrar.current.stage !== "tracking" || observed.ambiguous)
        ) {
          painted.current = assigned;
          engine.current?.pause(performance.now());
          setPauseText(
            observed.message || "Step apart so both players are fully in frame.",
          );
          consume();
          return;
        }
      }
      painted.current = assigned;
      if (debugRef.current && timestamp - lastDebug.current > 250) {
        lastDebug.current = timestamp;
        setDiagnostics(
          assigned.map(
            (p, i) =>
              `P${i + 1}: ${p ? "tracked" : "missing"} · confidence ${p ? Math.round((p.reduce((s, l) => s + (l.visibility ?? 1), 0) / p.length) * 100) : 0}% · ${detectors.current[i]?.state ?? "waiting"}`,
          ),
        );
      }
      if (phaseRef.current !== "active") return;
      const current = settingsRef.current;
      const missing = assigned
        .slice(0, current.players)
        .map((pose, index) =>
          bodyCovered(pose, current.mode) ? "" : current.names[index],
        )
        .filter(Boolean);
      if (missing.length) {
        if (!gapStarted.current) gapStarted.current = timestamp;
        if (timestamp - gapStarted.current >= 500) {
          engine.current?.pause(performance.now());
          const text = `${missing.join(" and ")}, step back into the frame.`;
          setPauseText((previous) => (previous === text ? previous : text));
        }
      } else {
        gapStarted.current = 0;
        engine.current?.resume(performance.now());
        setPauseText((previous) => (previous ? "" : previous));
      }
      if (!engine.current?.paused) {
        assigned.forEach((pose, i) => {
          for (const event of detectors.current[i]?.update(pose || [], timestamp) ??
            []) {
            if (event.type === "REP_COMPLETED")
              engine.current?.rep(i, performance.now(), {
                form: event.grade.form,
                weakest: event.grade.weakest,
              });
          }
        });
      }
      setMeters(
        detectors.current.map((detector) => ({ ...detector.meters })),
      );
      consume();
    },
    [consume],
  );
  const onStatus = useCallback((message: string, isReady: boolean) => {
    setStatus(message);
    setReady(isReady);
    if (isReady) readySeen.current = performance.now();
  }, []);
  const beginCountdown = useCallback(() => {
    const current = settingsRef.current;
    voice.current?.enqueue(
      `${current.names.slice(0, current.players).join(" versus ")}. Welcome to the ${activity(current.mode)}!`,
      5,
    );
    setAwaitingReturn(false);
    setCountdown(3);
    setPhase("countdown");
  }, []);
  useEffect(() => {
    if (phase !== "calibration") {
      setStartHeld(false);
      return;
    }
    if (ready) {
      setStartHeld(true);
      return;
    }
    const remainingHold = 8000 - (performance.now() - readySeen.current);
    if (remainingHold <= 0) {
      setStartHeld(false);
      return;
    }
    const id = window.setTimeout(() => setStartHeld(false), remainingHold);
    return () => window.clearTimeout(id);
  }, [ready, phase]);
  useEffect(() => {
    if (phase !== "calibration") setAwaitingReturn(false);
  }, [phase]);
  useEffect(() => {
    if (awaitingReturn && ready && phase === "calibration") beginCountdown();
  }, [awaitingReturn, ready, phase, beginCountdown]);
  function prepare() {
    const clean = {
      ...settings,
      names: settings.names.map(
        (n, i) => n.trim().slice(0, 24) || `Player ${i + 1}`,
      ),
    };
    setSettings(clean);
    settingsRef.current = clean;
    try {
      localStorage.setItem("el-settings", JSON.stringify(clean));
    } catch {}
    voice.current?.stop();
    if (voice.current) {
      voice.current.personality = clean.personality;
      voice.current.unlock();
    }
    if (!audio.current) audio.current = new AudioContext();
    void audio.current.resume();
    engine.current = new GameEngine({
      duration: clean.duration,
      players: clean.names.slice(0, clean.players),
    });
    tracker.current = new PlayerTracker(clean.players);
    registrar.current =
      !clean.demo && clean.players === 2 ? new IdentityRegistrar(2) : null;
    regKey.current = "";
    setRegistering(Boolean(registrar.current));
    setRegStage("await-1");
    setEnrolled(clean.demo || clean.players === 1);
    setRegReady(false);
    setRegAmbiguous(false);
    setRegMessage(
      registrar.current
        ? "Player 1, step into the frame alone."
        : "",
    );
    detectors.current = Array.from(
      { length: clean.players },
      () => new ActivityDetector(clean.mode),
    );
    processed.current = 0;
    setScores(Array(clean.players).fill(0));
    setReps(Array(clean.players).fill(0));
    setAverages(Array(clean.players).fill(0));
    setMeters([]);
    setFlash(null);
    setPauseText("");
    gapStarted.current = 0;
    setRemaining(clean.duration);
    setReady(false);
    setStartHeld(false);
    setAwaitingReturn(false);
    readySeen.current = 0;
    setTranscript([]);
    setCaption("The smallest stage. The biggest occasion.");
    setPhase("calibration");
  }
  function reset() {
    voice.current?.stop();
    phaseRef.current = "setup";
    setPhase("setup");
  }
  const inArena = ["calibration", "countdown", "active"].includes(phase);
  return (
    <main>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            voice.current?.stop();
            setPhase("landing");
          }}
          aria-label="Everyday League home"
        >
          <span className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </span>
          EVERYDAY<span className="brand-light">LEAGUE</span>
          <span className="brand-dot">®</span>
        </button>
        <div className="header-right">
          <span className="edition">THE EXTRAORDINARILY ORDINARY</span>
          <span className="live-pill">
            <i /> EL NETWORK
          </span>
        </div>
      </header>
      {phase === "landing" && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span /> WORLD-CLASS COVERAGE. LIVING-ROOM TALENT.
              </div>
              <h1>
                BIG LEAGUE
                <br />
                ENERGY.
                <br />
                <em>
                  EVERYDAY
                  <br />
                  ATHLETES.
                </em>
              </h1>
              <p>
                Your room. Your rivals. Your ridiculously dramatic AI
                sportscaster. Or switch to guided coaching, where control beats
                a pile of sloppy repetitions.
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => setPhase("setup")}>
                  Start Broadcasting <ArrowRight size={19} />
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setCoachStep("setup");
                    setPhase("coach");
                  }}
                >
                  Guided Coach
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setCoachStep("progress");
                    setPhase("coach");
                  }}
                >
                  Progress
                </button>
              </div>
              <div className="hero-meta">
                <span>
                  <Camera size={15} /> Just bring a webcam
                </span>
                <span>
                  <AudioLines size={15} /> Commentary by ElevenLabs
                </span>
              </div>
            </div>
            <div className="hero-art">
              <div className="art-top">
                <span className="live-pill">
                  <i /> LIVE FROM YOUR LIVING ROOM
                </span>
                <span>CH. 001</span>
              </div>
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="giant-type">
                GO
                <br />
                BIG.
              </div>
              <div className="athlete">
                <svg
                  viewBox="0 0 300 360"
                  aria-label="Original abstract athlete illustration"
                >
                  <defs>
                    <linearGradient id="jersey" x2="1" y2="1">
                      <stop stopColor="#dfff00" />
                      <stop offset="1" stopColor="#a8c900" />
                    </linearGradient>
                  </defs>
                  <circle cx="160" cy="63" r="27" fill="#e6b79a" />
                  <path d="M137 49q20-30 45 1l-2-23-40-5z" fill="#191c22" />
                  <path
                    d="M136 99L185 99 207 201 128 208z"
                    fill="url(#jersey)"
                  />
                  <path
                    d="M139 109L96 90 48 35M184 109L224 79 255 26"
                    stroke="#e6b79a"
                    strokeWidth="21"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M145 204L106 260 62 326M187 202L216 258 256 315"
                    stroke="#eceee7"
                    strokeWidth="29"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M48 329L76 335M247 320L276 324"
                    stroke="#dfff00"
                    strokeWidth="18"
                    strokeLinecap="round"
                  />
                  <text
                    x="145"
                    y="161"
                    fill="#172000"
                    fontSize="34"
                    fontWeight="900"
                  >
                    01
                  </text>
                </svg>
              </div>
              <div className="tracking-label">
                <Crosshair size={14} /> MAIN CHARACTER DETECTED
              </div>
              <div className="sample-caption">
                “THE FORM? QUESTIONABLE.
                <br />
                THE COMMITMENT? ABSOLUTE.”<span>YOUR AI COMMENTATOR</span>
              </div>
              <div className="art-bottom">
                <span>
                  ALEX <b>12</b>
                </span>
                <small>VS</small>
                <span>
                  <b>09</b> JORDAN
                </span>
              </div>
            </div>
          </section>
          <div className="ticker">
            <span>NO STADIUM REQUIRED</span>
            <b>✳</b>
            <span>ALL GLORY. ZERO ATHLETIC SCHOLARSHIPS.</span>
            <b>✳</b>
            <span>YOUR EVERYDAY DESERVES A REPLAY</span>
            <b>✳</b>
          </div>
          <section className="features">
            {[
              [
                <Crosshair key="a" />,
                "01 / MOVE",
                "Your body is the controller.",
                "Real-time pose tracking turns complete movements into points.",
              ],
              [
                <AudioLines key="b" />,
                "02 / MAKE SOME NOISE",
                "Every rep gets a storyline.",
                "AI-powered play-by-play with championship-level enthusiasm.",
              ],
              [
                <Trophy key="c" />,
                "03 / CLAIM THE GLORY",
                "Settle absolutely nothing.",
                "Go head-to-head or chase your own personal living-room best.",
              ],
            ].map(([icon, label, title, text], i) => (
              <article key={i}>
                {icon}
                <span>{label}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </section>
        </>
      )}
      {phase === "setup" && (
        <section className="setup-wrap">
          <button className="text-button" onClick={() => setPhase("landing")}>
            <ChevronLeft size={16} /> Back to the network
          </button>
          <div className="eyebrow">THE PRE-GAME SHOW</div>
          <h2>
            MAKE IT <em>OFFICIAL.</em>
          </h2>
          <p className="muted">
            A historic rivalry starts with a few minor details.
          </p>
          <div className="setup-grid">
            <div className="panel settings">
              <label className="field-label">01 / PICK YOUR CHAMPIONSHIP</label>
              <div className="choice-row">
                {(["jumping-jacks", "arm-raises"] as Mode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`choice ${settings.mode === mode ? "selected" : ""}`}
                    onClick={() => setSettings({ ...settings, mode })}
                  >
                    <span>{mode === "jumping-jacks" ? "✳" : "↟"}</span>
                    <strong>
                      {mode === "jumping-jacks"
                        ? "Jumping jacks"
                        : "Arm raises"}
                    </strong>
                    <small>
                      {mode === "jumping-jacks"
                        ? "Full body. Full glory."
                        : "Small space. Huge stakes."}
                    </small>
                  </button>
                ))}
              </div>
              <label className="field-label">02 / THE CONTENDERS</label>
              <div className="segmented">
                {[1, 2].map((players) => (
                  <button
                    key={players}
                    className={settings.players === players ? "selected" : ""}
                    onClick={() => setSettings({ ...settings, players })}
                  >
                    {players === 1 ? "Solo practice" : "Head to head"}
                  </button>
                ))}
              </div>
              <div className="name-row">
                {Array.from({ length: settings.players }, (_, i) => (
                  <label key={i}>
                    PLAYER {i + 1}
                    <input
                      maxLength={24}
                      value={settings.names[i]}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          names: settings.names.map((n, j) =>
                            i === j ? e.target.value : n,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="option-row">
                <label>
                  03 / MATCH LENGTH
                  <select
                    value={settings.duration}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        duration: Number(e.target.value),
                      })
                    }
                  >
                    {[15, 30, 60].map((n) => (
                      <option key={n} value={n}>
                        {n} seconds
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  04 / COMMENTARY
                  <select
                    value={settings.personality}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        personality: e.target.value as Settings["personality"],
                      })
                    }
                  >
                    <option value="hype">The Hype Machine</option>
                    <option value="dry">The Dry Wit</option>
                    <option value="documentary">Nature Documentary</option>
                  </select>
                </label>
              </div>
            </div>
            <aside className="panel match-card">
              <Radio size={26} />
              <span className="eyebrow">YOUR BROADCAST</span>
              <h3>
                THE WORLD
                <br />
                IS <em>ALMOST</em>
                <br />
                WATCHING.
              </h3>
              <p>
                Local arena. No account. No video uploads. Just you and an
                unreasonable amount of glory.
              </p>
              <div className="source-options">
                <label>
                  <input
                    type="radio"
                    name="source"
                    checked={settings.demo}
                    onChange={() => setSettings({ ...settings, demo: true })}
                  />{" "}
                  Demo Mode <small>Synthetic poses · no camera needed</small>
                </label>
                <label>
                  <input
                    type="radio"
                    name="source"
                    checked={!settings.demo}
                    onChange={() => setSettings({ ...settings, demo: false })}
                  />{" "}
                  Live webcam <small>Permission requested on next step</small>
                </label>
              </div>
              <button className="primary" onClick={prepare}>
                {settings.demo ? "Enter Demo Arena" : "Enable Camera"}
                <ArrowRight size={18} />
              </button>
              <small className="privacy">
                Camera footage stays on this device.
              </small>
              <button className="text-button" onClick={() => setPhase("coach")}>
                Switch to guided coach
              </button>
            </aside>
          </div>
          {history.length > 0 && (
            <div className="history">
              <span className="field-label">RECENT LOCAL RESULTS</span>
              {history.map((h, i) => (
                <p key={i}>
                  {h.demo ? "DEMO" : "LIVE"} · {h.names.join(" vs ")} ·{" "}
                  {h.scores.map((score) => score.toFixed(1)).join(" : ")}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      {inArena && (
        <section className="arena">
          <div className="arena-heading">
            <div>
              <span className="eyebrow">
                {settings.demo
                  ? "DEMO MODE · SYNTHETIC POSES"
                  : "LIVE CAMERA · LOCAL PROCESSING"}
              </span>
              <h2>{activity(settings.mode)}</h2>
            </div>
            <button className="text-button" onClick={reset}>
              End broadcast
            </button>
          </div>
          <div className="scoreboard">
            <div className="player blue">
              <span>
                PLAYER 01 / {settings.players === 1 ? "PRACTICE" : "HOME"}
              </span>
              <strong>{settings.names[0]}</strong>
              <small className="player-meta">
                {reps[0] ?? 0} reps · form {Math.round(averages[0] ?? 0)}
              </small>
              <b>{(scores[0] ?? 0).toFixed(1)}</b>
            </div>
            <div className="timer">
              <span>
                {pauseText
                  ? "CLOCK PAUSED"
                  : phase === "active"
                    ? "ON THE CLOCK"
                    : "PRE-GAME"}
              </span>
              <b className={remaining <= 10 ? "urgent" : ""}>
                {Math.floor(Math.ceil(remaining) / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(Math.ceil(remaining) % 60).toString().padStart(2, "0")}
              </b>
              <small>{settings.duration} SECOND CHAMPIONSHIP</small>
            </div>
            {settings.players === 2 ? (
              <div className="player red">
                <span>PLAYER 02 / AWAY</span>
                <strong>{settings.names[1]}</strong>
                <small className="player-meta">
                  {reps[1] ?? 0} reps · form {Math.round(averages[1] ?? 0)}
                </small>
                <b>{(scores[1] ?? 0).toFixed(1)}</b>
              </div>
            ) : (
              <div className="solo-card">
                <Trophy />
                <span>YOU VS. YOUR LEGEND</span>
              </div>
            )}
          </div>
          {phase === "active" && (
            <div className="form-meters">
              {Array.from({ length: settings.players }, (_, index) => {
                const meter = meters[index];
                return (
                  <div
                    key={index}
                    className={index === 0 ? "meter-player blue" : "meter-player red"}
                  >
                    <span>{settings.names[index]}</span>
                    <Meter
                      label="Arms"
                      value={meter?.arms ?? null}
                      best={meter?.bestArms ?? 0}
                    />
                    {settings.mode === "jumping-jacks" && (
                      <Meter
                        label="Feet"
                        value={meter?.feet ?? null}
                        best={meter?.bestFeet ?? 0}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="broadcast-grid">
            <div className="camera-shell">
              <VisionStage
                demo={settings.demo}
                players={settings.players}
                mode={settings.mode}
                running={phase === "active"}
                overlay={registering ? overlay : undefined}
                onPoses={onPoses}
                onStatus={onStatus}
              />
              <div className="camera-top">
                <span className="live-pill">
                  <i />
                  {settings.demo ? "DEMO FEED" : "LIVE FEED"}
                </span>
                <span className="tracking-tag">
                  <Crosshair size={13} />
                  {ready ? "TRACKING READY" : "ACQUIRING PLAYERS"}
                </span>
              </div>
              {phase === "calibration" && (
                <div className="calibration-overlay">
                  <div className="calibration-card">
                    <Crosshair size={30} />
                    <h3>
                      {settings.demo
                        ? "Welcome to the demo arena."
                        : "Find your starting position."}
                    </h3>
                    <p>
                      {settings.demo
                        ? "Scripted athletes. Real detectors, scores, and commentary."
                        : settings.mode === "jumping-jacks"
                          ? "Keep your full body visible, including hands and feet. Start with arms down and feet together."
                          : "Keep shoulders, hips, and hands visible. Start with both arms down."}
                    </p>
                    <p className="status-text" role="status">
                      {status}
                    </p>
                    {regMessage && <p>{regMessage}</p>}
                    <small>
                      Player 1 starts on the left of the preview. Live
                      two-player matches register one person at a time. Stay in
                      your lane after that.
                    </small>
                    {registering && !enrolled && (
                      <button
                        className="secondary"
                        disabled={!regReady}
                        onClick={() => {
                          if (!registrar.current?.confirm(performance.now()))
                            return;
                          const stage = registrar.current?.stage ?? "await-1";
                          setRegStage(stage);
                          setEnrolled(stage === "tracking");
                          setRegReady(false);
                        }}
                      >
                        Confirm{" "}
                        {regStage === "await-2"
                          ? settings.names[1]
                          : settings.names[0]}
                      </button>
                    )}
                    <button
                      className="primary"
                      disabled={
                        awaitingReturn || !enrolled || (!ready && !startHeld)
                      }
                      onClick={() => {
                        if (ready) beginCountdown();
                        else setAwaitingReturn(true);
                      }}
                    >
                      {awaitingReturn ? "Step back in to start" : "Start match"}{" "}
                      {!awaitingReturn && <ArrowRight size={18} />}
                    </button>
                    {!settings.demo && (
                      <small>
                        {awaitingReturn
                          ? "Click saved. The countdown starts when your full starting position is back in frame."
                          : "Leaning out to reach this button keeps it clickable for a few seconds."}
                      </small>
                    )}
                    {!settings.demo && settings.players === 2 && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setSettings({ ...settings, players: 1 });
                          reset();
                        }}
                      >
                        Switch to one-player setup
                      </button>
                    )}
                  </div>
                </div>
              )}
              {pauseText && phase === "active" && (
                <div className="pause-overlay" role="status">
                  <span>CLOCK PAUSED</span>
                  <b>{pauseText}</b>
                </div>
              )}
              {phase === "active" && (
                <div
                  className={
                    settings.mode === "arm-raises" ? "live-cues live-cues-pair" : "live-cues"
                  }
                >
                  {settings.mode === "arm-raises" && (
                    <div className="pace-overlay">
                      {Array.from({ length: settings.players }, (_, index) => {
                        const pace = meters[index]?.pace;
                        const showing =
                          pace === "fast" || pace === "slow" || pace === "good";
                        const label = showing
                          ? settings.players === 1
                            ? paceCopy(pace)
                            : `${settings.names[index]} · ${paceCopy(pace)}`
                          : "Pace good";
                        return (
                          <span
                            key={index}
                            className={showing ? `pace-live pace-${pace}` : "pace-live cue-held"}
                            aria-hidden={!showing}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div
                    className={flash ? "rep-flash" : "rep-flash cue-held"}
                    role={flash ? "status" : undefined}
                    aria-hidden={!flash}
                  >
                    {flash
                      ? `${(flash.points ?? 0).toFixed(1)} · ${flash.weakest}`
                      : "0.0 · pace"}
                  </div>
                </div>
              )}
              {phase === "countdown" && (
                <div className="countdown-overlay">
                  <span>THE GLORY STARTS IN</span>
                  <b key={countdown}>{countdown}</b>
                </div>
              )}
              <div className="caption">
                <span>
                  <AudioLines size={16} /> THE COMMENTARY BOX
                </span>
                <p aria-live="polite">{caption}</p>
              </div>
            </div>
            <aside className="panel commentary">
              <div className="commentary-title">
                <AudioLines />
                <h3>On the mic</h3>
                <button
                  aria-label={muted ? "Unmute commentary" : "Mute commentary"}
                  onClick={() => {
                    setMuted(!muted);
                    if (voice.current) voice.current.muted = !muted;
                  }}
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
              <span className="voice-status">{voiceStatus}</span>
              <div className="transcript">
                {transcript.length ? (
                  transcript.map((line, i) => (
                    <p key={i}>
                      <span>EL / PLAY-BY-PLAY</span>
                      {line}
                    </p>
                  ))
                ) : (
                  <p>The booth is ready. Greatness is pending.</p>
                )}
              </div>
              <div className="tracking-info">
                <span>
                  <i />
                  {status}
                </span>
                <small>
                  A full open-and-close scores 1 plus form. Leaving the frame pauses the clock for both players.
                  {regAmbiguous
                    ? " Scoring is paused while the players are ambiguous."
                    : ""}
                </small>
              </div>
              {regAmbiguous && (
                <button
                  className="secondary"
                  onClick={() => {
                    registrar.current?.reregister();
                    setEnrolled(false);
                    setPhase("calibration");
                  }}
                >
                  Re-register players
                </button>
              )}
            </aside>
          </div>
          <button
            className="text-button debug-toggle"
            onClick={() => setDebug(!debug)}
          >
            <Settings2 size={14} />
            {debug ? "Hide" : "Show"} tracking diagnostics
          </button>
          {debug && (
            <pre className="debug">
              {diagnostics.join("\n")}
              {"\n"}
              {eventLog}
            </pre>
          )}
        </section>
      )}
      {phase === "complete" && (
        <section className="results">
          <div className="eyebrow">
            {settings.demo ? "DEMO MODE · " : " "}THE FINAL WHISTLE
          </div>
          <Trophy className="result-trophy" size={62} />
          <h2>
            {settings.players === 1
              ? "YOUR SCORE."
              : winner === null
                ? "SHARED GLORY."
                : `${settings.names[winner ?? 0].toUpperCase()} WINS.`}
          </h2>
          <p className="result-subtitle">
            A monumental day in exceptionally minor sports.
          </p>
          <div className="final-scores">
            {scores.map((score, i) => (
              <div key={i} className={i === 0 ? "blue" : "red"}>
                <span>{settings.names[i]}</span>
                <b>{score.toFixed(1)}</b>
                <small>
                  {reps[i] ?? 0} REPS · FORM {Math.round(averages[i] ?? 0)}
                  {settings.demo ? " · SYNTHETIC" : ""}
                </small>
              </div>
            ))}
          </div>
          <div className="recap panel">
            <span className="eyebrow">THE POST-GAME REPORT</span>
            <p>
              {reps.reduce((a, b) => a + b, 0)} complete reps, scored{" "}
              {scores.reduce((a, b) => a + b, 0).toFixed(1)}.{" "}
              {settings.duration} seconds of commitment.{" "}
              {settings.players === 1
                ? "That's your score for this session."
                : winner === null
                  ? "The judges have declared a tie. The furniture remains neutral."
                  : `${settings.names[winner ?? 0]} takes the crown. The trophy is imaginary. The bragging rights are very real.`}
            </p>
          </div>
          <div className="result-actions">
            <button className="primary" onClick={prepare}>
              <RotateCcw size={18} /> Run it back
            </button>
            <button className="secondary" onClick={reset}>
              Change the lineup
            </button>
          </div>
          <details>
            <summary>Broadcast transcript ({transcript.length})</summary>
            {transcript.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </details>
        </section>
      )}
      {phase === "coach" && (
        <CoachFlow
          key={coachStep}
          initialStep={coachStep}
          onExit={() => setPhase("landing")}
          onArcade={() => setPhase("setup")}
        />
      )}
      <footer>
        <span>
          EVERYDAY LEAGUE <b>© 2026</b>
        </span>
        <span>
          <CircleHelp size={13} /> Experimental scores. Not a medical device.
        </span>
        <span>BUILT FOR THE UNREMARKABLE.</span>
      </footer>
    </main>
  );
}

function paceCopy(pace: "fast" | "slow" | "good" | "idle") {
  if (pace === "fast") return "Too fast";
  if (pace === "slow") return "Too slow";
  if (pace === "good") return "Pace good";
  return "";
}

function Meter({
  label,
  value,
  best,
}: {
  label: string;
  value: number | null;
  best: number;
}) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="meter">
      <span>{value == null ? `${label} not visible` : label}</span>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${width}%` }} />
        <i
          className="meter-best"
          style={{ left: `${Math.max(0, Math.min(100, best))}%` }}
        />
      </div>
    </div>
  );
}
