// Checks that the sentence layaFrameState writes describes the geometry correctly, with
// hand-computed cases (no game play, runs in under a second).
// Usage: node scripts/dev/test_laya_geometry.js [file]
//
// Conventions under test (see the snapshot comment in asteroids.html):
//   ship.angle 0..255, 0 = +x, counter-clockwise (y up); 64 = nose points up the screen.
//   x, y screen coordinates, y grows downward. ship.vy is y-up; every other vy is y-down.
//   "right of the nose" means clockwise from the nose when looking at the screen.
//
// The version 3 file does not have layaFrameState, and its layaFormatState mirrored every bearing
// (see docs/articles/FIXES.md, F1). Version 4 removed layaFormatState, so the bearing, closing-speed and
// wrap cases that guarded the F1 fix now run against layaFrameState, which the student reads.
// Run against versions/v3/asteroids.html this script fails at load: that file has no layaFrameState.
const path = require('path');
const { loadGame } = require('./lib/load_game');
const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');

const frame = loadGame(file)(`
return (angle, shipVx, shipVy, objs, saucTorps) => layaFrameState({
  frame: 0,
  ship: { x: 4000, y: 3000, vx: shipVx, vy: shipVy, angle, alive: true, visible: true, exploding: false },
  asteroids: objs.map(o => ({ x: 4000 + o[0], y: 3000 + o[1], vx: o[2] || 0, vy: o[3] || 0, size: 2, exploding: false })),
  saucer: null, torpedoes: [], saucTorps: saucTorps || [],
});
`);

let failed = 0, total = 0;
function check(name, got, want) {
  total++;
  if (want.test(got)) return;
  failed++;
  console.log(`FAIL ${name}\n     want ${want}\n     got  ${got}`);
}

// bearing, ship at rest, rock 400 units away, never closing (the F1 cases)
check('nose up, rock above   -> dead ahead',       frame(64, 0, 0, [[0, -400]]),  /dead ahead/);
check('nose up, rock below   -> 180 deg',          frame(64, 0, 0, [[0, 400]]),   /180 deg (left|right) of the nose/);
check('nose up, rock at screen right -> 90 right', frame(64, 0, 0, [[400, 0]]),   /90 deg right of the nose/);
check('nose up, rock at screen left  -> 90 left',  frame(64, 0, 0, [[-400, 0]]),  /90 deg left of the nose/);
check('nose right (0), rock at right -> ahead',    frame(0, 0, 0, [[400, 0]]),    /dead ahead/);
check('nose right (0), rock above    -> 90 left',  frame(0, 0, 0, [[0, -400]]),   /90 deg left of the nose/);
check('nose right (0), rock below    -> 90 right', frame(0, 0, 0, [[0, 400]]),    /90 deg right of the nose/);
check('nose left (128), rock above   -> 90 right', frame(128, 0, 0, [[0, -400]]), /90 deg right of the nose/);
check('nose down (192), rock below   -> ahead',    frame(192, 0, 0, [[0, 400]]),  /dead ahead/);
// a rock 45 degrees up-right of a nose-up ship is 45 degrees right
check('nose up, rock up-right        -> 45 right', frame(64, 0, 0, [[300, -300]]), /45 deg right of the nose/);

// closing speed: ship y-up velocity is the opposite sign of an object's y-down velocity
check('ship flies up at 10 toward rock above',  frame(64, 0, 10, [[0, -400]]), /closing at 10\.0 units\/tick/);
check('ship flies down at 10 away from rock above', frame(192, 0, -10, [[0, -400]]), /moving away at 10\.0 units\/tick/);
check('rock above falls down at 10, ship still', frame(64, 0, 0, [[0, -400, 0, 10]]), /closing at 10\.0 units\/tick/);
check('rock above moves up at 10, ship still',   frame(64, 0, 0, [[0, -400, 0, -10]]), /moving away at 10\.0 units\/tick/);
check('ship flies right at 10 toward rock right', frame(0, 10, 0, [[400, 0]]), /closing at 10\.0 units\/tick/);

