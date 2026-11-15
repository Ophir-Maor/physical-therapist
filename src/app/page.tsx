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
import HeroBoard from "@/components/hero-board";
import LeaderboardSubmit from "@/components/leaderboard-submit";
import {
  ActivityDetector,
  GameEngine,
  PlayerTracker,
  type Landmark,
  type Mode,
} from "@/lib/engine";
import { BroadcastVoice, coachCommentary, commentaryFor } from "@/lib/commentary";
import { COACHES, type CoachId } from "@/lib/exercises";
import { IdentityRegistrar } from "@/lib/identity";
import { saveSession } from "@/lib/progress";

type Phase =
  | "landing"
  | "setup"
  | "calibration"
  | "countdown"
  | "active"
  | "handoff"
  | "complete"
  | "coach";
type Settings = {
  names: string[];
  players: number;
  goal: number;
  mode: Mode;
  personality: "hype" | "dry" | "documentary";
  demo: boolean;
};
const defaults: Settings = {
  names: ["Alex", "Jordan"],
  players: 2,
  goal: 5,
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
  const [coachPersonality, setCoachPersonality] = useState<CoachId>("supportive");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [scores, setScores] = useState([0, 0]);
  const [winner, setWinner] = useState<number | null>(null);
  const [turn, setTurn] = useState(0);
  const [eventLog, setEventLog] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState("Preparing the arena…");
  const [ready, setReady] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState(
    "Voice initializes when you start",
  );
  const [caption, setCaption] = useState(
    "Small movements. Unreasonable stakes.",
  );
  const [landingPreviewed, setLandingPreviewed] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  const [muted, setMuted] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [history, setHistory] = useState<
    { names: string[]; scores: number[]; demo: boolean }[]
  >([]);
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
  const regKey = useRef("");
  const turnRef = useRef(0);
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
        [5, 10, 15].includes(saved.goal) &&
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
    for (const event of game.events.slice(processed.current)) {
      const s = settingsRef.current;
      const text = commentaryFor(
        event,
        s.names.slice(0, s.players),
        s.personality,
      );
      if (text)
        voice.current?.enqueue(
          text,
          event.type === "MATCH_FINISHED"
            ? 10
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
    if (
      settingsRef.current.players === 2 &&
      phaseRef.current === "active" &&
      game.state === "active" &&
      game.scores[turnRef.current] >= game.goal
    ) {
      phaseRef.current = "handoff";
      setPhase("handoff");
      setCaption(
        `${settingsRef.current.names[turnRef.current]} is done. One person at a time.`,
      );
    }
    if (game.state === "complete" && phaseRef.current !== "complete") {
      phaseRef.current = "complete";
      setWinner(game.winner);
      setPhase("complete");
      sound(880);
      const entry = {
        names: settingsRef.current.names.slice(0, settingsRef.current.players),
        scores: [...game.scores],
        demo: settingsRef.current.demo,
      };
      saveSession({
        id: `${Date.now()}`,
        at: new Date().toISOString(),
        experience: "arcade",
        exercise: settingsRef.current.mode,
        challenge: "reps",
        personality: settingsRef.current.personality,
        names: entry.names,
        reps: entry.scores,
        qualities: [],
        average: null,
        consistency: null,
        target: null,
        durationSec: 0,
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
        engine.current?.start(performance.now());
        phaseRef.current = "active";
        setPhase("active");
        consume();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, consume, sound]);
  const overlay = useCallback(() => painted.current, []);
  const onPoses = useCallback(
    (poses: Landmark[][], timestamp: number) => {
      let assigned = tracker.current?.update(poses, timestamp) || [];
      if (settingsRef.current.players === 2) {
        const pose = assigned[0] ?? null;
        assigned = [null, null];
        assigned[turnRef.current] = pose;
      }
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
      assigned.forEach((pose, i) => {
        for (const event of detectors.current[i].update(
          pose || [],
          timestamp,
        )) {
          if (event.type === "REP_COMPLETED")
            engine.current?.rep(i, performance.now());
        }
      });
      consume();
    },
    [consume],
  );
  const onStatus = useCallback((message: string, isReady: boolean) => {
    setStatus(message);
    setReady(isReady);
  }, []);
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
    turnRef.current = 0;
    setTurn(0);
    engine.current = new GameEngine({
      goal: clean.goal,
      players: clean.names.slice(0, clean.players),
      sequential: clean.players === 2,
    });
    tracker.current = new PlayerTracker(clean.players === 2 ? 1 : clean.players);
    registrar.current = null;
    regKey.current = "";
    setRegistering(Boolean(registrar.current));
    setRegStage("await-1");
    setEnrolled(true);
    setRegReady(false);
    setRegAmbiguous(false);
    setRegMessage(
      clean.players === 2
        ? `${clean.names[0]} goes first. ${clean.names[1]} steps in after that set.`
        : "",
    );
    detectors.current = Array.from(
      { length: clean.players },
      () => new ActivityDetector(clean.mode),
    );
    processed.current = 0;
    setScores(Array(clean.players).fill(0));
    setReady(false);
    setTranscript([]);
    setCaption("The smallest stage. The biggest occasion.");
    setPhase("calibration");
  }
  function reset() {
    voice.current?.stop();
    phaseRef.current = "setup";
    setPhase("setup");
  }
  const inArena = ["calibration", "countdown", "active", "handoff"].includes(phase);
  function startNextAthlete() {
    turnRef.current = 1;
    setTurn(1);
    detectors.current[1]?.reset();
    setCountdown(3);
    phaseRef.current = "countdown";
    setPhase("countdown");
  }
  useEffect(() => {
    if (phase !== "handoff" || !settings.demo) return;
    const id = window.setTimeout(() => startNextAthlete(), 700);
    return () => window.clearTimeout(id);
  }, [phase, settings.demo]);
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
          <a className="text-button" href="/leaderboard">
            Leaderboard
          </a>
          <span className="edition">THE EXTRAORDINARILY ORDINARY</span>
        </div>
      </header>
      {phase === "landing" && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span /> GUIDED MOVEMENT COACHING
              </div>
              <h1>
                TRAIN THE
                <br />
                <em>REP.</em>
              </h1>
              <p>
                Calibrate a comfortable target, score the quality of the
                movement, and hear a coach respond to what actually changed.
                Rep-count arcade competition is still here when you want it.
              </p>
              <div className="hero-actions">
                <button
                  className="primary"
                  onClick={() => {
                    setCoachStep("setup");
                    setPhase("coach");
                  }}
                >
                  Start Training <ArrowRight size={19} />
                </button>
                <button className="secondary" onClick={() => setPhase("setup")}>
                  Arcade Championship
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
                <a className="text-button" href="/leaderboard">
                  Quality board
                </a>
              </div>
              <div className="choice-row hero-coaches">
                {COACHES.map((coach) => (
                  <div key={coach.id} className="choice coach-choice-card">
                    <button
                      type="button"
                      className="coach-choice-main"
                      onClick={() => {
                        voice.current?.stop();
                        setCoachPersonality(coach.id);
                        setCoachStep("setup");
                        setPhase("coach");
                      }}
                    >
                      <strong>{coach.name}</strong>
                      <small>{coach.detail}</small>
                    </button>
                    <button
                      type="button"
                      className="coach-intro-button"
                      aria-label={`Hear ${coach.voiceName}, the ${coach.name}, introduce themselves`}
                      onClick={() => {
                        setLandingPreviewed(true);
                        voice.current?.unlock();
                        voice.current!.personality = coach.id;
                        voice.current?.preview(
                          coachCommentary({
                            type: "preview",
                            personality: coach.id,
                            name: "Player",
                          }),
                        );
                      }}
                    >
                      <Volume2 size={14} /> Hear {coach.voiceName}
                    </button>
                  </div>
                ))}
              </div>
              {landingPreviewed && (
                <div className="hero-voice-preview" aria-live="polite">
                  <AudioLines size={15} />
                  <div>
                    <p>{caption}</p>
                    <span>{voiceStatus}</span>
                  </div>
                </div>
              )}
              <div className="hero-meta">
                <span>
                  <Camera size={15} /> Just bring a webcam
                </span>
                <span>
                  <AudioLines size={15} /> Commentary by ElevenLabs
                </span>
              </div>
            </div>
            <HeroBoard />
          </section>
          <div className="ticker">
            <span>NO STADIUM REQUIRED</span>
            <b>✳</b>
            <span>ALL GLORY. ZERO ATHLETIC SCHOLARSHIPS.</span>
            <b>✳</b>
            <span>YOUR EVERYDAY DESERVES A REPLAY</span>
            <b>✳</b>
          </div>
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
                    {players === 1 ? "Solo practice" : "One at a time"}
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
                  03 / REP GOAL
                  <select
                    value={settings.goal}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        goal: Number(e.target.value),
                      })
                    }
                  >
                    {[5, 10, 15].map((n) => (
                      <option key={n} value={n}>
                        First to {n} reps
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
              <a className="text-button" href="/leaderboard">
                SanD Hacks Championship
              </a>
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
                  {h.scores.join(" : ")}
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
                PLAYER 01 /{" "}
                {settings.players === 1
                  ? "PRACTICE"
                  : turn === 0
                    ? "NOW"
                    : "DONE"}
              </span>
              <strong>{settings.names[0]}</strong>
              <b>{scores[0]}</b>
            </div>
            <div className="score-focus">
              <span>
                {phase === "handoff"
                  ? "SWITCH ATHLETES"
                  : phase === "active"
                    ? "RACE TO THE TARGET"
                    : "PRE-GAME"}
              </span>
              <b>{settings.goal}</b>
              <small>COMPLETE REPS TO WIN</small>
            </div>
            {settings.players === 2 ? (
              <div className="player red">
                <span>PLAYER 02 / {turn === 1 ? "NOW" : "NEXT"}</span>
                <strong>{settings.names[1]}</strong>
                <b>{scores[1]}</b>
              </div>
            ) : (
              <div className="solo-card">
                <Trophy />
                <span>YOU VS. YOUR LEGEND</span>
              </div>
            )}
          </div>
          <div className="broadcast-grid">
            <div className="camera-shell">
              <VisionStage
                demo={settings.demo}
                players={settings.players === 2 ? 1 : settings.players}
                demoPlayer={turn}
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
                      {settings.players === 2
                        ? `${settings.names[0]} takes the whole frame first. ${settings.names[1]} steps in only after that set.`
                        : "One person in frame. The camera follows whoever is practicing."}
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
                      disabled={!ready || !enrolled}
                      onClick={() => {
                        voice.current?.enqueue(
                          `${settings.names.slice(0, settings.players).join(" versus ")}. Welcome to the ${activity(settings.mode)}!`,
                          5,
                        );
                        setCountdown(3);
                        setPhase("countdown");
                      }}
                    >
                      Start match <ArrowRight size={18} />
                    </button>
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
              {phase === "handoff" && (
                <div className="calibration-overlay">
                  <div className="calibration-card">
                    <h3>{settings.names[1]} is up.</h3>
                    <p>
                      {settings.names[0]} finished with {scores[0]} reps. Step
                      in alone. The camera tracks one person at a time.
                    </p>
                    {!settings.demo && (
                      <button className="primary" onClick={startNextAthlete}>
                        Start {settings.names[1]} <ArrowRight size={18} />
                      </button>
                    )}
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
                  Counted reps require a full closed → open → closed cycle.
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
            {winner === null
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
                <b>{score}</b>
                <small>
                  VERIFIED CYCLES{settings.demo ? " · SYNTHETIC" : ""}
                </small>
              </div>
            ))}
          </div>
          <div className="recap panel">
            <span className="eyebrow">THE POST-GAME REPORT</span>
            <p>
              {scores.reduce((a, b) => a + b, 0)} complete reps.{" "}
              {winner === null
                ? "The judges have declared a tie. The furniture remains neutral."
                : `${settings.names[winner ?? 0]} takes the crown. The trophy is imaginary. The bragging rights are very real.`}
            </p>
          </div>
          <LeaderboardSubmit
            demo={settings.demo}
            experience="arcade"
            exercise={settings.mode}
            exerciseLabel={activity(settings.mode)}
            challenge="reps"
            challengeLabel="Rep championship"
            average={null}
            reps={scores[winner ?? 0] ?? 0}
            target={null}
            durationSec={0}
            goalReps={settings.goal}
            suggestedName={settings.names[winner ?? 0] || settings.names[0]}
          />
          <div className="result-actions">
            <button className="primary" onClick={prepare}>
              <RotateCcw size={18} /> Run it back
            </button>
            <button className="secondary" onClick={reset}>
              Change the lineup
            </button>
            <a className="text-button" href="/leaderboard">
              Championship board
            </a>
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
          key={`${coachStep}-${coachPersonality}`}
          initialStep={coachStep}
          initialPersonality={coachPersonality}
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
