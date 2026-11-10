// Measures pilots on the same game logic and tick budget, over several random seeds.
// Usage: node scripts/dev/measure_pilots.js [file] [ticksPerSeed] [pilot1,pilot2,...] [seeds]
//   e.g. node scripts/dev/measure_pilots.js asteroids.html 600000 simplePilot,smartPilot 5
// The game's RAND is a fixed-seed LFSR, so a "seed" here means: advance RAND by that many
// calls after initGame(). The same seed gives the same game for the same pilot.
// A good pilot may not lose its lives within the budget, so the main numbers are the rate of
// ship losses and the points earned per minute of play, not the score of finished games.
const path = require('path');
const { loadGame } = require('./lib/load_game');
const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');
const budget = Number(process.argv[3] || 600000);
const pilots = (process.argv[4] || 'simplePilot,smartPilot').split(',');
const seeds = Number(process.argv[5] || 3);

const run = loadGame(file, [
  ['"use strict";', '"use strict"; var HYPERS = 0, DEATH = null;'],
  ['function doHyperspace() {', 'function doHyperspace() { if (ship.alive && !ship.exploding && ship.visible) HYPERS++;'],
  ['explodeShip(); splitAsteroid(a); return;', 'DEATH = "rock"; explodeShip(); splitAsteroid(a); return;'],
  ['explodeShip(); explodeSaucer(); return;', 'DEATH = "saucer-body"; explodeShip(); explodeSaucer(); return;'],
  ['t.alive = false; explodeShip(); return;', 't.alive = false; DEATH = "saucer-torpedo"; explodeShip(); return;'],
  ['explodeShip();         // doomed by hyperspace', 'DEATH = "hyperspace"; explodeShip();'],
]);
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const mean = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0;

for (const name of pilots) {
  const t0 = Date.now();
  const tot = { losses: 0, points: 0, ticks: 0, hypers: 0, thrust: 0, play: 0, causes: {}, games: [] };
  for (let seed = 0; seed < seeds; seed++) {
    const r = run(`
      AUTOPILOT = ${name}; HYPERS = 0;
      initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
      const games = [], causes = {}; let startTick = 0, prev = '', thrust = 0, play = 0, losses = 0, prevLives = 3, banked = 0;
      for (let i = 0; i < ${budget}; i++) {
        applyAutopilot();
        if (gameState === 'playing') { play++; if (keys['ArrowUp']) thrust++; }
        DEATH = null;
        update();
        if (lives[0] < prevLives && gameState !== 'attract') { losses++; causes[DEATH || 'other'] = (causes[DEATH || 'other'] || 0) + 1; }
        prevLives = lives[0];
        if (gameState === 'gameover' && prev !== 'gameover') { games.push({ score: scores[0], ticks: i - startTick }); banked += scores[0]; prevLives = 3; }
        if (prev !== 'playing' && prev !== 'waveclear' && gameState === 'playing') startTick = i;
        prev = gameState;
      }
      const open = gameState === 'playing' || gameState === 'waveclear';
      return { games, causes, losses, thrust, play, hypers: HYPERS, points: banked + (open ? scores[0] : 0) };
    `);
    tot.losses += r.losses; tot.points += r.points; tot.ticks += budget; tot.hypers += r.hypers;
    tot.thrust += r.thrust; tot.play += r.play; tot.games.push(...r.games);
    for (const [c, n] of Object.entries(r.causes)) tot.causes[c] = (tot.causes[c] || 0) + n;
  }
  const hours = tot.ticks / 60 / 3600, minutes = tot.ticks / 3600;
  const sc = tot.games.map(g => g.score);
  console.log(`${name.padEnd(12)} ${seeds} seeds x ${(budget / 216000).toFixed(1)} h   ship losses/hour=${(tot.losses / hours).toFixed(1).padStart(5)}   points/min=${String(Math.round(tot.points / minutes)).padStart(6)}` +
    `   thrust=${(100 * tot.thrust / tot.play).toFixed(1)}%   hyperspace/hour=${(tot.hypers / hours).toFixed(1)}` +
    `   games ended=${tot.games.length}${sc.length ? ` (median score ${pct(sc, 0.5)})` : ''}   [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  console.log(`${' '.repeat(12)} losses by cause: ${Object.entries(tot.causes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ') || 'none'}`);
}
