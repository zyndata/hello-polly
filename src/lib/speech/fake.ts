/**
 * A recording stand-in for the Web Speech API (STATE.md decision 30), shared by both suites:
 * unit tests install it on a plain object, e2e passes `installSpeechFake` to
 * `page.addInitScript`. Either way the real `WebSpeechEngine` runs on top of it.
 *
 * The function must stay **self-contained**: Playwright serialises it with `toString()`, so it
 * may not use anything from module scope, and it avoids syntax a transpiler would rewrite into
 * helper calls (class fields, object spread).
 *
 * Behaviour, modelled on Chrome: voices arrive after a delay with `voiceschanged`; an utterance
 * gets `start`, then a `boundary` per word (unless switched off), then `end`, on a timer of
 * `msPerChar` per character ÷ rate; `cancel()` fails the current utterance with `interrupted`
 * and the queued ones with `canceled`.
 */

export interface FakeVoiceSpec {
  name: string;
  lang: string;
  /** Defaults to the name. */
  voiceURI?: string;
  localService?: boolean;
  default?: boolean;
}

export interface SpeechFakeOptions {
  /** Defaults to one British, one American and one Polish voice. */
  voices?: FakeVoiceSpec[];
  /** How long `getVoices()` stays empty. 0: available at once, with no event. */
  voicesDelayMs?: number;
  msPerChar?: number;
  /** Whether `boundary` events are sent (Android often sends none). */
  boundaries?: boolean;
}

export interface SpokenRecord {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  /** The chosen voice's name, or null when the platform picks. */
  voice: string | null;
  outcome: 'pending' | 'speaking' | 'ended' | 'cancelled';
}

export interface SpeechFakeLog {
  spoken: SpokenRecord[];
  cancels: number;
}

export function installSpeechFake(options: SpeechFakeOptions = {}, target: object = globalThis): SpeechFakeLog {
  const specs = options.voices ?? [
    { name: 'Fake English (UK)', lang: 'en-GB', localService: true, default: true },
    { name: 'Fake English (US)', lang: 'en-US', localService: true },
    { name: 'Fake Polski', lang: 'pl-PL', localService: true }
  ];
  const voicesDelayMs = options.voicesDelayMs ?? 30;
  const msPerChar = options.msPerChar ?? 20;
  const boundaries = options.boundaries ?? true;

  const log: SpeechFakeLog = { spoken: [], cancels: 0 };
  const voices = specs.map((s) => ({
    name: s.name,
    lang: s.lang,
    voiceURI: s.voiceURI ?? s.name,
    localService: s.localService ?? true,
    default: s.default ?? false
  }));
  let loaded = voicesDelayMs <= 0;

  type Timer = ReturnType<typeof setTimeout>;
  type Handlers = Record<string, unknown>;

  /** Calls the `on<type>` property and the listeners, like a real event target. */
  function fire(t: EventTarget, type: string, extra: Record<string, unknown> = {}): void {
    const event = Object.assign(new Event(type), extra);
    const handler = (t as unknown as Handlers)[`on${type}`];
    if (typeof handler === 'function') handler.call(t, event);
    t.dispatchEvent(event);
  }

  class FakeUtterance extends EventTarget {
    text: string;
    lang: string;
    rate: number;
    pitch: number;
    volume: number;
    voice: { name: string } | null;
    onstart: unknown;
    onend: unknown;
    onerror: unknown;
    onboundary: unknown;
    constructor(text?: string) {
      super();
      this.text = text ?? '';
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onboundary = null;
    }
  }

  interface Item {
    u: FakeUtterance;
    rec: SpokenRecord;
    timers: Timer[];
  }
  const queue: Item[] = [];
  let current: Item | null = null;

  function next(): void {
    const item = queue.shift();
    current = item ?? null;
    if (!item) return;
    item.rec.outcome = 'speaking';
    const u = item.u;
    const at = (ms: number, fn: () => void) => item.timers.push(setTimeout(fn, ms));
    at(0, () => fire(u, 'start'));
    if (boundaries) {
      for (const m of u.text.matchAll(/\S+/g)) {
        at(Math.max(1, (m.index * msPerChar) / u.rate), () =>
          fire(u, 'boundary', { name: 'word', charIndex: m.index, charLength: m[0].length })
        );
      }
    }
    at(Math.max(2, (u.text.length * msPerChar) / u.rate), () => {
      item.rec.outcome = 'ended';
      current = null;
      fire(u, 'end');
      next();
    });
  }

  class FakeSynthesis extends EventTarget {
    onvoiceschanged: unknown;
    paused: boolean;
    constructor() {
      super();
      this.onvoiceschanged = null;
      this.paused = false;
    }
    get speaking(): boolean {
      return current !== null;
    }
    get pending(): boolean {
      return queue.length > 0;
    }
    getVoices() {
      return loaded ? voices.slice() : [];
    }
    speak(u: FakeUtterance): void {
      const rec: SpokenRecord = {
        text: u.text,
        lang: u.lang,
        rate: u.rate,
        pitch: u.pitch,
        volume: u.volume,
        voice: u.voice ? u.voice.name : null,
        outcome: 'pending'
      };
      log.spoken.push(rec);
      queue.push({ u, rec, timers: [] });
      if (!current) next();
    }
    cancel(): void {
      log.cancels += 1;
      const stopped = current;
      const dropped = queue.splice(0);
      current = null;
      if (stopped) {
        for (const timer of stopped.timers) clearTimeout(timer);
        stopped.rec.outcome = 'cancelled';
        setTimeout(() => fire(stopped.u, 'error', { error: 'interrupted' }), 0);
      }
      for (const item of dropped) {
        item.rec.outcome = 'cancelled';
        setTimeout(() => fire(item.u, 'error', { error: 'canceled' }), 0);
      }
    }
    pause(): void {}
    resume(): void {}
  }

  const synth = new FakeSynthesis();
  if (!loaded) {
    setTimeout(() => {
      loaded = true;
      fire(synth, 'voiceschanged');
    }, voicesDelayMs);
  }

  const define = (key: string, value: unknown) =>
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
  define('speechSynthesis', synth);
  define('SpeechSynthesisUtterance', FakeUtterance);
  define('__speech', log);
  return log;
}
