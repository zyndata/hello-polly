/**
 * Recolouring for derived pictures (content/images.json `recolor`): one upstream shape, many
 * colours, e.g. the colour flags made from Fluent's triangular flag.
 */

/**
 * Replace every colour in `map` (upstream `#RRGGBB` → new `#RRGGBB`, case-insensitive): in
 * attributes such as `fill` and `stop-color`, and in the colour row of a `feColorMatrix`
 * (inner shadows), which spells the same colour as 0–1 channel values.
 * @param {string} svg
 * @param {Record<string, string>} map
 * @returns {string}
 */
export function recolor(svg, map) {
  const byHex = new Map(Object.entries(map).map(([from, to]) => [from.toLowerCase(), to]));
  const used = new Set();

  let out = svg.replace(/#[0-9a-f]{6}\b/gi, (hex) => {
    const to = byHex.get(hex.toLowerCase());
    if (!to) return hex;
    used.add(hex.toLowerCase());
    return to;
  });

  // `values="0 0 0 0 R 0 0 0 0 G 0 0 0 0 B 0 0 0 A 0"`: a flood of one colour.
  out = out.replace(
    /values="0 0 0 0 ([\d.]+) 0 0 0 0 ([\d.]+) 0 0 0 0 ([\d.]+) 0 0 0 ([\d.]+) 0"/g,
    (whole, r, g, b, a) => {
      const hex = '#' + [r, g, b].map((v) => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('');
      const to = byHex.get(hex);
      if (!to) return whole;
      used.add(hex);
      const [nr, ng, nb] = [1, 3, 5].map((i) => (parseInt(to.slice(i, i + 2), 16) / 255).toFixed(6));
      return `values="0 0 0 0 ${nr} 0 0 0 0 ${ng} 0 0 0 0 ${nb} 0 0 0 ${a} 0"`;
    }
  );

  const unused = [...byHex.keys()].filter((hex) => !used.has(hex));
  if (unused.length > 0) throw new Error(`recolor: ${unused.join(', ')} not found in the picture`);
  return out;
}
