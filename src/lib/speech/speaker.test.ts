import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installSpeechFake, type SpeechFakeLog, type SpeechFakeOptions } from './fake';
import { PITCH, POLISH_RATE, SENTENCE_PAUSE_MS, SLOW_PAUSE_MS, Speaker } from './speaker';
import { WebSpeechEngine, type SpeechGlobals } from './web-speech';

const banana = { en: 'banana', pl: 'banan', plAcc: 'banana' };

/** A speaker over the real WebSpeechEngine over the fake, voices loaded, unlocked. */
async function setup(options: SpeechFakeOptions = {}, unlock = true): Promise<{ speaker: Speaker; log: SpeechFakeLog }> {
  const target = {};
  const log = installSpeechFake(options, target);
  const speaker = new Speaker(new WebSpeechEngine(target as SpeechGlobals));
  await vi.advanceTimersByTimeAsync(100);
  if (unlock) speaker.unlock();
  log.spoken.splice(0); // the unlock's silent utterance
  return { speaker, log };
}

const said = (log: SpeechFakeLog) => log.spoken.map((r) => ({ text: r.text, lang: r.lang, rate: r.rate }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Speaker: speeds and rates', () => {
  it('speaks slow at the configured slow rate and normal at the normal rate', async () => {
    const { speaker, log } = await setup();
    speaker.configure({ slowRate: 0.55, normalRate: 0.95 });
    const slow = speaker.sayWord(banana, 'slow');
    await vi.runAllTimersAsync();
    expect(await slow).toBe('done');
    const normal = speaker.sayWord(banana, 'normal');
    await vi.runAllTimersAsync();
    expect(await normal).toBe('done');
    expect(said(log)).toEqual([
      { text: 'banana', lang: 'en-GB', rate: 0.55 },
      { text: 'banana', lang: 'en-GB', rate: 0.95 }
    ]);
    expect(log.spoken.every((r) => r.pitch === PITCH)).toBe(true);
  });

  it('uses the defaults (0.6 and 0.9) until configured', async () => {
    const { speaker, log } = await setup();
    void speaker.sayWord(banana, 'slow');
    await vi.runAllTimersAsync();
    void speaker.sayWord(banana, 'normal');
    await vi.runAllTimersAsync();
    expect(log.spoken.map((r) => r.rate)).toEqual([0.6, 0.9]);
  });

  it('clamps configured rates to the plan ranges', async () => {
    const { speaker } = await setup();
    speaker.configure({ slowRate: 0.1, normalRate: 3 });
    expect(speaker.rate('en', 'slow')).toBe(0.4);
    expect(speaker.rate('en', 'normal')).toBe(1.1);
  });

  it('repeats a slow word after a pause when asked, and never a normal one', async () => {
    const { speaker, log } = await setup();
    speaker.configure({ slowRepeatTwice: true });
    void speaker.sayWord(banana, 'slow');
    // The first "banana" at 0.6 takes 6 × 20 / 0.6 = 200 ms in the fake.
    await vi.advanceTimersByTimeAsync(210);
    expect(log.spoken).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(SLOW_PAUSE_MS - 50);
    expect(log.spoken).toHaveLength(1);
    await vi.runAllTimersAsync();
    expect(said(log)).toEqual([
      { text: 'banana', lang: 'en-GB', rate: 0.6 },
      { text: 'banana', lang: 'en-GB', rate: 0.6 }
    ]);
    void speaker.sayWord(banana, 'normal');
    await vi.runAllTimersAsync();
    expect(log.spoken).toHaveLength(3);
  });

  it('speaks a word’s `say` override instead of the word', async () => {
    const { speaker, log } = await setup();
    void speaker.sayWord({ en: 'orange', say: 'an orange' }, 'normal');
    await vi.runAllTimersAsync();
    expect(log.spoken.map((r) => r.text)).toEqual(['an orange']);
  });

  it('speaks English in the family accent with a matching voice', async () => {
    const { speaker, log } = await setup();
    speaker.configure({ accent: 'en-US' });
    void speaker.sayWord(banana, 'normal');
    await vi.runAllTimersAsync();
    expect(log.spoken[0]).toMatchObject({ lang: 'en-US', voice: 'Fake English (US)' });
  });

  it('uses the device’s preferred voice when it still exists', async () => {
    const { speaker, log } = await setup({
      voices: [
        { name: 'Daniel', lang: 'en-GB' },
        { name: 'Serena', lang: 'en-GB' }
      ]
    });
    speaker.configure({}, { 'en-GB': 'Serena' });
    void speaker.sayWord(banana, 'normal');
    await vi.runAllTimersAsync();
    speaker.configure({}, { 'en-GB': 'Gone' });
    void speaker.sayWord(banana, 'normal');
    await vi.runAllTimersAsync();
    expect(log.spoken.map((r) => r.voice)).toEqual(['Serena', 'Daniel']);
  });
});

