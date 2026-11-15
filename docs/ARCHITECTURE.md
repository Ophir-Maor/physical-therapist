# Architecture

## Runtime and data flow

The Next.js App Router application is local-first and has two experiences on one vision and voice stack.

- Arcade (`src/app/page.tsx`): phases `landing`, `setup`, `calibration`, `countdown`, `active`, `complete`. `GameEngine` still owns `idle`, `active`, and `complete`. A rep is one counted open-and-close. Its points are `1 + form/100`, so a perfect rep is worth 2. The higher total wins.
- Guided coach (`src/components/coach-flow.tsx`): setup, demonstration, registration or calibration, countdown, active set, results, progress. `FormEvaluator` owns movement phase and quality. A scored rep is a complete cycle whose landmarks were clear enough to measure.

```text
Webcam or synthetic landmarks
        → screen-space poses
        → PlayerTracker (demo and solo arcade)
          or IdentityRegistrar (live two-player, and live coach)
        → ActivityDetector (arcade) or FormEvaluator (coach)
        → scores or quality events
        → commentary templates → priority queue
        → POST /api/tts → ElevenLabs MP3
        → playback + captions
Optional: POST /api/leaderboard with nickname and score only
```

Camera frames never enter a server route. Commentary is template text from structured events. There is no LLM. Coach copy is selected from the measured feedback string and the chosen personality.

## Arcade scoring

`src/lib/broadcast-score.ts` grades a completed arcade cycle. The open is worth 50 and the return is worth 35. On jumping jacks those split in half between the arms and the feet, and the lower wrist caps the arms. Arm raises put the whole 50 and 35 on the arms. A clean upright torso is the other 15. Lean can deduct all 15 of those points. Missing hips skip that deduction.

The old open and close gates still decide that a cycle happened. Just clearing them scores about 40 form, worth 1.4 points. Wrists at head height, feet about twice shoulder width, and a full return score 100. An arm raise also loses up to 30 form points when the lift and lower take 600 ms or less. A raise that takes 1.2 seconds or longer keeps those points. Jumping jacks are not paced. A one-frame blink keeps the cycle. The open is accepted as soon as the smoothed pose crosses the line, and the grade uses the best open in that attempt. Noise that never holds a return still scores nothing.

The match cannot start until the required body is in frame. If either player stays incomplete for about half a second, `GameEngine` pauses time and scoring for both. It resumes when both are fully back. The screen names who has to step in. Live meters follow the smoothed pose in both directions and keep a mark at the best of the attempt. The flash is the number that is added. The announcer mentions form only in the final call.

Guided Coach does not use this grade.

## Form scoring

`FormEvaluator` samples shoulder-to-wrist elevation for arm raises and image-plane knee flexion for squats. Signals are lightly smoothed. Speed samples ignore gaps longer than 450 ms so a pause or a dropped frame is not treated as a jerk.

A repetition is the held return to the start after a real rise. Prototype weights are control 40%, selected-target range 30%, observable alignment 20%, and consistency 10%. Reaching the selected target scores 100 on range. Exceeding it does not score higher. If either arm or either leg is not confident, alignment is null instead of invented. If required landmarks disappear for more than 500 ms mid-rep, the attempt is aborted with a reason and `quality: null`.

Squat confidence is capped and every scored squat carries a note that depth is approximate. These thresholds are not clinical.

`RangeCalibrator` stores practice peaks and lets the UI choose 60–100% of the observed peak. Fallback targets are 65° (arms) and 30° (squat flexion), labeled as fallbacks.

`pickWinner("form")` compares average quality and can prefer fewer smooth reps over more rushed ones. `pickWinner("consistency")` compares how tightly scored peaks cluster around that player’s own target. Unscored reps are excluded. Scores within one point are a tie.

## Identity

`IdentityRegistrar` enrolls one confident torso, then a second torso at least 0.18 screen-widths away, then keeps those anchors. Assignment does not trust MediaPipe’s pose order. If the two people are closer than 0.14, or the two possible assignments are nearly equal, scoring is suspended. Anchors survive a short absence (about two seconds). This is not biometric identity. `PlayerTracker` remains the demo and solo arcade assigner.

## Persistence and the optional board

`el-settings` and `el-history` are unchanged in shape. `el-sessions` stores the richer coach and arcade records, capped at 30, with malformed rows dropped. Personal bests require the same exercise, challenge, demo flag, and a target within 10%.

`/api/leaderboard` uses `@neondatabase/serverless` only when `DATABASE_URL` is set. It creates this table if needed:

