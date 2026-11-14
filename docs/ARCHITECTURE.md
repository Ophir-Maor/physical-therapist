# Architecture

## Runtime and data flow

The Next.js App Router application is local-first. `src/app/page.tsx` owns presentation phases (`landing`, `setup`, `calibration`, `countdown`, `active`, `complete`) and browser settings. The separate `GameEngine` owns deterministic match states (`idle`, `active`, `complete`). Calibration and the three-second countdown occur before `GameEngine.start()`.

```text
Webcam → MediaPipe VIDEO inference ─┐
                                  ├→ screen-space poses → PlayerTracker
Synthetic demo fixture ────────────┘                       ↓
                                               per-player ActivityDetector
                                                          ↓
                                                  GameEngine.rep/tick
                                                          ↓
                                      scores + typed events + results
                                                          ↓
                             commentary templates → priority queue
                                                          ↓
                                     POST /api/tts → ElevenLabs MP3
                                                          ↓
                                     browser playback + caption
                                      (explicit fallback on failure)
```

Camera data never enters the server route. The optional LLM design from the original brief is not implemented: all commentary prose uses templates selected by actual game events and announcer personality.

## Vision

`VisionStage` requests webcam access only after the user enters the webcam arena. It imports MediaPipe client-side, loads `/mediapipe/wasm` and `/mediapipe/pose_landmarker_lite.task`, selects VIDEO mode with one or two poses, attempts GPU, and falls back to CPU if creation fails. A requestAnimationFrame loop limits inference to approximately 20 Hz and skips unchanged video frames. Inference is synchronous on the main thread; there is no Web Worker pipeline.

Video and canvas both use `object-fit: contain` and mirror horizontally. Canvas dimensions follow the actual video dimensions. Returned landmarks are converted into mirrored screen coordinates for identity assignment; overlay drawing accounts for that coordinate conversion. Separate spatial trackers provide score assignment and persistent overlay colors. Camera tracks, animation frames, and model resources are disposed when the arena unmounts. Device, permission, loading, and inference failures expose status messages.

Synthetic mode never opens a camera or initializes MediaPipe. Its fixture athletes cycle at different fixed periods and pass through the same detectors. Demo results are labeled synthetic. This tests the pipeline, not pose-estimation quality.

## Recognition and identity

`ActivityDetector.update(landmarks, timestamp)` returns repetition events. The timestamp unit is milliseconds. A complete, held closed → open → closed sequence is required. Defaults include confidence 0.55, EMA smoothing 0.55, phase hold 100 ms, minimum cycle 500 ms, and reset after 700 ms of missing input. Shoulder-width ratios normalize wrist and ankle thresholds; geometry/timing settings can be overridden with the optional constructor configuration.

Jumping jacks require wrists above shoulders and feet spread for the open position, wrists lowered and feet together for closed, with a basic upright torso/legs check. Arm raises use shoulders and wrists only. Neutral poses do not score. These are heuristic counters and do not certify exercise technique.

`PlayerTracker` considers torso center and proximity to previous positions; it is independent of MediaPipe array order. In two-player mode initial screen lanes are left/right. After a two-second absence it falls back to the original lane anchor. There is no appearance or biometric identity tracking. Crossings and long occlusions remain ambiguous, so players must remain in their lanes.

## Match rules

`GameEngine` receives duration in seconds and monotonic timestamp arguments in milliseconds. `tick` derives remaining time from elapsed time rather than decrementing a counter. `rep` ticks first, rejecting repetitions at or beyond the buzzer. Event payloads snapshot scores; types cover start, reps, five-rep milestones, lead changes, ties, halftime, final ten seconds, and completion. Winner is a player index or `null` for a versus draw. Solo completion selects player zero. Reset clears match state and events.

UI timers refresh independently from pose inference, so a lost camera does not stop match time. The browser may throttle background tabs; elapsed-time calculation catches up when execution resumes. There is no pause/resume feature.

## Commentary and API

`commentaryFor` maps structured game events into hype, dry, or documentary templates. Routine reps only generate lines at five-rep milestones. `CommentaryQueue` deduplicates, caps pending work at eight items, sorts priorities, expires routine calls after seven seconds, and clears pending commentary for priority-ten completion announcements. `BroadcastVoice` serializes playback, spaces starts, aborts obsolete requests/playback, keeps a bounded in-memory audio cache, and initializes playback from a click.

Captions update when MP3 playback starts; they are phrase-level, not word-aligned. Failure switches to explicitly labeled browser speech/captions, with a temporary API cooldown. Intro and final commentary may interrupt or expire according to priority. Browser speech and autoplay still require hands-on validation.

`POST /api/tts` uses the official ElevenLabs SDK on the Node server, returns a buffered MP3, and never exposes credentials. It validates a strict Zod object with 1–400 text characters and a supported personality, bounds request body length, rejects mismatched Origin headers, limits configured synthesis calls to 30/minute per process, and aborts upstream requests after eight seconds. Missing key returns 503; upstream failure returns 502; rate limiting returns 429. These are local-demo protections, not public-service authentication, distributed rate limiting, or deployment hardening.

## Persistence and testing

`el-settings` stores selected setup values; `el-history` stores the five most recent results in localStorage. No footage or audio is stored there. Audio caching lasts only for the current voice instance. Browser storage errors are caught.

Vitest exercises pure detectors, spatial association, game events, commentary priorities, and mocked API behavior. Playwright covers the labeled synthetic user journey. Neither substitutes for physical camera tests or credentialed ElevenLabs requests. See `STATUS.md` for actual run results.
