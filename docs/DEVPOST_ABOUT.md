## Inspiration

We wanted something funny for SanD Hacks. The first idea was an AI sports broadcaster that treated ordinary movement like a championship: the computer would watch two people do jumping jacks and narrate the rivalry in a ridiculous announcer voice.

Once that version worked, the same camera looked useful for a quieter problem. Home exercises get tedious, and a rep counter never says whether the movement stayed controlled. We turned the broadcast into Rep Dead Redemption, a coach that scores how you move and gives a rough rep a chance to improve on the next one. The humor stayed. You can train with a warm coach, a dry drill sergeant, a hyped commentator, or a calm instructor.

## What it does

The app coaches two movements: controlled arm raises and conservative squats. You pick a coach and a challenge, watch a short skeleton demo, and set a comfortable target from one or two practice reps. You can keep 60 to 100 percent of that range, or accept a labeled fallback, about 65 degrees of arm lift or 30 degrees of knee bend.

A split-screen avatar mirrors the pose. On target, the figure turns lime. More than 10 percent past the target, it turns red and asks you to ease off. Each complete, clearly seen repetition scores from 0 to 100. If the required joints disappear, that attempt stays unscored instead of receiving a fake low grade. Results list every rep. In a head-to-head, athletes go one at a time, the screen names the winner, and the coach closes with a line like “Great job, Sean. Better luck next time, Ophir.”

A Neon board ranks live, non-demo sessions by average quality, then consistency, then who submitted earlier. A bigger or faster movement does not climb the board. Demo Mode runs the same scoring on synthetic athletes and cannot be posted. The scores are approximate and camera-dependent. This is a prototype, not a clinical assessment.

## How we built it

The app is Next.js and TypeScript. VisionStage loads MediaPipe’s Pose Landmarker Lite locally, tries the GPU, and falls back to the CPU. Inference stays in the browser at about 20 frames a second. Webcam frames never leave the machine. ElevenLabs receives only the sentence about to be spoken. A leaderboard post is a nickname plus score metadata.

Arm raises measure shoulder-to-wrist elevation. Squats measure knee bend from hip, knee, and ankle in the image plane, and every squat result says that one front camera cannot certify depth. The signal is smoothed. A gap longer than 450 milliseconds is ignored, so a dropped frame is not treated as a jerk. A rep counts only after a real rise and a held return. Motion that is too small, too brief, or missing landmarks for more than half a second is discarded.

Quality mixes control (40%), match to the selected target (30%), visible left-right alignment (20%), and consistency (10%). A missing metric is dropped and the rest are reweighted. Control and range both have to exist before a number appears. Range caps at the chosen target, so overshooting does not help. A rep under about 0.9 seconds, or one with a sharp speed spike, is marked rushed and loses control points.

Speech follows measured events. It talks for a first scored rep, a real improvement, a repeated fault, a strong streak, a lost camera, or the recap, and stays quiet when nothing changed. The queue drops duplicates, expires routine lines after seven seconds, and clears stale audio for the final call. Playback is one clip at a time, with a short cache and a labeled browser voice when ElevenLabs fails. The four coaches use ElevenLabs Flash: Sarah, Callum, Charlie, and River. An optional rewriter can rephrase the measured fact when a model key is set, and it rejects any line that invents an injury or ignores the measurement. Without that key, the spoken line is deterministic.

The board is Neon Postgres behind Zod checks. Demo posts are refused. Quality rows must be tagged `form-v1`, so older scoring is not mixed in. Vitest covers the math. Playwright walks a synthetic session through the per-rep results.

## Challenges we ran into

Landmarks flicker. One confident frame is not a rep, so we required a full cycle and withheld the score when the camera lost the joints. Speed was the easy reward and the wrong one: the first product raced to a rep goal, and the coach had to prefer a slower, even set, judged against the target that person chose. Speech got annoying when it repeated names and stacked outdated lines, so names now appear in the intro and the result, and a flat rep stays silent. Two bodies at once were too unstable, so a match follows one athlete and then hands over the camera. Sean put the live top 10 on the home screen while scoring and voice were landing on the same branch, and we merged often so the report, the rep table, and the board still described the same scores.

## Accomplishments that we're proud of

We kept the joke and built a coach. The app tracks a person, calibrates a personal target, scores a complete repetition, and talks about what changed. Four voices stay distinct without turning the session into a lecture. The public board ranks quality, so a steadier set can beat a faster one. Scoring sits outside React and outside speech, which let us test it without a webcam. Locally, short requests for all four ElevenLabs voices returned audio, and the labeled fallback is there when that request fails.

## What we learned

A pretrained pose model is the start of the work. The hard part is deciding which frames belong to one repetition and which are too uncertain to grade. A voice feels human when it has a specific fact and when it knows how to stop. The funnier first idea was also allowed to change. A target the person chose, an honest “I couldn’t see that,” and a camera feed that stays on the device mattered more than adding another model.

## What's next for Rep Dead Redemption

More exercises, a longer calibration, and tracking from a less ideal camera angle come next. Therapist-reviewed movement definitions would make these heuristics less homemade. A model could draft a custom exercise from a description, as long as the score still comes from measured landmarks. Longer progress, a check of the angles against a known movement, and a locked-down public deployment follow that. None of it would make these scores a clinical grade.
