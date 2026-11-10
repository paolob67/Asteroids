// Parameter sweep for smartPilot: patches the SP_* constants in the source and measures losses/hour.
// Usage: node scripts/dev/tune_smart.js [ticksPerSeed] [seeds]
const path = require('path');
const { loadGame } = require('./lib/load_game');
const file = path.join(__dirname, '../../asteroids.html');
const budget = Number(process.argv[2] || 600000), seeds = Number(process.argv[3] || 3);
const variants = [
  ['baseline (24)', []],
  ['hyper ttc 12', [['const SP_HYPER_TTC  = 24;', 'const SP_HYPER_TTC  = 12;']]],
  ['hyper ttc 8', [['const SP_HYPER_TTC  = 24;', 'const SP_HYPER_TTC  = 8;']]],
  ['hyper ttc 5', [['const SP_HYPER_TTC  = 24;', 'const SP_HYPER_TTC  = 5;']]],
  ['ttc 8 margin 6', [['const SP_HYPER_TTC  = 24;', 'const SP_HYPER_TTC  = 8;'], ['const SP_MARGIN     = 12;', 'const SP_MARGIN     = 6;']]],
  ['ttc 8 margin 20', [['const SP_HYPER_TTC  = 24;', 'const SP_HYPER_TTC  = 8;'], ['const SP_MARGIN     = 12;', 'const SP_MARGIN     = 20;']]],
];
for (const [name, patches] of variants) {
  const run = loadGame(file, patches.concat([
    ['"use strict";', '"use strict"; var HYPERS = 0;'],
    ['function doHyperspace() {', 'function doHyperspace() { if (ship.alive && !ship.exploding && ship.visible) HYPERS++;'],
  ]));
  let losses = 0, points = 0, hypers = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const r = run(`
      AUTOPILOT = smartPilot; HYPERS = 0; initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
      let losses = 0, prevLives = 3, banked = 0, prev = '';
      for (let i = 0; i < ${budget}; i++) {
        applyAutopilot(); update();
        if (lives[0] < prevLives && gameState !== 'attract') losses++;
        prevLives = lives[0];
        if (gameState === 'gameover' && prev !== 'gameover') { banked += scores[0]; prevLives = 3; }
        prev = gameState;
      }
      return { losses, hypers: HYPERS, points: banked + ((gameState === 'playing' || gameState === 'waveclear') ? scores[0] : 0) };`);
    losses += r.losses; points += r.points; hypers += r.hypers;
  }
  const h = seeds * budget / 216000;
  console.log(`${name.padEnd(14)} losses/hour=${(losses / h).toFixed(1).padStart(5)}  points/min=${String(Math.round(points / (seeds * budget / 3600))).padStart(6)}  hyperspace/hour=${(hypers / h).toFixed(0)}`);
}
