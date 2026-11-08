// Pixel Pals art: the one source of truth.
// tools/gen-sprites.mjs packs this same data into contracts/PixelPals.sol, and the contract's
// tokenURI draws byte-for-byte the same SVG as renderSVG() below (tools/test-contract.mjs checks it).
//
// Each sprite is 16×16, drawn as its LEFT half (8 columns) and mirrored.
//   .  empty   o  outline   b  body   a  accent
// eyeY: row of the eyes (left eye col 6, right eye col 9). headY: top row of the head (hats/bows sit here).

export const SPECIES = ['Cat', 'Dino', 'Blob'];
export const STAGES = ['Egg', 'Baby', 'Teen', 'Adult'];
export const MOODS = ['Happy', 'Okay', 'Sad'];
export const PATTERNS = ['Plain', 'Spots', 'Stripes', 'Sparkles'];
export const ACCESSORIES = ['None', 'Bow', 'Tiny hat', 'Round glasses', 'Flower'];
export const STAGE_AT = [0, 1, 7, 14]; // care days needed for each stage

// [name, background, body, accent, pattern]
export const PALETTES = [
  ['Strawberry Milk', 'FFF0F5', 'FFC8DD', 'FF8FB8', 'FFFFFF'],
  ['Mint Chip', 'EEFBF3', 'C8F2DC', '7FD6A8', '6B4F3A'],
  ['Lavender Haze', 'F5F0FF', 'D9C8FF', 'A98BF0', 'FFFFFF'],
  ['Peach Soda', 'FFF4EC', 'FFD6BA', 'FFA77F', 'FFF1A8'],
  ['Sky Bubble', 'EEF6FF', 'BDE0FE', '7FB8F0', 'FFFFFF'],
  ['Lemon Drop', 'FFFBE6', 'FFF1A8', 'F5CE4E', 'FFB3A7'],
  ['Cotton Candy', 'FDF0FA', 'E8D5F5', 'FFB3D9', 'BDE0FE'],
  ['Matcha Latte', 'F3F7EA', 'CFE3B5', '96B972', 'FBF7F0'],
];
export const OUTLINE = '3A3150';

const half = (rows) => rows.trim().split(/\s+/);

