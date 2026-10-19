import { describe, expect, it } from 'vitest';
import { EFFECTS, EFFECT_NAMES, SoundEffects, effectLength, type AudioContextLike } from './effects';

/** Records every oscillator the player starts. */
function recordingContext(state: AudioContextState = 'running') {
  const started: { type: string; start: number; stop: number; ramps: number[] }[] = [];
  let resumed = 0;
  const param = (ramps: number[]) => ({
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: (v: number) => ramps.push(v)
  });
  const ctx = {
    currentTime: 10,
    destination: {},
    state,
    resume: async () => {
      resumed += 1;
    },
    createOscillator: () => {
      const entry = { type: '', start: 0, stop: 0, ramps: [] as number[] };
      const osc = {
        frequency: param([]),
        set type(t: string) {
          entry.type = t;
        },
        connect: (node: unknown) => node,
        start: (t: number) => {
          entry.start = t;
          started.push(entry);
        },
        stop: (t: number) => (entry.stop = t)
      };
      return osc;
    },
    createGain: () => ({ gain: param(started.at(-1)?.ramps ?? []), connect: (node: unknown) => node })
  };
  return { ctx: ctx as unknown as AudioContextLike, started, resumed: () => resumed };
}

describe('sound effects', () => {
  it('are the six PLAN.md names', () => {
    expect(EFFECT_NAMES).toEqual(['tap', 'correct', 'sparkle', 'wiggle', 'chest-creak', 'pop']);
  });

  it.each(EFFECT_NAMES)('%s is short and gentle', (name) => {
    const tones = EFFECTS[name];
    expect(tones.length).toBeGreaterThan(0);
    expect(effectLength(name)).toBeLessThanOrEqual(1.2);
    for (const tone of tones) {
      expect(tone.gain).toBeGreaterThan(0);
      expect(tone.gain).toBeLessThanOrEqual(0.3);
      for (const f of [tone.from, tone.to]) {
        expect(f).toBeGreaterThanOrEqual(40);
        expect(f).toBeLessThanOrEqual(5000);
      }
    }
  });

  it('a wrong tap is no buzzer: soft waves, ending no lower than it starts', () => {
    const wiggle = EFFECTS.wiggle;
    expect(wiggle.every((t) => t.wave === 'sine' || t.wave === 'triangle')).toBe(true);
    expect((wiggle.at(-1) as { to: number }).to).toBeGreaterThanOrEqual((wiggle[0] as { from: number }).from);
  });

  it('plays nothing before the unlock', () => {
    const { ctx, started } = recordingContext();
    let created = 0;
    const effects = new SoundEffects(() => (created++, ctx));
    effects.play('pop');
    expect(created).toBe(0);
    expect(started).toEqual([]);
  });

  it('after the unlock, plays one oscillator per tone, scheduled from now', () => {
    const { ctx, started } = recordingContext();
    const effects = new SoundEffects(() => ctx);
    effects.unlock();
    effects.play('correct');
    expect(started.map((s) => s.type)).toEqual(['triangle', 'triangle', 'triangle']);
    expect(started.map((s) => +(s.start - 10.01).toFixed(3))).toEqual([0, 0.1, 0.2]);
    for (const s of started) expect(s.stop).toBeGreaterThan(s.start);
  });

  it('resumes a suspended context on unlock, creating it once', () => {
    const { ctx, resumed } = recordingContext('suspended');
    let created = 0;
    const effects = new SoundEffects(() => (created++, ctx));
    effects.unlock();
    effects.unlock();
    expect(created).toBe(1);
    expect(resumed()).toBe(2);
  });

  it('without Web Audio, unlock and play do nothing', () => {
    const effects = new SoundEffects(() => undefined);
    expect(() => {
      effects.unlock();
      effects.play('sparkle');
    }).not.toThrow();
  });
});
