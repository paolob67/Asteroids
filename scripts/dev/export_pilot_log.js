// Exports (snapshot, decision, why, situation) records from a pilot, as JSON lines, for
// offline tests of a decision model (see docs/CLM.md).
// Usage: node scripts/dev/export_pilot_log.js [file] [ticks] [pilot] [seed] [out.jsonl]
//   e.g. node scripts/dev/export_pilot_log.js asteroids.html 600000 smartPilot 0 /tmp/smart_0.jsonl
//
// "seed" has the same meaning as in measure_pilots.js (RAND advanced by seed*7 calls after
// initGame()), so the same seed gives the same game for the same pilot.
//
// Every record is the state the pilot saw plus the keys it chose. Records are sampled by
// situation so that the rare, decisive ones are not drowned by calm ticks:
//   hyper  every tick where hyperspace was pressed
//   dodge  every 5th tick where the pilot was dodging a predicted hit
//   brake  every 15th tick where it braked
//   stay   every 30th tick where nothing threatened it (aim and shoot)
// The situation is read from the pilot's own `why` text, so it is only available for pilots
// that write one (smartPilot does; simplePilot's text is labelled 'simple').
const path = require('path');
const fs = require('fs');
const { loadGame } = require('./lib/load_game');
const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');
const budget = Number(process.argv[3] || 600000);
const pilot = process.argv[4] || 'smartPilot';
const seed = Number(process.argv[5] || 0);
const out = process.argv[6] || `/tmp/${pilot}_${seed}.jsonl`;

const run = loadGame(file);
const records = run(`
AUTOPILOT = ${pilot};
const recs = [];
const EVERY = { hyper: 1, dodge: 5, brake: 15, stay: 30, simple: 30 };
const seen = {};
initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
for (let i = 0; i < ${budget}; i++) {
  const snap = snapshot();
  applyAutopilot();
  if (gameState === 'playing' && snap.ship && snap.ship.alive && snap.ship.visible && !snap.ship.exploding) {
    const why = lastWhy || '';
    const situation = (keys['Shift'] || /Hyperspace [(]about/.test(why)) ? 'hyper'
      : /Dodge|no safe dodge/.test(why) ? 'dodge'
      : /brake/.test(why) ? 'brake'
      : /Safe for the next/.test(why) ? 'stay' : 'simple';
    seen[situation] = (seen[situation] || 0) + 1;
    if (seen[situation] % EVERY[situation] === 0) {
      recs.push({
        tick: i, situation, why, snapshot: snap,
        decision: { left: !!keys['ArrowLeft'], right: !!keys['ArrowRight'], thrust: !!keys['ArrowUp'], fire: !!keys[' '], hyper: !!keys['Shift'] },
      });
    }
  }
  update();
}
return { recs, seen };
`);

fs.writeFileSync(out, records.recs.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`${file}  pilot=${pilot}  seed=${seed}  ticks=${budget}  -> ${out}`);
console.log('ticks per situation:', JSON.stringify(records.seen));
const kept = {};
for (const r of records.recs) kept[r.situation] = (kept[r.situation] || 0) + 1;
console.log('records written:    ', JSON.stringify(kept), `(total ${records.recs.length})`);