// SPRITES[species][stage] = { rows: [8-char left halves], eyeY, headY }
export const SPRITES = [
  // ---------------- Cat ----------------
  [
    { eyeY: 0, headY: 4, rows: half(`
      ........ ........ ........ ........
      ......oo .....obb ....obbb ...obabb
      ...obbbb ..obbbbb ..obaabb ..obbbbb
      ..obbbbb ...obbbb ....obbb .....ooo`) },
    { eyeY: 10, headY: 8, rows: half(`
      ........ ........ ........ ........
      ........ ........ ...o.... ...oo...
      ...oaooo ...obbbb ..obbbbb ..obbbbb
      ..obbbbb ..obbbaa ...obbaa ....oooo`) },
    { eyeY: 8, headY: 5, rows: half(`
      ........ ........ ........ ..o.....
      ..oo.... ..oaoooo ..obbbbb .obbbbbb
      .obbbbbb .obbbbbb .obbbbbb ..obbbbb
      ..obbbaa .obbbbaa ..obbbaa ..ooo.oo`) },
    { eyeY: 6, headY: 3, rows: half(`
      ........ .o...... .oo..... .oaooooo
      .obbbbbb obbbbbbb obbbbbbb obbbbbbb
      obbbbbbb .obbbbbb ..obbbbb .obbbbaa
      obbbbbaa obbbbbaa .obbbbaa .oooo.oo`) },
  ],
  // ---------------- Dino ----------------
  [
    { eyeY: 0, headY: 4, rows: half(`
      ........ ........ ........ ........
      ......oo .....obb ....obbb ...obbbb
      ...obbbb ..obabab ..oababb ..obbbbb
      ..obbbbb ...obbbb ....obbb .....ooo`) },
    { eyeY: 10, headY: 8, rows: half(`
      ........ ........ ........ ........
      ........ ........ ........ .......a
      ...ooooo ..obbbbb ..obbbbb ..obbbbb
      ..obbbbb .oobbbaa ..obbbaa ..ooo.oo`) },
    { eyeY: 8, headY: 5, rows: half(`
      ........ ........ ........ .......a
      .....a.a ...ooooo ..obbbbb .obbbbbb
      .obbbbbb .obbbbbb .obbbbbb ..obbbbb
      .oobbbaa ..obbbaa ..obbbaa ..ooo.oo`) },
    { eyeY: 6, headY: 3, rows: half(`
      ........ .......a ....a..a ...ooooo
      ..obbbbb .obbbbbb obbbbbbb obbbbbbb
      obbbbbbb .obbbbbb ..obbbbb .oobbbaa
      oobbbbaa .obbbbaa .obbbbaa .oooo.oo`) },
  ],
  // ---------------- Blob ----------------
  [
    { eyeY: 0, headY: 4, rows: half(`
      ........ ........ ........ ........
      ......oo .....oaa ....oaaa ...obaba
      ...obbbb ..obbbbb ..obbbbb ..obbbbb
      ..obbbbb ...obbbb ....obbb .....ooo`) },
    { eyeY: 11, headY: 8, rows: half(`
      ........ ........ ........ ........
      ........ ........ ........ ........
      .....ooo ....obbb ...oabbb ..obabbb
      ..obbbbb ..obbbbb ..obbbbb ...ooooo`) },
    { eyeY: 9, headY: 4, rows: half(`
      ........ ........ ........ ........
      ......oo ....oobb ...obbbb ..oabbbb
      ..oabbbb .obbbbbb .obbbbbb .obbbbbb
      .obbbbbb .obbbbbb .obbbbbb ..oooooo`) },
    { eyeY: 8, headY: 2, rows: half(`
      ........ ........ ......oo ....oobb
      ...obbbb ..oabbbb .oabbbbb .obbbbbb
      obbbbbbb obbbbbbb obbbbbbb obbbbbbb
      obbbbbbb obbbbbbb .obbbbbb ..oooooo`) },
  ],
];

