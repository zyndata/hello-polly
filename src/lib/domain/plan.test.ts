import { describe, expect, it } from 'vitest';
import { topics } from '../content';
import { defaultPlan } from './family';
import { nextWords, type WordState } from './learning';
import {
  dequeue,
  enqueue,
  moveQueued,
  pendingQueue,
  planWordStatus,
  pruneQueue,
  setKnown,
  setPaused,
  setRandomWithinTopic,
  setTopicEnabled
} from './plan';

const plan = () => ({ ...defaultPlan(), queue: ['a', 'b', 'c'] });

describe('word plan editing', () => {
  it('appends to the queue once', () => {
    expect(enqueue(plan(), 'd').queue).toEqual(['a', 'b', 'c', 'd']);
    expect(enqueue(plan(), 'b').queue).toEqual(['a', 'b', 'c']);
    expect(dequeue(plan(), 'b').queue).toEqual(['a', 'c']);
  });

  it('moves a queued word within the queue', () => {
    expect(moveQueued(plan(), 'c', -1).queue).toEqual(['a', 'c', 'b']);
    expect(moveQueued(plan(), 'a', 1).queue).toEqual(['b', 'a', 'c']);
    expect(moveQueued(plan(), 'a', -1).queue).toEqual(['a', 'b', 'c']);
    expect(moveQueued(plan(), 'c', 5).queue).toEqual(['a', 'b', 'c']);
    expect(moveQueued(plan(), 'z', 1).queue).toEqual(['a', 'b', 'c']);
  });

  it('keeps queued, known and paused mutually exclusive', () => {
    const known = setKnown(plan(), 'b', true);
    expect(known.queue).toEqual(['a', 'c']);
    expect(known.known).toEqual(['b']);
    const paused = setPaused(known, 'b', true);
    expect(paused.known).toEqual([]);
    expect(paused.paused).toEqual(['b']);
    const queued = enqueue(paused, 'b');
    expect(queued.paused).toEqual([]);
    expect(queued.queue).toEqual(['a', 'c', 'b']);
    expect(setKnown(known, 'b', false).known).toEqual([]);
    expect(setPaused(paused, 'b', false).paused).toEqual([]);
  });

  it('switches topics and random order, leaving the input alone', () => {
    const p = defaultPlan();
    const off = setTopicEnabled(p, 'fruit', false);
    expect(off.enabledTopics).not.toContain('fruit');
    expect(setTopicEnabled(off, 'fruit', true).enabledTopics).toContain('fruit');
    expect(setTopicEnabled(p, 'fruit', true).enabledTopics.filter((t) => t === 'fruit')).toHaveLength(1);
    expect(setRandomWithinTopic(p, true).randomWithinTopic).toBe(true);
    expect(p).toEqual(defaultPlan());
  });

  it('keeps in the queue only the words not met yet', () => {
    const states = new Map<string, WordState>([['b', { status: 'introduced', firstTries: 0 }]]);
    expect(pendingQueue(plan(), states)).toEqual(['a', 'c']);
    expect(pruneQueue(plan(), states).queue).toEqual(['a', 'c']);
    const p = plan();
    expect(pruneQueue(p, new Map())).toBe(p);
  });

  it('shows the plan mark before the learning state', () => {
    const states = new Map<string, WordState>([['a', { status: 'learned', firstTries: 3, box: 1 }]]);
    const p = setPaused(setKnown(plan(), 'b', true), 'c', true);
    expect(planWordStatus(p, states, 'a')).toBe('learned');
    expect(planWordStatus(p, states, 'b')).toBe('known');
    expect(planWordStatus(p, states, 'c')).toBe('paused');
    expect(planWordStatus(p, states, 'd')).toBe('new');
  });

  it('makes a queued word the next one, ahead of topic order', () => {
    const queued = enqueue(defaultPlan(), 'fruit.mango');
    expect(nextWords(defaultPlan(), new Map(), topics, 'c1', 1)).toEqual(['colours.red']);
    expect(nextWords(queued, new Map(), topics, 'c1', 1)).toEqual(['fruit.mango']);
  });
});
