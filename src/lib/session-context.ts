/** Matches the current form weights. Rows from another version stay off this board. */
export const SCORING_VERSION = "form-v1";

export type CoachPersonality = "supportive" | "drill" | "hype" | "calm";

export type Trend = "up" | "down" | "flat" | "unknown";
export type Focus =
  | "first"
  | "improvement"
  | "decline"
  | "control"
  | "range"
  | "alignment"
  | "streak"
  | "unscored"
  | "tracking"
  | "recap"
  | "none";

export type MeasuredMetric = {
  id: string;
  label: string;
  score: number | null;
  note: string;
};

export type MeasuredRep = {
  scored: boolean;
  quality: number | null;
  confidence: number;
  rushed: boolean;
  feedback: string;
  metrics: MeasuredMetric[];
};

export type SessionContext = {
  exercise: string;
  personality: CoachPersonality;
  name: string;
  goal: number;
  repNumber: number;
  recentQualities: number[];
  average: number | null;
  trend: Trend;
  confidence: number | null;
  tracking: boolean;
  completed: boolean;
  recentComments: string[];
  spokenKeys: string[];
  rushedRecent: boolean[];
  weakIds: string[];
  controlNote: string | null;
  rangeNote: string | null;
  alignmentNote: string | null;
  suggestion: string | null;
  strongestLabel: string | null;
  improvement: number | null;
  feedback: string;
};

export type CoachDecision = {
  speak: boolean;
  key: string;
  focus: Focus;
  tone: "corrective" | "encouraging" | "humorous" | "neutral";
  fact: string;
  priority: number;
  safety: boolean;
  repNumber: number;
};

const empty = (): SessionContext => ({
  exercise: "arm-raises",
  personality: "supportive",
  name: "You",
  goal: 4,
  repNumber: 0,
  recentQualities: [],
  average: null,
  trend: "unknown",
  confidence: null,
  tracking: true,
  completed: false,
  recentComments: [],
  spokenKeys: [],
  rushedRecent: [],
  weakIds: [],
  controlNote: null,
  rangeNote: null,
  alignmentNote: null,
  suggestion: null,
  strongestLabel: null,
  improvement: null,
  feedback: "",
});

export function createSession(
  partial: Partial<Pick<SessionContext, "exercise" | "personality" | "name" | "goal">>,
): SessionContext {
  return { ...empty(), ...partial };
}

function metric(rep: MeasuredRep, id: string) {
  return rep.metrics.find((item) => item.id === id) ?? null;
}

function weakest(rep: MeasuredRep) {
  return rep.metrics
    .filter((item) => item.score != null)
    .sort((a, b) => a.score! - b.score!)[0] ?? null;
}

export function applyRep(context: SessionContext, rep: MeasuredRep): SessionContext {
  const next: SessionContext = {
    ...context,
    confidence: rep.confidence,
    feedback: rep.feedback,
    tracking: true,
    controlNote: metric(rep, "control")?.note ?? context.controlNote,
    rangeNote: metric(rep, "range")?.note ?? context.rangeNote,
    alignmentNote: metric(rep, "alignment")?.note ?? context.alignmentNote,
    rushedRecent: [...context.rushedRecent, rep.rushed].slice(-3),
  };
  if (!rep.scored || rep.quality == null) {
    next.repNumber = context.repNumber;
    return next;
  }
  const qualities = [...context.recentQualities, rep.quality].slice(-8);
  const previous = context.recentQualities.at(-1) ?? null;
  const average = Math.round(qualities.reduce((sum, score) => sum + score, 0) / qualities.length);
  const low = weakest(rep);
  const weakIds = [...context.weakIds, low?.id ?? ""].filter(Boolean).slice(-3);
  return {
    ...next,
    repNumber: context.repNumber + 1,
    recentQualities: qualities,
    average,
    trend:
      previous == null
        ? "unknown"
        : rep.quality - previous >= 8
          ? "up"
          : previous - rep.quality >= 12
            ? "down"
            : "flat",
    weakIds,
    suggestion: low && low.score != null && low.score < 85 ? low.note : context.suggestion,
    strongestLabel: strongestOf(rep) ?? context.strongestLabel,
    improvement:
      qualities.length >= 2 ? qualities[qualities.length - 1] - qualities[0] : null,
  };
}

function strongestOf(rep: MeasuredRep) {
  const ranked = rep.metrics
    .filter((item) => item.score != null)
    .sort((a, b) => b.score! - a.score!);
  return ranked[0]?.label ?? null;
}

export function applyTracking(context: SessionContext, tracking: boolean): SessionContext {
  return {
    ...context,
    tracking,
    spokenKeys: tracking
      ? context.spokenKeys.filter((key) => key !== "tracking")
      : context.spokenKeys,
  };
}

export function completeSession(context: SessionContext): SessionContext {
  return { ...context, completed: true };
}

