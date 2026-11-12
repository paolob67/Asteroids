// Builds the three LinkedIn cover images as SVG (and PNG through headless Chrome).
// The ship and rock outlines are read from the game itself (ROCKS and SHIPS in asteroids.html), so the
// covers use the same vector shapes as the 1979 data tables.
//
// Usage: node scripts/dev/make_cover_images.js [outDir] [--no-title] [--no-png]
// Default outDir: docs/articles/linkedin/covers. Output: cover-part1.svg|png, cover-part2.svg|png, cover-part3.svg|png (1920x1080).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadGame } = require('./lib/load_game');

const args = process.argv.slice(2);
const outDir = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '../../docs/articles/linkedin/covers'));
const TITLE = !args.includes('--no-title');
const PNG = !args.includes('--no-png');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const W = 1920, H = 1080;
const BG = '#0B0F0C', GREEN = '#7CFF7C', BLUE = '#78A9FF', WHITE = '#E6FFE6';
const MONO = "'IBM Plex Mono', Menlo, monospace", SANS = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";

const game = loadGame(path.join(__dirname, '../../asteroids.html'))('return { ROCKS, SHIPS }');

// ---------- helpers ----------
const f = n => Math.round(n * 10) / 10;

// Game segments [dx, dy, draw] (sub-pixel units = VCTR value * 8, y up) to a path centred on its bounding box.
// sc = screen pixels per VCTR unit.
function shape(segs, sc) {
  let x = 0, y = 0;
  const pts = [], moves = [];
  for (const [dx, dy, draw] of segs) {
    const nx = x + dx * sc / 8, ny = y - dy * sc / 8;
    moves.push([x, y, nx, ny, draw]);
    pts.push([nx, ny]);
    x = nx; y = ny;
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let d = '';
  for (const [x0, y0, x1, y1, draw] of moves) if (draw) d += `M${f(x0 - cx)} ${f(y0 - cy)}L${f(x1 - cx)} ${f(y1 - cy)}`;
  const r = Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cy)));
  return { d, r };
}
const rock = (i, sc) => shape(game.ROCKS[i], sc);
const ship = sc => shape(game.SHIPS[0].body, sc);   // frame 0: nose points right (+x)

function place(s, x, y, rot = 0, opts = {}) {
  const { stroke = GREEN, width = 2.5, opacity = 1, dash = '' } = opts;
  return `<path d="${s.d}" transform="translate(${f(x)} ${f(y)}) rotate(${rot})" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" opacity="${opacity}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
const text = (x, y, s, size, fill, opts = {}) =>
  `<text x="${x}" y="${y}" font-family="${opts.font || MONO}" font-size="${size}" fill="${fill}" ${opts.weight ? `font-weight="${opts.weight}"` : ''} ${opts.anchor ? `text-anchor="${opts.anchor}"` : ''} ${opts.opacity ? `opacity="${opts.opacity}"` : ''} ${opts.spacing ? `letter-spacing="${opts.spacing}"` : ''}>${s}</text>`;

function frame(partNo, title, subtitle, body) {
  const head = !TITLE ? '' : [
    text(100, 150, 'A JOURNEY IN CODE MODERNIZATION WITH BOB', 22, GREEN, { opacity: 0.8, spacing: 2 }),
    text(100, 230, `PART ${partNo}`, 44, GREEN, { weight: 600, spacing: 3 }),
    ...title.map((l, i) => text(100, 330 + i * 72, l, 60, WHITE, { font: SANS, weight: 700 })),
    text(100, 330 + title.length * 72 + 20, subtitle, 30, GREEN, { opacity: 0.9 }),
  ].join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.5" fill="#000" opacity="0.28"/></pattern>
<linearGradient id="fadeR" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="fadeMask"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#fadeR)"/></mask>
</defs>
<rect width="${W}" height="${H}" fill="${BG}"/>
<g filter="url(#glow)">
${head}
${body}
</g>
<rect width="${W}" height="${H}" fill="url(#scan)"/>
</svg>
`;
}