// ---------- overlays (pre-built SVG snippets, coordinates relative to their anchor) ----------
const px = (x, y, w, c, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="#${c}"${extra}/>`;
const INK = OUTLINE;
const BLUSH = ' opacity=".7"';

// faces, anchored at eyeY (eyes at cols 6 and 9, mouth at 7–8)
export const FACES = [
  // happy: tall eyes, little smile, blush
  px(6, 0, 1, INK) + px(9, 0, 1, INK) + px(6, 1, 1, INK) + px(9, 1, 1, INK) +
    px(7, 2, 2, INK) + px(5, 2, 1, 'FF8FB8', BLUSH) + px(10, 2, 1, 'FF8FB8', BLUSH),
  // okay: dot eyes, flat mouth
  px(6, 1, 1, INK) + px(9, 1, 1, INK) + px(7, 2, 2, INK),
  // sad: dot eyes, a tear, frown
  px(6, 1, 1, INK) + px(9, 1, 1, INK) + px(10, 2, 1, '7FB8F0') + px(7, 2, 2, INK) + px(6, 3, 1, INK) + px(9, 3, 1, INK),
];

// glasses, anchored at eyeY: drawn under the face so the eyes show through the lenses
export const GLASSES = px(5, -1, 3, INK) + px(8, -1, 3, INK) + px(5, 0, 1, INK) + px(6, 0, 1, 'FFFFFF') + px(7, 0, 2, INK) +
  px(9, 0, 1, 'FFFFFF') + px(10, 0, 1, INK) + px(5, 1, 1, INK) + px(6, 1, 1, 'FFFFFF') + px(9, 1, 1, 'FFFFFF') + px(10, 1, 1, INK);

// bow / hat / flower, anchored at headY (index = accessory id; 0 none, 3 glasses live in the face layer)
export const HEADWEAR = [
  '',
  px(5, -2, 2, 'FF6FA3') + px(9, -2, 2, 'FF6FA3') + px(5, -1, 2, 'FF6FA3') + px(7, -1, 2, 'D9487F') + px(9, -1, 2, 'FF6FA3') +
    px(5, 0, 2, 'FF6FA3') + px(9, 0, 2, 'FF6FA3'),
  px(6, -3, 4, '2B2440') + px(6, -2, 4, '2B2440') + px(6, -1, 4, 'FF8FB8') + px(5, 0, 6, '2B2440'),
  '',
  px(10, -2, 1, 'FFFFFF') + px(9, -1, 1, 'FFFFFF') + px(10, -1, 1, 'F5CE4E') + px(11, -1, 1, 'FFFFFF') + px(10, 0, 1, 'FFFFFF') +
    px(10, 1, 1, '7FD6A8'),
];

// rain cloud for sad pals (absolute, placed above the head)
export const CLOUD = px(6, 0, 3, 'A9B4CF') + px(4, 1, 8, 'A9B4CF') + px(3, 2, 10, 'A9B4CF') + px(5, 2, 1, 'C5CEE3') +
  px(5, 3, 1, '7FB8F0') + px(8, 3, 1, '7FB8F0') + px(11, 3, 1, '7FB8F0') + px(6, 4, 1, '7FB8F0') + px(10, 4, 1, '7FB8F0');

// ---------- helpers ----------
export function grid(species, stage) {
  const s = SPRITES[species][stage];
  return s.rows.map((l) => l + [...l].reverse().join(''));
}

export function stageOf(careDays) {
  return careDays >= 14 ? 3 : careDays >= 7 ? 2 : careDays >= 1 ? 1 : 0;
}

export function moodOf(today, lastCareDay) {
  const gap = today - lastCareDay;
  return gap <= 1 ? 0 : gap === 2 ? 1 : 2;
}

// pattern overlay on body pixels (same rule as the contract)
export function patternAt(pattern, x, y) {
  if (pattern === 1) return (x % 4 === 1 && y % 4 === 1) || (x % 4 === 3 && y % 4 === 3);
  if (pattern === 2) return y % 3 === 0;
  if (pattern === 3) return (x * 3 + y * 5) % 11 === 0;
  return false;
}

// Exactly the SVG the contract returns for a pal with these traits.
// `bare` (website only) drops the background square so a pal can stand inside a scene.
export function renderSVG({ species = 0, stage = 0, palette = 0, pattern = 0, accessory = 0, mood = 0, bare = false }) {
  const s = SPRITES[species][stage];
  const g = grid(species, stage);
  const [, bg, body, accent, pat] = PALETTES[palette];
  const colors = [null, OUTLINE, body, accent, pat];
  let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" shape-rendering="crispEdges">' +
    (bare ? '' : `<rect width="20" height="20" fill="#${bg}"/>`) +
    `<rect x="5" y="19" width="10" height="1" fill="#${OUTLINE}" opacity=".15"/>` +
    '<g transform="translate(2 3)">';
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      const c = code(g, pattern, x, y);
      let w = 1;
      while (x + w < 16 && code(g, pattern, x + w, y) === c) w++;
      if (c) out += px(x, y, w, colors[c]);
      x += w;
    }
  }
  if (stage > 0) {
    out += `<g transform="translate(0 ${s.eyeY})">${accessory === 3 ? GLASSES : ''}${FACES[mood]}</g>`;
    if (HEADWEAR[accessory]) out += `<g transform="translate(0 ${s.headY})">${HEADWEAR[accessory]}</g>`;
  }
  out += '</g>';
  if (mood === 2) out += `<g transform="translate(2 ${Math.max(s.headY - 3, 0)})">${CLOUD}</g>`;
  return out + '</svg>';
}

function code(g, pattern, x, y) {
  const ch = g[y][x];
  if (ch === 'o') return 1;
  if (ch === 'a') return 3;
  if (ch === 'b') return patternAt(pattern, x, y) ? 4 : 2;
  return 0;
}

export const svgDataUri = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
