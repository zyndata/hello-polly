import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { REQUIRED_PROMPT_IDS, SVG_BUDGET_BYTES, UI_IMAGE_IDS, storyTokens, validateContent, type ContentSet } from './lib/content-rules.mjs';

const apple = () => ({ word: 'fruit.apple', image: 'red-apple', x: 30, y: 50, size: 30 });
const banana = () => ({ word: 'fruit.banana', image: 'banana', x: 70, y: 50, size: 30, anim: 'hop' });

/** A small, valid content set; each test breaks one thing. */
function valid(): ContentSet {
  return {
    topics: [{ id: 'fruit', en: 'fruit', pl: 'Owoce', icon: 'red-apple', order: 1, words: ['fruit.apple', 'fruit.banana'] }],
    words: [
      { id: 'fruit.apple', en: 'apple', pl: 'jabłko', plAcc: 'jabłka', topic: 'fruit', image: 'red-apple', level: 1 },
      { id: 'fruit.banana', en: 'banana', pl: 'banan', plAcc: 'banana', topic: 'fruit', image: 'banana', level: 1 }
    ],
    prompts: REQUIRED_PROMPT_IDS.map((id) => ({ id, pl: id === 'pick.find' ? 'Gdzie jest {word}?' : 'Tekst.' })),
    praise: ['Great!'],
    stories: [
      {
        id: 'picnic',
        title: "Polly's Picnic",
        titlePl: 'Piknik Polly',
        topic: 'fruit',
        introPl: 'Posłuchaj bajki o owocach!',
        pages: [
          { text: 'I like fruit.', scene: [{ image: 'banana', x: 50, y: 50, size: 30, anim: 'bob' }] },
          { text: 'Look! An apple.', scene: [apple()] },
          { text: 'I see a banana.', scene: [banana()] },
          { text: 'An apple and a banana.', scene: [apple(), banana()] },
          { text: 'I like my apple.', scene: [apple()] }
        ]
      }
    ],
    stickers: [{ id: 'sticker.banana', image: 'banana', word: 'fruit.banana', set: 'food' }],
    avatars: ['red-apple']
  };
}
/** The content pictures above, plus the pictures the screens use directly. */
const images = () => new Map([['red-apple', 5000], ['banana', 10000], ...UI_IMAGE_IDS.map((id): [string, number] => [id, 1000])]);
const errorsOf = (content: ContentSet, sizes = images()) => validateContent(content, sizes).errors;

