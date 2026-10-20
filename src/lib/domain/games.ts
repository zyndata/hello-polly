/**
 * The game shelf (PLAN.md "A lesson": free play uses learned words only, and a game needs at
 * least four of them; STATE.md decisions 47–48, 88–89).
 */

import type { ChildId, FamilyFile, ImageId, Word, WordId, WordPlan } from '../types';
import { childPlan } from './children';
import { wordStates } from './learning';
import type { Digit } from './digits';

/** E1–E9 in PLAN.md's order. */
export const GAME_IDS = ['listen', 'digits', 'memory', 'bubbles', 'feed', 'spy', 'simon', 'paint', 'sort'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const isGameId = (id: string): id is GameId => (GAME_IDS as readonly string[]).includes(id);

/** Learned words a game needs before its tile opens. */
export const MIN_LEARNED = 4;
/** *Gdzie jest…?* hides at least this many learned things in its scene. */
export const MIN_SPY = 5;
/** *Pokoloruj* needs this many learned colours for its paint pots. */
export const MIN_PAINT_COLOURS = 3;
/** *Kosze*: a topic becomes a basket with this many learned words. */
export const MIN_PER_BASKET = 3;

/** *Cyferki*'s digit tiles are the numbers topic's keycaps, so its pictures come from elsewhere. */
export const DIGIT_TOPIC = 'numbers';
export const digitImage = (digit: Digit): ImageId => `keycap-${digit}`;
/** *Pokoloruj*'s paint pots. */
export const COLOUR_TOPIC = 'colours';
/** *Polly mówi*'s commands (decision 83). */
export const BODY_TOPIC = 'body';

type WordTopic = Pick<Word, 'id' | 'topic'>;

/** The child's learned words that are not paused, in content order. */
export function learnedWords(file: FamilyFile, child: ChildId, words: readonly Pick<Word, 'id'>[]): WordId[] {
  const states = wordStates(file.progress[child]);
  const paused = new Set(childPlan(file, child).paused);
  return words.map((w) => w.id).filter((id) => !paused.has(id) && states.get(id)?.status === 'learned');
}

/** Learned words by topic, in content order. */
export function byTopic(learned: readonly WordId[], words: readonly WordTopic[]): Map<string, WordId[]> {
  const topicOf = new Map(words.map((w) => [w.id, w.topic]));
  const groups = new Map<string, WordId[]>();
  for (const id of learned) {
    const topic = topicOf.get(id);
    if (topic === undefined) continue;
    groups.set(topic, [...(groups.get(topic) ?? []), id]);
  }
  return groups;
}

/** *Pokoloruj*: learned colours (the pots) and the learned things to paint (not colours, not numbers). */
export function paintPools(learned: readonly WordId[], words: readonly WordTopic[]): { colours: WordId[]; things: WordId[] } {
  const topicOf = new Map(words.map((w) => [w.id, w.topic]));
  return {
    colours: learned.filter((id) => topicOf.get(id) === COLOUR_TOPIC),
    things: learned.filter((id) => topicOf.get(id) !== COLOUR_TOPIC && topicOf.get(id) !== DIGIT_TOPIC)
  };
}

/** *Kosze*: the topics with enough learned words to be a basket. */
export const basketTopics = (learned: readonly WordId[], words: readonly WordTopic[]): string[] =>
  [...byTopic(learned, words)].filter(([, ids]) => ids.length >= MIN_PER_BASKET).map(([topic]) => topic);

/**
 * The words a game may use: every learned word, except *Cyferki* (outside the numbers) and
 * *Polly mówi* (body parts only).
 */
export function gamePool(game: GameId, learned: readonly WordId[], words: readonly WordTopic[]): WordId[] {
  const topicOf = new Map(words.map((w) => [w.id, w.topic]));
  if (game === 'digits') return learned.filter((id) => topicOf.get(id) !== DIGIT_TOPIC);
  if (game === 'simon') return learned.filter((id) => topicOf.get(id) === BODY_TOPIC);
  return [...learned];
}

/** Whether the game can be played with these learned words. */
export function gameOpen(game: GameId, learned: readonly WordId[], words: readonly WordTopic[]): boolean {
  const pool = gamePool(game, learned, words);
  switch (game) {
    case 'spy':
      return pool.length >= MIN_SPY;
    case 'paint': {
      const { colours, things } = paintPools(learned, words);
      return colours.length >= MIN_PAINT_COLOURS && things.length >= 1;
    }
    case 'sort':
      return basketTopics(learned, words).length >= 2;
    default:
      return pool.length >= MIN_LEARNED;
  }
}

/** The games on this child's shelf: *Kosze* only when the parent switched it on (decision 89). */
export const shelfGames = (plan: Pick<WordPlan, 'sortGame'>): GameId[] => GAME_IDS.filter((g) => g !== 'sort' || plan.sortGame === true);
