// Part 4 diagnostic: how well does smartPilot itself fly when its decisions are stale and held?
// A model that answers in D ticks acts on a frame D ticks old and keeps pressing the same keys until the
// next answer arrives. This script gives smartPilot exactly that, with no model involved: every D ticks it
// decides from the current frame, and the keys take effect D ticks later and are held for D ticks.
// Fire and hyperspace are pulsed on even frames, as the executor does.
// If the teacher also stops hitting things at D = 22 (the 0.36 s the model needs), the delay is the cause.
// Usage: node scripts/dev/measure_delayed_teacher.js [ticksPerSeed] [firstSeed] [lastSeed] [lag,lag,...]
const path = require('path');
const { loadGame } = require('./lib/load_game');

const pos = process.argv.slice(2);
const budget = Number(pos[0] || 8000), firstSeed = Number(pos[1] || 0), lastSeed = Number(pos[2] || 3);
const lags = (pos[3] || '0,1,6,12,22').split(',').map(Number);

const run = loadGame(path.join(__dirname, '../../asteroids.html'), [
  ['"use strict";', '"use strict"; var DEATH = null, LOSS_LOG = [];'],
  ['lives[curPlayer]--;', 'lives[curPlayer]--; LOSS_LOG.push(DEATH || "other");'],
  ['explodeShip(); splitAsteroid(a); return;', 'DEATH = "rock"; explodeShip(); splitAsteroid(a); return;'],
  ['explodeShip(); explodeSaucer(); return;', 'DEATH = "saucer-body"; explodeShip(); explodeSaucer(); return;'],
  ['t.alive = false; explodeShip(); return;', 't.alive = false; DEATH = "saucer-torpedo"; explodeShip(); return;'],
  ['explodeShip();         // doomed by hyperspace', 'DEATH = "hyperspace"; explodeShip();'],
]);

const body = (seed, lag) => `
  LOSS_LOG.length = 0; DEATH = null;
  initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
  const lag = ${lag};
  // decisions made now take effect lag ticks later; queue holds [due tick, keys]
  let held = { left: false, right: false, thrust: false, fire: false, hyper: false };
  const queue = [];
  let play = 0, turn = 0, fire = 0, thrust = 0, banked = 0, prev = '';
  for (let i = 0; i < ${budget}; i++) {
    if (lag === 0) { AUTOPILOT = smartPilot; applyAutopilot(); }
    else {
      AUTOPILOT = null;
      const s = snapshot();
      if (i % lag === 0 && s.ship && s.ship.alive && s.ship.visible && !s.ship.exploding) {
        const d = smartPilot(s), why = d.why || '';
        queue.push({ due: i + lag, k: { left: !!d.left, right: !!d.right, thrust: !!d.thrust,
          fire: /aligned: fire/.test(why), hyper: /Hyperspace [(]about/.test(why) } });
      }
      while (queue.length && queue[0].due <= i) held = queue.shift().k;
      const even = s.frame % 2 === 0;
      keys['ArrowLeft'] = held.left; keys['ArrowRight'] = held.right; keys['ArrowUp'] = held.thrust;
      keys[' '] = held.fire && even; keys['Shift'] = held.hyper && even;
    }
    if (gameState === 'playing') { play++; if (keys['ArrowLeft'] || keys['ArrowRight']) turn++; if (keys[' ']) fire++; if (keys['ArrowUp']) thrust++; }
    DEATH = null;
    update();
    if (gameState === 'gameover' && prev !== 'gameover') banked += scores[0];
    prev = gameState;
  }
  const open = gameState === 'playing' || gameState === 'waveclear';
  const causes = {}; for (const c of LOSS_LOG) causes[c] = (causes[c] || 0) + 1;
  return { play, turn, fire, thrust, losses: LOSS_LOG.length, points: banked + (open ? scores[0] : 0), causes };
`;

console.log(`smartPilot with decisions delayed and held, seeds ${firstSeed}..${lastSeed} x ${budget} ticks (lag 0 = the normal pilot)`);
console.log('lag  ticks_s  flying_min  losses  losses/hour  points/min  turning%  fire%  thrust%  causes');
for (const lag of lags) {
  const t = { play: 0, turn: 0, fire: 0, thrust: 0, losses: 0, points: 0, causes: {} };
  for (let seed = firstSeed; seed <= lastSeed; seed++) {
    const r = run(body(seed, lag));
    for (const k of ['play', 'turn', 'fire', 'thrust', 'losses', 'points']) t[k] += r[k];
    for (const [c, n] of Object.entries(r.causes)) t.causes[c] = (t.causes[c] || 0) + n;
  }
  const min = t.play / 3600;
  console.log(`${String(lag).padStart(3)}  ${(lag / 60).toFixed(2).padStart(7)}  ${min.toFixed(1).padStart(10)}  ${String(t.losses).padStart(6)}  ${(t.losses / (min / 60)).toFixed(0).padStart(11)}  ${String(Math.round(t.points / min)).padStart(10)}  ${(100 * t.turn / t.play).toFixed(1).padStart(8)}  ${(100 * t.fire / t.play).toFixed(1).padStart(5)}  ${(100 * t.thrust / t.play).toFixed(1).padStart(7)}  ${JSON.stringify(t.causes)}`);
}
process.exit(0);