export function rememberComment(context: SessionContext, key: string, line: string): SessionContext {
  return {
    ...context,
    spokenKeys: [...context.spokenKeys, key].slice(-12),
    recentComments: [...context.recentComments, line].slice(-4),
  };
}

function heard(context: SessionContext, key: string) {
  return context.spokenKeys.includes(key);
}

export function decide(context: SessionContext, rep?: MeasuredRep): CoachDecision {
  const quiet = (focus: Focus = "none"): CoachDecision => ({
    speak: false,
    key: "",
    focus,
    tone: "neutral",
    fact: "",
    priority: 0,
    safety: false,
    repNumber: context.repNumber,
  });
  if (!context.tracking) {
    const key = "tracking";
    if (heard(context, key)) return quiet("tracking");
    return {
      speak: true,
      key,
      focus: "tracking",
      tone: "neutral",
      fact: context.feedback || "Step back until the camera can see the whole movement.",
      priority: 8,
      safety: true,
      repNumber: context.repNumber,
    };
  }
  if (context.completed) {
    return {
      speak: true,
      key: "recap",
      focus: "recap",
      tone: "neutral",
      fact: "",
      priority: 10,
      safety: true,
      repNumber: context.repNumber,
    };
  }
  if (!rep) return quiet();
  if (!rep.scored || rep.quality == null) {
    const key = `unscored-${rep.feedback}`;
    if (heard(context, key) || context.recentComments.at(-1) === rep.feedback) return quiet("unscored");
    return {
      speak: true,
      key,
      focus: "unscored",
      tone: "neutral",
      fact: rep.feedback,
      priority: 5,
      safety: true,
      repNumber: context.repNumber,
    };
  }
  if (context.repNumber === 1 && !heard(context, "first")) {
    return {
      speak: true,
      key: "first",
      focus: "first",
      tone: "neutral",
      fact: `${rep.quality}. ${rep.feedback}`,
      priority: 4,
      safety: false,
      repNumber: context.repNumber,
    };
  }
  const rushed = context.rushedRecent.filter(Boolean).length >= 2;
  if (rushed && !heard(context, "control-rushed")) {
    return {
      speak: true,
      key: "control-rushed",
      focus: "control",
      tone: context.personality === "drill" || context.personality === "hype" ? "humorous" : "corrective",
      fact: metric(rep, "control")?.note || rep.feedback,
      priority: 6,
      safety: false,
      repNumber: context.repNumber,
    };
  }
  const weak = weakest(rep);
  const repeated =
    weak &&
    weak.score != null &&
    weak.score < 75 &&
    context.weakIds.filter((id) => id === weak.id).length >= 2;
  if (repeated && weak && !heard(context, `issue-${weak.id}`)) {
    if (!(weak.id === "control" && heard(context, "control-rushed"))) {
      const focus =
        weak.id === "range" || weak.id === "alignment" || weak.id === "control"
          ? weak.id
          : "control";
      return {
        speak: true,
        key: `issue-${weak.id}`,
        focus,
        tone: "corrective",
        fact: weak.note,
        priority: 5,
        safety: false,
        repNumber: context.repNumber,
      };
    }
  }
  const previous = context.recentQualities.at(-2) ?? null;
  if (previous != null && rep.quality - previous >= 8 && !heard(context, `up-${context.repNumber}`)) {
    return {
      speak: true,
      key: `up-${context.repNumber}`,
      focus: "improvement",
      tone: "encouraging",
      fact: `${previous} to ${rep.quality}. ${rep.feedback}`,
      priority: 4,
      safety: false,
      repNumber: context.repNumber,
    };
  }
  const streak =
    context.recentQualities.length >= 3 &&
    context.recentQualities.slice(-3).every((score) => score >= 85);
  if (streak && !heard(context, `streak-${context.repNumber}`)) {
    const earlier = context.spokenKeys.some((key) => key.startsWith("streak-"));
    if (!earlier || context.repNumber % 3 === 0) {
      return {
        speak: true,
        key: `streak-${context.repNumber}`,
        focus: "streak",
        tone: "encouraging",
        fact: `${rep.quality}`,
        priority: 3,
        safety: false,
        repNumber: context.repNumber,
      };
    }
  }
  if (previous != null && previous - rep.quality >= 12 && !heard(context, `down-${context.repNumber}`)) {
    return {
      speak: true,
      key: `down-${context.repNumber}`,
      focus: "decline",
      tone: "neutral",
      fact: rep.feedback,
      priority: 4,
      safety: false,
      repNumber: context.repNumber,
    };
  }
  return quiet();
}

