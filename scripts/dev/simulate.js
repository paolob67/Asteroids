// Headless soak test: runs the game logic with random inputs and checks invariants.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'asteroids.html', 'utf8');
const js = src.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^loop\(\);\s*$/m, '');            // do not start rAF loop
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
;globalThis.api = { update, draw, initGame, keys, get state(){return {gameState, ship, asteroids, scores, lives, highScore, saucer, torpedoes, saucerTorps: saucTorps, frameCount: frame, srocks};} };`, sandbox);
const { api } = sandbox;
let seed = 12345; const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let maxScore = 0, waves = 0, deaths = 0, saucers = 0, prevLives = 3, prevSrocks = 0;
for (let game = 0; game < 40; game++) {
  api.initGame(game % 2 ? 2 : 1);
  for (let f = 0; f < 20000; f++) {
    if (f % 20 === 0) {
      api.keys['ArrowLeft'] = r() < 0.3; api.keys['ArrowRight'] = r() < 0.3;
      api.keys['ArrowUp'] = r() < 0.5; api.keys[' '] = r() < 0.6; api.keys['Shift'] = r() < 0.02;
    }
    api.update(); api.draw();
    const s = api.state;
    for (const a of s.asteroids) if (!isFinite(a.x + a.y + a.vx + a.vy)) throw new Error('NaN asteroid');
    if (!isFinite(s.ship.x + s.ship.y + s.ship.vx + s.ship.vy)) throw new Error('NaN ship');
    if (s.srocks !== prevSrocks) { waves++; prevSrocks = s.srocks; }
    if (s.saucer && !s.saucer.exploding) saucers++;
    maxScore = Math.max(maxScore, s.scores[0], s.scores[1]);
    if (s.gameState === 'gameover') break;
  }
}
console.log('OK: no exceptions. maxScore=%d waveChanges=%d saucerFrames=%d', maxScore, waves, saucers);
