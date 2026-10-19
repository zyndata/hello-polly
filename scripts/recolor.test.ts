import { describe, expect, it } from 'vitest';
import { recolor } from './lib/recolor.mjs';

const svg =
  '<svg><path fill="#F03874"/><stop stop-color="#f03874"/><stop stop-color="#FFEECE"/>' +
  '<feColorMatrix type="matrix" values="0 0 0 0 0.894118 0 0 0 0 0.14902 0 0 0 0 0.388235 0 0 0 1 0"/></svg>';

describe('recolor', () => {
  it('swaps mapped colours in attributes, in any case, and leaves the rest', () => {
    const out = recolor(svg, { '#F03874': '#2A7BF7', '#E42663': '#000000' });
    expect(out).toContain('fill="#2A7BF7"');
    expect(out).toContain('stop-color="#2A7BF7"');
    expect(out).toContain('stop-color="#FFEECE"');
  });

  it('swaps a mapped colour in a feColorMatrix flood, keeping its alpha', () => {
    const out = recolor(svg, { '#E42663': '#FF0000' });
    expect(out).toContain('values="0 0 0 0 1.000000 0 0 0 0 0.000000 0 0 0 0 0.000000 0 0 0 1 0"');
  });

  it('fails when a mapped colour is not in the picture', () => {
    expect(() => recolor(svg, { '#123456': '#000000' })).toThrow('#123456');
  });
});