// wrapping: ship near the right edge, rock just across the edge (shortest path is to the right)
{
  const wrapped = loadGame(file)(`
return layaFrameState({ frame: 0, ship: { x: 8000, y: 3000, vx: 0, vy: 0, angle: 0, alive: true, visible: true, exploding: false },
  asteroids: [{ x: 100, y: 3000, vx: 0, vy: 0, size: 2, exploding: false }], saucer: null, torpedoes: [], saucTorps: [] });`);
  check('wrap: rock across the right edge, nose right -> ahead', wrapped, /dead ahead/);
}

// layaFrameState: bearing, closing, closest approach, ship motion
check('frame: rock above, nose up -> dead ahead', frame(64, 0, 0, [[0, -400]]), /400 units away, dead ahead, not closing/);
check('frame: rock at screen right, nose up -> 90 right', frame(64, 0, 0, [[400, 0]]), /90 deg right of the nose/);
check('frame: rock at screen left, nose up -> 90 left', frame(64, 0, 0, [[-400, 0]]), /90 deg left of the nose/);
check('frame: rock below, nose up -> 180', frame(64, 0, 0, [[0, 400]]), /180 deg (left|right) of the nose/);
check('frame: nose right, rock above -> 90 left', frame(0, 0, 0, [[0, -400]]), /90 deg left of the nose/);
check('frame: ship at rest', frame(64, 0, 0, [[0, -400]]), /^The ship is not moving\./);
check('frame: ship flies up at 10, nose up -> moves dead ahead', frame(64, 0, 10, [[0, -400]]), /moves at 10\.0 units\/tick, dead ahead/);
check('frame: ship flies up at 10, nose right -> 90 left', frame(0, 0, 10, [[0, -400]]), /moves at 10\.0 units\/tick, 90 deg left of the nose/);
check('frame: ship flies down at 10, nose up -> 180', frame(64, 0, -10, [[0, -400]]), /moves at 10\.0 units\/tick, 180 deg/);
check('frame: head-on, rock above, ship up at 10', frame(64, 0, 10, [[0, -400]]), /closing at 10\.0 units\/tick, closest approach 0 units in 40 ticks/);
check('frame: away, ship down at 10', frame(192, 0, -10, [[0, -400]]), /moving away at 10\.0 units\/tick/);
// rock 400 above and 100 to the screen right, falling straight down at 10, ship nose up:
// in 40 ticks it is level with the ship, 100 units to its right
check('frame: passes on the right', frame(64, 0, 0, [[100, -400, 0, 10]]), /closest approach 100 units, 90 deg right of the nose in 40 ticks/);
check('frame: passes on the left',  frame(64, 0, 0, [[-100, -400, 0, 10]]), /closest approach 100 units, 90 deg left of the nose in 40 ticks/);
// ship turned to face screen right: the same rock then crosses the ship's row 100 units ahead of the nose
check('frame: nose right, rock crosses ahead of the nose', frame(0, 0, 0, [[100, -400, 0, 10]]), /closest approach 100 units, dead ahead in 40 ticks/);
// nose down: the same rock ends up 100 units to the screen right, which is the ship's left
check('frame: nose down, rock passes on the left', frame(192, 0, 0, [[100, -400, 0, 10]]), /closest approach 100 units, 90 deg left of the nose in 40 ticks/);
{
  const many = frame(64, 0, 0, [[0, -100], [0, -200], [0, -300], [0, -400], [0, -500], [0, -600], [0, -700], [0, -800]]);
  check('frame: lists 4 objects, nearest first', many, /1\) large rock, 100 units.*4\) large rock, 400 units/);
  total++; if (/5\)/.test(many)) { failed++; console.log('FAIL frame: more than 4 objects listed'); }
  check('frame: saucer torpedo listed', frame(64, 0, 0, [], [{ x: 4000, y: 2800, vx: 0, vy: 8, life: 20 }]), /1\) saucer torpedo, 200 units away, dead ahead, closing at 8\.0 units\/tick/);
  check('frame: empty sky', frame(64, 0, 0, []), /Nearest objects: none\./);
  // torpedo interception (63 units/tick relative to the ship, 70 ticks of flight)
  // still rock 630 straight ahead: time 630 / 63 = 10 ticks, aimed dead ahead
  check('frame: shot at a still rock ahead', frame(64, 0, 0, [[0, -630]]), /a torpedo fired now meets it in 10 ticks if aimed dead ahead/);
  // rock 630 ahead moving right at 21: 630^2 + (21 t)^2 = (63 t)^2 gives t = 10.6, lead angle asin(21 / 63) = 19.5 degrees
  check('frame: lead on a rock moving right', frame(64, 0, 0, [[0, -630, 21, 0]]), /meets it in 11 ticks if aimed 19 deg right of the nose/);
  check('frame: lead on a rock moving left',  frame(64, 0, 0, [[0, -630, -21, 0]]), /meets it in 11 ticks if aimed 19 deg left of the nose/);
  // nose turned to screen right: the rock above is 90 left of the nose, and leading it to the right
  // (atan(630 / 222.7) = 70.5 degrees) means aiming 71 left of the nose
  check('frame: lead measured from the nose', frame(0, 0, 0, [[0, -630, 21, 0]]), /if aimed 71 deg left of the nose/);
  // 5000 units away (4000 across, 3000 down, no wrap): 79 ticks of flight, beyond the 70-tick range
  check('frame: out of torpedo range', frame(64, 0, 0, [[4000, 3000]]), /out of torpedo range/);
  check('frame: no shot clause for a saucer torpedo', frame(64, 0, 0, [], [{ x: 4000, y: 2800, vx: 0, vy: 8, life: 20 }]), /^((?!fired now|out of torpedo range).)*$/);
  // look-ahead: an empty sky is quiet; a large rock 1200 above falling at 10 reaches the hit zone
  // (vertical gap below 2 * (132 + 40 + 12) = 368) after ceil((1200 - 368) / 10) = 84 ticks
  check('frame: quiet sky look-ahead', frame(64, 0, 0, []), /With no key pressed nothing is predicted to hit the ship in the next 90 ticks\./);
  check('frame: rock on a collision course', frame(64, 0, 0, [[0, -1200, 0, 10]]), /a large rock hits the ship in 84 ticks; it is now 1200 units away, dead ahead\. Thrusting \d+ times toward .* keeps every object clear/);
  // brake: a ship drifting up at 10 needs 10 thrusts pointing down the screen: 180 degrees from a nose-up
  // ship, 90 right of a nose-right ship (down is clockwise from right), 90 left of a nose-left ship
  check('frame: drifting, nose along the motion -> brake astern', frame(64, 0, 10, []), /Thrusting 10 times toward 180 deg (left|right) of the nose slows the ship and keeps every object clear/);
  check('frame: drifting up, nose right -> brake toward 90 right', frame(0, 0, 10, []), /Thrusting 10 times toward 90 deg right of the nose slows the ship/);
  check('frame: drifting up, nose left -> brake toward 90 left', frame(128, 0, 10, []), /Thrusting 10 times toward 90 deg left of the nose slows the ship/);
  check('frame: slow ship gets no brake sentence', frame(64, 0, 1, []), /^((?!slows the ship).)*$/);
  // the dodge heading itself is verified against smartPilot's own play by check_dodge_facts.js
  check('frame: no verdict words', many, /^((?!dodge|turn |danger|safe|should|must).)*$/i);
}

console.log(failed === 0 ? `OK: ${total} geometry checks passed on ${path.basename(path.dirname(file))}/${path.basename(file)}`
                         : `${failed} of ${total} geometry checks FAILED on ${file}`);
process.exit(failed === 0 ? 0 : 1);
