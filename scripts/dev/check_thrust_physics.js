// Proves that a pilot can only move the ship through the five keys. For every tick it
//   1. copies the ship state,
//   2. replays one tick of the game's own movement rules on the copy, using ONLY the keys the
//      pilot is holding (rotate, thrust along the nose, friction), and
//   3. compares the copy with the real ship after update().
// Any velocity or position change that the keys do not explain is reported. It also reports
// how long the THRUST key is held per burst, since very short bursts are easy to miss on screen.
// Usage: node scripts/dev/check_thrust_physics.js [file] [ticks] [pilot]
const path = require('path');
const { loadGame } = require('./lib/load_game');
const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');
const ticks = Number(process.argv[3] || 300000);
const pilot = process.argv[4] || 'smartPilot';
const run = loadGame(file);
const r = run(`
AUTOPILOT = ${pilot}; initGame(1);
const bad = []; let checked = 0, thrustTicks = 0, moving = 0, movingNoKey = 0, hyper = 0;
let cur = 0; const bursts = [];
for (let i = 0; i < ${ticks}; i++) {
  applyAutopilot();
  const t = !!keys['ArrowUp'];
  if (t) cur++; else if (cur) { bursts.push(cur); cur = 0; }
  const active = ship && ship.alive && ship.visible && !ship.exploding && ship.sdelay === 0 && gameState === 'playing';
  let h = null;
  if (active) {
    h = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy, vxf: ship.vxf, vyf: ship.vyf, angle: ship.angle };
    const rot = keys['ArrowLeft'] ? 1 : keys['ArrowRight'] ? -1 : 0;
    spShipStep(h, rot, t, frame + 1);          // update() increments frame before moving the ship
    if (t) thrustTicks++;
    if (Math.hypot(ship.vx, ship.vy) >= 1) { moving++; if (!t) movingNoKey++; }
  }
  const hyperNow = !!keys['Shift'];
  update();
  if (h) {
    if (!(ship.alive && ship.visible)) { hyper++; continue; }   // hyperspace took the ship away
    checked++;
    if (h.x !== ship.x || h.y !== ship.y || h.vx !== ship.vx || h.vy !== ship.vy || h.vxf !== ship.vxf || h.vyf !== ship.vyf || h.angle !== ship.angle) {
      if (bad.length < 5) bad.push({ i, keys: { ...keys }, model: h, real: { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy, vxf: ship.vxf, vyf: ship.vyf, angle: ship.angle } });
    }
  }
}
bursts.sort((a, b) => a - b);
const q = p => bursts[Math.min(bursts.length - 1, Math.floor(p * bursts.length))];
return { ticksChecked: checked, mismatches: bad.length, thrustTicks, thrustBursts: bursts.length,
  burstLength: { p10: q(.1), median: q(.5), p90: q(.9), max: bursts[bursts.length - 1] },
  pctBurstsUnder6Ticks: +(100 * bursts.filter(b => b < 6).length / bursts.length).toFixed(0),
  ticksMovingFasterThan1: moving, ofThoseCoastingWithoutThrust: movingNoKey, hyperspaceJumps: hyper, bad };`);
console.log(JSON.stringify(r, null, 1));
if (r.mismatches) process.exit(1);
