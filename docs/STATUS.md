# Everyday League — implementation handoff

Updated November 13, 2026 (America/Los_Angeles). Local MVP for SanD Hacks. Project directory: `/Users/alinamaor/Documents/SanD Hacks/everyday-league`.

## Critical restrictions

- User explicitly prohibits Git initialization, staging, commits, pushes, repository publication, PRs, and deployment until separately authorized.
- Scaffold used `create-next-app ... --disable-git`; output confirmed “Skipping git initialization.” No Git operations were performed.
- Local implementation, dependency installation, servers, testing, and asset downloads are authorized.
- Keep this file current at the end of subsequent work. Read `AGENTS.md` before continuing.

## Run locally

```sh
cd '/Users/alinamaor/Documents/SanD Hacks/everyday-league'
npm install
npm run dev
```

Open http://localhost:3000. Choose Start Broadcasting → Demo Mode → Enter Demo Arena → Start match. Default is two players, jumping jacks, 30 seconds. Match length can be 15, 30, or 60 seconds. Camera is requested only after selecting Live webcam and clicking Enable Camera. Browser camera access requires localhost or a secure context.

Optional real voice: copy `.env.example` to `.env.local`, enter `ELEVENLABS_API_KEY`, and restart Next.js. Optional voice/model IDs are documented in that example. No API credentials were provided or created. Missing credentials trigger explicit browser speech/captions fallback. Real voice sends short commentary text (including entered player names) to ElevenLabs; camera frames never leave the browser.

## Implemented

### Interface and flow

- Original dark sports network aesthetic, lime branding, blue/red contenders, original SVG athlete artwork and neon demo skeletons. No external fonts or image CDN required.
- Landing, match setup, calibration, three-second countdown with original Web Audio tones, live broadcast, winner/tie/practice results and humorous recap.
- One/two players, bounded editable names, two activities, match duration, three announcer personalities.
- Dominant video/canvas, scoreboard, timer, captions, commentary transcript, mute, readiness, diagnostics, reset/restart.
- LocalStorage settings and last five results. Stored settings/history are shape-checked before use; malformed JSON is ignored. Demo results remain labeled.
- Narrow viewport styles, keyboard focus indicators, reduced-motion support, accessible control labels.

### Vision and activities

- `src/components/vision-stage.tsx`: dynamic client-side MediaPipe VIDEO inference, one/two poses, Lite model, GPU first and CPU fallback. RAF throttled to 20fps, no duplicate processing of unchanged video frames.
- Matching video/canvas intrinsic dimensions and `object-fit: contain`, both mirrored consistently. Detection coordinates converted to screen coordinates before tracking, so player one starts preview-left.
- Confidence-based visible skeleton, player color association, readiness checks, camera permission/missing/busy messages. Tracks, RAF, and model disposed on teardown, including asynchronous startup cancellation.
- Model and package WASM files bundled under `public/mediapipe` (~35MB). Runtime does not download model from a third-party CDN.
- `src/lib/engine.ts`: activity detectors independent of React. Configurable confidence, smoothing, geometry ratios, held-position debounce, minimum cycle duration, missing-data grace/reset. Closed → open → closed required for a rep.
- Jumping jacks require shoulders/wrists/hips/ankles and arm/leg positions; arm raises require shoulders/wrists and do not require visible legs.
- Spatial/temporal player association tolerates detection-array reordering and short disappearances; it is not biometric identification.
- Demo Mode generates deterministic synthetic landmarks (roughly two-second and 2.7-second cycles) through the same detectors and scoring engine, not fabricated score increments.

### Match engine

- Deterministic monotonic-timestamp engine for start, scoring, deadline, halfway, final ten seconds, milestones, ties, lead changes, winner and reset.
- Core engine states idle/active/complete. Camera setup, calibration and countdown are React orchestration states rather than part of the core engine class.
- Scores at or after the deadline are rejected. A separate interval checks wall-clock elapsed time even without pose detections. Briefly leaving the frame stops rep recognition but does not pause the clock.
- UI renders engine snapshots; event IDs avoid replaying commentary.

### Voice

- `src/app/api/tts/route.ts`: official ElevenLabs SDK, default `eleven_flash_v2_5`, browser-playable MP3, configurable voices/model, Zod validation, bounded request text/body, same-origin check, process-local burst limiter, provider timeout and sanitized failure responses.
- `src/lib/commentary.ts`: event templates for hype/dry/documentary styles, introductions, leads, ties, every fifth rep, halftime/final ten and results. No LLM dependency or frame-level requests.
- Bounded priority queue, deduplication, expiry, minimum start interval, serialized playback, interrupt/clear on final result, cancellation on reset/mute, bounded audio cache, gesture audio unlock.
- Caption display begins on audio playback; browser fallback displays text and optionally speaks using browser speech synthesis. Provider unavailable state backs off for a minute.
- Voice status explicitly distinguishes ElevenLabs and demo browser speech/captions.

## Verification evidence

Commands run successfully against implemented code:

