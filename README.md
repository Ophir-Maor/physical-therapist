# Everyday League

Big-league energy. Everyday athletes. A local web app with two modes: a timed sports broadcast, and a guided movement coach that scores control instead of speed.

Built for SanD Hacks, November 14–15, 2026. Coaching work is on the local branch `feature/gamified-coaching` and is not committed. Do not commit, push, or deploy unless you are asked to.

This is an experimental coaching prototype. It does not diagnose injuries, prescribe rehabilitation, or measure clinical recovery.

## Start locally

Node.js 24 and npm 11 were used during development. From this project directory:

```sh
npm install
npm run dev
```

Open http://localhost:3000 in desktop Chrome.

- **Start Broadcasting** keeps the timed jumping-jack or arm-raise match. Demo Mode needs no camera.
- **Guided Coach** scores arm raises or conservative squats for control, your selected range, and consistency.
- **Progress** shows sessions saved in this browser.

Use a 15-second arcade match or a 4-rep coached demo for a quick walkthrough. The MediaPipe Lite model and WASM assets are served from `public/mediapipe`. Inference runs in the browser. Camera footage is never sent to ElevenLabs, Neon, or an LLM.

## Voice configuration

Copy `.env.example` to `.env.local` and provide `ELEVENLABS_API_KEY` to enable real speech generation. Restart the development server after changing environment variables. Optional voice IDs exist for hype, dry, documentary, supportive, drill, and calm. The default model is `eleven_flash_v2_5`.

Set `DATABASE_URL` only if you want the optional Neon leaderboard. Without it, scores stay on this device. Synthetic sessions are refused by the board. Browser-computed scores are not cheat-proof.

Without a key, or when speech fails, the interface labels the fallback as **Demo voice · browser speech / captions**. Commentary is deterministic and event-driven. No OpenAI integration is implemented.

Only commentary text and the selected personality reach ElevenLabs. Names inside that text can too. API keys must remain server-side. Never prefix them with `NEXT_PUBLIC_`.

## Application flow

- **Arcade:** landing → setup → calibration → countdown → timed match → results. A full held closed → open → closed cycle scores one rep.
- **Guided coach:** exercise → generated skeleton demo → calibrate a comfortable target → scored set → results → progress. Quality uses control (40%), selected range (30%), visible alignment (20%), and consistency (10%). Going past the selected target does not score higher. Unclear reps stay unscored.
- Jumping jacks need shoulders, wrists, hips, and ankles. Arcade arm raises need shoulders and wrists. Coached squats need hips, knees, and feet, and depth is approximate from one camera.
- Live two-player matches register player 1 alone, then player 2. Player 1 starts on the left of the mirrored preview. Crossing pauses identity. This is not face recognition.
- Demo Mode runs synthetic athletes through the real detectors. The coach demo includes a slower athlete and a rushed one.
- Settings, the five most recent arcade results, and up to 30 richer sessions stay in this browser's localStorage.

## Commands

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

The Playwright suite starts a local development server if needed and uses synthetic Demo Mode. It does not verify physical camera accuracy. `npm start` requires a successful production build first. See `docs/STATUS.md` for actual verification results and outstanding issues; do not infer that a command passed from this list.

## Technology and layout

Next.js App Router, React, TypeScript, Tailwind CSS, Lucide, MediaPipe Tasks Vision, the official ElevenLabs JavaScript SDK, optional `@neondatabase/serverless`, Zod, Vitest, and Playwright. Dependency versions are recorded in `package-lock.json`.

- `src/app/page.tsx`: arcade broadcast, live registration, and the coach entry.
- `src/components/coach-flow.tsx`: guided session, calibration, and results.
- `src/components/vision-stage.tsx`: webcam, arcade demo, coach demo, ghost skeleton.
- `src/lib/engine.ts`: arcade detectors, lane tracking, timed scores.
- `src/lib/form.ts`: geometric quality scoring.
- `src/lib/identity.ts`: sequential registration.
- `src/lib/commentary.ts`: personalities, queue, playback, fallback.
- `src/app/api/tts/route.ts` and `src/app/api/leaderboard/route.ts`.

Read [architecture](docs/ARCHITECTURE.md), [demo script](docs/DEMO_SCRIPT.md), [roadmap](docs/ROADMAP.md), and [current status](docs/STATUS.md) before continuing development.

## Verification boundaries

Real webcam movement accuracy, two-person tracking in a crowded room, camera overlay alignment on physical hardware, GPU/CPU performance, and credentialed ElevenLabs synthesis need hands-on verification. The local speech endpoint has validation, a same-origin check, and an in-process rate limit; it is not authenticated or hardened for public hosting. No deployment is authorized.
