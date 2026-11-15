# Everyday League — implementation handoff

Updated November 14, 2026 (America/Los_Angeles). Local MVP for SanD Hacks. Project directory: `/Users/alinamaor/Documents/SanD Hacks/everyday-league`.

This is a movement-coaching prototype. It is not a medical device, does not diagnose injuries, and does not measure clinical recovery. Exercise scores are approximate and depend on camera visibility.

## Critical restrictions

- Git exists in this directory. Branch `feature/gamified-coaching` tracks `origin/feature/gamified-coaching`. The coaching commit `87230c5` is already on GitHub. The later ElevenLabs voice work is **uncommitted**. Do not commit, push, force-push, delete branches, or deploy unless the user explicitly asks.
- `main` tracks `origin/main`. Do not overwrite that history.
- Local implementation, dependency installation, servers, and testing are authorized.
- Keep this file current at the end of subsequent work. Read `AGENTS.md` before continuing.

## Run locally

```sh
cd '/Users/alinamaor/Documents/SanD Hacks/everyday-league'
npm install
npm run dev
```

Open http://localhost:3000. `http://127.0.0.1:3000` is also allowed in dev (`allowedDevOrigins`). Using the other host used to load the page with no JavaScript, so buttons did nothing. Hard-refresh after a dev-server restart.

- **Start Training** opens Guided Coach: demonstration, calibration, form scoring, and one of four coaches.
- **Arcade Championship** keeps the timed rep-count broadcast as a secondary mode.
- **Quality board** opens `/leaderboard`, ranked by average form quality.
- Demo Mode needs neither a camera nor API keys. Live webcam is requested only after the user chooses it and continues.

Real voice is configured in gitignored `.env.local` (`ELEVENLABS_API_KEY` plus one voice ID per personality). Restart Next.js after any env change. The key is not in client code, docs, or git. Missing credentials or an upstream failure use labeled browser speech and captions. Camera frames never leave the browser. Only the commentary sentence and personality name are sent to ElevenLabs.

Shared board: quality rankings are the primary board. A coach row ranks by average form quality, then consistency, then earlier submission. It must match the exercise, the 4/6/8 repetition goal, a target within 10%, and scoring version `form-v1`. `db/migrations/002_scoring_version.sql` adds nullable `scoring_version`. Older rows with a null version stay in the table and are not mixed into that board. Arcade 15/30/60 rankings remain available from the same page by choosing a timed exercise. Demo Mode cannot be posted.

## What changed on November 14

The arcade path is still the landing headline, `GameEngine`, `ActivityDetector`, `PlayerTracker`, and the original three Playwright journeys in `tests/broadcast.spec.ts`.

### Guided Movement Coach

`src/components/coach-flow.tsx` adds a second experience without copying the vision or voice stack:

Choose exercise → watch an original looping skeleton → Demo Mode or webcam → calibrate → countdown → scored set → results → progress.

Exercises: controlled arm raises, and conservative squats. Squats say explicitly that depth from one camera is approximate.

Coaches: Supportive, Drill Sergeant (opt-in, and it tells the user to stop if they feel pain), Hype Commentator, Calm Instructor. Arcade personalities `hype`, `dry`, and `documentary` still work. Drill Sergeant is not the arcade default.