// ---------- Part 1: source code to vector game in a browser ----------
function part1() {
  const asm = ['EFIRE:  LDA FRAME', '        ASL', '        BNE 10$', '        JSR RAND', '        AND I,03', '        TAX',
               '        LDA X,99$', '        STA YINC+NOBJ+1'];
  // asm block starts at x=100 and fades to the right (mask on a sub-group)
  const code = `<g mask="url(#asmMask)">${asm.map((l, i) => text(100, 690 + i * 36, l.replace(/ /g, '&#160;'), 26, GREEN, { opacity: 0.85 })).join('\n')}</g>`;
  const asmMask = `<mask id="asmMask"><linearGradient id="asmG" x1="100" x2="860" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><rect x="0" y="600" width="900" height="400" fill="url(#asmG)"/></mask>`;
  const arrow = `<path d="M470 905 L930 905" stroke="${GREEN}" stroke-width="2" stroke-dasharray="3 9" fill="none" opacity="0.6"/><path d="M915 893 L935 905 L915 917" stroke="${GREEN}" stroke-width="2" fill="none" opacity="0.7"/>`;
  const win = `<rect x="960" y="110" width="880" height="860" rx="14" fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.55"/>
<line x1="960" y1="160" x2="1840" y2="160" stroke="${GREEN}" stroke-width="2" opacity="0.4"/>
${[0, 1, 2].map(i => `<circle cx="${990 + i * 26}" cy="135" r="6" fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.6"/>`).join('')}
${text(1300, 142, 'asteroids.html', 20, GREEN, { opacity: 0.6 })}`;
  const scene = [
    place(ship(1.7), 1400, 560, -28),
    place(rock(0, 3.6), 1650, 330),
    place(rock(2, 3.0), 1150, 790),
    place(rock(1, 1.8), 1720, 760),
    place(rock(3, 1.6), 1210, 330),
    ...[[1090, 240], [1560, 880], [1790, 520], [1300, 900], [1100, 560]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5" fill="${GREEN}" opacity="0.7"/>`),
    place(ship(0.7), 1020, 920, -90, { opacity: 0.8 }), place(ship(0.7), 1060, 920, -90, { opacity: 0.8 }), place(ship(0.7), 1100, 920, -90, { opacity: 0.8 }),
  ].join('\n');
  return frame(1, ['Porting a 1979 arcade', 'game with an LLM'], 'What worked, what did not',
    `<defs>${asmMask}</defs>\n${code}\n${arrow}\n${win}\n${scene}`);
}

