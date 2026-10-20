/**
 * The content rules (PLAN.md "Content model"), as one pure function.
 *
 * Plain JavaScript with JSDoc so that `npm run check:content` runs on bare Node on both
 * machines, with no TypeScript runner (STATE.md decision 12). The app imports only types from
 * here; the unit tests import the function and feed it fixtures.
 */

/** Per-SVG size budget (PLAN.md "Pictures"). */
export const SVG_BUDGET_BYTES = 25 * 1024;

/**
 * Every Polish prompt the app speaks: the start screen's greeting (Phase 3), and the Phase 5
 * lesson player and exercises (look and listen, E1, E2, E3, feedback, finish), the Phase 6
 * chest and album, and the Phase 9 story shelf and player and games E4–E9. `check:content` fails when one is missing from the catalog, or when
 * the catalog has one that is not listed here.
 */
export const REQUIRED_PROMPT_IDS = /** @type {const} */ ([
  'start.hello',
  'lesson.start',
  'lesson.finish',
  'intro.look',
  'intro.tap',
  'intro.next',
  'pick.find',
  'digits.start',
  'digits.find',
  'memory.start',
  'memory.pair',
  'feedback.retry',
  'feedback.hint',
  'feedback.correct',
  'games.locked',
  'games.choose',
  'speed.slow',
  'speed.normal',
  'home.hold',
  'picker.who',
  'map.go',
  'map.later',
  'gate.parents',
  'map.chest',
  'chest.tap',
  'chest.again',
  'chest.open',
  'album.look',
  'album.empty',
  'album.missing',
  'stories.choose',
  'stories.locked',
  'story.end',
  'story.new',
  'bubbles.find',
  'feed.find',
  'simon.start',
  'simon.say',
  'paint.colour',
  'paint.pot',
  'sort.which',
  'sleep.night'
]);

/**
 * Placeholders a prompt may contain. `{word}` is the English target word (spoken by the English
 * voice), `{plAcc}` the word's Polish form used after „Dotknij…".
 */
export const PROMPT_PLACEHOLDERS = /** @type {const} */ (['word', 'plAcc']);

/**
 * Words a story may use that are not vocabulary (PLAN.md "Content model"), plus "an" and "am",
 * which the plan's own example story needs, and the mascot's name.
 */
export const STORY_FUNCTION_WORDS = /** @type {const} */ ([
  'a', 'an', 'the', 'is', 'am', 'i', 'see', 'it', 'and', 'my', 'like', 'can', 'look', 'polly'
]);

/**
 * Pictures the screens use directly rather than through content: Polly, the 🐢/🐇 speed
 * toggle, Polly's ship on the map, the gear of the parent gate, the home button, the game
 * shelf's die, lock and speaker, the album's ledger, the stories' book, and the Phase 9 game
 * tiles and *Polly mówi*'s ✅. They count as used, and must exist like any content picture.
 */
export const UI_IMAGE_IDS = /** @type {const} */ ([
  'parrot', 'turtle', 'rabbit', 'sailboat', 'gear', 'house', 'game-die', 'locked', 'speaker-high-volume', 'ledger',
  'open-book', 'check-mark-button', 'bubbles', 'magnifying-glass-tilted-left', 'fork-and-knife-with-plate', 'basket',
  'zzz'
]);

/** A story has this many pages (PLAN.md "Content model": 5–8, about 30 seconds). */
export const STORY_PAGES = /** @type {const} */ ([5, 8]);
/** A page's sentence has this many words. */
export const STORY_SENTENCE_WORDS = /** @type {const} */ ([3, 7]);
/**
 * A scene item's width, in percent of the scene's width (STATE.md decision 84): at 24 the
 * picture is still ≥ 72 px wide on a 320 px wide phone scene.
 */
export const SCENE_ITEM_SIZE = /** @type {const} */ ([24, 40]);
/** The scene's height in percent of its width (a 4:3 scene, `viewBox="0 0 100 75"`). */
export const SCENE_HEIGHT = 75;

/**
 * @typedef {object} ContentSet
 * @property {any[]} topics
 * @property {any[]} words
 * @property {any[]} prompts
 * @property {any[]} praise
 * @property {any[]} stories
 * @property {any[]} stickers
 * @property {any[]} avatars   image ids a child profile may use
 */

/**
 * @typedef {object} ValidationResult
 * @property {string[]} errors    anything here fails the check
 * @property {string[]} warnings  reported, never fatal
 */

/**
 * Lower-cased word tokens of an English sentence. Apostrophes stay inside a word.
 * @param {string} text
 * @returns {string[]}
 */
export function storyTokens(text) {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
}

