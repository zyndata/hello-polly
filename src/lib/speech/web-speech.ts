/**
 * WebSpeechEngine: the device's own voices through the Web Speech API. This file is the only
 * place in the app that touches `speechSynthesis` (CLAUDE.md "Through the abstractions only").
 *
 * Platform rules it absorbs:
 * - voices load asynchronously: `voiceschanged` where it fires, a short poll where it does not
 *   (some Android builds);
 * - a live reference to every utterance is kept until it settles, because Chrome garbage-
 *   collects utterances and then drops their events;
 * - `cancel()` settles every pending promise at once, since Safari may report a cancelled
 *   utterance as ended, late, or not at all;
 * - a watchdog settles an utterance that never ends (STATE.md decision 28).
 */

import type { EngineVoice, SpeechEngine, Utterance, UtteranceEvents, UtteranceOutcome } from './engine';
import { watchdogMs } from './timing';
import { normaliseLang } from './voices';

/** The parts of `window` this engine uses, so tests can hand it a fake. */
export interface SpeechGlobals {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

const POLL_MS = 250;
const POLL_TRIES = 12;

export class WebSpeechEngine implements SpeechEngine {
  private readonly synth: SpeechSynthesis | undefined;
  private readonly Utter: typeof SpeechSynthesisUtterance | undefined;
  private list: EngineVoice[] = [];
  /** `EngineVoice.id` → the platform's voice object, as of the last refresh. */
  private byId = new Map<string, SpeechSynthesisVoice>();
  private readonly listeners = new Set<() => void>();
  /** Every utterance not yet settled, with the function that settles it. */
  private readonly live = new Map<SpeechSynthesisUtterance, (outcome: UtteranceOutcome) => void>();

  constructor(globals: SpeechGlobals = globalThis as SpeechGlobals) {
    this.synth = globals.speechSynthesis;
    this.Utter = globals.SpeechSynthesisUtterance;
    if (!this.isAvailable()) return;
    this.refresh();
    this.synth?.addEventListener('voiceschanged', () => this.refresh());
    let tries = 0;
    const poll = () => {
      if (this.list.length > 0 || ++tries > POLL_TRIES) return;
      setTimeout(() => {
        this.refresh();
        poll();
      }, POLL_MS);
    };
    poll();
  }

  isAvailable(): boolean {
    return this.synth !== undefined && this.Utter !== undefined;
  }

  voices(): readonly EngineVoice[] {
    return this.list;
  }

  onVoicesChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  speak(utterance: Utterance, events: UtteranceEvents = {}): Promise<UtteranceOutcome> {
    const { synth, Utter } = this;
    if (!synth || !Utter) return Promise.resolve('failed');
    return new Promise((resolve) => {
      const u = new Utter(utterance.text);
      u.lang = utterance.lang;
      u.rate = utterance.rate;
      u.pitch = utterance.pitch;
      const voice = utterance.voiceId === undefined ? undefined : this.byId.get(utterance.voiceId);
      if (voice) u.voice = voice;

      const settle = (outcome: UtteranceOutcome) => {
        if (!this.live.has(u)) return;
        this.live.delete(u);
        clearTimeout(watchdog);
        resolve(outcome);
      };
      u.onstart = () => events.onStart?.();
      u.onboundary = (e) => {
        if (e.name === undefined || e.name === 'word') events.onBoundary?.(e.charIndex);
      };
      u.onend = () => settle('ended');
      u.onerror = (e) => settle(e.error === 'interrupted' || e.error === 'canceled' ? 'cancelled' : 'failed');
      const watchdog = setTimeout(() => settle('failed'), watchdogMs(utterance.text, utterance.rate));

      this.live.set(u, settle);
      synth.speak(u);
    });
  }

  cancel(): void {
    if (!this.synth) return;
    const pending = [...this.live.values()];
    this.synth.cancel();
    for (const settle of pending) settle('cancelled');
  }

  prime(): void {
    const { synth, Utter } = this;
    if (!synth || !Utter) return;
    // iOS allows speech only once it has been started inside a gesture; a silent, empty
    // utterance is enough.
    const u = new Utter('');
    u.volume = 0;
    synth.speak(u);
  }

  private refresh(): void {
    const byId = new Map<string, SpeechSynthesisVoice>();
    const next = (this.synth?.getVoices() ?? []).map((v): EngineVoice => {
      const id = voiceId(v, byId);
      byId.set(id, v);
      return { id, name: v.name, lang: normaliseLang(v.lang), local: v.localService, isDefault: v.default };
    });
    this.byId = byId;
    const key = (list: EngineVoice[]) => list.map((v) => `${v.id}|${v.lang}`).join('\n');
    if (key(next) === key(this.list)) return;
    this.list = next;
    for (const listener of this.listeners) listener();
  }
}

/**
 * A voice's id: its `voiceURI`, or its name and language where the platform leaves the URI
 * empty (WebKit with espeak on Linux reports "" for every voice), made unique with `#2`, `#3`…
 * Stable between visits as long as the device's voices stay the same.
 */
function voiceId(voice: SpeechSynthesisVoice, taken: ReadonlyMap<string, unknown>): string {
  const base = voice.voiceURI || `${voice.name}|${voice.lang}`;
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}#${n}`;
  return id;
}
