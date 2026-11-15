# Roadmap by demonstration impact

## Done on `feature/gamified-coaching`

Guided coach, arm-raise and conservative squat scoring, calibration against a demonstrated range, four coach personalities, sequential live registration, form and consistency challenges, device history, achievements, a controlled-versus-rushed demo, and an optional Neon leaderboard that stays off without `DATABASE_URL`. The arcade broadcast is a first-to-repetition-goal race. The work is not committed.

## 1. Prove it on the demo laptop

Run `npm run test:e2e` outside a sandbox. Then rehearse slow arm raises against a deliberately fast set and confirm the quality gap matches what you see. Repeat for a shallow squat. Record any threshold change with a new fixture. Synthetic confidence is not real-world accuracy.

## 2. Real voice in the room

Configure ElevenLabs and confirm the coach voices, mute, and the caption fallback. Warm one request before presenting.

## 3. Two people, without crossing

Register left, then right. Confirm the colors survive a brief step out of frame, and that crossing pauses scoring. Keep that limit in the spoken demo.

## 4. Neon only if a URL is available

Restart with `DATABASE_URL`, submit one real nickname and score, and show that a demo session cannot be uploaded. The board is not cheat-proof.

## Still later

Worker inference, a longer calibration dwell, word-level captions, and any public deployment. Public hosting needs authentication, paid-API protection, and a privacy note. No deployment is authorized.
