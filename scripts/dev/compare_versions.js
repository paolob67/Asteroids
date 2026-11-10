// Measures the gameplay constants that differ between two builds of the game, so the
// documentation can quote numbers instead of reading them off a diff.
// Usage: node scripts/dev/compare_versions.js [fileA] [fileB]   (default: versions/v1 vs versions/v2)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
const files = [process.argv[2] || path.join(root, 'versions/v1/asteroids.html'),
               process.argv[3] || path.join(root, 'versions/v2/asteroids.html')];

const noop = () => {};
const ctxStub = new Proxy({}, { get: () => noop, set: () => true });
const el = new Proxy({}, { get: (t, k) => k === 'getContext' ? () => ctxStub : k === 'classList' ? { toggle: noop } : k === 'style' ? {} : noop, set: () => true });
global.document = { getElementById: () => el, addEventListener: noop, createElement: () => el, body: el };
global.window = { addEventListener: noop, innerWidth: 1400, innerHeight: 800 };
global.requestAnimationFrame = noop;
global.AudioContext = undefined;

function load(file, scenario) {
  const html = fs.readFileSync(file, 'utf8');
  const src = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');
  return new Function(src + '\n' + scenario)();
}

// A: ticks between the end of the ship explosion and the ship coming back (centre clear)
const respawn = `
initGame(1); asteroids.forEach(a => a.alive = false);
for (let i = 0; i < 5; i++) update();
explodeShip();
let t = 0;
while (ship.exploding && t < 1000) { update(); t++; }
let wait = 0;
while (!(ship.alive && ship.visible) && wait < 1000) { update(); wait++; }
return wait;`;

// B: ticks between the last rock dying and the next wave appearing
const waveGap = `
initGame(1); for (let i = 0; i < 5; i++) update();
const n0 = asteroids.filter(a => a.alive).length;
asteroids.forEach(a => a.alive = false);
let t = 0;
while (!asteroids.some(a => a.alive) && t < 1000) { update(); t++; }
return { gap: t, before: n0, after: asteroids.filter(a => a.alive).length };`;

// C: saucer behaviour with an idle, invulnerable ship and a fixed score
const saucerRun = score => `
initGame(1); checkCollisions = () => {};
let prevSauc = null, small = 0, large = 0, shots = 0, vys = new Set(), torpWas = [];   // torpedoes are counted by object identity: a new object is created on every shot
for (let i = 0; i < 300000; i++) {
  scores[0] = ${score};
  update();
  if (saucer && saucer.alive && saucer !== prevSauc) { if (saucer.small) small++; else large++; }
  prevSauc = saucer && saucer.alive ? saucer : null;
  if (saucer && saucer.alive) vys.add(saucer.vy);
  for (let k = 0; k < saucTorps.length; k++) {
    if (saucTorps[k].alive && saucTorps[k] !== torpWas[k]) shots++;
    torpWas[k] = saucTorps[k];
  }
}
return { small, large, shotsPerSaucer: +(shots / Math.max(1, small + large)).toFixed(1), vys: [...vys].sort((x, y) => x - y) };`;

for (const f of files) {
  const label = path.relative(root, f);
  console.log('== ' + label);
  console.log('ship respawn wait after explosion (ticks):', load(f, respawn));
  console.log('wave gap after last rock:', JSON.stringify(load(f, waveGap)));
  for (const sc of [0, 5000, 35000]) console.log(`saucers at score ${sc}:`, JSON.stringify(load(f, saucerRun(sc))));
}
