"use client";

import { useState } from "react";

type Props = {
  demo: boolean;
  experience: "coach" | "arcade";
  exercise: string;
  exerciseLabel: string;
  challenge: string;
  challengeLabel: string;
  average: number | null;
  reps: number;
  target: number | null;
  durationSec: number;
  goalReps?: number | null;
  consistency?: number | null;
  suggestedName: string;
};

export default function LeaderboardSubmit(props: Props) {
  const key = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "00000000-0000-4000-8000-000000000000",
  )[0];
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(props.suggestedName.slice(0, 24));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [place, setPlace] = useState<{ rank: number | null; inTop10: boolean } | null>(null);
  const quality = props.experience === "coach";
  const publicBoard =
    props.challenge === "timed" || props.challenge === "form" || props.challenge === "consistency";
  const canSubmit = quality ? (props.average ?? 0) > 0 && props.reps > 0 : props.reps > 0;
  const rankingHref = (() => {
    const params = new URLSearchParams({
      exercise: props.exercise,
      experience: props.experience,
      challenge: props.challenge,
      submission: key,
    });
    if (props.experience === "arcade") params.set("duration", String(props.durationSec));
    else {
      params.set("goal", String(props.goalReps ?? ""));
      if (props.target != null) params.set("target", String(Math.round(props.target)));
    }
    return `/leaderboard?${params}`;
  })();

  async function submit() {
    if (!consent || busy || submitted) return;
    setBusy(true);
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          exercise: props.exercise,
          challenge: props.challenge,
          experience: props.experience,
          average: quality ? props.average : null,
          reps: props.reps,
          target: quality ? props.target : null,
          durationSec: props.durationSec,
          goalReps: props.goalReps ?? null,
          consistency: props.consistency ?? null,
          submissionKey: key,
          consent: true,
          demo: false,
        }),
      });
      const body = await response.json();
      setNote(body.message || body.error || "The score could not be shared.");
      if (body.submitted) {
        setSubmitted(true);
        setPlace(body.place ?? null);
        setOpen(false);
      }
    } catch {
      setNote("The score could not be shared. It remains on this device.");
    } finally {
      setBusy(false);
    }
  }

  if (props.demo) {
    return (
      <p className="disclaimer" role="status">
        Demo Mode stays on this device. Synthetic results are not accepted on
        the public leaderboard.
      </p>
    );
  }

  return (
    <div className="board-panel">
      {!submitted && (
        <button
          className="primary"
          type="button"
          disabled={!canSubmit}
          onClick={() => setOpen(true)}
        >
          Submit to Leaderboard
        </button>
      )}
      {!canSubmit && !submitted && (
        <p className="disclaimer">
          This session has no public score yet. Finish at least one counted
          repetition first.
        </p>
      )}
      {open && !submitted && (
        <form
          className="panel board-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h3>Share this result</h3>
          <label className="field-label">
            Nickname
            <input
              aria-label="Leaderboard nickname"
              maxLength={24}
              required
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>
          <dl>
            <div>
              <dt>Exercise</dt>
              <dd>{props.exerciseLabel}</dd>
            </div>
            <div>
              <dt>Challenge</dt>
              <dd>{props.challengeLabel}</dd>
            </div>
            <div>
              <dt>{quality ? "Form quality" : "Counted reps"}</dt>
              <dd>{quality ? props.average : props.reps}</dd>
            </div>
            <div>
              <dt>Repetitions</dt>
              <dd>{props.reps}</dd>
            </div>
            {quality && props.target != null && (
              <div>
                <dt>Selected target</dt>
                <dd>{Math.round(props.target)}°</dd>
              </div>
            )}
          </dl>
          <p className="disclaimer">
            {quality
              ? "This board ranks form quality, not how many reps you squeezed in. Only sessions with a similar selected target are compared."
              : "This timed board ranks counted repetitions. It is separate from quality coaching scores."}{" "}
            Scores are experimental and reported by your browser. They are not
            verified competition results. No video or pose data is uploaded.
          </p>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I agree to share this nickname and score on the public leaderboard.
          </label>
          <div className="result-actions">
            <button className="primary" type="submit" disabled={!consent || busy || !nickname.trim()}>
              {busy ? "Submitting…" : "Submit score"}
            </button>
            <button className="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {note && (
        <p role="status" className="board-note">
          {note}
        </p>
      )}
      {submitted && publicBoard && (
        <a className="secondary champ-link" href={rankingHref}>
          {place?.inTop10 ? `View my ranking · #${place.rank}` : "View my ranking"}
        </a>
      )}
      {submitted && place && !place.inTop10 && place.rank && (
        <p className="disclaimer">You are #{place.rank}, outside the top 10 for this category.</p>
      )}
    </div>
  );
}

