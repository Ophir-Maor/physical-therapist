"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ACTIVITIES,
  CHALLENGE_LABELS,
  activityKey,
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
};

type Payload = {
  enabled?: boolean;
  entries?: Entry[];
  unit?: string;
  message?: string;
};

const initial =
  ACTIVITIES.find((item) => item.experience === "coach") ?? ACTIVITIES[0];

function place(rank: number) {
  if (rank === 1) return "1ST";
  if (rank === 2) return "2ND";
  if (rank === 3) return "3RD";
  return `#${rank}`;
}

export default function HeroBoard() {
  const [activity, setActivity] = useState<Activity>(initial);
  const [challenge, setChallenge] = useState<BoardChallenge>(initial.challenges[0]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [unit, setUnit] = useState("average quality");
  const [note, setNote] = useState("Loading the board…");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      exercise: activity.exercise,
      experience: activity.experience,
      challenge,
    });
    try {
      const response = await fetch(`/api/leaderboard?${params}`);
      const body = (await response.json()) as Payload;
      if (body.enabled === false || !response.ok) {
        setEntries([]);
        setNote(body.message || "The board could not be loaded.");
        return;
      }
      const next = body.entries ?? [];
      setEntries(next);
      setUnit(body.unit || (challenge === "reps" ? "reps" : "average quality"));
      setNote(next.length === 0 ? "No scores in this category yet." : "");
    } catch {
      setEntries([]);
      setNote("The board could not be loaded.");
    } finally {
      setLoaded(true);
    }
  }, [activity, challenge]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  const scoreOf = (entry: Entry) =>
    challenge === "reps" ? entry.reps : entry.average;
  const boardHref = `/leaderboard?exercise=${activity.exercise}&experience=${activity.experience}&challenge=${challenge}`;

  return (
    <aside className="hero-board" aria-label="Current leaderboard">
      <div className="eyebrow">
        <span /> RIGHT NOW
      </div>
      <h2>
        THE <em>BOARD.</em>
      </h2>
      <div className="champ-filters hero-board-filters">
        <label>
          Exercise
          <select
            aria-label="Leaderboard exercise"
            value={activityKey(activity)}
            onChange={(event) => {
              const next =
                ACTIVITIES.find((item) => activityKey(item) === event.target.value) ??
                ACTIVITIES[0];
              setActivity(next);
              setChallenge(
                next.challenges.includes(challenge) ? challenge : next.challenges[0],
              );
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
            aria-label="Leaderboard challenge"
            value={challenge}
            onChange={(event) => setChallenge(event.target.value as BoardChallenge)}
          >
            {activity.challenges.map((item) => (
              <option key={item} value={item}>
                {CHALLENGE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="champ-unit">
        Ranking unit: <b>{unit}</b>
      </p>
      {note && (
        <p className="hero-board-note" role="status">
          {note}
          {loaded && note.startsWith("The board could not") && (
            <>
              {" "}
              <button className="text-button" type="button" onClick={() => void load()}>
                Retry
              </button>
            </>
          )}
        </p>
      )}
      {entries.length > 0 && (
        <ol className="champ-list">
          {entries.map((entry) => (
            <li key={`${entry.rank}-${entry.nickname}-${entry.createdAt}`}>
              <b>{place(entry.rank)}</b>
              <span>{entry.nickname}</span>
              <strong>
                {scoreOf(entry)}
                <small>{unit}</small>
              </strong>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
      <a className="text-button hero-board-link" href={boardHref}>
        Open full board
      </a>
    </aside>
  );
}
