# Everyday League — persistent project instructions

Read `docs/STATUS.md` first, then `docs/ARCHITECTURE.md`. The project is a local SanD Hacks MVP, not a deployed service.

## Authorization constraints

- Do not initialize Git until the user explicitly authorizes it. Any future Next.js scaffolding must use `--disable-git`.
- Do not stage, commit, push, create repositories or PRs, publish, or deploy until separately authorized by the user. Do not use helpers that implicitly perform those operations.
- Local file changes, dependency installation, servers, and testing are authorized. Continue autonomously with routine implementation choices.
- Never expose keys or write secrets to public files. Keep `.env.local`, generated outputs, credentials, and test artifacts ignored.

## Engineering constraints

- Keep webcam frames entirely browser-local. Only commentary text may reach ElevenLabs.
- Label synthetic poses and fallback voices honestly. Do not claim real camera or paid API verification from mock/demo tests.
- Keep scoring/detectors independent of React and speech playback; preserve monotonic millisecond timestamps and duration seconds.
- Full cycles only. Maintain confidence thresholds, smoothing, held transitions, missing-landmark handling, and per-player state.
- Player assignment is based on screen-space position. Document crossing/occlusion limits rather than claiming robust biometric identity.
- Preserve server-side Zod validation, bounded text, timeouts, and explicit API failure fallback.
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
