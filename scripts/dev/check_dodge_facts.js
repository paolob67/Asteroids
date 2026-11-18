#!/usr/bin/env node
// Checks the look-ahead sentence of layaFrameState against smartPilot's own play (Part 4).
// For every even frame of a few games it compares what the text says with what the teacher decided:
//   - "nothing is predicted to hit" must go with a smartPilot reason that starts "Safe";
//   - "hits the ship in N ticks" must go with a Dodge / no-safe-dodge reason, and N must be the same;
//   - "Thrusting K times toward <bearing>" must name the same thrust count K and the same heading
//     (as a bearing from the nose, > 0 to the right) as smartPilot's "turn to H, thrust Kx".
// Usage: node scripts/dev/check_dodge_facts.js [file.html] [firstSeed] [lastSeed] [ticks]
const fs = require('fs');
const path = require('path');
const { loadGame } = require('./lib/load_game');

const argv = process.argv.slice(2);
const file = argv[0] && argv[0].endsWith('.html') ? argv.shift() : path.join(__dirname, '../../asteroids.html');
const first = Number(argv[0] || 100), last = Number(argv[1] || 100), budget = Number(argv[2] || 8000);
if (!fs.readFileSync(file, 'utf8').includes('function layaFrameState')) { console.log('SKIP: ' + path.basename(path.dirname(file)) + ' has no layaFrameState (added after version 3)'); process.exit(0); }
const run = loadGame(file);

const bearing = t => /dead ahead/.test(t) ? 0 : (/(\d+) deg (left|right)/.test(t) ? (RegExp.$2 === 'right' ? 1 : -1) * Number(RegExp.$1) : null);
const tally = { brakeOk: 0, brakeBad: 0, noBrakeOk: 0, noBrakeBad: 0, frames: 0, safeOk: 0, safeBad: 0, hitOk: 0, hitBad: 0, headingOk: 0, headingBad: 0, noSafeOk: 0, noSafeBad: 0 };
const bad = [];

for (let seed = first; seed <= last; seed++) {
  const recs = run(`
AUTOPILOT = smartPilot;
const recs = [];
initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
for (let i = 0; i < ${budget}; i++) {
  const snap = snapshot();
  if (gameState === 'playing' && snap.ship && snap.ship.alive && snap.ship.visible && !snap.ship.exploding && snap.frame % 2 === 0) {
    const text = layaFrameState(snap);
    applyAutopilot();
    recs.push({ tick: i, angle: snap.ship.angle, text, why: lastWhy || '', left: !!keys['ArrowLeft'], right: !!keys['ArrowRight'], thrust: !!keys['ArrowUp'] });
  } else applyAutopilot();
  update();
}
return recs;
`);
  for (const r of recs) {
    tally.frames++;
    const quiet = /nothing is predicted to hit/.test(r.text);
    const hit = r.text.match(/hits the ship in (\d+) ticks/);
    const thrust = r.text.match(/Thrusting (\d+) times toward ([^.]*?) keeps every object clear/);
    const noSafe = /No heading and thrust length tried/.test(r.text);
    if (quiet) {
      (/^Safe/.test(r.why) ? (tally.safeOk++) : (tally.safeBad++, bad.push(['quiet text, but teacher says', r])));
      // Brake: the text offers a braking thrust when the ship drifts; smartPilot brakes only when that is safe.
      const br = r.text.match(/Thrusting (\d+) times toward ([^.]*?) slows the ship and (keeps|does not keep) every object clear/);
      const teacherBrakes = /drifting at .*: brake/.test(r.why);
      if (br && br[3] === 'keeps') {
        const b = bearing(br[2]);
        // left key = turn counter-clockwise = heading to the left of the nose; the teacher turns when 2 or more units off
        const ok = teacherBrakes && (b <= -2.8 ? r.left && !r.right : b >= 2.8 ? r.right && !r.left : !r.left && !r.right);
        if (ok) tally.brakeOk++; else { tally.brakeBad++; bad.push(['brake: text says safe to brake toward ' + b + ', teacher brakes=' + teacherBrakes, r]); }
      } else if (teacherBrakes) { tally.brakeBad++; bad.push(['teacher brakes, text does not offer a safe brake', r]); }
      else if (br) tally.noBrakeOk++;
      continue;
    }
    const dodge = r.why.match(/hits? in (\d+) ticks/);
    const plan = r.why.match(/Dodge: turn to (\d+), thrust (\d+)x/);
    if (!hit) { tally.hitBad++; bad.push(['no hit sentence', r]); continue; }
    // The hyperspace message of smartPilot prints the best delayed hit time, not the no-key one.
    const delayed = r.text.match(/delays the hit to (\d+) ticks/);
    const wantTicks = /no dodge works\. Hyperspace/.test(r.why) && delayed ? Number(delayed[1]) : Number(hit[1]);
    if (dodge && Number(dodge[1]) === wantTicks) tally.hitOk++; else { tally.hitBad++; bad.push(['hit ticks differ', r]); }
    if (plan) {
      const d = ((Number(plan[1]) - r.angle + 128) & 0xFF) - 128;       // > 0 means turn left (counter-clockwise)
      const want = -Math.round(d * 360 / 256);
      if (thrust && Number(thrust[1]) === Number(plan[2]) && bearing(thrust[2]) === want) tally.headingOk++;
      else { tally.headingBad++; bad.push(['heading differs: want ' + want + ' x' + plan[2], r]); }
    } else if (/no safe dodge/.test(r.why)) {
      if (noSafe) tally.noSafeOk++; else { tally.noSafeBad++; bad.push(['teacher has no safe dodge, text offers one', r]); }
    }
  }
}
console.log(JSON.stringify(tally));
for (const [why, r] of bad.slice(0, 5)) console.log(`MISMATCH ${why}\n  tick ${r.tick} angle ${r.angle}\n  teacher: ${r.why}\n  text:    ${r.text.slice(-260)}`);
const fails = tally.brakeBad + tally.safeBad + tally.hitBad + tally.headingBad + tally.noSafeBad;
console.log(fails === 0 ? `OK: the look-ahead sentence agrees with smartPilot on ${tally.frames} frames` : `${fails} disagreements on ${tally.frames} frames`);
process.exit(fails === 0 ? 0 : 1);
