# Everyday League — implementation handoff

Updated November 14, 2026 (America/Los_Angeles). Local MVP for SanD Hacks. Project directory: `/Users/alinamaor/Documents/SanD Hacks/everyday-league`.

This is a movement-coaching prototype. It is not a medical device, does not diagnose injuries, and does not measure clinical recovery. Exercise scores are approximate and depend on camera visibility.

## Critical restrictions

- Git exists in this directory. The checked-out branch is `ophir` at `1a179cf`, the same commit as local `main` and `origin/main` (pull request #4). It contains the guided-coaching, contextual voice, quality-leaderboard, rep-only arcade, and split-screen avatar work. `ophir` is one commit ahead of `origin/ophir` (`046c9ec`) because that extra commit is GitHub's merge of this branch into `main`. It has not been pushed. Branch `feature/gamified-coaching` remains at `87230c5`. Do not commit, push, force-push, delete branches, or deploy unless the user explicitly asks.
- `main` matches `origin/main` at `1a179cf`. Do not overwrite that history.
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
- **Arcade Championship** is a first-to-5, 10, or 15 rep-count broadcast as a secondary mode.
- **Quality board** opens `/leaderboard`, ranked by average form quality.
- Demo Mode needs neither a camera nor API keys. Live webcam is requested only after the user chooses it and continues.
- The landing page’s right-hand “GO BIG” illustration is replaced by the live championship board for the selected exercise and challenge. It uses the same `/api/leaderboard` top 10, and **Open full board** keeps that category.
- Guided Coach setup uses dropdowns for coach and challenge. Exercise and player count stay as buttons. Scored reps are a 1–99 number box with up and down controls and the words “quality reps” beside it. The default is 4. The selected coach and challenge each keep one line of detail. The Hear intro button sits 28px above the challenge title. Dropdowns do not keep the lime focus outline after a choice is clicked.
- The merge of `origin` into `Sean` kept the teammate Session Results layout in `src/components/coach-flow.tsx`. Two players get a win, even-set, or stopped heading plus a score-per-rep table. A solo session keeps “Session results”, the quality report, the coaching cue, and the recap. Championship board still uses the outlined Progress button style and opens `/leaderboard`.

Real voice is configured in gitignored `.env.local` (`ELEVENLABS_API_KEY`; voice IDs stay on the built-in Sarah, Callum, Charlie, and River presets unless overridden). Restart Next.js after any env change. On November 14, after adding the key and restarting, short speech requests for supportive, drill, hype, and calm each returned HTTP 200 `audio/mpeg`. Playback through the speakers was not checked. The key is not in client code, docs, or git. Missing credentials or an upstream failure use labeled browser speech and captions. Camera frames never leave the browser. Only the commentary sentence and personality name are sent to ElevenLabs.

Shared board: quality rankings are the primary board. A coach row ranks by the average quality across all scored repetitions, then consistency, then earlier submission. It must match only the exercise, challenge, and scoring version `form-v1`. Calibrated range, selected repetition goal, and completed repetition count are stored as context but do not select a board or affect rank. `db/migrations/002_scoring_version.sql` adds nullable `scoring_version`. Older rows with a null version stay in the table and are not mixed into that board. Arcade boards rank counted reps without duration categories. Demo Mode cannot be posted.

## What changed on November 14

The arcade path is still the landing headline, `GameEngine`, `ActivityDetector`, `PlayerTracker`, and the original three Playwright journeys in `tests/broadcast.spec.ts`.

### Optional coach introductions

Each coach card on the landing page now has a separate, optional **Hear Sarah**, **Hear Callum**, **Hear Charlie**, or **Hear River** control. Listening does not select the coach or start training. The short introduction names the voice, matches the selected personality, includes the movement-safety reminder, and uses the existing ElevenLabs route with the labeled browser-speech fallback. The spoken caption and live/fallback voice status appear below the cards. The coach setup preview uses the same introduction and names the selected voice in its button label.

### Guided Movement Coach

`src/components/coach-flow.tsx` adds a second experience without copying the vision or voice stack:

Choose exercise → watch an original looping skeleton → Demo Mode or webcam → calibrate → countdown → scored set → results → progress.

Exercises: controlled arm raises, and conservative squats. Squats say explicitly that depth from one camera is approximate.

Coaches: Supportive, Drill Sergeant (opt-in, and it tells the user to stop if they feel pain), Hype Commentator, Calm Instructor. Arcade personalities `hype`, `dry`, and `documentary` still work. Drill Sergeant is not the arcade default.

Challenges: Practice, Form (highest average quality), Consistency (steadiness against that player's own target), Personal Best (only compared with similar on-device sessions). The first-to-rep-goal arcade match remains separate.

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

`src/lib/progress.ts` stores up to 30 sessions in `el-sessions` (exercise, recorded date, coach, reps, qualities, average, consistency, target, internal session length, demo flag). Personal bests compare only coach sessions with the same exercise, challenge, demo flag, and a target within 10%. Achievements: Five Quality Reps, Smooth Operator, Consistency King, Personal Best, Comeback Champion. Arcade results still use `el-history` and also append a rep-goal session record.

`POST /api/leaderboard` rejects synthetic sessions, validates nickname, score, consent, and challenge settings with Zod, and rate-limits per process (10 inserts a minute). It stores a public nickname, exercise, challenge, experience, rep count, selected goal metadata, target, average, and consistency. New arcade rows store no duration. No poses, video, or skeletal landmarks. A submission key blocks a second insert of the same result. Practice and personal-best can be saved but are not championship categories.

`GET /api/leaderboard` returns at most 10 rows for one comparable category. Both coached challenge boards rank average quality, then consistency, then earlier `created_at`, and only include rows tagged `form-v1`. Arcade ranks counted reps on one board per exercise, with no duration filter. Coach boards require only the same exercise and challenge; repetition goal, completed rep count, and calibrated target are not board filters.

The page at `/leaderboard` is linked from the home-page board, arcade setup, arcade results, and Guided Coach setup and results. The top-right header link is removed. It polls periodically while the tab is visible, and **Refresh** loads immediately. Changing exercise or challenge updates that category only.

### Championship categories

| Exercise | Challenge | Grouping | Rank |
| --- | --- | --- | --- |
| Jumping jacks | Arcade Championship | All submitted live rep-goal sets | Reps |
| Arm raises | Arcade Championship | All submitted live rep-goal sets | Reps |
| Controlled arm raises | Form | All submitted live sets | Average quality |
| Controlled arm raises | Consistency | All submitted live sets | Average quality |
| Controlled squats | Form | All submitted live sets | Average quality |
| Controlled squats | Consistency | All submitted live sets | Average quality |

Not public boards: Practice, Personal Best, and Demo Mode. Legacy `timed` arcade rows remain stored but are excluded from the new `reps` boards. A live Neon read after simplifying coached categories found the existing `Ophir` controlled-arm-raise consistency result at rank 1 with average quality 80; its 4 completed reps, selected goal of 4, consistency 66, and target 172.5° remain metadata only. Temporary verification rows were deleted by submission key.

### How to check a top 10 locally

```sh
cd '/Users/alinamaor/Documents/SanD Hacks/everyday-league'
npm run dev
```

Open http://127.0.0.1:3000/leaderboard. The page opens on controlled arm raises and Form. Switch the exercise to arcade **Arm raises** to view its rep-count board. Legacy duration-based rows are intentionally not mixed into the new board. Other categories stay empty until a live, non-demo session is submitted.

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

## Codex intake verification on November 14

- Fetched `origin` and pruned stale refs. The clean current branch `ophir` matched `origin/ophir` exactly (0 ahead, 0 behind), and `git pull --ff-only origin ophir` reported already up to date. `origin/main` advanced to merge commit `e0cf608`; no merge into `ophir` was attempted.
- Node `v24.22.3`, npm `11.19.1`, and all top-level dependencies were installed at the expected versions.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed. Vitest: 10 files and 64 tests passed. The credential-aware Neon round trip required network access and passed, including its temporary-row cleanup.
- The first parallel Playwright run passed 4 of 6 tests; the arcade restart and guided-demo journeys timed out waiting for their results screens. Both failed journeys passed when rerun serially (`2 passed`), indicating timing/resource contention rather than a consistently reproducible failure.
- `.env.local` is present and gitignored. ElevenLabs key/model/voice variables and Neon pooled/unpooled connection variables are non-empty. Values were not printed or modified. The ElevenLabs route configuration and Neon round-trip test were verified; no new audible browser playback or physical-webcam test was performed.
- This intake changed only this status document. Application functionality, credentials, Git index/history, and remote branches were not modified.

## Sync and verification on November 14, evening

- The working tree on `ophir` was clean before the fetch. There was no stash. Ignored local files, including `.env.local` and `.neon`, were not touched.
- `git fetch origin` advanced `origin/main` from `e0cf608` to `1a179cf` (`Merge pull request #4 from Ophir-Maor/ophir`). That commit's tree is identical to the previous `ophir` tip (`9442eb1`). Fast-forwarded local `ophir` and local `main` to `1a179cf`. No conflicts, no file changes, and no push.
- `npm run typecheck` and `npm run lint` passed. `npm test` passed: 10 files, 64 tests. The credentialed Neon round trip ran (about 1.3 seconds) and deleted its temporary rows.
- Playwright did not start on the first attempt: `next dev` hit `EMFILE: too many open files`, and Chromium was missing from the sandbox browser cache. After the dev server was started with file polling and Playwright used the user browser cache, `npx playwright test --workers=1` passed all 6 tests in 57.2 seconds.
- No application functionality was changed and nothing was committed.

## Guided Coach navigation on November 14, evening

- On Guided Coach setup, **Back to the network** and **Championship board** were inline with no gap, so the labels ran together. They now sit in a flex row with a divider and stay on one line at 390px width.
- Checked in the browser: Back returns to the landing page, Championship board opens `/leaderboard`, and that page's Back link returns home. Desktop and phone layouts were both checked.

## Voice and header on November 14, evening

- Coaching speech says the athlete's name only in the opening line. Rep cues, camera reminders, the recap, and the stop line no longer use it. Arcade calls at every fifth rep and at halfway no longer use it. A lead change and the final result still name the athlete so a two-player match can tell who is ahead. The optional model prompt also tells the model not to say the name.
- The header **EL NETWORK** pill is removed. The landing page was reloaded and the label is gone.
- The landing-page feature row (Move, Coach, Quality) is removed. The ticker under the hero remains. Reloading the landing page confirmed those three blurbs are gone.
- Guided Coach results include a score-per-rep table for each athlete. Unscored repetitions stay labeled unscored. The guided demo Playwright journey checks that Alex's table is present and contains at least one numeric score.
- Two-player arcade and Guided Coach now run one athlete at a time. The camera tracks a single person. The second athlete steps in only after the first reaches the rep goal. Live play waits for a start button. Demo play advances on its own. A simultaneous two-person match is no longer started.
- A finished head-to-head coach screen says who won, keeps both scores and the per-rep tables, and drops the recap, badges, and clinical disclaimer. The coach says "Great job, [winner]. Better luck next time, [loser]." A tie says it was even. Solo results still use the longer quality report, without that clinical line.
- `npx vitest run` on the commentary, session, and coach-route tests passed: 13 tests.

## Optional coach-introduction verification on November 14

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed after the landing-page introduction controls were added. Vitest: 10 files and 64 tests passed, including distinct, named, safety-bounded introductions for all four personalities and the live Neon round trip.
- `npx playwright test tests/coach.spec.ts --workers=1` passed. The journey verifies that the optional Sarah introduction control is present before entering Guided Coach, then completes the existing synthetic coached session.
- No audible speaker-quality judgment or physical-webcam session was performed.

## Target- and goal-independent leaderboard verification on November 14

- The range-target and repetition-goal dropdowns were removed from `/leaderboard`. Coach boards are now selected only by exercise and Form or Consistency challenge.
- Server top-ten and placement queries no longer filter `target_deg`, `goal_reps`, or completed `reps`. Those values remain stored and returned as session context, but they do not affect board membership, ordering, or placement.
- Both coached challenges display and rank `average`, which `summarizeReps` computes across every scored repetition in the completed set. Consistency is only an equal-average tie-break.
- `npm run typecheck`, `npm run lint`, and `npm test` passed. Vitest: 10 files and 64 tests passed, including a ranking test that combines different calibrated targets and the live Neon round trip.
- `npx playwright test tests/leaderboard.spec.ts --workers=1` passed: 2 tests. The desktop test explicitly verifies that neither Range target nor Repetition goal is rendered; the phone layout still passes.
- A live local API read of the controlled-arm-raise Consistency board returned `Ophir` at rank 1 with displayed average quality 80. Adding obsolete `goal=8` or `target=90` query parameters returns the same board and rank, confirming that neither value changes board selection.

## Rep-only task verification on November 14

- Arcade setup now offers first-to-5, 10, or 15 repetition goals. `GameEngine` completes immediately when one athlete reaches the selected goal; it has no duration, clock tick, buzzer, halftime, or final-seconds event.
- The arcade scoreboard shows the repetition target instead of a clock. Guided Coach shows average quality without elapsed seconds. Countdown and monotonic detector timestamps remain implementation mechanics, not task or ranking criteria.
- Arcade leaderboard rows use challenge `reps`, have no duration selector or query parameter, and share one board per exercise. New arcade submissions store a null database duration; legacy `timed` rows remain untouched and excluded.
- `npm run typecheck`, `npm run lint`, and `npm test` passed: 64 tests. `npx playwright test --workers=1` passed all 6 browser tests, including the first-to-5 synthetic arcade completion and duration-free leaderboard.

## Split-screen movement avatar on November 14

- Guided Coach calibration and coached repetitions now place the camera and a movement avatar side by side. The avatar uses the same current MediaPipe landmark coordinates as the person rather than replaying a canned animation.
- The live webcam preview is clean: the old coached ghost/pose guide is removed from that side. Demo Mode still shows its synthetic athlete because there is no camera person to display. Arcade is unchanged.
- Controlled arm raises show target hand markers plus a live `Current …° · Stop at …°` readout. The avatar turns lime when the selected target is reached. More than 10% beyond the target turns the avatar and target red, raises a red alert, and says `TOO HIGH · LOWER SLIGHTLY`. Squats use the corresponding `TOO DEEP` correction.
- Avatar mirroring is separate from evaluation. It continues during calibration, countdown, the active set, and pause, but only calibration and the active set feed `FormEvaluator`, so countdown and pause cannot add repetitions.
- `npm run typecheck`, `npm run lint`, `npm test` (64 tests), and `npm run build` passed. The serial Guided Coach Playwright journey passed and explicitly verified the avatar during calibration plus the red overshoot state with a deliberately reduced demo target. The full six-test browser run passed five journeys; the leaderboard journey remained on its loading message for its five-second assertion, then both leaderboard tests passed immediately when rerun in isolation. This matches the existing external-data timing flake rather than an avatar failure.

## Known limitations

1. Form scores are heuristics. They are not a clinical grade. Squats are the less reliable of the two exercises because a single webcam cannot see depth well. Alignment is withheld when both sides are not visible.
2. Calibration uses the range the camera just saw. It does not know whether that range is medically appropriate.
3. Live two-player identity is spatial. Crossing or standing on top of each other pauses scoring. Demo Mode does not prove live registration.
4. Coach demo trajectories are deterministic scripts, not recorded humans. A higher demo score does not prove real-world accuracy.
5. Pose inference stays on the main thread. The camera loop targets about 12 frames per second at 640×480, and the demo loop about 30. The court background is cached, skeleton shadows are off, and scoreboard React updates happen only when scores change. A worker is still not used.
6. Arcade still has no pause. Coach pause freezes demo motion and stops feeding the evaluator; internal timestamps exclude the paused interval from movement analysis and stored session metadata.
7. Speech rate limiting, the audio cache, and the leaderboard limiter are process-local. There is no login. Browser-submitted scores can be forged. Do not treat the board as officiated.
8. `npm audit` was not re-run. The previous handoff reported 7 moderate findings in the dev ESLint chain. Do not claim a clean audit.
9. ElevenLabs voice wiring, Neon setup, and the championship leaderboard are committed on `ophir` and merged to `origin/main` at `1a179cf`. `.env.local` is gitignored and must stay that way. Do not push `ophir` unless asked; it is one merge commit ahead of `origin/ophir`.
10. The public board is self-reported. Movement scoring still happens in the browser. There is no account and no server-side pose check.
11. Optional model dialogue is implemented but not live-tested. This environment has no `OPENAI_API_KEY` or Neon AI Gateway token, so coaching speech is deterministic.
12. `eleven_turbo_v2_5` returned audio faster than Flash on one short cue. It was not listened to, so it is not the default.
13. The movement avatar mirrors detected 2D landmarks, not the person’s appearance or true 3D biomechanics. Clothing, occlusion, camera angle, and pose-model error can move it incorrectly. The red overshoot state is coaching feedback against the user-selected target, not a safety or medical warning.
14. The app cannot add field of view the webcam lens did not capture. A software fisheye would shrink the person and distort arm and knee angles without bringing cut-off feet into frame. On start, the live camera asks for an uncropped frame and the widest supported zoom. Cameras that do not expose those controls, including many built-in laptop cameras, stay at their native view. Arm raises only need shoulders and hands. Squats and jumping jacks still need the listed joints in frame.

## Next recommended steps

1. Run `npm run test:e2e` on the demo machine, outside any sandbox, and watch the guided demo through results. Confirm the controlled athlete’s average is visibly higher than a two-player rushed demo.
2. On a real camera, confirm the split-screen avatar tracks arms and legs without visible left/right reversal, then compare ten slow arm raises with the score and deliberately go slightly past the target. Confirm the avatar reaches lime before turning red. Adjust thresholds only from observed failures and add a fixture for each change.
3. Repeat with a conservative squat. Expect more “unscored” results when feet or hips leave the frame.
4. Register two people without crossing. Confirm preview-left stays player 1 after MediaPipe reorders poses.
5. Restart the app and finish a **non-demo** session. On the results screen press **Submit to Leaderboard**, enter a nickname, check the public-sharing box, and submit. **View my ranking** opens the matching top 10. Demo Mode has no submit button. Open `/leaderboard` to switch exercise or challenge.
6. Commit and push only after the user asks. Do not deploy until they ask, and do not expose the TTS or leaderboard routes publicly without authentication.

## File map

- `src/app/page.tsx`: arcade UI, live two-player registration, entry to coach and progress.
- `src/components/coach-flow.tsx`: guided session, calibration, results.
- `src/components/pose-avatar.tsx`: landmark-mirrored split-screen avatar, target markers, and correction states.
- `src/components/exercise-demo.tsx`: original looping skeleton.
- `src/components/vision-stage.tsx`: webcam, arcade demo, coach demo, and optional pose overlay.
- `src/lib/engine.ts`: arcade detectors, lane tracker, rep-goal match.
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