function clean(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

export function renderLine(context: SessionContext, decision: CoachDecision): string {
  if (!decision.speak) return "";
  const name = context.name;
  const fact = decision.fact;
  if (decision.focus === "tracking") {
    return clean(
      context.personality === "drill"
        ? `${name}, hold up. ${fact}`
        : context.personality === "hype"
          ? `${name}, the camera lost you. ${fact}`
          : `${name}, ${fact}`,
    );
  }
  if (decision.focus === "recap") return renderRecap(context);
  if (decision.focus === "unscored") {
    return clean(
      context.personality === "calm"
        ? `Not scored. ${fact}`
        : context.personality === "drill"
          ? `${name}, I can't score that one. ${fact}`
          : `${name}, I'll leave that one unscored. ${fact}`,
    );
  }
  if (decision.focus === "first") {
    return clean(
      context.personality === "calm"
        ? `First scored rep, ${fact}`
        : context.personality === "drill"
          ? `${name}, first one is in. ${fact}`
          : context.personality === "hype"
            ? `${name} opens with ${fact}`
            : `${name}, that's a start. ${fact}`,
    );
  }
  if (decision.focus === "control" && decision.tone === "humorous") {
    return clean(
      context.personality === "drill"
        ? `${name}, that one sprinted off without you. ${fact}`
        : context.personality === "hype"
          ? `${name}, that rep tried to set a speed record. ${fact}`
          : `${name}, that one got quick. ${fact}`,
    );
  }
  if (decision.focus === "improvement") {
    return clean(
      context.personality === "hype"
        ? `${name}, that jumped, ${fact}`
        : context.personality === "drill"
          ? `Better, ${name}. ${fact}`
          : context.personality === "calm"
            ? `Better. ${fact}`
            : `That's smoother, ${name}. ${fact}`,
    );
  }
  if (decision.focus === "streak") {
    return clean(
      context.personality === "hype"
        ? `Three strong reps, and that one was ${fact}.`
        : context.personality === "drill"
          ? `${name}, three controlled reps. Keep that, not the rush.`
          : context.personality === "calm"
            ? `Three steady reps. Last one was ${fact}.`
            : `${name}, three solid reps in a row. Last one was ${fact}.`,
    );
  }
  if (decision.focus === "decline" || decision.focus === "range" || decision.focus === "alignment" || decision.focus === "control") {
    return clean(
      context.personality === "calm" ? fact : `${name}, ${fact.charAt(0).toLowerCase()}${fact.slice(1)}`,
    );
  }
  return clean(fact);
}

export function renderRecap(context: SessionContext) {
  const average = context.average == null ? "an unscored set" : `${context.average}`;
  const change =
    context.improvement == null
      ? ""
      : context.improvement >= 5
        ? ` The scores climbed by ${context.improvement}.`
        : context.improvement <= -5
          ? ` The scores finished ${Math.abs(context.improvement)} lower than they started.`
          : " The scores stayed close.";
  const next = context.suggestion ? ` Next time, ${context.suggestion.charAt(0).toLowerCase()}${context.suggestion.slice(1)}` : "";
  const strongest = context.strongestLabel ? ` Strongest measure was ${context.strongestLabel.toLowerCase()}.` : "";
  return clean(
    `${context.name}, ${context.repNumber} scored reps, average ${average}.${change}${strongest}${next}`,
  );
}

export function renderFixed(
  personality: CoachPersonality,
  type: "intro" | "preview" | "stop",
  name: string,
) {
  const lines = {
    supportive: {
      intro: `${name}, we'll work on control and your selected target. Stop if anything feels painful.`,
      preview:
        "I'm the supportive coach. I'll notice when a rep gets smoother, and I won't pile on when one doesn't. Stop if anything hurts.",
      stop: `${name}, we stopped. That's the right call if something hurts or you're done.`,
    },
    drill: {
      intro: `${name}, controlled reps. Stop immediately if you feel pain.`,
      preview:
        "Drill sergeant here. I'll give you a hard time about sloppy reps, and I still want you to stop if something hurts.",
      stop: `${name}, session stopped. We don't train through pain.`,
    },
    hype: {
      intro: `${name}, we're scoring control, not speed. Stop if you feel pain.`,
      preview:
        "Hype commentator. I'll get loud for a genuinely sharp rep, then get out of the way. Stop if you feel pain.",
      stop: `${name}, you called it. Stopping when you need to is part of the set.`,
    },
    calm: {
      intro: `${name}, move to your target and come back slowly. Stop if you feel pain.`,
      preview: "Calm instructor. Short cues, no extra noise. Stop if you feel pain.",
      stop: `${name}, session stopped. End a set whenever you need to.`,
    },
  } as const;
  return lines[personality][type];
}

export function isStale(context: SessionContext, decision: CoachDecision) {
  return context.repNumber !== decision.repNumber;
}

export function coachPayload(context: SessionContext, decision: CoachDecision) {
  return {
    personality: context.personality,
    exercise: context.exercise,
    name: context.name,
    repNumber: context.repNumber,
    goal: context.goal,
    recentQualities: context.recentQualities.slice(-6),
    average: context.average,
    trend: context.trend,
    focus: decision.focus,
    tone: decision.tone,
    fact: decision.fact,
    recentComments: context.recentComments.slice(-4),
    completed: context.completed,
    suggestion: context.suggestion,
    strongest: context.strongestLabel,
    improvement: context.improvement,
  };
}