Challenges: Practice, Form (highest average quality), Consistency (steadiness against that player's own target), Personal Best (only compared with similar on-device sessions). The timed arcade match remains separate.

Pause, resume, and stop are on the coached session. Stopping is always available. Motivational copy does not tell anyone to push through pain.

### Form scoring

`src/lib/form.ts` is independent of React. `FormEvaluator.update(landmarks, timestamp)` tracks a full down → raise/lower → return cycle and returns a structured repetition:

- valid or not
- scored or withheld
- confidence
- quality 0–100, or `null` when the camera cannot support a score
- control, selected-target range, observable alignment, consistency
- one coaching sentence and explicit reasons

Default weights, documented as prototype defaults: control 40%, target range 30%, alignment 20%, consistency 10%. Missing metrics are omitted and the remaining weights are renormalized. Control and range are both required before a quality number is produced.

Range reaches 100 at the selected target and does not increase if the person goes past it. Fast repetitions stay valid but score lower on control. Low-confidence or occluded repetitions are unscored rather than given a fake low grade.

`RangeCalibrator` records one or two comfortable practice peaks. The user can keep 60–100% of that observed range. They can also accept a labeled conservative fallback (about 65° of arm elevation or 30° of knee flexion) if a practice rep is not available. That fallback is not described as their medical maximum.

### Identity

`src/lib/identity.ts` registers player 1 alone, then player 2 as a separate pose, then tracks by torso position. It does not use faces. Overlap or an unclear swap suspends scoring and asks for re-registration. A short disappearance keeps the previous anchors.

Live two-player arcade matches use this registration before **Start match**. Demo Mode and solo arcade still use the original lane tracker so the existing broadcast tests can start immediately. Guided demo athletes are labeled synthetic and are not presented as a live registration.

### Demo motion, history, leaderboard

`src/lib/demo-motion.ts` drives the coach demo. Player 1 is a slower controlled cycle. Player 2 is a faster, less even cycle. The same form engine scores both, and tests require the controlled average to win even with fewer repetitions.

`src/lib/progress.ts` stores up to 30 sessions in `el-sessions` (exercise, time, coach, reps, qualities, average, consistency, target, duration, demo flag). Personal bests compare only coach sessions with the same exercise, challenge, demo flag, and a target within 10%. Achievements: Five Quality Reps, Smooth Operator, Consistency King, Personal Best, Comeback Champion. Arcade results still use `el-history` and also append a timed session record.

`POST /api/leaderboard` rejects synthetic sessions, validates nickname, score, consent, and challenge settings with Zod, and rate-limits per process (10 inserts a minute). It stores a public nickname, exercise, challenge, experience, rep count, duration or goal, target, average, and consistency. No poses, video, or skeletal landmarks. A submission key blocks a second insert of the same result. Practice and personal-best can be saved but are not championship categories.

`GET /api/leaderboard` returns at most 10 rows for one comparable category. The primary form board ranks average quality, then consistency, then earlier `created_at`, and only rows tagged `form-v1`. Arcade still ranks counted reps for 15, 30, or 60 seconds. Consistency-challenge boards still rank the consistency score. Coach boards require the goal and a range target within 10%.

The page at `/leaderboard` is linked from the landing header, arcade setup, arcade results, and Guided Coach setup and results. It polls every 20 seconds while the tab is visible, and **Refresh** loads immediately. Changing exercise, challenge, or duration/goal updates that category only.

### Championship categories

| Exercise | Challenge | Grouping | Rank |
| --- | --- | --- | --- |
| Jumping jacks | Arcade Championship | 15s, 30s, or 60s | Reps |
| Arm raises | Arcade Championship | 15s, 30s, or 60s | Reps |
| Controlled arm raises | Form | Goal 4, 6, or 8 and a range target near 45°, 60°, 75°, or 90° | Average quality |
| Controlled arm raises | Consistency | Same goal and range | Consistency |
| Controlled squats | Form | Goal 4, 6, or 8 and a range target near 25°, 35°, 45°, or 60° | Average quality |
| Controlled squats | Consistency | Same goal and range | Consistency |

Not public boards: Practice, Personal Best, Demo Mode, unknown durations, missing goals, missing consistency, and targets outside the 10% window. A live Neon read on November 14 found one existing production row: arcade arm raises, 15 seconds, 3 reps. It was not modified. Temporary verification rows were deleted by submission key.

### How to check a top 10 locally

```sh
cd '/Users/alinamaor/Documents/SanD Hacks/everyday-league'
npm run dev
```

Open http://127.0.0.1:3000/leaderboard. The page opens on controlled arm raises, Form, 4 quality reps. Switch the exercise to arcade **Arm raises** and 15 seconds to see the existing production score. Other quality categories stay empty until a live, non-demo session is submitted.

## Coaching session context

`src/lib/session-context.ts` follows a set from measured reps only: exercise, coach, scored-rep count, recent qualities, average, trend, control/range/alignment notes, rushed flag, confidence, and the last few comments. The decision engine speaks for a first scored rep, a measured improvement, a repeated measured fault, a three-rep strong streak, a lost camera, or the recap. A flat next rep stays silent. The same cue is not repeated. Tracking and unscored feedback stay deterministic.

`POST /api/coach` can turn that JSON into one or two sentences when `NEON_AI_GATEWAY_BASE_URL` plus `NEON_AI_GATEWAY_TOKEN`, or `OPENAI_API_KEY`, is set. No key is required. Without one, the route returns `fallback: true` and the app speaks the deterministic line. The model never receives landmarks or frames. A reply that invents an injury, says to push through pain, or ignores the measured fact is discarded. The browser drops a reply if another scored rep has already happened. Optional model name: `COACH_LLM_MODEL` (default `gpt-4o-mini`).

Results show average, scored reps, consistency, change across the set, the strongest measured label, and the measured suggestion. The selected coach speaks that recap.

ElevenLabs stays on `eleven_flash_v2_5`. One calm cue was also generated with `eleven_turbo_v2_5` (HTTP 200, 238ms versus 369ms for Flash). Audible quality was not compared, so Flash remains the default. Set `ELEVENLABS_MODEL_ID` to try Turbo. Speed is 0.96 for Sarah, 0.96 for Callum, 1.05 for Charlie, and 0.88 for River. Style exaggeration is still not sent.

## Verification on November 14, later session

- `npm test`: 64 tests passed, including session silence, repeated-cue suppression, stale-line rejection, quality tie-break by consistency, scoring-version isolation, and LLM fallback.
- `npm run typecheck` and `npm run lint` passed.
- `npm run build` passed. `/api/coach` is dynamic.
- Playwright: 6 tests passed. The arcade restart test failed once while the dev server reloaded, then passed on its own rerun.
- A live Neon insert/read still passes, and `scoring_version` exists on the production branch. Temporary rows were deleted.
- No new webcam session was run. The optional LLM path was not called against a live model because no gateway or OpenAI key is configured.

## Known limitations

1. Form scores are heuristics. They are not a clinical grade. Squats are the less reliable of the two exercises because a single webcam cannot see depth well. Alignment is withheld when both sides are not visible.
2. Calibration uses the range the camera just saw. It does not know whether that range is medically appropriate.
3. Live two-player identity is spatial. Crossing or standing on top of each other pauses scoring. Demo Mode does not prove live registration.
4. Coach demo trajectories are deterministic scripts, not recorded humans. A higher demo score does not prove real-world accuracy.
5. Pose inference stays on the main thread. The camera loop now targets about 12 frames per second at 640×480, and the demo loop about 30. The court background is cached, skeleton shadows are off, and scoreboard React updates happen when the score or displayed second changes rather than on every frame. A worker is still not used.
6. The match and coach timers do not have a shared pause model. Arcade still has no pause. Coach pause freezes demo motion and stops feeding the evaluator; the clock subtracts paused time.
7. Speech rate limiting, the audio cache, and the leaderboard limiter are process-local. There is no login. Browser-submitted scores can be forged. Do not treat the board as officiated.
8. `npm audit` was not re-run. The previous handoff reported 7 moderate findings in the dev ESLint chain. Do not claim a clean audit.
9. ElevenLabs voice wiring, Neon setup, and the championship leaderboard after `87230c5` are uncommitted. `.env.local` is gitignored and must stay that way.
10. The public board is self-reported. Movement scoring still happens in the browser. There is no account and no server-side pose check.
11. Optional model dialogue is implemented but not live-tested. This environment has no `OPENAI_API_KEY` or Neon AI Gateway token, so coaching speech is deterministic.
12. `eleven_turbo_v2_5` returned audio faster than Flash on one short cue. It was not listened to, so it is not the default.

## Next recommended steps

1. Run `npm run test:e2e` on the demo machine, outside any sandbox, and watch the guided demo through results. Confirm the controlled athlete’s average is visibly higher than a two-player rushed demo.
2. On a real camera, compare ten slow arm raises with the score, then try a deliberately fast set. Adjust thresholds only from those failures and add a fixture for each change.
3. Repeat with a conservative squat. Expect more “unscored” results when feet or hips leave the frame.
4. Register two people without crossing. Confirm preview-left stays player 1 after MediaPipe reorders poses.
5. Restart the app and finish a **non-demo** session. On the results screen press **Submit to Leaderboard**, enter a nickname, check the public-sharing box, and submit. **View my ranking** opens the matching top 10. Demo Mode has no submit button. Open `/leaderboard` to switch exercise, challenge, and duration or repetition goal.
6. Commit and push only after the user asks. Do not deploy until they ask, and do not expose the TTS or leaderboard routes publicly without authentication.

## File map

- `src/app/page.tsx`: arcade UI, live two-player registration, entry to coach and progress.
- `src/components/coach-flow.tsx`: guided session, calibration, results.
- `src/components/exercise-demo.tsx`: original looping skeleton.
- `src/components/vision-stage.tsx`: webcam, arcade demo, coach demo, ghost overlay.
- `src/lib/engine.ts`: arcade detectors, lane tracker, timed match.
- `src/lib/form.ts`, `geometry.ts`: quality scoring and pose math.
- `src/lib/identity.ts`: sequential registration.
- `src/lib/demo-motion.ts`: controlled versus rushed synthetic motion.
- `src/lib/progress.ts`: device history, personal bests, achievements.
- `src/app/page.tsx`: landing starts training; arcade setup remains.
- `src/lib/session-context.ts`: measured session memory and the speak-or-stay-quiet decision.
- `src/app/api/coach/route.ts`: optional model dialogue. Deterministic lines remain the fallback.
- `src/lib/commentary.ts`: arcade lines, coach previews, and the non-overlapping queue.
- `src/lib/voices.ts`: verified premade voice IDs and delivery settings.
- `src/app/api/tts/route.ts`: server-only ElevenLabs synthesis. Browser speech remains the fallback.

## ElevenLabs coaches

Verified on this account against `eleven_flash_v2_5` on November 14. Each preview returned HTTP 200 and a real MP3 (`ID3` header). Style exaggeration is not sent: Flash accepts the field but does not apply Multilingual v2 style. Stability, similarity, speed, and speaker boost are the controls that this model uses. Env vars in gitignored `.env.local` still override these IDs.

| Coach | Voice | ID | Stability | Similarity | Speed |
| --- | --- | --- | --- | --- | --- |
| Supportive Coach | Sarah, warm American | `EXAVITQu4vr4xnSDxMaL` | 0.55 | 0.82 | 0.96 |
| Drill Sergeant | Callum, gravelly American | `N2lVS1w4EtoT3dr4eOWO` | 0.28 | 0.90 | 0.90 |
| Hype Commentator | Charlie, energetic Australian | `IKne3meq5aSn9XLyUdCD` | 0.32 | 0.74 | 1.14 |
| Calm Instructor | River, relaxed neutral | `SAz9YHcvj6GT2YYXdXww` | 0.82 | 0.86 | 0.84 |

Arcade announcers stay George (`JBFqnCBsd6RMkjVDRZzb`) and Daniel (`onwK4e9ZLuTAKqWW03F9`).

Commentary is personality-specific. Supportive celebrates improvement and does not scold a miss. Drill roasts sloppy control, including the “invisible bees” line, and never says to train through pain. Hype calls a 90-plus rep like a living-room championship. Calm stays short and slow. Speech still waits for a meaningful event: an unscored rep, a score under 72, a score of 90 or more, an 8-point improvement, a steady or uneven run of three, lost tracking, or the start and end of the set. Ordinary middle reps stay on screen. Clips cache, playback does not overlap, mute still captions only, and a provider failure uses browser speech.

### Hear the four coaches

```sh
cd '/Users/alinamaor/Documents/SanD Hacks/everyday-league'
npm run dev
```

Restart the dev server after the voice-id change. Open http://127.0.0.1:3000, choose **Guided Coach**, pick a coach, and press **Preview this coach**. Repeat for Supportive, Drill Sergeant, Hype Commentator, and Calm Instructor. The status line should say `ElevenLabs · live voice`. Captions appear when the clip starts. If the key is removed or the service fails, the same button uses browser speech and the status says `Demo voice`.

The live check synthesized those four preview lines. It did not play them through the browser speakers. Flash cannot match a fully acted performance, so the wording and pace do more of the personality work than style exaggeration would.
- `src/components/leaderboard-submit.tsx`: opt-in public score form.
- `src/app/leaderboard/page.tsx`: SanD Hacks Championship top 10.
- `src/lib/boards.ts`: comparable categories and ranking rules.
- `src/lib/db.ts`: pooled Neon client.
- `db/migrations/001_leaderboard_championship.sql`: nullable consistency, goal, and indexes.
- `tests/broadcast.spec.ts`: original arcade journeys. `tests/coach.spec.ts`: guided demo journey. `tests/leaderboard.spec.ts`: championship filters and a phone layout. All three passed in this session.