describe('Speaker: a new request cancels the previous one', () => {
  it('cancels the word being spoken before speaking the next', async () => {
    const { speaker, log } = await setup();
    const first = speaker.sayWord({ en: 'watermelon' }, 'slow');
    await vi.advanceTimersByTimeAsync(20);
    expect(log.spoken[0]?.outcome).toBe('speaking');
    const second = speaker.sayWord(banana, 'slow');
    await vi.runAllTimersAsync();
    expect(await first).toBe('cancelled');
    expect(await second).toBe('done');
    expect(log.spoken.map((r) => [r.text, r.outcome])).toEqual([
      ['watermelon', 'cancelled'],
      ['banana', 'ended']
    ]);
  });

  it('cancels before every request, so nothing ever queues', async () => {
    const { speaker, log } = await setup();
    for (const en of ['one', 'two', 'three', 'four']) void speaker.sayWord({ en }, 'normal');
    await vi.runAllTimersAsync();
    expect(log.cancels).toBe(4);
    expect(log.spoken.filter((r) => r.outcome === 'ended').map((r) => r.text)).toEqual(['four']);
  });

  it('a request made during the slow pause drops the repeat', async () => {
    const { speaker, log } = await setup();
    speaker.configure({ slowRepeatTwice: true });
    const first = speaker.sayWord(banana, 'slow');
    await vi.advanceTimersByTimeAsync(300); // inside the pause
    void speaker.sayWord({ en: 'pear' }, 'normal');
    await vi.runAllTimersAsync();
    expect(await first).toBe('cancelled');
    expect(log.spoken.map((r) => r.text)).toEqual(['banana', 'pear']);
  });

  it('cancel() stops speech and the rest of a prompt', async () => {
    const { speaker, log } = await setup();
    const p = speaker.sayPrompt('Gdzie jest {word}?', 'normal', banana);
    await vi.advanceTimersByTimeAsync(5);
    speaker.cancel();
    await vi.runAllTimersAsync();
    expect(await p).toBe('cancelled');
    expect(log.spoken.map((r) => r.text)).toEqual(['Gdzie jest']);
  });
});

describe('Speaker: the unlock gesture', () => {
  it('never reaches the engine before unlock()', async () => {
    const { speaker, log } = await setup({}, false);
    expect(await speaker.sayWord(banana, 'slow')).toBe('locked');
    expect(await speaker.sayPrompt('Gdzie jest {word}?', 'slow', banana)).toBe('locked');
    expect(log.spoken).toEqual([]);
    expect(log.cancels).toBe(0);
  });

  it('unlock() primes the engine once with a silent, empty utterance', async () => {
    const { speaker, log } = await setup({}, false);
    speaker.unlock();
    speaker.unlock();
    expect(log.spoken).toEqual([expect.objectContaining({ text: '', volume: 0 })]);
    expect(speaker.isUnlocked).toBe(true);
  });

  it('reports `unavailable` when there is no speech at all', async () => {
    const speaker = new Speaker(new WebSpeechEngine({}));
    speaker.unlock();
    expect(await speaker.sayWord(banana, 'slow')).toBe('unavailable');
  });
});