// ---------- Part 2: a pilot is a function from state to five keys ----------
function part2() {
  const S = { x: 1350, y: 560 }, shipDeg = -30, L = 400;
  const rocks = [
    { x: 1625, y: 370, i: 0, sc: 3.0 }, { x: 1085, y: 380, i: 2, sc: 3.0 }, { x: 1575, y: 790, i: 1, sc: 2.6 },
    { x: 1015, y: 700, i: 3, sc: 2.2 }, { x: 1410, y: 160, i: 1, sc: 1.8 },
  ].map(r => ({ ...r, ...rock(r.i, r.sc) }));
  const headings = Array.from({ length: 16 }, (_, k) => k * 22.5 - 180);
  const curves = headings.map(h => {
    const a = h * Math.PI / 180, bend = 0.22;
    const E = [S.x + L * Math.cos(a), S.y + L * Math.sin(a)];
    const C = [S.x + 0.55 * L * Math.cos(a + bend), S.y + 0.55 * L * Math.sin(a + bend)];
    let hit = null;
    for (let t = 0; t <= 1 && !hit; t += 0.01) {
      const x = (1 - t) ** 2 * S.x + 2 * (1 - t) * t * C[0] + t * t * E[0];
      const y = (1 - t) ** 2 * S.y + 2 * (1 - t) * t * C[1] + t * t * E[1];
      if (rocks.some(r => Math.hypot(x - r.x, y - r.y) < r.r * 0.8)) hit = { t, x, y };
    }
    return { h, a, E, C, hit };
  });
  const safe = curves.filter(c => !c.hit);
  const turn = c => Math.abs(((c.h - shipDeg + 540) % 360) - 180);
  const best = safe.reduce((b, c) => (turn(c) < turn(b) ? c : b), safe[0]);
  console.log(`part2: ${curves.length - safe.length} of 16 curves hit a rock, ${safe.length} safe`);

  const qpath = (c, t1 = 1) => {
    const pts = [];
    for (let t = 0; t <= t1 + 1e-9; t += 0.02) pts.push([(1 - t) ** 2 * S.x + 2 * (1 - t) * t * c.C[0] + t * t * c.E[0], (1 - t) ** 2 * S.y + 2 * (1 - t) * t * c.C[1] + t * t * c.E[1]]);
    return 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L');
  };
  const lines = curves.map(c => {
    if (c === best) return `<path d="${qpath(c)}" fill="none" stroke="${GREEN}" stroke-width="4" stroke-linecap="round"/><circle cx="${f(c.E[0])}" cy="${f(c.E[1])}" r="9" fill="${GREEN}"/>`;
    if (c.hit) return `<path d="${qpath(c, c.hit.t)}" fill="none" stroke="${GREEN}" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.35"/>` +
      `<path d="M${f(c.hit.x - 9)} ${f(c.hit.y - 9)}L${f(c.hit.x + 9)} ${f(c.hit.y + 9)}M${f(c.hit.x + 9)} ${f(c.hit.y - 9)}L${f(c.hit.x - 9)} ${f(c.hit.y + 9)}" stroke="${GREEN}" stroke-width="2.5" opacity="0.6"/>`;
    return `<path d="${qpath(c)}" fill="none" stroke="${GREEN}" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.6"/>`;
  }).join('\n');

  const keys = ['LEFT', 'RIGHT', 'THRUST', 'FIRE', 'HYPER'], lit = 2, kx0 = 1030, kw = 150, gap = 22, ky = 930;
  const keyBoxes = keys.map((k, i) => {
    const x = kx0 + i * (kw + gap), on = i === lit;
    return `<rect x="${x}" y="${ky}" width="${kw}" height="64" rx="10" fill="${on ? GREEN : 'none'}" fill-opacity="${on ? 0.22 : 0}" stroke="${GREEN}" stroke-width="${on ? 3 : 2}" opacity="${on ? 1 : 0.45}"/>` +
      text(x + kw / 2, ky + 40, k, 22, GREEN, { anchor: 'middle', opacity: on ? 1 : 0.5 });
  }).join('\n');
  const grid = Array.from({ length: 9 }, (_, i) => `<line x1="${960 + i * 110}" y1="90" x2="${960 + i * 110}" y2="880" stroke="${GREEN}" stroke-width="1" opacity="0.07"/>`).join('') +
    Array.from({ length: 8 }, (_, i) => `<line x1="960" y1="${90 + i * 110}" x2="1840" y2="${90 + i * 110}" stroke="${GREEN}" stroke-width="1" opacity="0.07"/>`).join('');
  const scene = [grid, lines, ...rocks.map(r => place({ d: r.d }, r.x, r.y)), place(ship(1.4), S.x, S.y, shipDeg), keyBoxes].join('\n');
  return frame(2, ['Once the code is modern,', 'a game becomes something', 'a program can play'], '80 plans, 90 ticks, 5 keys', scene);
}

