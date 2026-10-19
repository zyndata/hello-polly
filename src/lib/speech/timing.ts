/**
 * Word positions and timing estimates for spoken text: which word a `boundary` event points at,
 * and where the timed fallback moves the highlight when a platform sends none (STATE.md
 * decision 28).
 */

/** An estimate of speaking time per character at rate 1. Deliberately rough. */
export const MS_PER_CHAR = 75;

export interface WordRange {
  start: number;
  end: number;
  text: string;
}

/** Letters and digits, with apostrophes kept inside a word ("Polly's"). */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function wordRanges(text: string): WordRange[] {
  return [...text.matchAll(WORD)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
}

/** The word at a character offset: the last word starting at or before it, -1 before the first. */
export function wordAt(ranges: readonly WordRange[], charIndex: number): number {
  let found = -1;
  for (const [i, range] of ranges.entries()) {
    if (range.start > charIndex) break;
    found = i;
  }
  return found;
}

/** Estimated milliseconds to speak `text` at `rate`. */
export function estimateMs(text: string, rate: number): number {
  return Math.round((text.length * MS_PER_CHAR) / rate);
}

/** When each word starts, in ms after the utterance's `start`, by the same estimate. */
export function fallbackSchedule(text: string, rate: number): number[] {
  return wordRanges(text).map((range) => Math.round((range.start * MS_PER_CHAR) / rate));
}

/**
 * How long to wait for an utterance that neither ends nor fails before giving up on it (some
 * Android builds drop `end`): three times the estimate plus four seconds.
 */
export function watchdogMs(text: string, rate: number): number {
  return estimateMs(text, rate) * 3 + 4000;
}