describe('validateContent', () => {
  it('accepts a valid set', () => {
    expect(validateContent(valid(), images())).toEqual({ errors: [], warnings: [] });
  });

  it('fails on a missing image', () => {
    const sizes = images();
    sizes.delete('banana');
    expect(errorsOf(valid(), sizes)).toEqual([
      'word "fruit.banana": image "banana" has no file in content/img/',
      'story "picnic" page 1 scene: image "banana" has no file in content/img/',
      'story "picnic" page 3 scene: image "banana" has no file in content/img/',
      'story "picnic" page 4 scene: image "banana" has no file in content/img/',
      'sticker "sticker.banana": image "banana" has no file in content/img/'
    ]);
  });

  it('fails on an empty avatar list, a duplicate avatar and an avatar with no picture', () => {
    expect(errorsOf({ ...valid(), avatars: [] })).toEqual(['avatars: empty']);
    expect(errorsOf({ ...valid(), avatars: ['red-apple', 'red-apple', 'unicorn'] })).toEqual([
      'avatar "red-apple": duplicate',
      'avatar: image "unicorn" has no file in content/img/'
    ]);
  });

  it('fails on an oversized SVG', () => {
    const sizes = images();
    sizes.set('red-apple', SVG_BUDGET_BYTES + 1);
    expect(errorsOf(valid(), sizes)).toContain(
      `word "fruit.apple": image "red-apple" is ${SVG_BUDGET_BYTES + 1} B, over the ${SVG_BUDGET_BYTES} B budget`
    );
  });

  it('fails on an unknown story word', () => {
    const content = valid();
    content.stories[0].pages.push({ text: 'Yum! A red pear.', scene: [apple()] });
    expect(errorsOf(content)).toEqual([
      'story "picnic" page 6: "yum" is neither vocabulary nor a function word',
      'story "picnic" page 6: "red" is neither vocabulary nor a function word',
      'story "picnic" page 6: "pear" is neither vocabulary nor a function word',
      'story "picnic" page 6: the scene shows "fruit.apple", which the sentence does not name'
    ]);
  });

  it('fails on a story too short or too long, and on sentences outside 3–7 words', () => {
    const short = valid();
    short.stories[0].pages.splice(4);
    expect(errorsOf(short)).toEqual(['story "picnic": has 4 pages, not 5–8']);
    const long = valid();
    long.stories[0].pages.push(...Array.from({ length: 4 }, () => ({ text: 'Look! An apple.', scene: [apple()] })));
    expect(errorsOf(long)).toEqual(['story "picnic": has 9 pages, not 5–8']);
    const words = valid();
    words.stories[0].pages[1].text = 'An apple!';
    words.stories[0].pages[2].text = 'I see a banana and I like it.';
    expect(errorsOf(words)).toEqual([
      'story "picnic" page 2: the sentence has 2 words, not 3–7',
      'story "picnic" page 3: the sentence has 8 words, not 3–7'
    ]);
  });

  it('fails on an empty scene, an item outside the scene or too small to tap, and an unknown animation', () => {
    const content = valid();
    content.stories[0].pages[0].scene = [];
    content.stories[0].pages[1].scene = [{ ...apple(), x: 5 }];
    content.stories[0].pages[2].scene = [{ ...banana(), size: 12, anim: 'fly' }];
    content.stories[0].pages[3].scene = [apple(), { ...banana(), y: 95 }];
    expect(errorsOf(content)).toEqual([
      'story "picnic" page 1: the scene is empty',
      'story "picnic" page 2 scene "red-apple": does not fit inside the scene at (5, 50)',
      'story "picnic" page 3 scene "banana": size 12 is not 24–40',
      'story "picnic" page 3 scene "banana": unknown anim "fly"',
      'story "picnic" page 4 scene "banana": does not fit inside the scene at (70, 95)'
    ]);
  });

  it('fails on a story with no scene word, and on an empty intro', () => {
    const content = valid();
    content.stories[0].introPl = ' ';
    for (const page of content.stories[0].pages) page.scene = page.scene.map(({ word: _w, ...rest }: { word?: string }) => rest);
    expect(errorsOf(content)).toEqual([
      'story "picnic": introPl is empty',
      'story "picnic": no scene item has a word, so nothing unlocks it'
    ]);
  });

  it('fails on an incomplete prompt catalog, an unknown prompt and an unknown placeholder', () => {
    const content = valid();
    content.prompts = content.prompts.filter((p) => p.id !== 'feedback.hint');
    content.prompts.push({ id: 'made.up', pl: 'Hej {name}!' });
    expect(errorsOf(content)).toEqual([
      'prompt "feedback.hint": missing from the catalog',
      'prompt "made.up": not a known prompt id',
      'prompt "made.up": unknown placeholder {name}'
    ]);
  });

  it('fails on duplicate ids, a word without pl, and topic/word disagreements', () => {
    const content = valid();
    content.words.push({ ...content.words[0], pl: '' });
    content.words.push({ id: 'fruit.pear', en: 'pear', pl: 'gruszka', topic: 'fruit', image: 'banana', level: 1 });
    content.topics[0].words.push('fruit.kiwi');
    expect(errorsOf(content)).toEqual([
      'word "fruit.apple": duplicate id',
      'topic "fruit": word "fruit.kiwi" does not exist',
      'word "fruit.apple": no pl',
      'word "fruit.pear": not listed by its topic "fruit"'
    ]);
  });

  it('fails on a sticker without a picture and a file name where an id belongs', () => {
    const content = valid();
    content.stickers.push({ id: 'sticker.x', set: 'food' });
    content.words[0].image = 'red-apple.svg';
    expect(errorsOf(content)).toEqual([
      'word "fruit.apple": image "red-apple.svg" must be an id, not a file name or path',
      'sticker "sticker.x": no image id'
    ]);
  });

  it('warns about pictures nothing uses', () => {
    const sizes = images();
    sizes.set('unused', 100);
    expect(validateContent(valid(), sizes).warnings).toEqual(['image "unused" is in content/img/ but no content uses it']);
  });

  it('fails on a missing UI picture, and never calls one unused', () => {
    const sizes = images();
    sizes.delete('turtle');
    expect(errorsOf(valid(), sizes)).toEqual(['UI picture: image "turtle" has no file in content/img/']);
    expect(validateContent(valid(), images()).warnings).toEqual([]);
  });

  it('tokenises sentences into lower-case words', () => {
    expect(storyTokens("Hello! I'm Polly, look: a RED apple.")).toEqual(['hello', "i'm", 'polly', 'look', 'a', 'red', 'apple']);
  });
});

