/**
 * The app's speech: one `Speaker` over the device's voices, configured from the family
 * settings and this device's preferred voices. Screens import from here, never from the
 * engine.
 */

import { getPreferredVoices, loadFamily } from '../db';
import { readSettings } from '../domain/family';
import { speed } from './speed.svelte';
import { Speaker } from './speaker';
import { WebSpeechEngine } from './web-speech';

export { Speaker, type Lang, type SpeakOutcome } from './speaker';
export type { EngineVoice } from './engine';
export { spokenForm, type Segment } from './prompt';

let shared: Speaker | undefined;

/** The app's speaker, created on first use (so nothing touches the platform at import). */
export function speaker(): Speaker {
  return (shared ??= new Speaker(new WebSpeechEngine()));
}

/** Reads the family settings and preferred voices from IndexedDB into the speaker. */
export async function loadSpeechSettings(): Promise<void> {
  const [family, voices] = await Promise.all([loadFamily(), getPreferredVoices()]);
  const settings = readSettings(family);
  speaker().configure(settings, voices);
  speed.setDefault(settings.defaultSpeed);
}
