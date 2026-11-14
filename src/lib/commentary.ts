import type { GameEvent } from "./engine";

export type Personality = "hype" | "dry" | "documentary";
export function commentaryFor(
  event: GameEvent,
  names: string[],
  personality: Personality,
): string | null {
  const player = names[event.player ?? 0] || "Our competitor";
  const score = event.scores[event.player ?? 0] ?? 0;
  const leader = event.scores.indexOf(Math.max(...event.scores));
  const tied =
    event.scores.length > 1 && event.scores.every((s) => s === event.scores[0]);
  const lines: Record<string, [string, string, string]> = {
    MATCH_STARTED: [
      `${names.join(" versus ")}! The living room is now a stadium. Let the championship begin!`,
      `${names.join(" and ")} have arrived. The stakes are imaginary. The effort is real.`,
      `Here we observe ${names.join(" and ")} entering the competitive habitat.`,
    ],
    PLAYER_TAKES_LEAD: [
      `${player} takes the lead! History is being made between the sofa and the coffee table!`,
      `${player} leads. The furniture remains understandably speechless.`,
      `${player} establishes a narrow advantage in this remarkable display.`,
    ],
    SCORE_TIED: [
      "All square! This championship refuses to be decided!",
      "A tie. Our nonexistent bookmakers are deeply concerned.",
      "Balance returns to the competitive ecosystem.",
    ],
    HALF_TIME: [
      "Halfway there! Leave absolutely nothing in the living room!",
      "Halfway. Time continues to perform as expected.",
      "At the midpoint, endurance becomes the decisive adaptation.",
    ],
    FINAL_TEN_SECONDS: [
      "Ten seconds remain! This is your moment!",
      "Ten seconds. A manageable length of sporting immortality.",
      "The final ten seconds will reveal the strongest finish.",
    ],
    MATCH_FINISHED: tied
      ? [
          "A dead heat! Two legends, one deeply confused living room!",
          "A draw. We have successfully avoided making a decision.",
          "The contest ends in perfect equilibrium.",
        ]
      : names.length === 1
        ? [
            `${names[0]} finishes with ${event.scores[0]}! A household legend is born!`,
            `${event.scores[0]} repetitions. A personal triumph over remaining seated.`,
            `${names[0]} completes the display with ${event.scores[0]} successful repetitions.`,
          ]
        : [
            `${names[leader]} wins ${event.scores.join(" to ")}! Give that champion the imaginary trophy!`,
            `${names[leader]} wins. The prize is the right to mention this at dinner.`,
            `${names[leader]} emerges victorious. The others retreat with dignity intact.`,
          ],
  };
  if (event.type === "REP_COMPLETED" && score > 0 && score % 5 === 0)
    return `${player} reaches ${score}! ${personality === "hype" ? "An unstoppable household force!" : personality === "dry" ? "The numbers are getting impressively larger." : "A sustained display of coordination."}`;
  return (
    lines[event.type]?.[{ hype: 0, dry: 1, documentary: 2 }[personality]] ??
    null
  );
}

interface Line {
  text: string;
  priority: number;
  key: string;
  created: number;
}
/** Bounded event queue. Priority is descending; old routine calls are discarded. */
export class CommentaryQueue {
  private items: Line[] = [];
  private seen = new Set<string>();
  push(text: string, priority = 1, key = text, now = Date.now()) {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > 200)
      this.seen.delete(this.seen.values().next().value!);
    if (priority >= 10) this.items = [];
    this.items.push({ text, priority, key, created: now });
    this.items.sort((a, b) => b.priority - a.priority || a.created - b.created);
    this.items = this.items.slice(0, 8);
    return true;
  }
  pop(now = Date.now()) {
    this.items = this.items.filter(
      (item) => now - item.created < (item.priority >= 8 ? 30000 : 7000),
    );
    return this.items.shift();
  }
  clear() {
    this.items = [];
    this.seen.clear();
  }
}

export class BroadcastVoice {
  personality: Personality = "hype";
  private isMuted = false;
  get muted() {
    return this.isMuted;
  }
  set muted(value: boolean) {
    this.isMuted = value;
    if (value) this.stop();
  }
  private queue = new CommentaryQueue();
  private busy = false;
  private generation = 0;
  private controller?: AbortController;
  private audio?: HTMLAudioElement;
  private cancelPlayback?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private cache = new Map<string, Blob>();
  private unavailableUntil = 0;
  private lastStarted = -Infinity;
  constructor(
    private onCaption: (text: string) => void,
    private onStatus: (status: string) => void,
  ) {}
  unlock() {
    if (typeof window === "undefined") return;
    this.audio ??= new Audio();
    // Unlock browser audio from the initiating click, using a tiny silent WAV.
    this.audio.src =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA";
    void this.audio
      .play()
      .then(() => {
        this.audio?.pause();
      })
      .catch(() => {});
    window.speechSynthesis?.resume();
  }
  enqueue(text: string, priority = 1, key = text) {
    if (this.isMuted) {
      this.onCaption(text);
      return;
    }
    if (!this.queue.push(text, priority, key)) return;
    if (priority >= 10) this.cancelCurrent();
    void this.pump();
  }
  private cancelCurrent() {
    this.generation++;
    this.controller?.abort();
    this.audio?.pause();
    this.cancelPlayback?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (this.timer) clearTimeout(this.timer);
    this.busy = false;
  }
  stop() {
    this.queue.clear();
    this.cancelCurrent();
  }
  private async pump() {
    if (this.busy || this.isMuted) return;
    const wait = 1800 - (Date.now() - this.lastStarted);
    if (wait > 0) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.pump(), wait);
      return;
    }
    const line = this.queue.pop();
    if (!line) return;
    this.busy = true;
    this.onStatus("Preparing commentary audio…");
    this.lastStarted = Date.now();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const cacheKey = `${this.personality}:${line.text}`;
      let blob = this.cache.get(cacheKey);
      if (!blob) {
        if (Date.now() < this.unavailableUntil) throw new Error("fallback");
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: line.text,
            personality: this.personality,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          this.unavailableUntil = Date.now() + 60000;
          throw new Error("unavailable");
        }
        blob = await response.blob();
        if (this.cache.size >= 24)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(cacheKey, blob);
      }
      clearTimeout(timeout);
      if (generation !== this.generation) return;
      this.onStatus("ElevenLabs · live voice");
      await this.play(blob, line.text);
    } catch {
      if (generation !== this.generation) return;
      this.onStatus("Demo voice · browser speech / captions");
      this.onCaption(line.text);
      await this.speakFallback(line.text);
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) {
        this.busy = false;
        void this.pump();
      }
    }
  }
  private play(blob: Blob, text: string) {
    const audio = (this.audio ??= new Audio());
    const url = URL.createObjectURL(blob);
    audio.src = url;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        audio.pause();
        finish();
      }, 20000);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        audio.onended = null;
        audio.onerror = null;
        audio.onplaying = null;
        URL.revokeObjectURL(url);
        this.cancelPlayback = undefined;
        if (error) reject(error);
        else resolve();
      };
      this.cancelPlayback = () => finish();
      audio.onended = () => finish();
      audio.onplaying = () => this.onCaption(text);
      audio.onerror = () => finish(new Error("audio"));
      void audio.play().catch(() => finish(new Error("autoplay")));
    });
  }
  private speakFallback(text: string) {
    return new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }
      let settled = false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.personality === "hype" ? 1.15 : 1;
      const timeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        finish();
      }, 15000);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.cancelPlayback = undefined;
        resolve();
      };
      this.cancelPlayback = finish;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }
}
