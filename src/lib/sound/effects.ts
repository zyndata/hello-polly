/**
 * Sound effects, synthesised with the Web Audio API (PLAN.md "Speech"; STATE.md decision 29).
 * No audio file of any kind exists in this app.
 *
 * Each effect is data: a few tones, each an oscillator with a frequency sweep and an
 * attack/decay envelope. The player renders them on demand. Everything stays gentle: peak gain
 * ≤ 0.3, at most 1.2 s, and `wiggle` (a wrong tap) is a soft wobble, never a buzzer.
 */

export type Effect = 'tap' | 'correct' | 'sparkle' | 'wiggle' | 'chest-creak' | 'pop';

export interface Tone {
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** Hz at the start and at the end of the tone (an exponential sweep). */
  from: number;
  to: number;
  /** Seconds after the effect starts. */
  at: number;
  dur: number;
  /** Peak gain, 0–1. */
  gain: number;
  /** Seconds to reach the peak; defaults to 10 ms. */
  attack?: number;
}

export const EFFECTS: Record<Effect, readonly Tone[]> = {
  tap: [{ wave: 'sine', from: 620, to: 900, at: 0, dur: 0.08, gain: 0.16 }],
  // C5 – E5 – G5, rising: the "yes" sound.
  correct: [
    { wave: 'triangle', from: 523.25, to: 523.25, at: 0, dur: 0.14, gain: 0.22 },
    { wave: 'triangle', from: 659.25, to: 659.25, at: 0.1, dur: 0.14, gain: 0.22 },
    { wave: 'triangle', from: 783.99, to: 783.99, at: 0.2, dur: 0.3, gain: 0.24 }
  ],
  sparkle: [
    { wave: 'sine', from: 1568, to: 1760, at: 0, dur: 0.16, gain: 0.08 },
    { wave: 'sine', from: 2093, to: 2349, at: 0.07, dur: 0.16, gain: 0.08 },
    { wave: 'sine', from: 2637, to: 2960, at: 0.14, dur: 0.18, gain: 0.07 },
    { wave: 'sine', from: 3136, to: 3520, at: 0.21, dur: 0.24, gain: 0.06 }
  ],
  // Up, down, up: a playful wobble that means "again", not "wrong".
  wiggle: [
    { wave: 'triangle', from: 392, to: 466, at: 0, dur: 0.11, gain: 0.14 },
    { wave: 'triangle', from: 466, to: 392, at: 0.11, dur: 0.11, gain: 0.14 },
    { wave: 'triangle', from: 392, to: 440, at: 0.22, dur: 0.14, gain: 0.12 }
  ],
  // A slow, low groan of old hinges, quiet because sawtooth is bright.
  'chest-creak': [
    { wave: 'sawtooth', from: 95, to: 70, at: 0, dur: 0.45, gain: 0.05, attack: 0.08 },
    { wave: 'sawtooth', from: 130, to: 85, at: 0.35, dur: 0.6, gain: 0.05, attack: 0.1 },
    { wave: 'triangle', from: 190, to: 120, at: 0.35, dur: 0.6, gain: 0.04, attack: 0.1 }
  ],
  pop: [{ wave: 'sine', from: 950, to: 220, at: 0, dur: 0.09, gain: 0.26, attack: 0.005 }]
};

export const EFFECT_NAMES = Object.keys(EFFECTS) as Effect[];

/** The end of an effect's last tone, in seconds. */
export const effectLength = (effect: Effect): number => Math.max(...EFFECTS[effect].map((t) => t.at + t.dur));

/** The parts of an `AudioContext` the player uses, so tests can record what it does. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state: AudioContextState;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

/** Exponential ramps cannot reach 0. */
const SILENT = 0.0001;

export class SoundEffects {
  private context: AudioContextLike | undefined;

  constructor(private readonly create: () => AudioContextLike | undefined = defaultContext) {}

  /** Call inside a user gesture: browsers start audio contexts suspended until then. */
  unlock(): void {
    this.context ??= this.create();
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
  }

  /** Plays an effect. Before the unlock (or with no Web Audio) it does nothing. */
  play(effect: Effect): void {
    const ctx = this.context;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.01;
    for (const tone of EFFECTS[effect]) {
      const start = t0 + tone.at;
      const end = start + tone.dur;
      const osc = ctx.createOscillator();
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.from, start);
      osc.frequency.exponentialRampToValueAtTime(tone.to, end);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(SILENT, start);
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + (tone.attack ?? 0.01));
      gain.gain.exponentialRampToValueAtTime(SILENT, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}

function defaultContext(): AudioContextLike | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  try {
    return new AudioContext();
  } catch {
    return undefined;
  }
}

let shared: SoundEffects | undefined;

/** The app's sound effects. */
export function sounds(): SoundEffects {
  return (shared ??= new SoundEffects());
}
