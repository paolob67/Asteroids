// Plays the Part 4 student (strategyPilot: the model chooses a strategy, the executor flies it) against
// simplePilot and smartPilot on the same seeds and the same tick budget, all on the working asteroids.html.
// Usage: node scripts/dev/measure_student.js [ticksPerSeed] [firstSeed] [lastSeed] [--lag=N] [--json=path]
//          [--pilots=simplePilot,smartPilot,strategyPilot]
//   needs scripts/dev/student_server.py on port 8701
//
// Same protocol as measure_pilots.js (Part 3): seeds are RAND advances after initGame(), flying time is
// ticks with gameState === 'playing', a loss is one call to explodeShip() that removes a life. The model
// answers in some milliseconds; to make the run independent of wall-clock speed the harness holds every
// answer back until exactly --lag ticks after its request (60 ticks = 1 second; default 22, about the
// 0.36 s the server needs on this machine). The run aborts if the student ever falls back to smartPilot.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { loadGame } = require('./lib/load_game');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const pos = args.filter(a => !a.startsWith('--'));
const budget = Number(pos[0] || 8000), firstSeed = Number(pos[1] || 0), lastSeed = Number(pos[2] || 11);
const lag = Number(flags.lag || 22);
const PORT = Number(flags.port || 8701);
const GAME_URL = 'http://127.0.0.1:8701/v1/systemone';   // what the game's STUDENT_ENDPOINT says
const URL_ = `http://127.0.0.1:${PORT}/v1/systemone`;   // where the requests really go

for (const m of ['log', 'warn']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => { if (!String(a[0]).startsWith('[Student Autopilot]')) orig(...a); };
}

const realFetch = global.fetch;
const cache = new Map();
const stats = { hits: 0, misses: 0, ms: [] };
const postOnce = (url, body) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', agent: false,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
    let d = ''; res.setEncoding('utf8'); res.on('data', c => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, text: d }));
  });
  req.on('error', reject); req.end(body);
});
global.fetch = async (url, opts = {}) => {
  if (String(url) !== GAME_URL) return realFetch(url, opts);
  const key = opts.body; let text, status = 200;
  if (cache.has(key)) { stats.hits++; text = cache.get(key); }
  else {
    const t0 = performance.now();
    const r = await postOnce(URL_, key);
    status = r.status; text = r.text; stats.misses++; stats.ms.push(performance.now() - t0);
    if (status === 200) cache.set(key, text);
  }
  return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
};

const run = loadGame(path.join(__dirname, '../../asteroids.html'), [
  ['"use strict";', '"use strict"; var HYPERS = 0, DEATH = null, LOSS_LOG = [];'],
  ['function doHyperspace() {', 'function doHyperspace() { if (ship.alive && !ship.exploding && ship.visible) HYPERS++;'],
  ['lives[curPlayer]--;', 'lives[curPlayer]--; LOSS_LOG.push(DEATH || "other");'],
  ['explodeShip(); splitAsteroid(a); return;', 'DEATH = "rock"; explodeShip(); splitAsteroid(a); return;'],
  ['explodeShip(); explodeSaucer(); return;', 'DEATH = "saucer-body"; explodeShip(); explodeSaucer(); return;'],
  ['t.alive = false; explodeShip(); return;', 't.alive = false; DEATH = "saucer-torpedo"; explodeShip(); return;'],
  ['explodeShip();         // doomed by hyperspace', 'DEATH = "hyperspace"; explodeShip();'],
]);

const body = (name, seed) => `
  AUTOPILOT = ${name}; HYPERS = 0; LOSS_LOG.length = 0; DEATH = null;
  initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
  return (async () => {
    const lag = ${lag}, isStudent = AUTOPILOT === strategyPilot;
    strategyLast = { choice: 'aim', why: 'start' }; strategyPending = false; strategyServerOnline = true;
    let startTick = 0, prev = '', thrust = 0, play = 0, fallback = 0, banked = 0, reqTick = -1, turnTicks = 0, fireTicks = 0, games = 0;
    const choiceTicks = {};
    for (let i = 0; i < ${budget}; i++) {
      const wasPending = strategyPending;
      applyAutopilot();
      if (isStudent && !wasPending && strategyPending) reqTick = i;
      if (gameState === 'playing') {
        play++; if (keys['ArrowUp']) thrust++; if (keys['ArrowLeft'] || keys['ArrowRight']) turnTicks++; if (keys[' ']) fireTicks++;
        if (isStudent) { if (strategyLast.choice === null) fallback++; const c = strategyLast.choice; choiceTicks[c] = (choiceTicks[c] || 0) + 1; }
      }
      DEATH = null;
      update();
      if (isStudent) { while (strategyPending && i + 1 >= reqTick + lag) await new Promise(r => setImmediate(r)); }
      if (gameState === 'gameover' && prev !== 'gameover') { games++; banked += scores[0]; }
      prev = gameState;
    }
    while (strategyPending) await new Promise(r => setImmediate(r));
    const open = gameState === 'playing' || gameState === 'waveclear';
    const causes = {}; for (const c of LOSS_LOG) causes[c] = (causes[c] || 0) + 1;
    return { games, causes, losses: LOSS_LOG.length, thrust, turnTicks, fireTicks, play, fallback, hypers: HYPERS, points: banked + (open ? scores[0] : 0), choiceTicks };
  })();
`;

