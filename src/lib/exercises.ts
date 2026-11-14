import type { ExerciseId } from "./form";

export type ExerciseGuide = {
  id: ExerciseId;
  name: string;
  summary: string;
  areas: string;
  start: string;
  steps: string[];
  mistakes: string[];
  pattern: string;
  camera: string;
};

export const EXERCISES: Record<ExerciseId, ExerciseGuide> = {
  "arm-raises": {
    id: "arm-raises",
    name: "Controlled arm raises",
    summary:
      "Lift both arms to a comfortable target and lower them with control.",
    areas: "Shoulders and arms",
    start: "Stand tall with both arms relaxed at your sides.",
    steps: [
      "Raise both arms together toward the target you select.",
      "Pause briefly without bouncing.",
      "Lower slowly until your arms are down again.",
    ],
    mistakes: [
      "Jerking the arms up or letting them drop",
      "Going farther than the target you selected",
      "Letting one arm lag behind the other",
    ],
    pattern: "Down → raise → target → lower → down",
    camera: "Face the camera with both shoulders and hands visible.",
  },
  squats: {
    id: "squats",
    name: "Controlled squats",
    summary:
      "Bend the hips and knees to a comfortable depth, then return toward standing.",
    areas: "Hips, knees, and legs",
    start: "Stand with both feet visible and your torso upright.",
    steps: [
      "Bend your hips and knees toward the depth you select.",
      "Keep the movement steady.",
      "Return toward standing to finish the repetition.",
    ],
    mistakes: [
      "Dropping quickly instead of controlling the lower",
      "Going deeper than the target you selected",
      "Turning so one leg leaves the frame",
    ],
    pattern: "Stand → lower → target → rise → stand",
    camera:
      "Step back until hips, knees, and feet are visible. Depth from one camera is approximate.",
  },
};

export const COACHES = [
  {
    id: "supportive",
    name: "Supportive Coach",
    detail: "Patient, specific, and encouraging.",
  },
  {
    id: "drill",
    name: "Drill Sergeant",
    detail: "Loud and demanding. Never tells you to ignore pain.",
  },
  {
    id: "hype",
    name: "Hype Commentator",
    detail: "Championship calls for controlled reps.",
  },
  {
    id: "calm",
    name: "Calm Instructor",
    detail: "Short cues and the score. Nothing extra.",
  },
] as const;

export type CoachId = (typeof COACHES)[number]["id"];

export const CHALLENGES = [
  {
    id: "practice",
    name: "Practice",
    detail: "Finish the set. Quality is shown, nobody is ranked.",
  },
  {
    id: "form",
    name: "Form Challenge",
    detail: "Highest average quality wins. Extra sloppy reps do not help.",
  },
  {
    id: "consistency",
    name: "Consistency Challenge",
    detail: "Steadiest match to your own target wins.",
  },
  {
    id: "personal-best",
    name: "Personal Best",
    detail: "Compared with your own similar sessions on this device.",
  },
] as const;

export type ChallengeId = (typeof CHALLENGES)[number]["id"];
