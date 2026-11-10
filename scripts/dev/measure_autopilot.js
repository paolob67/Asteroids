// Measures the built-in autopilot (simplePilot) against two baselines on the same
// game logic: a ship that never presses a key, and a ship that presses random keys.
// Usage: node scripts/dev/measure_autopilot.js [file] [ticks]
// Each controller gets the same tick budget (default 600,000 = about 2.8 hours of play at 60 Hz)
// and restarts a 1-player game whenever the previous one ends.
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');
const budget = Number(process.argv[3] || 600000);
const html = fs.readFileSync(file, 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');

const noop = () => {};
const ctxStub = new Proxy({}, { get: () => noop, set: () => true });
const el = new Proxy({}, { get: (t, k) => k === 'getContext' ? () => ctxStub : k === 'classList' ? { toggle: noop } : k === 'style' ? {} : noop, set: () => true });
global.document = { getElementById: () => el, addEventListener: noop, createElement: () => el, body: el };
global.window = { addEventListener: noop, innerWidth: 1400, innerHeight: 800 };
global.requestAnimationFrame = noop;
global.AudioContext = undefined;

const body = src + `
const mode = MODE;
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const games = [];                       // { score, ticks, waves }
let startTick = 0, startRocks = 0, prevState = '', waves = 0, prevSrocks = 0;
if (mode === 'autopilot') AUTOPILOT = simplePilot;
initGame(1);
for (let i = 0; i < ${budget}; i++) {
  if (mode === 'autopilot') applyAutopilot();
  else {
    if (gameState === 'attract' || (gameState === 'gameover' && entryQueue.length === 0)) { initGame(1); startTick = i; waves = 0; }
    if (gameState === 'hiscore') { keys['Shift'] = i % 2 === 0; }
    else if (mode === 'random' && i % 20 === 0) {
      keys['ArrowLeft'] = rnd() < 0.3; keys['ArrowRight'] = rnd() < 0.3;
      keys['ArrowUp'] = rnd() < 0.5; keys[' '] = rnd() < 0.6; keys['Shift'] = rnd() < 0.02;
    }
  }
  update();
  if (srocks !== prevSrocks) { waves++; prevSrocks = srocks; }
  if (gameState === 'gameover' && prevState !== 'gameover') {
    games.push({ score: scores[0], ticks: i - startTick, waves });
  }
  if (mode === 'autopilot' && prevState !== 'playing' && prevState !== 'waveclear' && gameState === 'playing') { startTick = i; waves = 0; }
  prevState = gameState;
}
return games;
`;

const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
for (const mode of ['idle', 'random', 'autopilot']) {
  const games = new Function(body.replace('MODE', JSON.stringify(mode)))();
  const sc = games.map(g => g.score), tk = games.map(g => g.ticks / 60);
  const mean = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0;
  console.log(`${mode.padEnd(9)} games=${String(games.length).padStart(4)}  ` +
    `score mean=${String(mean(sc)).padStart(6)} median=${String(sc.length ? pct(sc, 0.5) : 0).padStart(6)} ` +
    `best=${String(sc.length ? Math.max(...sc) : 0).padStart(6)}  ` +
    `survival mean=${mean(tk)}s median=${tk.length ? Math.round(pct(tk, 0.5)) : 0}s longest=${tk.length ? Math.round(Math.max(...tk)) : 0}s`);
}
