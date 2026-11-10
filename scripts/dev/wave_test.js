// Targeted test: clearing all rocks must start a new, larger wave; a deployed ship fades in.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'asteroids.html', 'utf8');
const js = src.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');
const noop = () => {};
const ctx = new Proxy({}, { get: () => noop, set: () => true });
const sandbox = {
  console, Math, Array, String, Number, Object,
  document: { getElementById: () => ({ getContext: () => ctx, style: {} }), addEventListener: noop },
  window: { addEventListener: noop, innerWidth: 1100, innerHeight: 860 },
  requestAnimationFrame: noop,
};
vm.createContext(sandbox);
vm.runInContext(js + `
;globalThis.api = { update, initGame, get s(){return {gameState, ship, asteroids, srocks, SHIP_FADE_FRAMES};},
  clearRocks(){ asteroids.forEach(a => { a.alive = false; }); } };`, sandbox);
const { api } = sandbox;
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

api.initGame(1);
const before = api.s.asteroids.length;
for (let i = 0; i < 5; i++) api.update();
api.clearRocks();
let sawClear = false, newWave = false;
for (let i = 0; i < 400 && !newWave; i++) {
  api.update();
  if (api.s.gameState === 'waveclear') sawClear = true;
  newWave = api.s.asteroids.some(a => a.alive);
}
assert(sawClear, 'wave-clear state was never entered');
assert(newWave, 'no new wave after all rocks destroyed');
assert(api.s.asteroids.length === before + 2, `expected ${before + 2} rocks, got ${api.s.asteroids.length}`);
assert(api.s.gameState === 'playing', 'state should return to playing');

// Fade-in: force a respawn
const ship = api.s.ship;
ship.alive = false; ship.visible = false; ship.sdelay = 1; ship.fade = 0;
api.s.asteroids.forEach(a => { a.x = 0; a.y = 0; });   // keep rocks away from centre
for (let i = 0; i < 5 && !ship.alive; i++) api.update();
assert(ship.alive && ship.fade > 0, 'ship should appear with fade > 0');
for (let i = 0; i < api.s.SHIP_FADE_FRAMES + 2; i++) api.update();
assert(ship.fade === 0, 'fade should finish');
console.log('OK: wave advance and ship fade-in work');
