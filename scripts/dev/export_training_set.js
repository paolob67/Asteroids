#!/usr/bin/env node
// Exports a training or evaluation set for fine-tuning Laya to imitate smartPilot (Part 4).
// Usage: node scripts/dev/export_training_set.js <out.jsonl> <firstSeed> <lastSeed> [ticks] [flags]
//   e.g. node scripts/dev/export_training_set.js .work/data/train.jsonl 100 139 60000
//
// Each output line is one intermediate row:
//   { state, expected: { left, right, thrust, fire, hyper }, meta: { seed, tick, situation } }
// `state` is layaFrameState(snapshot): a description of the frame in the ship's own frame (nearest
// objects with bearing, distance, closing speed and closest approach; the ship's own motion). It
// states measurements only, never what to do. `expected` is the keys smartPilot held on that tick,
// as booleans. make_strategy_set.py (or make_choice_set.py) adds the question and the label.
//
// Only even frames are recorded. smartPilot pulses fire and hyperspace on even frames because the
// game triggers them on a key press; on an even frame the key state is exactly its intent, on an odd
// frame it is always up. The pilot that runs the student does the same: it presses fire or
// hyperspace only on even frames, when the model answers yes.
//
// Seeds 0..11 are the in-play evaluation games of Part 3 and must never be used for training;
// the script refuses them unless --allow-eval-seeds is given.
//
// Sampling keeps every rare decisive tick and thins the calm ones (STRIDE, counted in even frames).
// The situation comes from smartPilot's own `why` text, as in export_pilot_log.js.
//
// Flags:
//   --stats        print the census and counts, write nothing
//   --stride=a:n,b:n   override a per-situation stride, e.g. --stride=hyper:1,dodge:2,stay:40,brake:5
//   --geometry     write the geometry-only state text (object list and ship motion; no look-ahead or brake sentence)
const path = require('path');
const fs = require('fs');
const { loadGame } = require('./lib/load_game');

const args = process.argv.slice(2);
const pos = args.filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const [k, v] = a.slice(2).split('=');
  return [k, v === undefined ? true : v];
}));
const out = pos[0];
const firstSeed = Number(pos[1]);
const lastSeed = Number(pos[2]);
const budget = Number(pos[3] || 60000);
if (!out || !Number.isInteger(firstSeed) || !Number.isInteger(lastSeed) || lastSeed < firstSeed) {
  console.error('usage: export_training_set.js <out.jsonl> <firstSeed> <lastSeed> [ticks] [--stats] [--stride=...]');
  process.exit(2);
}
if (firstSeed <= 11 && !flags['allow-eval-seeds']) {
  console.error('seeds 0..11 are the in-play evaluation games; use seeds above 11 or pass --allow-eval-seeds');
  process.exit(2);
}

const STRIDE = { hyper: 1, dodge: 2, brake: 5, stay: 40, simple: 40 };
for (const part of String(flags.stride || '').split(',').filter(Boolean)) {
  const [k, v] = part.split(':');
  STRIDE[k] = Number(v);
}

const run = loadGame(path.join(__dirname, '../../asteroids.html'));

function exportSeed(seed) {
  return run(`
AUTOPILOT = smartPilot;
const recs = [];
const seen = {};
const census = {};
initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
const STRIDE = ${JSON.stringify(STRIDE)};
const LOOKAHEAD = ${flags.geometry ? 'false' : 'true'};
for (let i = 0; i < ${budget}; i++) {
  const snap = snapshot();
  applyAutopilot();
  if (gameState === 'playing' && snap.ship && snap.ship.alive && snap.ship.visible && !snap.ship.exploding && snap.frame % 2 === 0) {
    const why = lastWhy || '';
    const situation = (keys['Shift'] || /Hyperspace [(]about/.test(why)) ? 'hyper'
      : /Dodge|no safe dodge/.test(why) ? 'dodge'
      : /brake/.test(why) ? 'brake'
      : /Safe for the next/.test(why) ? 'stay' : 'simple';
    const d = { left: !!keys['ArrowLeft'], right: !!keys['ArrowRight'], thrust: !!keys['ArrowUp'], fire: !!keys[' '], hyper: !!keys['Shift'] };
    const combo = (d.left ? 'L' : '') + (d.right ? 'R' : '') + (d.thrust ? 'T' : '') + (d.fire ? 'F' : '') + (d.hyper ? 'H' : '') || '-';
    census[situation + ':' + combo] = (census[situation + ':' + combo] || 0) + 1;
    seen[situation] = (seen[situation] || 0) + 1;
    if (seen[situation] % (STRIDE[situation] || 40) === 0) {
      const state = layaFrameState(snap, LAYA_FRAME_OBJECTS, LOOKAHEAD);
      if (state) recs.push({ tick: i, situation, d, state });
    }
  }
  update();
}
return { recs, seen, census, ended: gameState };
`);
}

const rows = [];
const census = {};
const seenTotal = {};
for (let seed = firstSeed; seed <= lastSeed; seed++) {
  const r = exportSeed(seed);
  for (const [k, v] of Object.entries(r.census)) census[k] = (census[k] || 0) + v;
  for (const [k, v] of Object.entries(r.seen)) seenTotal[k] = (seenTotal[k] || 0) + v;
  for (const rec of r.recs) {
    rows.push({
      state: rec.state,
      expected: { left: rec.d.left, right: rec.d.right, thrust: rec.d.thrust, fire: rec.d.fire, hyper: rec.d.hyper },
      meta: { seed, tick: rec.tick, situation: rec.situation },
    });
  }
  console.error(`seed ${seed}: ${r.recs.length} rows kept, game state at end: ${r.ended}`);
}

console.log(`seeds ${firstSeed}..${lastSeed}, ${budget} ticks each, even frames only, stride ${JSON.stringify(STRIDE)}`);
console.log('even-frame ticks per situation (before thinning):', JSON.stringify(seenTotal));
console.log('key census (situation:keys -> ticks), L=left R=right T=thrust F=fire H=hyperspace, - = none:');
for (const [k, v] of Object.entries(census).sort((a, b) => b[1] - a[1]).slice(0, 24)) console.log(`  ${k.padEnd(16)} ${String(v).padStart(8)}`);
const yes = { left: 0, right: 0, thrust: 0, fire: 0, hyper: 0 };
for (const r of rows) for (const k of Object.keys(yes)) if (r.expected[k]) yes[k]++;
console.log('rows kept:', rows.length, ' "yes" answers per key:', JSON.stringify(yes));

if (!flags.stats) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  console.log(`wrote ${out}`);
}
process.exit(0);   // the game script starts a health-check interval that would keep Node alive