async function main() {
  try { await (await realFetch(`http://127.0.0.1:${PORT}/health`)).json(); } catch { console.error('start the student server first: .venv/bin/python scripts/dev/student_server.py'); process.exit(2); }
  const health = await (await realFetch(`http://127.0.0.1:${PORT}/health`)).json();
  console.log(`seeds ${firstSeed}..${lastSeed} x ${budget} ticks, answer delay ${lag} ticks, model ${health.model}`);
  const out = [];
  for (const name of (flags.pilots || 'simplePilot,smartPilot,strategyPilot').split(',')) {
    const t0 = Date.now(); const rows = [];
    for (let seed = firstSeed; seed <= lastSeed; seed++) {
      const r = await run(body(name, seed));
      if (name === 'strategyPilot' && r.fallback > 0) { console.error(`seed ${seed}: student fell back to smartPilot for ${r.fallback} ticks; aborting`); process.exit(3); }
      rows.push({ seed, ...r });
      if (name === 'strategyPilot') console.error(`  student seed ${seed}: ${r.losses} losses in ${(r.play / 3600).toFixed(1)} min, ${r.points} points, ${JSON.stringify(r.causes)}; ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    const t = rows.reduce((a, r) => { for (const k of ['losses', 'points', 'play', 'thrust', 'turnTicks', 'fireTicks', 'hypers']) a[k] += r[k]; for (const [c, n] of Object.entries(r.causes)) a.causes[c] = (a.causes[c] || 0) + n; for (const [c, n] of Object.entries(r.choiceTicks)) a.choice[c] = (a.choice[c] || 0) + n; return a; },
      { losses: 0, points: 0, play: 0, thrust: 0, turnTicks: 0, fireTicks: 0, hypers: 0, causes: {}, choice: {} });
    const hours = t.play / 216000, minutes = t.play / 3600;
    const res = { pilot: name, seeds: rows.length, flyingMinutes: +minutes.toFixed(1), losses: t.losses, lossesPerHour: +(t.losses / hours).toFixed(1), pointsPerMin: Math.round(t.points / minutes),
      thrustPct: +(100 * t.thrust / t.play).toFixed(1), turnPct: +(100 * t.turnTicks / t.play).toFixed(1), firePct: +(100 * t.fireTicks / t.play).toFixed(1), hyperPerHour: +(t.hypers / hours).toFixed(1), causes: t.causes, rows };
    if (name === 'strategyPilot') res.choiceShare = Object.fromEntries(Object.entries(t.choice).map(([c, n]) => [c, +(100 * n / t.play).toFixed(1)]));
    out.push(res);
    console.log(`${name.padEnd(13)} flying ${res.flyingMinutes} min  losses ${res.losses}  losses/hour ${res.lossesPerHour}  points/min ${res.pointsPerMin}  turning ${res.turnPct}%  thrust ${res.thrustPct}%  fire ${res.firePct}%  hyperspace/hour ${res.hyperPerHour}  causes ${JSON.stringify(res.causes)}`);
    if (res.choiceShare) console.log(`${' '.repeat(13)} time per choice ${JSON.stringify(res.choiceShare)}`);
  }
  if (stats.ms.length) { const s = stats.ms.slice().sort((a, b) => a - b); console.log(`server: ${stats.misses} requests, ${stats.hits} from cache, latency median ${s[Math.floor(s.length / 2)].toFixed(0)} ms, p95 ${s[Math.floor(s.length * 0.95)].toFixed(0)} ms`); }
  if (flags.json) { fs.mkdirSync(path.dirname(path.resolve(flags.json)), { recursive: true }); fs.writeFileSync(flags.json, JSON.stringify({ meta: { date: new Date().toISOString(), lag, budget, firstSeed, lastSeed, model: health.model }, results: out }, null, 2) + '\n'); console.log('wrote ' + flags.json); }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
