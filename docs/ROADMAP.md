# Roadmap by demonstration impact

## 1. Physical rehearsal and scoring accuracy

Test one-player arm raises first, then jumping jacks, then two-player versus on the actual demo laptop/camera. Compare manually observed repetitions with counted repetitions. Verify mirrored overlay alignment, both screen lanes, small/big participants, varied distance and lighting, partial occlusions, low confidence, and leaving/re-entering frame. Record detector threshold changes and regression fixtures. No exercise-form accuracy claim is justified by synthetic tests.

## 2. Real ElevenLabs and room audio

Configure credentials and suitable available voice IDs. Verify actual SDK synthesis, latency, MP3 playback, captions, cancellation at the final whistle, and all personalities. Test denied autoplay, mute/unmute, offline/failing API, and fallback labeling. Tune commentary brevity and priorities so victory arrives promptly in a short match.

## 3. Rehearse the crowded-room fallback

Run several consecutive 15/30/60-second matches, solo and versus, both activities. Test denied/busy/missing cameras and recovery. Validate switching to practice and synthetic mode without leaking camera tracks or stale speech. Rehearse the three-minute script with the actual projector and speakers.

## 4. Improve identity and calibration

Current association is spatial and becomes ambiguous during crossings or long occlusion. Add explicit lane guidance or calibration locks before considering more complex tracking. Consider a brief sustained readiness requirement and show per-player readiness rather than only a combined status. Improve empty/corrupt local-history validation if expanding persistence.

## 5. Profile and optimize only where measured

Measure MediaPipe main-thread inference time and UI responsiveness on the demo hardware. The current loop targets approximately 20 Hz. Move inference to a Web Worker only if supported browser APIs and measured stalls justify the complexity. Reuse demo canvas dimensions rather than reassigning each frame if profiling shows overhead.

## 6. Optional enhancements after the core is reliable

A structured, server-only LLM commentary endpoint for significant events is not implemented and is lower priority than live accuracy. Additional games, richer replay/history, word-level captions, and low-latency streaming are also future work. Keep templates and buffered MP3 fallback even if optional features are introduced.

## Public service work is out of scope

No deployment is authorized. Before any future public use, separately authorize deployment and address authentication, paid-API abuse protection, distributed limits, request-body streaming limits, privacy disclosures, and operational monitoring. The current origin check and process-local limiter are intended only for local demonstration.
