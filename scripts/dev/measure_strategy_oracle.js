// Part 4 viability check: if the strategy were always right, how well does "strategy + executor" fly?
// Every `lag` ticks smartPilot names its strategy (escape, brake, hyperspace, aim) from the current frame.
// That choice takes effect `lag` ticks later (the model's answer time) and is held until the next one.
// Every tick the executor (spExecute) carries the held strategy out on the CURRENT frame: it turns, thrusts,
// aims and pulses fire and hyperspace itself. No model is involved, so this is the ceiling for a strategy model.
// Compare with measure_delayed_teacher.js, where the same delay is applied to the raw keys instead.
// Usage: node scripts/dev/measure_strategy_oracle.js [ticksPerSeed] [firstSeed] [lastSeed] [lag,lag,...] [fixedStrategy]
// With a fixedStrategy (for example aim) the executor flies that one strategy all the time: the control that shows
// how much of a model's result comes from the executor alone.
const path = require('path');
const { loadGame } = require('./lib/load_game');

const pos = process.argv.slice(2);
const budget = Number(pos[0] || 8000), firstSeed = Number(pos[1] || 0), lastSeed = Number(pos[2] || 3);
const lags = (pos[3] || '0,1,6,12,22').split(',').map(Number);
const fixed = pos[4] || '';

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
  let held = 'aim';
  const queue = [];
  const count = {};
  let play = 0, turn = 0, fire = 0, thrust = 0, banked = 0, prev = '';
  for (let i = 0; i < ${budget}; i++) {
    AUTOPILOT = null;
    const s = snapshot();
    const ok = s.ship && s.ship.alive && s.ship.visible && !s.ship.exploding;
    if (lag === 0) { if (ok) held = smartPilot(s).strategy; }
    else {
      if (i % lag === 0 && ok) queue.push({ due: i + lag, strategy: smartPilot(s).strategy });
      while (queue.length && queue[0].due <= i) held = queue.shift().strategy;
    }
    if (${JSON.stringify(fixed)}) held = ${JSON.stringify(fixed)};
    if (gameState === 'playing' || gameState === 'waveclear') {
      const a = spExecute(s, held);
      keys['ArrowLeft'] = !!a.left; keys['ArrowRight'] = !!a.right; keys['ArrowUp'] = !!a.thrust;
      keys[' '] = !!a.fire; keys['Shift'] = !!a.hyper;
      if (gameState === 'playing') count[held] = (count[held] || 0) + 1;
    } else if (gameState === 'attract' || (gameState === 'gameover' && entryQueue.length === 0)) {
      initGame(1); keys['ArrowLeft'] = keys['ArrowRight'] = keys['ArrowUp'] = keys[' '] = keys['Shift'] = false;
    } else if (gameState === 'hiscore') {
      keys['ArrowLeft'] = keys['ArrowRight'] = keys['ArrowUp'] = keys[' '] = false; keys['Shift'] = frame % 2 === 0;
    }
    if (gameState === 'playing') { play++; if (keys['ArrowLeft'] || keys['ArrowRight']) turn++; if (keys[' ']) fire++; if (keys['ArrowUp']) thrust++; }
    DEATH = null;
    update();
    if (gameState === 'gameover' && prev !== 'gameover') banked += scores[0];
    prev = gameState;
  }
  const open = gameState === 'playing' || gameState === 'waveclear';
  const causes = {}; for (const c of LOSS_LOG) causes[c] = (causes[c] || 0) + 1;
  return { play, turn, fire, thrust, losses: LOSS_LOG.length, points: banked + (open ? scores[0] : 0), causes, count };
`;

console.log(`strategy oracle + executor, seeds ${firstSeed}..${lastSeed} x ${budget} ticks (lag 0 = strategy chosen and applied on the same frame)`);
console.log('lag  ticks_s  flying_min  losses  losses/hour  points/min  turning%  fire%  thrust%  causes');
for (const lag of lags) {
  const t = { play: 0, turn: 0, fire: 0, thrust: 0, losses: 0, points: 0, causes: {}, count: {} };
  for (let seed = firstSeed; seed <= lastSeed; seed++) {
    const r = run(body(seed, lag));
    for (const k of ['play', 'turn', 'fire', 'thrust', 'losses', 'points']) t[k] += r[k];
    for (const [c, n] of Object.entries(r.causes)) t.causes[c] = (t.causes[c] || 0) + n;
    for (const [c, n] of Object.entries(r.count)) t.count[c] = (t.count[c] || 0) + n;
  }
  const min = t.play / 3600;
  const mix = Object.entries(t.count).map(([c, n]) => `${c} ${(100 * n / t.play).toFixed(1)}%`).join(', ');
  console.log(`${String(lag).padStart(3)}  ${(lag / 60).toFixed(2).padStart(7)}  ${min.toFixed(1).padStart(10)}  ${String(t.losses).padStart(6)}  ${(t.losses / (min / 60)).toFixed(0).padStart(11)}  ${String(Math.round(t.points / min)).padStart(10)}  ${(100 * t.turn / t.play).toFixed(1).padStart(8)}  ${(100 * t.fire / t.play).toFixed(1).padStart(5)}  ${(100 * t.thrust / t.play).toFixed(1).padStart(7)}  ${JSON.stringify(t.causes)}  [${mix}]`);
}
process.exit(0);
