import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installSpeechFake, type SpeechFakeOptions } from './fake';
import { watchdogMs } from './timing';
import { WebSpeechEngine, type SpeechGlobals } from './web-speech';

function setup(options: SpeechFakeOptions = {}) {
  const target = {};
  const log = installSpeechFake(options, target);
  return { engine: new WebSpeechEngine(target as SpeechGlobals), log, target: target as SpeechGlobals };
}

const utterance = { text: 'banana', lang: 'en-GB', rate: 0.6, pitch: 1.1 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('WebSpeechEngine', () => {
  it('is unavailable without the Web Speech API, and then does nothing', async () => {
    const engine = new WebSpeechEngine({});
    expect(engine.isAvailable()).toBe(false);
    expect(engine.voices()).toEqual([]);
    expect(await engine.speak(utterance)).toBe('failed');
    expect(() => {
      engine.cancel();
      engine.prime();
    }).not.toThrow();
  });

  it('loads voices that arrive later, and tells listeners', async () => {
    const { engine } = setup({ voicesDelayMs: 100 });
    const changed = vi.fn();
    engine.onVoicesChanged(changed);
    expect(engine.voices()).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(engine.voices().map((v) => v.lang)).toEqual(['en-GB', 'en-US', 'pl-PL']);
    expect(engine.voices()[0]).toEqual({ id: 'Fake English (UK)', name: 'Fake English (UK)', lang: 'en-GB', local: true, isDefault: true });
  });

  it('polls when voiceschanged never fires', async () => {
    const { engine, target } = setup({ voicesDelayMs: 0 });
    // Same synthesis, but the first getVoices() answers empty and no event follows.
    const synth = target.speechSynthesis as SpeechSynthesis;
    const real = synth.getVoices.bind(synth);
    let calls = 0;
    synth.getVoices = () => (calls++ < 1 ? [] : real());
    const polled = new WebSpeechEngine(target);
    expect(polled.voices()).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(polled.voices()).toHaveLength(3);
    expect(engine.voices()).toHaveLength(3);
  });

  it('normalises underscored language tags', async () => {
    const { engine } = setup({ voices: [{ name: 'Old Android', lang: 'en_GB' }], voicesDelayMs: 0 });
    expect(engine.voices()[0]?.lang).toBe('en-GB');
  });

  it('gives every voice a unique id when the platform leaves voiceURI empty or repeats it', async () => {
    const { engine, log } = setup({
      voicesDelayMs: 0,
      voices: [
        { name: 'kal', lang: 'en-US', voiceURI: '' },
        { name: 'slt', lang: 'en-US', voiceURI: '' },
        { name: 'kal', lang: 'en-US', voiceURI: '' },
        { name: 'Same', lang: 'en-GB', voiceURI: 'uri' },
        { name: 'Same too', lang: 'en-GB', voiceURI: 'uri' }
      ]
    });
    expect(engine.voices().map((v) => v.id)).toEqual(['kal|en-US', 'slt|en-US', 'kal|en-US#2', 'uri', 'uri#2']);
    void engine.speak({ ...utterance, voiceId: 'uri#2' });
    await vi.runAllTimersAsync();
    expect(log.spoken[0]?.voice).toBe('Same too');
  });

  it('sets language, rate, pitch and the chosen voice on the utterance', async () => {
    const { engine, log } = setup({ voicesDelayMs: 0 });
    const done = engine.speak({ ...utterance, voiceId: 'Fake English (US)' });
    await vi.runAllTimersAsync();
    expect(await done).toBe('ended');
    expect(log.spoken).toEqual([
      { text: 'banana', lang: 'en-GB', rate: 0.6, pitch: 1.1, volume: 1, voice: 'Fake English (US)', outcome: 'ended' }
    ]);
  });

  it('reports start and word boundaries', async () => {
    const { engine } = setup({ voicesDelayMs: 0 });
    const events: string[] = [];
    void engine.speak(
      { ...utterance, text: 'I like fruit' },
      { onStart: () => events.push('start'), onBoundary: (i) => events.push(`b${i}`) }
    );
    await vi.runAllTimersAsync();
    expect(events).toEqual(['start', 'b0', 'b2', 'b7']);
  });

  it('cancel() settles the current utterance as cancelled at once', async () => {
    const { engine } = setup({ voicesDelayMs: 0 });
    const done = engine.speak(utterance);
    await vi.advanceTimersByTimeAsync(10);
    engine.cancel();
    expect(await done).toBe('cancelled');
  });

  it('a platform error settles as failed', async () => {
    const { engine, target } = setup({ voicesDelayMs: 0 });
    const synth = target.speechSynthesis as SpeechSynthesis;
    synth.speak = (u) => setTimeout(() => u.onerror?.call(u, Object.assign(new Event('error'), { error: 'synthesis-failed' }) as SpeechSynthesisErrorEvent), 5);
    const done = engine.speak(utterance);
    await vi.advanceTimersByTimeAsync(10);
    expect(await done).toBe('failed');
  });

  it('the watchdog settles an utterance that never ends', async () => {
    const { engine, target } = setup({ voicesDelayMs: 0 });
    (target.speechSynthesis as SpeechSynthesis).speak = () => {};
    let outcome: string | undefined;
    void engine.speak(utterance).then((o) => (outcome = o));
    await vi.advanceTimersByTimeAsync(watchdogMs(utterance.text, utterance.rate) - 1);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe('failed');
  });

  it('prime() speaks one silent, empty utterance', () => {
    const { engine, log } = setup({ voicesDelayMs: 0 });
    engine.prime();
    expect(log.spoken).toEqual([expect.objectContaining({ text: '', volume: 0 })]);
  });
});
