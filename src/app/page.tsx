"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, AudioLines, Camera, Volume2, Zap } from "lucide-react";
import CoachFlow from "@/components/coach-flow";
import HeroBoard from "@/components/hero-board";
import { BroadcastVoice, coachCommentary } from "@/lib/commentary";
import { COACHES, type CoachId } from "@/lib/exercises";

type Phase = "landing" | "coach";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [coachStep, setCoachStep] = useState<"setup" | "progress">("setup");
  const [coachPersonality, setCoachPersonality] = useState<CoachId>("supportive");
  const [voiceStatus, setVoiceStatus] = useState("Voice initializes when you start");
  const [caption, setCaption] = useState("Small movements. Unreasonable stakes.");
  const [landingPreviewed, setLandingPreviewed] = useState(false);
  const voice = useRef<BroadcastVoice | null>(null);

  useEffect(() => {
    voice.current = new BroadcastVoice((text) => {
      setCaption(text);
    }, setVoiceStatus);
    return () => {
      voice.current?.stop();
    };
  }, []);

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
      {phase === "coach" && (
        <CoachFlow
          key={`${coachStep}-${coachPersonality}`}
          initialStep={coachStep}
          initialPersonality={coachPersonality}
          onExit={() => setPhase("landing")}
        />
      )}
      <footer>
        <span>
          EVERYDAY LEAGUE <b>© 2026</b>
        </span>
        <span>Experimental scores. Not a medical device.</span>
        <span>BUILT FOR THE UNREMARKABLE.</span>
      </footer>
    </main>
  );
}
