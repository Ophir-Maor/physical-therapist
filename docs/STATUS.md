# Everyday League — implementation handoff

Updated November 14, 2026 (America/Los_Angeles). Local MVP for SanD Hacks. Project directory: `/Users/alinamaor/Documents/SanD Hacks/everyday-league`.

This is a movement-coaching prototype. It is not a medical device, does not diagnose injuries, and does not measure clinical recovery. Exercise scores are approximate and depend on camera visibility.

## Critical restrictions

- Git now exists in this directory. Branch `feature/gamified-coaching` was created from `main` (`20cdded`, “Initial Everyday League project”). The coaching work is **uncommitted**. Do not commit, push, force-push, delete branches, or deploy unless the user explicitly asks.
- `main` tracks `origin/main`. Do not overwrite that history.
- Local implementation, dependency installation, servers, and testing are authorized.
- Keep this file current at the end of subsequent work. Read `AGENTS.md` before continuing.

## Run locally

```sh
cd '/Users/alinamaor/Documents/SanD Hacks/everyday-league'
npm install
npm run dev
```

Open http://localhost:3000.

- **Start Broadcasting** keeps the original timed arcade (jumping jacks or arm raises, rep count, three announcer personalities).
- **Guided Coach** is the quality-scored practice flow.
- **Progress** opens device-local session history.
- Demo Mode needs neither a camera nor API keys. Live webcam is requested only after the user chooses it and continues.

Optional real voice: copy `.env.example` to `.env.local`, set `ELEVENLABS_API_KEY`, and restart Next.js. Optional per-personality voice IDs include `SUPPORTIVE`, `DRILL`, and `CALM` in addition to the original three. Missing credentials use labeled browser speech and captions. Camera frames never leave the browser.

Optional shared board: set `DATABASE_URL` to a Neon Postgres connection string and restart. Without it, `GET /api/leaderboard` returns `{ enabled: false }` and scores stay in `localStorage`. The route creates `leaderboard` if the database is reachable. Do not put that URL in a `NEXT_PUBLIC_` variable.

## Broadcast scoring — November 14, later session

Arcade matches now score form instead of adding 1 per rep. Guided Coach is unchanged.

- Each completed open-and-close is worth `1 + form/100` (perfect = 2). The higher total wins.
- Form is 50 open, 35 return, and up to 15 for an upright torso. Jumping jacks split the open and the return evenly between arms and feet. The lower wrist caps the arm score. A barely legal rep is about 40 form (1.4 points). Full range is 100.
- A brief landmark blink still counts, graded from the smoothed peak. Leaving the frame for about half a second pauses the clock and scoring for both players until both are fully back.
- The broadcast screen keeps its layout and adds live arm and foot meters, a best-this-attempt mark, a rep flash (`1.4 · feet`), and a scoreboard line with total, reps, and average form. The announcer says the form average only in the final call.
- Arcade arm raises now need shoulders, hands, and hips before Start match. Coach arm raises still need shoulders and hands.
- Arm raises lose up to 30 form points when the lift and lower finish in 600 ms or less. The flash can read `pace`. A raise of 1.2 seconds or longer keeps the pace points. Jumping jacks are not paced.
- Solo practice results say "YOUR SCORE." and the final call says "Your score is …". Head-to-head matches still name a winner. Two-player ties still say "SHARED GLORY."
- During an arm raise, the live view shows "Too fast", "Too slow", or "Pace good" on one line in its own box beside the points flash. Both slots stay reserved, so one box disappearing does not move the other. The arm meter box does not change height. Holding still does not show a pace warning.
- After the camera has seen the required body, Start match stays clickable for 8 seconds if the player leans out to reach it. A click while they are out of frame waits, and the countdown starts when they step back in. Confirm keeps the last good registration pose for the same 8 seconds. The in-match pause banner does not capture clicks. Leaving the frame during a match still pauses the clock.

Verification this session:

- `npx vitest run`: 53 tests passed across 7 files. `src/app/api/leaderboard/route.test.ts` did not run because `@neondatabase/serverless` is not installed.
- `npx eslint` passed on the broadcast scoring files. `npx tsc --noEmit` reports only the missing Neon module in `src/app/api/leaderboard/route.ts`.
- Browser, Demo Mode, 15-second jumping jacks: both players scored perfect 2-point reps (for example Alex 10.0 from 5 reps, Jordan 6.0 from 3). The results screen showed the point total, rep count, and form 100, labeled synthetic. The final announcer line was “Alex wins, 5 reps, form 100.” Live meters followed the pose and kept a lime mark at the best of the attempt. A 390px-wide viewport had no horizontal overflow on the results screen or during a live match. The shared pause was not triggered in the browser because the synthetic athletes never leave the frame; the pause behavior is covered by the engine unit test. No physical webcam pass was done.
- Start-button hold: `npx vitest run src/lib/identity.test.ts` passed 5 tests, including a lean-out confirm. Demo Mode still enabled Start match and reached the countdown. The 8-second live-camera hold was not tried on a physical webcam.
- Demo Mode arm raises: the speed box stays left of the points box and shows "Too fast" on one line. Each box's edge stayed fixed while the other appeared and disappeared. Synthetic poses only.

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

`POST /api/leaderboard` rejects synthetic sessions, validates nickname and score, and rate-limits per process. It stores nickname, exercise, challenge, average, and rep count. No poses or video.

## Verification on November 14

Passed in this session:

- `npm test`: **49 tests passed across 7 files**. Includes the original detector, clock, tracker, commentary, and TTS cases, plus form quality versus speed, overshoot, occlusion, low confidence, noise, calibration targets, squat uncertainty, identity registration and overlap, progress and achievements, coach personality safety copy, and leaderboard rejection when Neon is unset.
- `npm run typecheck`: TypeScript passed.
- `npm run lint`: ESLint passed again after the smoothness pass (lower camera rate, cached demo background, no per-frame scoreboard renders, coach phase updates written to the DOM).
- `npm run build`: Webpack production build passed before the smoothness pass. `/` static. `/api/tts` and `/api/leaderboard` dynamic. The production build was not rerun after the smoothness edits.

Not passed here:

- `npm run test:e2e` did **not** run to completion. Playwright’s Chromium process died in the agent sandbox (`bootstrap_check_in` permission denied). `tests/coach.spec.ts` is new and unverified in a browser. The three original broadcast tests were not re-executed successfully in this session.
- The in-editor browser was not available to click through the new flow (tool approval timed out).
- No new physical webcam session and no live ElevenLabs call were run. Earlier manual webcam testing, recorded before this change, does not validate the new quality thresholds or squat geometry.

## Known limitations

1. Form scores are heuristics. They are not a clinical grade. Squats are the less reliable of the two exercises because a single webcam cannot see depth well. Alignment is withheld when both sides are not visible.
2. Calibration uses the range the camera just saw. It does not know whether that range is medically appropriate.
3. Live two-player identity is spatial. Crossing or standing on top of each other pauses scoring. Demo Mode does not prove live registration.
4. Coach demo trajectories are deterministic scripts, not recorded humans. A higher demo score does not prove real-world accuracy.
5. Pose inference stays on the main thread. The camera loop now targets about 12 frames per second at 640×480, and the demo loop about 30. The court background is cached, skeleton shadows are off, and scoreboard React updates happen when the score or displayed second changes rather than on every frame. A worker is still not used.
6. The match and coach timers do not have a shared pause model. Arcade still has no pause. Coach pause freezes demo motion and stops feeding the evaluator; the clock subtracts paused time.
7. Speech rate limiting, the audio cache, and the leaderboard limiter are process-local. There is no login. Browser-submitted scores can be forged. Do not treat the board as officiated.
8. `npm audit` was not re-run. The previous handoff reported 7 moderate findings in the dev ESLint chain. Do not claim a clean audit.
9. Git changes are uncommitted on `feature/gamified-coaching`.

## Next recommended steps

1. Run `npm run test:e2e` on the demo machine, outside any sandbox, and watch the guided demo through results. Confirm the controlled athlete’s average is visibly higher than a two-player rushed demo.
2. On a real camera, compare ten slow arm raises with the score, then try a deliberately fast set. Adjust thresholds only from those failures and add a fixture for each change.
3. Repeat with a conservative squat. Expect more “unscored” results when feet or hips leave the frame.
4. Register two people without crossing. Confirm preview-left stays player 1 after MediaPipe reorders poses.
5. If a Neon URL is available, restart and submit one non-demo score. Confirm synthetic sessions are refused.
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
- `src/lib/commentary.ts`: arcade lines and coach personalities.
- `src/app/api/tts/route.ts`: ElevenLabs, now including the four coach personalities.
- `src/app/api/leaderboard/route.ts`: optional Neon board.
- `tests/broadcast.spec.ts`: original arcade journeys. `tests/coach.spec.ts`: guided demo journey, not yet executed here.