describe('Speaker: Polish prompts', () => {
  it('says the Polish parts in Polish at a fixed rate and the word in English at the speed', async () => {
    const { speaker, log } = await setup();
    void speaker.sayPrompt('Gdzie jest {word}?', 'slow', banana);
    await vi.runAllTimersAsync();
    expect(said(log)).toEqual([
      { text: 'Gdzie jest', lang: 'pl-PL', rate: POLISH_RATE },
      { text: 'banana', lang: 'en-GB', rate: 0.6 }
    ]);
    expect(log.spoken[0]?.voice).toBe('Fake Polski');
  });

  it('substitutes {plAcc} into the Polish text', async () => {
    const { speaker, log } = await setup();
    void speaker.sayPrompt('Dotknij {plAcc}!', 'normal', banana);
    await vi.runAllTimersAsync();
    expect(log.spoken.map((r) => r.text)).toEqual(['Dotknij banana!']);
  });

  it('without a Polish voice, speaks only the English word and says it spoke no Polish', async () => {
    const { speaker, log } = await setup({ voices: [{ name: 'UK', lang: 'en-GB' }] });
    expect(speaker.speaksPolish).toBe(false);
    expect(await promptDone(speaker.sayPrompt('Gdzie jest {word}?', 'normal', banana))).toBe('done');
    expect(log.spoken.map((r) => r.text)).toEqual(['banana']);
  });

  it('with Polish prompts switched off, the same', async () => {
    const { speaker, log } = await setup();
    speaker.configure({ polishPrompts: false });
    expect(speaker.speaksPolish).toBe(false);
    void speaker.sayPrompt('Gdzie jest {word}?', 'normal', banana);
    await vi.runAllTimersAsync();
    expect(log.spoken.map((r) => r.text)).toEqual(['banana']);
  });

  it('a prompt with no English part and no Polish voice says nothing', async () => {
    const { speaker, log } = await setup({ voices: [{ name: 'UK', lang: 'en-GB' }] });
    expect(await speaker.sayPrompt('Super!', 'normal')).toBe('unavailable');
    expect(log.spoken).toEqual([]);
  });
});

describe('Speaker: the sentence queue', () => {
  const sentences = ['Hello! I am Polly.', 'I like fruit.'];

  it('speaks one utterance per sentence, in order, with a pause between', async () => {
    const { speaker, log } = await setup();
    const done = speaker.speakSentences(sentences, { speed: 'normal' });
    await vi.advanceTimersByTimeAsync(((sentences[0] as string).length * 20) / 0.9 + 10);
    expect(log.spoken).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(SENTENCE_PAUSE_MS);
    expect(log.spoken).toHaveLength(2);
    await vi.runAllTimersAsync();
    expect(await done).toBe('done');
    expect(log.spoken.map((r) => r.text)).toEqual(sentences);
  });

  it('follows boundary events word by word', async () => {
    const { speaker } = await setup();
    const words: [number, number][] = [];
    void speaker.speakSentences(sentences, { speed: 'normal', onWord: (s, w) => words.push([s, w]) });
    await vi.runAllTimersAsync();
    expect(words).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
      [1, 2]
    ]);
  });

  it('falls back to timing when the platform sends no boundaries', async () => {
    const { speaker } = await setup({ boundaries: false });
    const words: [number, number][] = [];
    void speaker.speakSentences(['I like fruit.'], { speed: 'slow', onWord: (s, w) => words.push([s, w]) });
    await vi.advanceTimersByTimeAsync(1);
    expect(words).toEqual([[0, 0]]);
    // "like" starts at character 2: 2 × 75 / 0.6 = 250 ms after start.
    await vi.advanceTimersByTimeAsync(240);
    expect(words).toEqual([[0, 0]]);
    await vi.advanceTimersByTimeAsync(20);
    expect(words).toEqual([
      [0, 0],
      [0, 1]
    ]);
  });

  it('a new request stops the queue', async () => {
    const { speaker, log } = await setup();
    const story = speaker.speakSentences(sentences, { speed: 'normal' });
    await vi.advanceTimersByTimeAsync(20);
    void speaker.sayWord(banana, 'normal');
    await vi.runAllTimersAsync();
    expect(await story).toBe('cancelled');
    expect(log.spoken.map((r) => r.text)).toEqual(['Hello! I am Polly.', 'banana']);
  });
});

/** Runs the timers until the promise settles. */
async function promptDone<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}
