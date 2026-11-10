// What kills the autopilot? Runs a pilot for a tick budget and classifies every ship loss.
// Usage: node scripts/dev/death_causes.js [file] [ticks] [pilotFunctionName]
//   e.g. node scripts/dev/death_causes.js versions/v2/asteroids.html 1000000 simplePilot
const path = require('path');
const { loadGame } = require('./lib/load_game');
const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');
const budget = Number(process.argv[3] || 1000000);
const pilot = process.argv[4] || 'simplePilot';

const run = loadGame(file, [
  // Instrumentation: tag each explodeShip() call site with its cause.
  ['explodeShip(); splitAsteroid(a); return;', 'DEATH = "rock-" + ["small","medium","large"][a.size]; explodeShip(); splitAsteroid(a); return;'],
  ['explodeShip(); explodeSaucer(); return;', 'DEATH = "saucer-body"; explodeShip(); explodeSaucer(); return;'],
  ['t.alive = false; explodeShip(); return;', 't.alive = false; DEATH = "saucer-torpedo"; explodeShip(); return;'],
  ['explodeShip();         // doomed by hyperspace', 'DEATH = "hyperspace-reentry"; explodeShip();'],
  ['"use strict";', '"use strict"; var DEATH = null;'],
]);

const deaths = run(`
AUTOPILOT = ${pilot};
const out = [];

initGame(1);
for (let i = 0; i < ${budget}; i++) {
  applyAutopilot();
  const sp = ship ? Math.hypot(ship.vx, ship.vy) : 0;
  const saucerOn = !!(saucer && saucer.alive);
  const nRocks = asteroids.filter(a => a.alive && !a.exploding).length;
  const l0 = lives[0];
  DEATH = null;
  update();
  if (lives[0] < l0 && gameState !== 'attract') out.push({ cause: DEATH || 'unknown', speed: sp, saucerOn, nRocks, score: scores[0] });
}
return out;
`);

const by = {};
for (const d of deaths) {
  const b = by[d.cause] || (by[d.cause] = { n: 0, speed: 0, saucer: 0, rocks: 0 });
  b.n++; b.speed += d.speed; b.saucer += d.saucerOn ? 1 : 0; b.rocks += d.nRocks;
}
console.log(`${file}  pilot=${pilot}  ticks=${budget}  ship losses=${deaths.length}`);
for (const [c, b] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${c.padEnd(22)} ${String(b.n).padStart(5)}  ${(100 * b.n / deaths.length).toFixed(1).padStart(5)}%   mean ship speed ${(b.speed / b.n).toFixed(1)}   saucer on screen ${(100 * b.saucer / b.n).toFixed(0)}%   mean rocks ${(b.rocks / b.n).toFixed(1)}`);
}
