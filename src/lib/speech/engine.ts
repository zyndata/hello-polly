/**
 * SpeechEngine (PLAN.md "Speech and pictures are replaceable"): the platform half of speech.
 *
 * An engine speaks one utterance at a time with an explicit language, rate, pitch and voice,
 * and knows which voices exist. Everything that is policy (speed → rate, slow mode, prompts,
 * the sentence queue, voice choice, the unlock) lives in `Speaker`, which works over any
 * engine (STATE.md decision 20). `WebSpeechEngine` is the first implementation; an on-device
 * neural TTS or a keyed service would be another, and nothing outside this directory changes.
 */

export interface EngineVoice {
  /** Stable per device (`voiceURI` for the Web Speech API). */
  id: string;
  name: string;
  /** BCP 47, normalised (`en-GB`, never `en_GB`). */
  lang: string;
  /** Synthesised on the device rather than by a network service. */
  local: boolean;
  /** The platform's own default voice. */
  isDefault: boolean;
}

export interface Utterance {
  text: string;
  /** BCP 47 tag the text is in. */
  lang: string;
  rate: number;
  pitch: number;
  /** `EngineVoice.id`; without it, the engine picks by `lang`. */
  voiceId?: string | undefined;
}

export interface UtteranceEvents {
  /** Speaking has actually begun (audio is about to come out). */
  onStart?: () => void;
  /** A word starts at this character offset of `Utterance.text`. Not every platform sends it. */
  onBoundary?: (charIndex: number) => void;
}

/** `cancelled`: a newer utterance or `cancel()` stopped it. `failed`: the platform gave up. */
export type UtteranceOutcome = 'ended' | 'cancelled' | 'failed';

export interface SpeechEngine {
  isAvailable(): boolean;
  voices(): readonly EngineVoice[];
  /** Voices load asynchronously; returns the unsubscribe function. */
  onVoicesChanged(listener: () => void): () => void;
  /** Resolves when the utterance ends, is cancelled or fails. Never rejects. */
  speak(utterance: Utterance, events?: UtteranceEvents): Promise<UtteranceOutcome>;
  /** Stops the current utterance and drops anything queued. */
  cancel(): void;
  /** Called once, inside a user gesture: whatever the platform needs to allow speech later. */
  prime(): void;
}
