# Three-minute demonstration

## Before presenting

Start `npm run dev` and open localhost in desktop Chrome. Use headphones or room audio at a tested volume. If available, set the ElevenLabs key in `.env.local`, restart, and confirm real voice before presenting; otherwise explain the labeled browser-speech/caption fallback. Do not describe fallback as live ElevenLabs output.

Keep the local model assets intact. Confirm the camera is free, the room is lit, and both players can keep their feet and hands in frame. Complete a physical rehearsal before relying on live scoring. Keep Demo Mode ready as the deterministic fallback. No publication or Git operations are needed.

## 0:00–0:30 — The premise

Open the landing page: “We give ordinary movements the broadcast treatment they absolutely do not deserve.” Point out that the camera feed stays on the device. Click **Start Broadcasting**.

Choose a 30-second jumping-jack championship, two player names, and **The Hype Machine**. Explain that arm raises offer a smaller-space alternative.

## 0:30–1:20 — Live match, if rehearsed

Select **Live webcam**, then **Enable Camera**. Explicitly allow the browser permission request. Player 1 stands on the left of the mirrored preview; player 2 on the right. Keep lanes separated. Start with arms down and feet together. Wait for both players to be ready, then click **Start match**.

During the match, point out skeletal overlays, independent scores, event-driven commentary, and the elapsed-time clock. Explain that a rep needs a complete closed–open–closed cycle. Use a few deliberate movements, rather than racing before detector behavior is established.

If only one player is detected, use **Switch to one-player setup**. If camera/model readiness fails, return to setup and enter **Demo Mode** rather than repeatedly troubleshooting on stage.

## 1:20–2:00 — Results and replay

Show the final score, winner/draw, humorous recap, and transcript. Explain that only commentary text goes to the server for ElevenLabs speech. The voice status distinguishes live synthesis from fallback.

Select **Change the lineup**, choose Demo Mode and a 15-second match, and enter the arena. Say explicitly: “These are synthetic athletes, running through the real detector and scoring pipeline.”

## 2:00–2:40 — Reliability and engineering

Start the synthetic match and open **Show tracking diagnostics**. Highlight detector phases, tracking confidence, and event logs. Demonstrate that the two athletes have independent rhythms and scores. Explain brief missing-landmark handling, spatial player association, and the bounded commentary queue that avoids overlapping voices.

Do not claim synthetic confidence proves real-world accuracy. Mention that crossings remain ambiguous and competitors stay in their lanes.

## 2:40–3:00 — Close

Show the synthetic results and recent local history. “No stadium, no account, no video uploads—just your living room and championship-level commitment.” Describe real-world tuning and hardware rehearsal as the next validation step.

## Fast fallback

If audio is blocked or the API fails, use visible captions and the labeled demo voice. If two-person tracking fails, switch to solo arm raises. If camera setup fails, use Demo Mode; never present synthetic poses as webcam output.