- `npm run typecheck`: TypeScript passed.
- `npm run lint`: ESLint passed. Bundled third-party MediaPipe JavaScript is excluded from app linting.
- `npm test`: **28 tests passed across 3 files**. Covers full cycles in both modes, noise/holds, missing and low-confidence landmarks, jump legs requirement, timer/deadline/score events, ties/winners/reset, pose reordering/occlusion association, queue expiry/deduplication/prioritization, mocked audio serialization/interruption/mute, API malformed/oversized/invalid requests, same-origin rejection, missing configuration, mocked provider success/failure, rate-limit recovery.
- `npm run test:e2e`: **3 Chromium tests passed**. Two-player jumping-jack demo traverses landing/setup/countdown/match/results/restart with nonzero scores for both and no page errors. Solo arm-raise demo completes on 390px viewport with nonzero score and no horizontal overflow. Simulated camera permission denial disables start and recovers to Demo Mode.
- Final targeted rerun of the two-player browser journey also passed after adding a nonempty commentary-transcript assertion; final typecheck, lint, 28 unit/API tests, and build were rerun successfully.
- `npm run build`: production compilation, TypeScript, prerender and route generation passed with Webpack. `/` static; `/api/tts` dynamic.
- Browser screenshots captured at `test-results/landing.png`, `broadcast.png`, `results.png`. Landing, broadcast, and results screenshots were visually inspected. Artifacts are ignored; rerunning Playwright replaces them.
- Installed MediaPipe and ElevenLabs API signatures inspected and official docs consulted. Provider success in tests is mocked, NOT a live ElevenLabs verification.

Environment: Node 24.22.3, npm 11.19.1; Next.js 16.4.6, React 19.3.0, MediaPipe tasks-vision 1.2.3. Exact installed versions are in package-lock.json. Chromium downloaded through Playwright.

## Environment issues resolved / remaining

- Scaffold Node 20 type definitions conflicted with current Vitest; updated `@types/node` to Node 24.
- Scaffold enabled Cache Components, incompatible with explicit route runtime config; disabled because this local app does not require it.
- Turbopack production CSS processing hit an environment worker-port permission panic even after escalation. Switched both dev/build scripts to supported `--webpack`, using Tailwind PostCSS. Webpack production build passed. This is a resolved build workaround, not a product feature.
- Initial browser run was interrupted by a config/server restart during development; the clean run passed all three tests.
- `npm audit` reports **7 moderate findings**, all in development ESLint/typescript-eslint dependency chain through minimatch (GHSA-g3hv-75wg-m249). Compatible `npm audit fix` did not clear them. No high/critical reported. Do not claim a clean audit; review upstream updates before publishing. No forced major overrides were introduced.

## Known limitations and unverified behavior

1. **No physical webcam trial performed.** Real camera acquisition, GPU/CPU inference, alignment and detector accuracy are implemented but require testing with actual humans, lighting, clothing, distance and available space. Synthetic fixtures cannot establish exercise-form accuracy.
2. **No live ElevenLabs generation or audible speaker test performed.** Missing credentials and provider mocks are tested. Check chosen voice availability, latency, browser autoplay, queue behavior, volume and captions on demo laptop.
3. Spatial identities can swap if players cross or remain occluded for long periods. Keep each player in the assigned lane. Do not claim robust identity across crossings.
4. Detection runs synchronously on the main thread at up to 20fps. Worker offloading not implemented; measure low-end laptop performance before adding complexity.
5. Calibration verifies required landmarks are currently confident; it does not calibrate custom body thresholds or require a sustained ready dwell. Threshold tuning needs real footage/manual observation. Geometry uses normalized image coordinates; camera aspect and posture can affect practical thresholds.
6. Browser speech support/voices differ by environment. Captions remain the reliable fallback. Cold dev compilation can delay the first TTS request; warm production startup for demonstrations.
7. Match timer continues if tab is hidden; stale speech is canceled on visibility loss. There is no pause/resume flow.
8. API rate limiter/cache are process-local, without authentication or shared quota enforcement. Appropriate for requested local MVP, not a publicly exposed paid API proxy.
9. Optional OpenAI/LLM-written commentary, audio streaming, replay recording, downloadable recap, and additional sports are not implemented. Recap and commentary are contextual templates.
10. No measured accessibility audit or cross-browser certification. Automated browser coverage is Chromium; physical desktop Chrome is primary target.
11. Scores update immediately, but there is no elaborate animated score transition or separate event-banner animation; captions/transcript carry event narrative.

## Next recommended steps

1. Run one-person arm raises on the actual laptop, then full-body jumping jacks. Check at least ten cycles manually against counts; test incomplete reps, hands-only motion, leaving/re-entering frame and reset.
2. Run two-person side-by-side matches. Confirm preview-left maps to Player 1 and overlay colors/scores stay consistent when MediaPipe ordering changes. Avoid crossings; test brief missing-player recovery.
3. Configure ElevenLabs, run a short match with headphones/speakers, verify model/voice IDs, MP3 playback and priority interruption. Try network loss and mute/unmute. Warm one API request before presenting.
4. Tune confidence/hold/geometry thresholds only from observed failures and add regression fixtures/tests for each change.
5. Rehearse `docs/DEMO_SCRIPT.md`: 30-second real match, quick results, immediate labeled demo fallback if the room/camera fails.
6. Resolve dev dependency advisory chain through upstream compatible releases. Only after explicit user authorization consider Git initialization/commit and deployment preparation.

## File map

- `src/app/page.tsx`: UI orchestration and all five screens.
- `src/app/globals.css`: broadcast design and responsive styles.
- `src/components/vision-stage.tsx`: webcam/model/demo/canvas lifecycle.
- `src/lib/engine.ts` and `.test.ts`: detectors, tracker, game, synthetic fixtures.
- `src/lib/commentary.ts` and `.test.ts`: template and voice queue/playback.
- `src/app/api/tts/route.ts` and `.test.ts`: server synthesis/validation.
- `tests/broadcast.spec.ts`: browser journeys and screenshots.
- `README.md`, `AGENTS.md`, `.env.example`, `docs/ARCHITECTURE.md`, `docs/DEMO_SCRIPT.md`, `docs/ROADMAP.md`: continuing context.