/**
 * @param {ContentSet} content
 * @param {ReadonlyMap<string, number>} imageBytes  image id → size of `content/img/<id>.svg`;
 *   an id with no file is absent
 * @returns {ValidationResult}
 */
export function validateContent(content, imageBytes) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {Set<string>} */
  const usedImages = new Set();

  /** @param {unknown} v */
  const isText = (v) => typeof v === 'string' && v.trim().length > 0;

  /**
   * @param {string} what
   * @param {any[]} list
   * @returns {Map<string, any>}
   */
  const indexById = (what, list) => {
    const byId = new Map();
    for (const item of list) {
      if (!isText(item?.id)) {
        errors.push(`${what}: an entry has no id (${JSON.stringify(item)})`);
        continue;
      }
      if (byId.has(item.id)) errors.push(`${what} "${item.id}": duplicate id`);
      byId.set(item.id, item);
    }
    return byId;
  };

  /**
   * @param {string} where
   * @param {unknown} id
   */
  const checkImage = (where, id) => {
    if (!isText(id)) {
      errors.push(`${where}: no image id`);
      return;
    }
    const image = /** @type {string} */ (id);
    usedImages.add(image);
    if (/[./]/.test(image)) {
      errors.push(`${where}: image "${image}" must be an id, not a file name or path`);
      return;
    }
    const bytes = imageBytes.get(image);
    if (bytes === undefined) errors.push(`${where}: image "${image}" has no file in content/img/`);
    else if (bytes > SVG_BUDGET_BYTES) {
      errors.push(`${where}: image "${image}" is ${bytes} B, over the ${SVG_BUDGET_BYTES} B budget`);
    }
  };

  /**
   * A scene item stays inside the scene, at a size that keeps it a tap target.
   * @param {string} where
   * @param {any} item
   */
  const checkPlace = (where, item) => {
    const { x, y, size } = item;
    if (![x, y, size].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      errors.push(`${where}: x, y and size must be numbers`);
      return;
    }
    const [min, max] = SCENE_ITEM_SIZE;
    if (size < min || size > max) errors.push(`${where}: size ${size} is not ${min}–${max}`);
    const cy = (y * SCENE_HEIGHT) / 100;
    if (x - size / 2 < 0 || x + size / 2 > 100 || cy - size / 2 < 0 || cy + size / 2 > SCENE_HEIGHT) {
      errors.push(`${where}: does not fit inside the scene at (${x}, ${y})`);
    }
    if (item.anim !== undefined && !['bob', 'hop', 'spin'].includes(item.anim)) errors.push(`${where}: unknown anim "${item.anim}"`);
  };

  // Topics and words.
  const topics = indexById('topic', content.topics);
  const words = indexById('word', content.words);
  /** @type {Map<string, string>} word id → the topic listing it */
  const listedIn = new Map();

  for (const topic of topics.values()) {
    const where = `topic "${topic.id}"`;
    if (!isText(topic.en)) errors.push(`${where}: no en`);
    if (!isText(topic.pl)) errors.push(`${where}: no pl`);
    if (!Number.isInteger(topic.order)) errors.push(`${where}: order must be an integer`);
    checkImage(where, topic.icon);
    if (!Array.isArray(topic.words) || topic.words.length === 0) {
      errors.push(`${where}: no words`);
      continue;
    }
    for (const wordId of topic.words) {
      const word = words.get(wordId);
      if (!word) errors.push(`${where}: word "${wordId}" does not exist`);
      else if (word.topic !== topic.id) {
        errors.push(`${where}: lists "${wordId}", whose topic is "${word.topic}"`);
      }
      if (listedIn.has(wordId)) errors.push(`${where}: "${wordId}" is already listed by "${listedIn.get(wordId)}"`);
      listedIn.set(wordId, topic.id);
    }
  }

  for (const word of words.values()) {
    const where = `word "${word.id}"`;
    if (!isText(word.en)) errors.push(`${where}: no en`);
    if (!isText(word.pl)) errors.push(`${where}: no pl`);
    if ('plAcc' in word && !isText(word.plAcc)) errors.push(`${where}: plAcc is empty`);
    if ('say' in word && !isText(word.say)) errors.push(`${where}: say is empty`);
    if (![1, 2, 3].includes(word.level)) errors.push(`${where}: level must be 1, 2 or 3`);
    if (!topics.has(word.topic)) errors.push(`${where}: topic "${word.topic}" does not exist`);
    else if (!listedIn.has(word.id)) errors.push(`${where}: not listed by its topic "${word.topic}"`);
    checkImage(where, word.image);
  }

  // Polish prompts and English praise.
  const prompts = indexById('prompt', content.prompts);
  /** @type {readonly string[]} */
  const required = REQUIRED_PROMPT_IDS;
  /** @type {readonly string[]} */
  const placeholders = PROMPT_PLACEHOLDERS;
  for (const id of required) {
    if (!prompts.has(id)) errors.push(`prompt "${id}": missing from the catalog`);
  }
  for (const prompt of prompts.values()) {
    const where = `prompt "${prompt.id}"`;
    if (!required.includes(prompt.id)) errors.push(`${where}: not a known prompt id`);
    if (!isText(prompt.pl)) {
      errors.push(`${where}: no pl`);
      continue;
    }
    for (const [, name] of prompt.pl.matchAll(/\{([^}]*)\}/g)) {
      if (!placeholders.includes(name)) errors.push(`${where}: unknown placeholder {${name}}`);
    }
  }
  if (!Array.isArray(content.praise) || content.praise.length === 0) errors.push('praise: empty');
  else if (!content.praise.every(isText)) errors.push('praise: every entry must be text');

  // Stories: every token is vocabulary, a topic name, or a function word.
  /** @type {Set<string>} */
  const vocabulary = new Set(STORY_FUNCTION_WORDS);
  for (const item of [...words.values(), ...topics.values()]) {
    if (isText(item.en)) for (const token of storyTokens(item.en)) vocabulary.add(token);
  }
  for (const story of indexById('story', content.stories).values()) {
    const where = `story "${story.id}"`;
    if (!isText(story.title)) errors.push(`${where}: no title`);
    if (!isText(story.titlePl)) errors.push(`${where}: no titlePl`);
    if (!topics.has(story.topic)) errors.push(`${where}: topic "${story.topic}" does not exist`);
    if (!Array.isArray(story.pages) || story.pages.length === 0) {
      errors.push(`${where}: no pages`);
      continue;
    }
    if ('introPl' in story && !isText(story.introPl)) errors.push(`${where}: introPl is empty`);
    const [minPages, maxPages] = STORY_PAGES;
    if (story.pages.length < minPages || story.pages.length > maxPages) {
      errors.push(`${where}: has ${story.pages.length} pages, not ${minPages}–${maxPages}`);
    }
    let sceneWords = 0;
    story.pages.forEach((/** @type {any} */ page, /** @type {number} */ n) => {
      const at = `${where} page ${n + 1}`;
      /** @type {string[]} */
      let said = [];
      if (!isText(page.text)) errors.push(`${at}: no text`);
      else {
        said = storyTokens(page.text);
        for (const token of said) {
          if (!vocabulary.has(token)) errors.push(`${at}: "${token}" is neither vocabulary nor a function word`);
        }
        const [minWords, maxWords] = STORY_SENTENCE_WORDS;
        if (said.length < minWords || said.length > maxWords) {
          errors.push(`${at}: the sentence has ${said.length} words, not ${minWords}–${maxWords}`);
        }
      }
      if (!Array.isArray(page.scene) || page.scene.length === 0) {
        errors.push(`${at}: the scene is empty`);
        return;
      }
      for (const item of page.scene) {
        checkImage(`${at} scene`, item.image);
        checkPlace(`${at} scene "${item.image}"`, item);
        if (item.word === undefined) continue;
        const word = words.get(item.word);
        if (!word) {
          errors.push(`${at}: scene word "${item.word}" does not exist`);
          continue;
        }
        sceneWords++;
        if (isText(word.en) && !storyTokens(word.en).every((t) => said.includes(t))) {
          errors.push(`${at}: the scene shows "${item.word}", which the sentence does not name`);
        }
      }
    });
    if (sceneWords === 0) errors.push(`${where}: no scene item has a word, so nothing unlocks it`);
  }

  // Stickers.
  for (const sticker of indexById('sticker', content.stickers).values()) {
    const where = `sticker "${sticker.id}"`;
    if (!isText(sticker.set)) errors.push(`${where}: no set`);
    if (sticker.word !== undefined && !words.has(sticker.word)) errors.push(`${where}: word "${sticker.word}" does not exist`);
    checkImage(where, sticker.image);
  }

  // Avatars: a non-empty list of distinct picture ids.
  if (!Array.isArray(content.avatars) || content.avatars.length === 0) errors.push('avatars: empty');
  else {
    const seen = new Set();
    for (const id of content.avatars) {
      if (seen.has(id)) errors.push(`avatar "${id}": duplicate`);
      seen.add(id);
      checkImage('avatar', id);
    }
  }

  for (const id of UI_IMAGE_IDS) checkImage(`UI picture`, id);

  for (const id of imageBytes.keys()) {
    if (!usedImages.has(id)) warnings.push(`image "${id}" is in content/img/ but no content uses it`);
  }

  return { errors, warnings };
}
