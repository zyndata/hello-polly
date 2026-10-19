/**
 * Speaker: what the app means by "say this" (STATE.md decisions 20–24, 28), over any
 * `SpeechEngine`.
 *
 * - English words at the family's slow or normal rate; Polish prompts at a fixed rate.
 * - Every new request cancels the previous one first, so taps never queue up.
 * - Slow mode adds a pause and, when the family wants it, says the word a second time.
 * - Prompts are Polish with the English word inside; without a Polish voice (or with Polish
 *   prompts switched off) only the English parts are spoken.
 * - Stories go sentence by sentence and report the word being spoken.
 * - Nothing reaches the engine before `unlock()`, which a gesture handler calls.
 */

import { DEFAULT_SETTINGS, clampRate } from '../domain/family';
import type { Accent, FamilySettings, Speed, Word } from '../types';
import type { EngineVoice, SpeechEngine, Utterance, UtteranceEvents, UtteranceOutcome } from './engine';
import { promptSegments, spokenForm, type Segment } from './prompt';
import { fallbackSchedule, wordAt, wordRanges } from './timing';
import { chooseVoice } from './voices';

export type Lang = 'en' | 'pl';
export const POLISH_TAG = 'pl-PL';
export const PITCH = 1.1;
export const POLISH_RATE = 1.0;
/** Before the repeat in slow mode. */
export const SLOW_PAUSE_MS = 600;
/** Before the English word inside a Polish prompt. */
export const WORD_PAUSE_MS = 250;
/** Between sentences of a story. */
export const SENTENCE_PAUSE_MS = 400;

export type SpeakerSettings = Pick<
  FamilySettings,
  'accent' | 'slowRate' | 'normalRate' | 'slowRepeatTwice' | 'polishPrompts'
>;

/** Language tag → preferred `EngineVoice.id`, chosen on this device. */
export type PreferredVoices = Partial<Record<string, string>>;

/**
 * `locked`: called before the unlock gesture. `unavailable`: no engine or nothing it could say.
 * `failed`: the platform gave up on at least one utterance.
 */
export type SpeakOutcome = 'done' | 'cancelled' | 'locked' | 'unavailable' | 'failed';

/** `after` runs once the utterance has settled, however it settled. */
type SayStep = { say: Utterance; events?: UtteranceEvents; after?: () => void };
type Step = SayStep | { pause: number };

export class Speaker {
  private settings: SpeakerSettings = { ...DEFAULT_SETTINGS };
  private preferred: PreferredVoices = {};
  private unlocked = false;
  /** Bumped by every request and by `cancel()`; a run that sees it change stops. */
  private generation = 0;