```sql
CREATE TABLE IF NOT EXISTS leaderboard (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nickname text NOT NULL,
  exercise text NOT NULL,
  challenge text NOT NULL,
  average integer NOT NULL,
  reps integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

The handler validates a strict object, refuses `demo: true`, and allows 8 posts per minute per process. That is a local demo guard, not authentication or cheat prevention.

## Vision

`VisionStage` requests webcam access only after the user enters the webcam arena. It imports MediaPipe client-side, loads `/mediapipe/wasm` and `/mediapipe/pose_landmarker_lite.task`, selects VIDEO mode with one or two poses, attempts GPU, and falls back to CPU if creation fails. A requestAnimationFrame loop limits inference to approximately 20 Hz and skips unchanged video frames. Inference is synchronous on the main thread; there is no Web Worker pipeline.

Video and canvas both use `object-fit: contain` and mirror horizontally. Canvas dimensions follow the actual video dimensions. Returned landmarks are converted into mirrored screen coordinates for identity assignment; overlay drawing accounts for that coordinate conversion. Separate spatial trackers provide score assignment and persistent overlay colors. Camera tracks, animation frames, and model resources are disposed when the arena unmounts. Device, permission, loading, and inference failures expose status messages.

Synthetic mode never opens a camera or initializes MediaPipe. Its fixture athletes cycle at different fixed periods and pass through the same detectors. Demo results are labeled synthetic. This tests the pipeline, not pose-estimation quality.

## Recognition and identity

`ActivityDetector.update(landmarks, timestamp)` returns repetition events. The timestamp unit is milliseconds. A complete closed → open → closed sequence is required. The open is accepted on the frame the smoothed pose crosses the line. A missing frame of about 200 ms does not clear that attempt. The return still has to hold for 100 ms, the cycle has to last at least 500 ms, and landmarks missing for 700 ms reset the attempt. Confidence default is 0.55 and smoothing is 0.55.

Jumping jacks require wrists above shoulders and feet spread for the open position, wrists lowered and feet together for closed, with a basic upright torso/legs check. Arm-raise cycles use shoulders and wrists. The arcade start gate also requires hips so lean can be judged. Neutral poses do not score. These are heuristic counters and do not certify exercise technique.

`PlayerTracker` considers torso center and proximity to previous positions; it is independent of MediaPipe array order. In two-player mode initial screen lanes are left/right. After a two-second absence it falls back to the original lane anchor. There is no appearance or biometric identity tracking. Crossings and long occlusions remain ambiguous, so players must remain in their lanes.

## Match rules

`GameEngine` receives duration in seconds and monotonic timestamp arguments in milliseconds. `tick` derives remaining time from elapsed time rather than decrementing a counter. `rep` ticks first, rejecting repetitions at or beyond the buzzer, and adds `1 + form/100`. Milestones follow the rep count. Event payloads snapshot scores, rep counts, and form averages. Winner is the higher point total, or `null` for a versus draw. Solo completion selects player zero. Reset clears match state and events.

If either arcade player is out of frame for about half a second, `pause` stops time and scoring for both. `resume` continues from the remaining time. A lost camera therefore holds the clock until both required bodies are back. The browser may throttle background tabs; elapsed-time calculation catches up when execution resumes. Guided Coach still has its own manual pause.

## Commentary and API

`commentaryFor` maps structured game events into hype, dry, or documentary templates. Routine reps only generate lines at five-rep milestones. `CommentaryQueue` deduplicates, caps pending work at eight items, sorts priorities, expires routine calls after seven seconds, and clears pending commentary for priority-ten completion announcements. `BroadcastVoice` serializes playback, spaces starts, aborts obsolete requests/playback, keeps a bounded in-memory audio cache, and initializes playback from a click.

Captions update when MP3 playback starts; they are phrase-level, not word-aligned. Failure switches to explicitly labeled browser speech/captions, with a temporary API cooldown. Intro and final commentary may interrupt or expire according to priority. Browser speech and autoplay still require hands-on validation.

`POST /api/tts` uses the official ElevenLabs SDK on the Node server, returns a buffered MP3, and never exposes credentials. It validates a strict Zod object with 1–400 text characters and a supported personality, bounds request body length, rejects mismatched Origin headers, limits configured synthesis calls to 30/minute per process, and aborts upstream requests after eight seconds. Missing key returns 503; upstream failure returns 502; rate limiting returns 429. These are local-demo protections, not public-service authentication, distributed rate limiting, or deployment hardening.

## Persistence and testing

`el-settings` stores selected setup values; `el-history` stores the five most recent results in localStorage. No footage or audio is stored there. Audio caching lasts only for the current voice instance. Browser storage errors are caught.

Vitest exercises pure detectors, spatial association, game events, commentary priorities, and mocked API behavior. Playwright covers the labeled synthetic user journey. Neither substitutes for physical camera tests or credentialed ElevenLabs requests. See `STATUS.md` for actual run results.
