/**
 * The shapes of PLAN.md "Content model" and "Local data model (synced)".
 *
 * Deviations from the plan's sketch are STATE.md decisions: image fields hold image ids, not
 * file names (9), `AttemptDay` carries an optional `days` on the compacted bucket (16), and
 * `DeviceProgress` records finished lessons (35).
 */

// ---------------------------------------------------------------------------------------------
// Content (static JSON in the bundle, versioned by CONTENT_VERSION)

export type TopicId = string; // "fruit"
export type WordId = string; // "fruit.banana"
/** An id that `src/lib/images.ts` turns into a URL ("banana"). Never a file name or a URL. */
export type ImageId = string;

export interface Word {
  id: WordId;
  /** What the parent sees ("banana"). */
  en: string;
  /** Text for the speech engine when it differs from `en` ("a banana", a respelling). */
  say?: string;
  /** Polish, for parent screens and Polish prompts ("banan"). */
  pl: string;
  /** The Polish form used after „Dotknij…" („Dotknij banana!"). */
  plAcc?: string;
  topic: TopicId;
  image: ImageId;
  /** 1 = first-year concrete nouns; 3 = verbs and adjectives. */
  level: 1 | 2 | 3;
}

export interface Topic {
  id: TopicId;
  en: string;
  pl: string;
  icon: ImageId;
  /** Default position on the map. */
  order: number;
  /** Default teaching order inside the topic. */
  words: WordId[];
}

export interface SceneItem {
  word?: WordId;
  image: ImageId;
  x: number;
  y: number;
  size: number;
  anim?: 'bob' | 'hop' | 'spin';
}

export interface StoryPage {
  /** One English sentence, 3–7 words. */
  text: string;
  scene: SceneItem[];
}

export interface Story {
  id: string;
  /** English. */
  title: string;
  titlePl: string;
  topic: TopicId;
  /** 5–8 pages, about 30 seconds. */
  pages: StoryPage[];
}

export interface Sticker {
  id: string;
  image: ImageId;
  word?: WordId;
  set: string;
  rare?: boolean;
}

export interface Prompt {
  id: string;
  /** Polish. `{word}` marks where the English word is spoken. */
  pl: string;
}

// ---------------------------------------------------------------------------------------------
// Local data model (synced through the family file)

export type ChildId = string; // uuid
export type DeviceId = string; // uuid, created once per install, local only
/** A local calendar day, `YYYY-MM-DD`. */
export type Day = string;
/** An ISO 8601 instant in UTC, as `Date.prototype.toISOString` writes it. */
export type Instant = string;

/** Last-writer-wins register. */
export interface Lww<T> {
  v: T;
  t: Instant;
  d: DeviceId;
}

export interface ChildProfile {
  /** A nickname is enough; shown on the picker and in the parent panel. */
  name: string;
  /** Image id from a small avatar set (no photos). */
  avatar: ImageId;
  birthYear?: number;
  /** Tombstone, so that deletion syncs. Sticky (STATE.md decision 15). */
  deleted?: boolean;
}

export interface WordPlan {
  enabledTopics: TopicId[];
  /** "These words next", in order. */
  queue: WordId[];
  /** Skipped: already known. */
  known: WordId[];
  /** Neither introduced nor reviewed. */
  paused: WordId[];
  randomWithinTopic: boolean;
}

export type Accent = 'en-GB' | 'en-US';
export type Speed = 'slow' | 'normal';

export interface FamilySettings {
  accent: Accent;
  /** 0.4–0.8, default 0.6. */
  slowRate: number;
  /** 0.8–1.1, default 0.9. */
  normalRate: number;
  slowRepeatTwice: boolean;
  defaultSpeed: Speed;
  polishPrompts: boolean;
  starsPerChest: number;
}

export interface ChildLimits {
  dailyMinutes: number | null;
  sessionMinutes: number | null;
}

/**
 * One word on one day on one device: `c` correct answers (one per exercise, since the child
 * always ends on the right picture), `w` wrong taps, `first` first-try correct answers.
 * `days` exists only on the compacted `"old"` bucket: how many days with `first > 0` it folds.
 */
export interface AttemptDay {
  c: number;
  w: number;
  first: number;
  days?: number;
}

/** The key of the compacted bucket in `DeviceProgress.attempts[word]`. */
export const OLD_BUCKET = 'old';

export interface ChestOpening {
  at: Instant;
  stickers: string[];
}

/** A lesson (one island) finished on one device, and the new words it introduced. */
export interface LessonRecord {
  at: Instant;
  words: WordId[];
}

/** Everything one device recorded about one child. Only that device ever writes it. */
export interface DeviceProgress {
  /** Bumped on every local change. */
  seq: number;
  /** First time each word was shown. */
  introduced: Record<WordId, Instant>;
  /** Per word, per day (`YYYY-MM-DD` or `"old"`). */
  attempts: Record<WordId, Record<Day, AttemptDay>>;
  /** Earned on this device; monotonic. */
  stars: number;
  /** Keyed by an event id unique to the opening. */
  chestsOpened: Record<string, ChestOpening>;
  /** Lessons finished on this device, keyed by an event id (STATE.md decision 35). */
  lessons: Record<string, LessonRecord>;
  minutes: Record<Day, number>;
  storiesHeard: Record<string, number>;
}

export interface FamilyMember {
  email: string;
  role: 'owner' | 'writer';
}

export const FAMILY_SCHEMA = 1;

export interface FamilyFile {
  schema: typeof FAMILY_SCHEMA;
  familyId: string;
  contentVersion: number;
  settings: { [K in keyof FamilySettings]: Lww<FamilySettings[K]> };
  children: Record<ChildId, Lww<ChildProfile>>;
  plans: Record<ChildId, Lww<WordPlan>>;
  limits: Record<ChildId, Lww<ChildLimits>>;
  progress: Record<ChildId, Record<DeviceId, DeviceProgress>>;
  /** Display cache; Drive's permissions are the authority. */
  members?: FamilyMember[];
}