// ---------- Part 3: a decision model chooses the tactic ----------
function part3() {
  const S = { x: 1330, y: 590 }, shipDeg = -25;
  const rk = { x: 1610, y: 400, ...rock(0, 3.4) };
  const q = (p0, c, p1) => `M${p0[0]} ${p0[1]}Q${c[0]} ${c[1]} ${p1[0]} ${p1[1]}`;
  const paths = [
    // stay_and_fire: dotted line of shots at the rock, ship stays
    `<path d="M${S.x + 60} ${S.y - 30}L${rk.x - 95} ${rk.y + 50}" stroke="${GREEN}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" fill="none" opacity="0.5"/>` +
      text(rk.x - 270, rk.y + 190, 'stay_and_fire', 22, GREEN, { opacity: 0.5 }),
    // turn_left_and_thrust: the brightest path, bends away from the rock
    `<path d="${q([S.x - 10, S.y + 30], [S.x - 30, S.y + 190], [S.x - 140, S.y + 290])}" stroke="${GREEN}" stroke-width="5" stroke-linecap="round" fill="none"/>` +
      `<circle cx="${S.x - 140}" cy="${S.y + 290}" r="10" fill="${GREEN}"/>` + text(S.x - 80, S.y + 345, 'turn_left_and_thrust  0.97', 24, GREEN, { anchor: 'middle', weight: 600 }),
    // turn_right_and_thrust: weaker
    `<path d="${q([S.x + 30, S.y + 40], [S.x + 190, S.y + 120], [S.x + 330, S.y + 210])}" stroke="${GREEN}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.45"/>` +
      text(S.x + 150, S.y + 275, 'turn_right_and_thrust', 22, GREEN, { opacity: 0.45 }),
  ].join('\n');
  const ghost = place(ship(0.9), 1560, 175, -60, { opacity: 0.4, dash: '4 8' }) + text(1560, 245, 'hyperspace', 22, GREEN, { anchor: 'middle', opacity: 0.4 });
  // laptop
  const lap = `<rect x="960" y="760" width="250" height="150" rx="10" fill="none" stroke="${GREEN}" stroke-width="2.5"/>
<path d="M930 915 L1240 915 L1220 940 L950 940 Z" fill="none" stroke="${GREEN}" stroke-width="2.5" stroke-linejoin="round"/>
${text(1085, 825, 'laya-mlx 421M', 22, GREEN, { anchor: 'middle' })}${text(1085, 860, '127.0.0.1:8700', 20, GREEN, { anchor: 'middle', opacity: 0.6 })}`;
  // decision model motif
  const layers = [[3, 1010], [4, 1090], [4, 1170], [4, 1250]];
  const ys = n => Array.from({ length: n }, (_, i) => 250 + (i - (n - 1) / 2) * 52);
  let net = '';
  for (let l = 0; l < layers.length - 1; l++) for (const ya of ys(layers[l][0])) for (const yb of ys(layers[l + 1][0]))
    net += `<line x1="${layers[l][1]}" y1="${ya}" x2="${layers[l + 1][1]}" y2="${yb}" stroke="${BLUE}" stroke-width="1" opacity="0.3"/>`;
  layers.forEach(([n, x], li) => ys(n).forEach((y, k) => {
    const chosen = li === layers.length - 1 && k === 1;
    net += `<circle cx="${x}" cy="${y}" r="${chosen ? 10 : 7}" fill="${chosen ? BLUE : BG}" stroke="${BLUE}" stroke-width="2"/>`;
  }));
  const chosenY = ys(4)[1];
  net += `<path d="${q([1250, chosenY], [1330, 380], [S.x - 20, S.y - 40])}" stroke="${BLUE}" stroke-width="2.5" stroke-dasharray="3 9" stroke-linecap="round" fill="none" opacity="0.9"/>`;
  net += `<line x1="1085" y1="${ys(4)[3] + 20}" x2="1085" y2="760" stroke="${BLUE}" stroke-width="2" stroke-dasharray="3 9" opacity="0.5"/>`;
  const scene = [net, lap, paths, ghost, place(rock(0, 3.4), rk.x, rk.y), place(ship(1.5), S.x, S.y, shipDeg)].join('\n');
  return frame(3, ['From rules to a', 'decision model'], 'A model can fly the ship', scene);
}

// ---------- write ----------
fs.mkdirSync(outDir, { recursive: true });
const tmp = PNG ? fs.mkdtempSync(path.join(os.tmpdir(), 'cover-')) : null;
[[1, part1], [2, part2], [3, part3]].forEach(([n, build]) => {
  const svg = path.join(outDir, `cover-part${n}.svg`);
  fs.writeFileSync(svg, build());
  console.log(path.relative(process.cwd(), svg));
  if (PNG) {
    const html = path.join(tmp, `c${n}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${BG}}img{display:block}</style><img src="file://${svg}" width="${W}" height="${H}">`);
    const png = path.join(outDir, `cover-part${n}.png`);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`, `--screenshot=${png}`, 'file://' + html], { stdio: 'ignore' });
    console.log(path.relative(process.cwd(), png));
  }
});
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
