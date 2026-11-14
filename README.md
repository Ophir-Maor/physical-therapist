# Everyday League

Big-league energy. Everyday athletes. A local web application that turns jumping jacks and arm raises into a timed, AI-voiced sports broadcast for one or two competitors.

Built for SanD Hacks, November 14–15, 2026. **Local development only: no Git initialization, staging, commits, pushes, publication, or deployment is authorized.**

## Start locally

Node.js 24 and npm 11 were used during development. From this project directory:

```sh
npm install
npm run dev
```

Open http://localhost:3000 in desktop Chrome. Choose **Start Broadcasting**, configure the match, then select **Demo Mode** or **Live webcam**. Demo Mode needs neither credentials nor camera access. Use a 15-second match for a quick walkthrough.

The MediaPipe Lite model and WASM assets are served from `public/mediapipe`; inference runs in the browser. Camera access requires localhost or a secure browser context. Camera footage is never sent to ElevenLabs or an LLM.

## Voice configuration

Copy `.env.example` to `.env.local` and provide `ELEVENLABS_API_KEY` to enable real speech generation. Restart the development server after changing environment variables. Configure your available ElevenLabs voice IDs if needed. The default model is `eleven_flash_v2_5`.

Without a key, or when the service fails, the interface explicitly labels the fallback as **Demo voice · browser speech / captions**. Browser speech availability and autoplay behavior vary. Commentary text is deterministic and event-driven; no OpenAI/LLM writing integration is implemented.

Only commentary text and the selected voice personality reach the server-side speech API. Names appear in commentary and therefore can reach ElevenLabs when real voice is enabled. API keys must remain server-side; never prefix them with `NEXT_PUBLIC_`.

## Application flow

- Landing → setup → camera/synthetic calibration → three-second countdown → timed match → results.
- Jumping jacks require visible shoulders, wrists, hips, and ankles. Start with feet together and arms down, then open fully and return closed.
- Arm raises require visible shoulders and wrists; lower-body landmarks are unnecessary for scoring.
- Player 1 occupies the left side of the mirrored preview. Stay in your assigned lane: identity is spatial, not biometric, and crossing or prolonged occlusion is ambiguous.
- A full held closed → open → closed cycle earns a rep. These are prototype movement heuristics, not exercise-form or medical assessments.
- Demo Mode uses explicitly synthetic landmarks through the same tracking, detector, score, event, and commentary path.
- Settings and the five most recent results are stored in this browser's localStorage. No accounts or database are used.

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

Next.js App Router, React, TypeScript, Tailwind CSS, Lucide, MediaPipe Tasks Vision, the official ElevenLabs JavaScript SDK, Zod, Vitest, and Playwright. Dependency versions are recorded in `package-lock.json`.

- `src/app/page.tsx`: setup, broadcast UI, lifecycle, browser storage, original Web Audio tones.
- `src/components/vision-stage.tsx`: webcam/model lifecycle, overlay, synthetic athletes.
- `src/lib/engine.ts`: detectors, association, deterministic scores and events.
- `src/lib/commentary.ts`: personalities, bounded priority queue, playback, fallback.
- `src/app/api/tts/route.ts`: validated server-side MP3 synthesis.

Read [architecture](docs/ARCHITECTURE.md), [demo script](docs/DEMO_SCRIPT.md), [roadmap](docs/ROADMAP.md), and [current status](docs/STATUS.md) before continuing development.

## Verification boundaries

Real webcam movement accuracy, two-person tracking in a crowded room, camera overlay alignment on physical hardware, GPU/CPU performance, and credentialed ElevenLabs synthesis need hands-on verification. The local speech endpoint has validation, a same-origin check, and an in-process rate limit; it is not authenticated or hardened for public hosting. No deployment is authorized.
