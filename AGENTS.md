# Everyday League — persistent project instructions

Read `docs/STATUS.md` first, then `docs/ARCHITECTURE.md`. The project is a local SanD Hacks MVP, not a deployed service.

## Authorization constraints

- Git is already initialized. Stay on `feature/gamified-coaching` for this work. Do not stage, commit, push, open PRs, publish, or deploy until the user explicitly asks. Do not re-initialize the repository.
- Local file changes, dependency installation, servers, and testing are authorized. Continue autonomously with routine implementation choices.
- Never expose keys or write secrets to public files. Keep `.env.local`, generated outputs, credentials, and test artifacts ignored.

## Engineering constraints

- Keep webcam frames entirely browser-local. Only commentary text may reach ElevenLabs. Leaderboard posts, if enabled, contain a nickname and score metadata only.
- This is a movement-coaching prototype, not a medical device. Do not claim diagnosis, prescribed rehab, or clinical recovery. Say when a metric was not visible enough to score.
- Label synthetic poses and fallback voices honestly. Do not claim real camera, paid API, or database verification from mock or demo tests.
- Keep scoring, form evaluation, and detectors independent of React and speech playback. Preserve monotonic millisecond timestamps.
- Full cycles only. Maintain confidence thresholds, smoothing, held transitions, missing-landmark handling, and per-player state. Do not reward moving past a selected target.
- Live two-player assignment is sequential and then spatial. Document crossing and occlusion limits. Do not use face recognition.
- Preserve server-side Zod validation, bounded text, timeouts, and explicit API failure fallback on both speech and the optional leaderboard.
- No database, authentication infrastructure, Python backend, or optional LLM integration is needed for the core demo.
- Consult official documentation and actual installed signatures before changing MediaPipe or ElevenLabs APIs.
- Prefer task-focused tests over implementation-mirroring tests. Run type checking, linting, meaningful unit/browser tests, and production build after substantial changes.
- Use the user-authorized parallel agent work only for independent file ownership, coordinating shared contracts to avoid conflicting edits.

## Handoff requirement

At the end of work, update `docs/STATUS.md` with implemented behavior, exact verification performed and results, known bugs, incomplete features, physical/manual tests still required, and prioritized next steps. The next session must be able to continue without conversation history. Never fabricate checks or erase unresolved limitations.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
