"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ACTIVITIES,
  ARCADE_DURATIONS,
  CHALLENGE_LABELS,
  COACH_GOALS,
  activityKey,
  findActivity,
  type Activity,
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
  notice?: string;
  tieBreak?: string;
  place?: { rank: number | null; inTop10: boolean } | null;
};

function nearestTarget(activity: Activity, requested: number | null) {
  if (!activity.targets.length) return null;
  if (requested == null) return activity.targets[0];
  return activity.targets.reduce((best, target) =>
    Math.abs(target - requested) < Math.abs(best - requested) ? target : best,
  );
}

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
  const requestedDuration = Number(params.get("duration"));
  const duration = ARCADE_DURATIONS.includes(requestedDuration as 15 | 30 | 60)
    ? (requestedDuration as 15 | 30 | 60)
    : 30;
  const requestedGoal = Number(params.get("goal"));
  const goal = COACH_GOALS.includes(requestedGoal as 4 | 6 | 8)
    ? (requestedGoal as 4 | 6 | 8)
    : 4;
  const requestedTarget = Number(params.get("target"));
  const target =
    nearestTarget(
      activity,
      Number.isFinite(requestedTarget) && requestedTarget > 0 ? requestedTarget : null,
    ) ?? activity.targets[0] ?? null;
  const submission = params.get("submission");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(window.location.search);
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
    if (activity.experience === "arcade") params.set("duration", String(duration));
    else {
      params.set("goal", String(goal));
      if (target != null) params.set("target", String(target));
    }
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
  }, [activity, challenge, duration, goal, target, submission]);

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
  const unit = data?.unit || (challenge === "timed" ? "reps" : challenge === "consistency" ? "consistency" : "quality points");
  const scoreOf = (entry: Entry) =>
    challenge === "timed" ? entry.reps : challenge === "consistency" ? entry.consistency : entry.average;
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
          {activity.experience === "arcade" ? (
            <label>
              Duration
              <select
                aria-label="Duration"
                value={duration}
                onChange={(event) => update({ duration: event.target.value })}
              >
                {ARCADE_DURATIONS.map((item) => (
                  <option key={item} value={item}>
                    {item} seconds
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Repetition goal
                <select
                  aria-label="Repetition goal"
                  value={goal}
                  onChange={(event) => update({ goal: event.target.value })}
                >
                  {COACH_GOALS.map((item) => (
                    <option key={item} value={item}>
                      {item} quality reps
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Range target
                <select
                  aria-label="Range target"
                  value={nearestTarget(activity, target) ?? ""}
                  onChange={(event) => update({ target: event.target.value })}
                >
                  {activity.targets.map((item) => (
                    <option key={item} value={item}>
                      about {item}°
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button className="secondary" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <p className="champ-unit">
          Ranking unit: <b>{unit}</b>
          {activity.experience === "arcade"
            ? ` · ${activity.label} · ${duration}s`
            : ` · ${activity.label} · ${goal} reps · about ${nearestTarget(activity, target)}°`}
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
        <p className="disclaimer">{data?.notice}</p>
      </section>
    </main>
  );
}
