import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { REQUIRED_PROMPT_IDS, SVG_BUDGET_BYTES, storyTokens, validateContent, type ContentSet } from './lib/content-rules.mjs';

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
        pages: [{ text: 'I like fruit. Look! An apple and a banana.', scene: [{ word: 'fruit.apple', image: 'red-apple', x: 0, y: 0, size: 1 }] }]
      }
    ],
    stickers: [{ id: 'sticker.banana', image: 'banana', word: 'fruit.banana', set: 'food' }]
  };
}
const images = () => new Map([['red-apple', 5000], ['banana', 10000]]);
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
      'sticker "sticker.banana": image "banana" has no file in content/img/'
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
    content.stories[0].pages.push({ text: 'Yum! A red pear.', scene: [] });
    expect(errorsOf(content)).toEqual([
      'story "picnic" page 2: "yum" is neither vocabulary nor a function word',
      'story "picnic" page 2: "red" is neither vocabulary nor a function word',
      'story "picnic" page 2: "pear" is neither vocabulary nor a function word'
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
      ['LICENSE', 'MIT'],
      ['ATTRIBUTION.md', 'commit 0123456789abcdef']
    ]);
    change(content, files);
    mkdirSync(join(root, 'content', 'img'), { recursive: true });
    for (const [name, list] of Object.entries(content)) writeFileSync(join(root, 'content', `${name}.json`), JSON.stringify(list));
    const manifest = {
      source: { name: 'Fixture', repository: 'https://example.invalid', commit: '0123456789abcdef', license: 'MIT' },
      images: { 'red-apple': 'assets/apple.svg', banana: 'assets/banana.svg' }
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
    const root = fixture((content) => content.stories[0].pages.push({ text: 'A purple dragon.', scene: [] }));
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
