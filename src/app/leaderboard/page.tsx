"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ACTIVITIES,
  CHALLENGE_LABELS,
  activityKey,
  findActivity,
  type BoardChallenge,
} from "@/lib/boards";

type Entry = {
  nickname: string;
  reps: number;
  average: number | null;
  consistency: number | null;
  createdAt: string;
  rank: number;
  yours?: boolean;
};

type Payload = {
  enabled?: boolean;
  entries?: Entry[];
  unit?: string;
  message?: string;
  tieBreak?: string;
  place?: { rank: number | null; inTop10: boolean } | null;
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeQuery(params: URLSearchParams) {
  const next = `${window.location.pathname}?${params}`;
  window.history.replaceState(null, "", next);
  listeners.forEach((listener) => listener());
}

export default function ChampionshipBoard() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = useMemo(() => new URLSearchParams(search), [search]);
    const activity =
    findActivity(params.get("exercise") || "arm-raises", params.get("experience") || "coach") ??
    ACTIVITIES.find((item) => item.experience === "coach") ??
    ACTIVITIES[0];
  const requestedChallenge = params.get("challenge");
  const challenge = activity.challenges.includes(requestedChallenge as BoardChallenge)
    ? (requestedChallenge as BoardChallenge)
    : activity.challenges[0];
  const submission = params.get("submission");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(window.location.search);
    next.delete("target");
    next.delete("goal");
    next.delete("duration");
    if (!next.get("exercise")) {
      next.set("exercise", activity.exercise);
      next.set("experience", activity.experience);
      next.set("challenge", challenge);
    }
    for (const [key, value] of Object.entries(patch)) next.set(key, value);
    writeQuery(next);
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      exercise: activity.exercise,
      experience: activity.experience,
      challenge,
    });
    if (submission) params.set("submission", submission);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/leaderboard?${params}`);
      const body = (await response.json()) as Payload;
      if (!response.ok && response.status !== 200) {
        setError(body.message || "The championship board could not be loaded.");
      }
      setData(body);
      if (body.enabled === false) setError(body.message || "The board is unavailable.");
    } catch {
      setError("The championship board could not be loaded.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activity, challenge, submission]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 120);
    return () => window.clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  const entries = data?.entries ?? [];
  const unit = data?.unit || (challenge === "reps" ? "reps" : "average quality");
  const scoreOf = (entry: Entry) =>
    challenge === "reps" ? entry.reps : entry.average;
  const outside =
    submission && data?.place && data.place.rank != null && !data.place.inTop10
      ? data.place.rank
      : null;

  return (
    <main className="championship">
      <header className="topbar">
        <Link className="brand" href="/">
          EVERYDAY<span className="brand-light">LEAGUE</span>
        </Link>
        <Link className="text-button" href="/">
          Back to the network
        </Link>
      </header>
      <section className="champ-wrap">
        <div className="eyebrow">SAND HACKS</div>
        <h1>
          SAND HACKS <em>CHAMPIONSHIP</em>
        </h1>
        <p className="muted">
          Top 10 by movement quality. Consistency breaks ties. Scores are experimental, not a clinical grade.
          {data?.tieBreak ? ` ${data.tieBreak}` : ""}
        </p>
        <div className="champ-filters">
          <label>
            Exercise
            <select
              aria-label="Exercise"
              value={activityKey(activity)}
              onChange={(event) => {
                const next =
                  ACTIVITIES.find((item) => activityKey(item) === event.target.value) ??
                  ACTIVITIES[0];
                update({
                  exercise: next.exercise,
                  experience: next.experience,
                  challenge: next.challenges.includes(challenge)
                    ? challenge
                    : next.challenges[0],
                });
              }}
            >
              {ACTIVITIES.map((item) => (
                <option key={activityKey(item)} value={activityKey(item)}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Challenge
            <select
              aria-label="Challenge"
              value={challenge}
              onChange={(event) => update({ challenge: event.target.value })}
            >
              {activity.challenges.map((item) => (
                <option key={item} value={item}>
                  {CHALLENGE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <p className="champ-unit">
          Ranking unit: <b>{unit}</b>
          {activity.experience === "arcade"
            ? ` · ${activity.label}`
            : ` · ${activity.label}`}
        </p>
        {outside && (
          <p className="board-note" role="status">
            Your score is saved at #{outside}. It is outside this top 10.
          </p>
        )}
        {error && (
          <p className="board-note" role="status">
            {error}{" "}
            <button className="text-button" type="button" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
        {loading && <p className="muted">Loading the board…</p>}
        {!loading && !error && entries.length === 0 && (
          <div className="panel champ-empty">
            <h2>No scores in this category yet.</h2>
            <p>Finish a matching live session and submit it. Demo Mode stays off this board.</p>
          </div>
        )}
        {!loading && entries.length > 0 && (
          <ol className="champ-list">
            {entries.map((entry) => (
              <li
                key={`${entry.rank}-${entry.nickname}-${entry.createdAt}`}
                className={`place-${entry.rank} ${entry.yours ? "yours" : ""}`}
              >
                <b>{entry.rank === 1 ? "1ST" : entry.rank === 2 ? "2ND" : entry.rank === 3 ? "3RD" : `#${entry.rank}`}</b>
                <span>{entry.nickname}</span>
                <strong>
                  {scoreOf(entry)}
                  <small>{unit}</small>
                </strong>
                <time>{new Date(entry.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