describe('npm run check:content (the CLIs, against fixture checkouts)', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const svg = (bytes: number) => `<svg xmlns="http://www.w3.org/2000/svg">${' '.repeat(Math.max(0, bytes - 41))}</svg>`;

  /** A checkout with the valid set, its pictures, the manifest, licence and attribution. */
  function fixture(change: (content: ContentSet, files: Map<string, string>) => void = () => {}): string {
    const root = mkdtempSync(join(tmpdir(), 'hello-polly-content-'));
    dirs.push(root);
    const content = valid();
    const files = new Map([
      ['red-apple.svg', svg(5000)],
      ['banana.svg', svg(10000)],
      ...UI_IMAGE_IDS.map((id): [string, string] => [`${id}.svg`, svg(1000)]),
      ['LICENSE', 'MIT'],
      ['ATTRIBUTION.md', 'commit 0123456789abcdef']
    ]);
    change(content, files);
    mkdirSync(join(root, 'content', 'img'), { recursive: true });
    for (const [name, list] of Object.entries(content)) writeFileSync(join(root, 'content', `${name}.json`), JSON.stringify(list));
    const manifest = {
      source: { name: 'Fixture', repository: 'https://example.invalid', commit: '0123456789abcdef', license: 'MIT' },
      images: {
        'red-apple': 'assets/apple.svg',
        banana: 'assets/banana.svg',
        ...Object.fromEntries(UI_IMAGE_IDS.map((id) => [id, `assets/${id}.svg`]))
      }
    };
    writeFileSync(join(root, 'content', 'images.json'), JSON.stringify(manifest));
    for (const [name, body] of files) writeFileSync(join(root, 'content', 'img', name), body);
    return root;
  }

  /** What `npm run check:content` does: the offline pipeline check, then the rules. */
  function checkContent(root: string): { status: number; output: string } {
    let output = '';
    for (const [script, ...args] of [
      ['build-content.mjs', '--check', '--root', root],
      ['check-content.mjs', '--root', root]
    ] as const) {
      const path = fileURLToPath(new URL(`./${script}`, import.meta.url));
      const run = spawnSync(process.execPath, [path, ...args], { encoding: 'utf8' });
      output += run.stdout + run.stderr;
      if (run.status !== 0) return { status: run.status ?? 1, output };
    }
    return { status: 0, output };
  }

  it('passes on a valid checkout', () => {
    const { status, output } = checkContent(fixture());
    expect(output).toContain('✓ content: 1 topics, 2 words');
    expect(status).toBe(0);
  });

  it('fails on a missing image', () => {
    const { status, output } = checkContent(fixture((_c, files) => files.delete('banana.svg')));
    expect(status).toBe(1);
    expect(output).toContain('banana.svg is missing');
  });

  it('fails on an oversized SVG', () => {
    const { status, output } = checkContent(fixture((_c, files) => files.set('banana.svg', svg(SVG_BUDGET_BYTES + 500))));
    expect(status).toBe(1);
    expect(output).toContain('banana.svg is 25.5 kB, over the 25.0 kB budget');
  });

  it('fails on an unknown story word', () => {
    const root = fixture((content) => content.stories[0].pages.push({ text: 'A purple dragon.', scene: [apple()] }));
    const { status, output } = checkContent(root);
    expect(status).toBe(1);
    expect(output).toContain('"purple" is neither vocabulary nor a function word');
    expect(output).toContain('"dragon" is neither vocabulary nor a function word');
  });

  it('fails on a stray picture and a stale attribution', () => {
    const root = fixture((_c, files) => {
      files.set('extra.svg', svg(100));
      files.set('ATTRIBUTION.md', 'commit ffffffff');
    });
    const { status, output } = checkContent(root);
    expect(status).toBe(1);
    expect(output).toContain('extra.svg is not in content/images.json');
    expect(output).toContain('ATTRIBUTION.md does not name the pinned commit');
  });
});