  constructor(
    readonly engine: SpeechEngine,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {}

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Call inside a user gesture. Idempotent. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.engine.isAvailable()) this.engine.prime();
  }

  configure(settings: Partial<SpeakerSettings>, preferred?: PreferredVoices): void {
    const next = { ...this.settings, ...settings };
    next.slowRate = clampRate('slowRate', next.slowRate);
    next.normalRate = clampRate('normalRate', next.normalRate);
    this.settings = next;
    if (preferred) this.preferred = { ...preferred };
  }

  get accent(): Accent {
    return this.settings.accent;
  }

  /** The language tag a language is spoken in: the family's accent for English. */
  tag(lang: Lang): string {
    return lang === 'en' ? this.settings.accent : POLISH_TAG;
  }

  voiceFor(lang: Lang): EngineVoice | undefined {
    const tag = this.tag(lang);
    return chooseVoice(this.engine.voices(), tag, this.preferred[tag]);
  }

  /** Whether prompts will be heard in Polish: switched on, and a Polish voice exists. */
  get speaksPolish(): boolean {
    return this.settings.polishPrompts && this.voiceFor('pl') !== undefined;
  }

  rate(lang: Lang, speed: Speed): number {
    if (lang === 'pl') return POLISH_RATE;
    return speed === 'slow' ? this.settings.slowRate : this.settings.normalRate;
  }

  /** Stops whatever is being said. */
  cancel(): void {
    this.generation += 1;
    this.engine.cancel();
  }

  /** Text in one language. English honours the speed; slow mode may repeat it. */
  speak(text: string, opts: { lang: Lang; speed: Speed }): Promise<SpeakOutcome> {
    return this.run(opts.lang === 'en' ? this.wordSteps(text, opts.speed) : [this.step('pl', text, 'normal')]);
  }

  /** A word as the child hears it: its `say` override, else the English word. */
  sayWord(word: Pick<Word, 'en' | 'say'>, speed: Speed): Promise<SpeakOutcome> {
    return this.speak(spokenForm(word), { lang: 'en', speed });
  }

  /** A Polish prompt template from the catalog, with the English word in place of `{word}`. */
  sayPrompt(template: string, speed: Speed, word?: Pick<Word, 'en' | 'say' | 'pl' | 'plAcc'>): Promise<SpeakOutcome> {
    return this.saySegments(promptSegments(template, word), speed);
  }

  /**
   * Polish and English parts as one request (so one tap elsewhere cuts them off together). The
   * Polish parts are skipped when `speaksPolish` is false; English parts get the speed rules.
   */
  saySegments(segments: readonly Segment[], speed: Speed): Promise<SpeakOutcome> {
    const steps: Step[] = [];
    let previous: Segment | undefined;
    for (const segment of segments) {
      if (segment.lang === 'pl') {
        if (!this.speaksPolish) continue;
        steps.push(this.step('pl', segment.text, speed));
      } else {
        if (previous) steps.push({ pause: WORD_PAUSE_MS });
        steps.push(...this.wordSteps(segment.text, speed));
      }
      previous = segment;
    }
    return this.run(steps);
  }

  /**
   * English sentences, one utterance each (Chrome cuts long ones), at the given speed and
   * without the slow repeat. `onWord(sentence, word)` follows the speech: from `boundary`
   * events when the platform sends them, from a timed estimate until it does.
   */
  speakSentences(
    sentences: readonly string[],
    opts: { speed: Speed; onWord?: (sentence: number, word: number) => void }
  ): Promise<SpeakOutcome> {
    const steps: Step[] = [];
    let realBoundaries = false;
    for (const [s, text] of sentences.entries()) {
      if (s > 0) steps.push({ pause: SENTENCE_PAUSE_MS });
      const step = this.step('en', text, opts.speed);
      const onWord = opts.onWord;
      if (onWord) {
        const ranges = wordRanges(text);
        const timers: ReturnType<typeof setTimeout>[] = [];
        const stopFallback = () => timers.splice(0).forEach(clearTimeout);
        let last = -1;
        const report = (w: number) => {
          if (w < 0 || w === last) return;
          last = w;
          onWord(s, w);
        };
        step.events = {
          onStart: () => {
            if (realBoundaries) return;
            for (const [w, ms] of fallbackSchedule(text, step.say.rate).entries()) {
              timers.push(setTimeout(() => report(w), ms));
            }
          },
          onBoundary: (charIndex) => {
            realBoundaries = true;
            stopFallback();
            report(wordAt(ranges, charIndex));
          }
        };
        step.after = stopFallback;
      }
      steps.push(step);
    }
    return this.run(steps);
  }

  private step(lang: Lang, text: string, speed: Speed): SayStep {
    return {
      say: {
        text,
        lang: this.tag(lang),
        rate: this.rate(lang, speed),
        pitch: PITCH,
        voiceId: this.voiceFor(lang)?.id
      }
    };
  }

  private wordSteps(text: string, speed: Speed): Step[] {
    const once = this.step('en', text, speed);
    if (speed === 'normal') return [once];
    return this.settings.slowRepeatTwice ? [once, { pause: SLOW_PAUSE_MS }, once] : [once];
  }

  /** Cancels what came before, then runs the steps in order unless something newer starts. */
  private async run(steps: Step[]): Promise<SpeakOutcome> {
    if (!this.unlocked) return 'locked';
    if (!this.engine.isAvailable()) return 'unavailable';
    const token = ++this.generation;
    this.engine.cancel();
    if (!steps.some((s) => 'say' in s)) return 'unavailable';
    let failed = false;
    for (const s of steps) {
      if (token !== this.generation) return 'cancelled';
      if ('pause' in s) {
        await this.wait(s.pause);
        continue;
      }
      const outcome: UtteranceOutcome = await this.engine.speak(s.say, s.events);
      s.after?.();
      if (outcome === 'cancelled' || token !== this.generation) return 'cancelled';
      if (outcome === 'failed') failed = true;
    }
    return failed ? 'failed' : 'done';
  }
}
