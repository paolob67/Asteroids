// Measures pilots on the same game logic and tick budget, over several random seeds.
// Usage: node scripts/dev/measure_pilots.js [file] [ticksPerSeed] [pilot1,pilot2,...] [seeds] [flags]
//   e.g. node scripts/dev/measure_pilots.js asteroids.html 600000 simplePilot,smartPilot 5
//        node scripts/dev/measure_pilots.js asteroids.html 60000 layaPilot 3 --json=out.json
// Flags:
//   --json=path   write the full result (meta, per-seed rows, totals) as JSON
//   --no-cache    layaPilot only: do not reuse answers for identical requests (slow, see below)
//   --lag=N       layaPilot only: an answer takes effect N ticks after its request (default 1)
//
// The game's RAND is a fixed-seed LFSR, so a "seed" here means: advance RAND by that many
// calls after initGame(). The same seed gives the same game for the same pilot.
//
// Definitions (the same for every pilot, so the rows are comparable):
//   flying time    ticks with gameState === 'playing' (60 ticks = 1 second). Attract, wave-clear
//                  gaps, game-over and initials screens are not flying time.
//   ship loss      one call to explodeShip() that removes a life, counted inside the game code.
//   losses/hour    losses / flying hours.
//   points/min     points earned / flying minutes. Points = scores of finished games + the open game.
//
// layaPilot needs the Laya server (scripts/dev/laya_server.py). In the browser an answer arrives
// some milliseconds after its request and the ship keeps following the previous answer meanwhile.
// To make the run deterministic and independent of wall-clock speed, the harness holds every answer
// back until exactly --lag ticks after its request. 60 Hz means 16.7 ms per tick, so --lag=1 models
// a server that answers within one frame and --lag=6 one that takes 84 to 100 ms. Pick the lag from
// the latency measured on the machine (the script prints it). Identical requests get the identical
// answer from the model, so answers are cached by default; the latency printed is that of requests
// that really reached the server. The run fails if the pilot ever falls back to smartPilot, because
// that would silently measure the wrong pilot.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { loadGame } = require('./lib/load_game');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const pos = args.filter(a => !a.startsWith('--'));
const file = pos[0] || path.join(__dirname, '../../asteroids.html');
const budget = Number(pos[1] || 600000);
const pilots = (pos[2] || 'simplePilot,smartPilot').split(',');
const seeds = Number(pos[3] || 3);
const lag = Number(flags.lag || 1);

const LAYA_URL = 'http://127.0.0.1:8700/v1/systemone';
const LAYA_HEALTH = 'http://127.0.0.1:8700/health';

// The game prints server status to the console; keep the measurement output clean.
for (const m of ['log', 'warn']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => { if (!String(a[0]).startsWith('[Laya Autopilot]')) orig(...a); };
}

// Answer cache and latency record for layaPilot requests.
const realFetch = global.fetch;
const cache = new Map();
let layaStats;
const resetLayaStats = () => { layaStats = { hits: 0, misses: 0, missMs: [], transportRetries: 0 }; };
resetLayaStats();
// The server speaks HTTP/1.0 and closes every connection after its reply. Node's fetch reuses
// pooled sockets, and a reused socket the server already closed fails with ECONNRESET, or crashes
// the process with "setTypeOfService EINVAL" (seen once, in the run of 2026-11-11, outside any
// try/catch). So requests to the Laya server use the http module with a new connection each time.
const http = require('http');
const postOnce = (url, body) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', agent: false,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', c => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, text: data }));
  });
  req.on('error', reject);
  req.end(body);
});
global.fetch = async (url, opts = {}) => {
  if (String(url) !== LAYA_URL) return realFetch(url, opts);
  const key = opts.body;
  let text, status = 200;
  if (!flags['no-cache'] && cache.has(key)) {
    layaStats.hits++;
    text = cache.get(key);
  } else {
    // A failed attempt (connection refused or reset) never reached the model, so it is retried and not timed.
    let r, t0;
    for (let attempt = 0; ; attempt++) {
      t0 = performance.now();
      try { r = await postOnce(url, key); break; }
      catch (e) { layaStats.transportRetries++; if (attempt >= 5) throw e; }
    }
    status = r.status; text = r.text;
    layaStats.misses++;
    layaStats.missMs.push(performance.now() - t0);
    if (status >= 200 && status < 300 && !flags['no-cache']) cache.set(key, text);
  }
  return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
};

const run = loadGame(file, [
  ['"use strict";', '"use strict"; var HYPERS = 0, DEATH = null, LOSS_LOG = [];'],
  ['function doHyperspace() {', 'function doHyperspace() { if (ship.alive && !ship.exploding && ship.visible) HYPERS++;'],
  ['lives[curPlayer]--;', 'lives[curPlayer]--; LOSS_LOG.push(DEATH || "other");'],
  ['explodeShip(); splitAsteroid(a); return;', 'DEATH = "rock"; explodeShip(); splitAsteroid(a); return;'],
  ['explodeShip(); explodeSaucer(); return;', 'DEATH = "saucer-body"; explodeShip(); explodeSaucer(); return;'],
  ['t.alive = false; explodeShip(); return;', 't.alive = false; DEATH = "saucer-torpedo"; explodeShip(); return;'],
  ['explodeShip();         // doomed by hyperspace', 'DEATH = "hyperspace"; explodeShip();'],
  // Keep the reason of the last Laya request failure, to report it if the pilot falls back.
  ['}).catch(err => {\n        layaServerOnline = false;', '}).catch(err => {\n        LAYA_LAST_ERROR = String(err && err.message || err) + (err && err.cause ? " / " + (err.cause.code || err.cause.message) : "");\n        layaServerOnline = false;'],
  ['var HYPERS = 0,', 'var LAYA_LAST_ERROR = null, HYPERS = 0,'],
]);

// Behaviour counters (added 2026-11-11; they only read game state, they do not change the run):
//   shipTicks   ticks with a live, visible ship        speed / drift   mean speed, ticks at speed >= 1.5
//   distSum     distance from the field centre          bursts          thrust key presses (rising edges)
//   threatsAtLoss  how many rocks/saucer were closing within 60 ticks (and nearer than 1200 units)
//                  on the tick before each loss (same test as layaFormatState)
//   Laya only: answers received, choice changes, ticks spent on each choice
const body = (name, seed) => `
  AUTOPILOT = ${name}; HYPERS = 0; LOSS_LOG.length = 0; DEATH = null;
  initGame(1); for (let k = 0; k < ${seed} * 7; k++) rand();
  return (async () => {
    // The loop never yields to the event loop except to collect an answer that is due, so an
    // answer requested at tick i takes effect at tick i + lag, whatever the wall-clock speed.
    const lag = ${lag};
    layaLastAction = { why: 'Laya initialized: waiting for first decision.' };
    const isLaya = AUTOPILOT === layaPilot;
    const games = []; let startTick = 0, prev = '', thrust = 0, play = 0, fallback = 0, banked = 0, reqTick = -1;
    let shipTicks = 0, speedSum = 0, drift = 0, distSum = 0, bursts = 0, prevUp = false, threatsNow = 0;
    const threatsAtLoss = {}, choiceTicks = {}; let answers = 0, choiceChanges = 0, prevAct = null, prevChoice = null;
    const wrapD = (d, size) => d - size * Math.round(d / size);
    const countThreats = () => {
      let n = 0;
      const items = asteroids.filter(a => a.alive && !a.exploding);
      if (saucer && saucer.alive && !saucer.exploding) items.push(saucer);
      for (const it of items) {
        const dx = wrapD(it.x - ship.x, SX), dy = wrapD(it.y - ship.y, SY), dist = Math.hypot(dx, dy);
        const closing = -((dx * (it.vx - ship.vx) + dy * (it.vy - ship.vy)) / (dist || 1));
        if (closing > 0 && dist < 1200 && dist / closing <= 60) n++;
      }
      return n;
    };
    for (let i = 0; i < ${budget}; i++) {
      const wasPending = layaPending;
      applyAutopilot();
      if (isLaya && !wasPending && layaPending) reqTick = i;
      if (gameState === 'playing') { play++; if (keys['ArrowUp']) thrust++; }
      if (isLaya && layaLastAction.isFallback) fallback++;
      if (gameState === 'playing' && ship.alive && ship.visible && !ship.exploding) {
        shipTicks++;
        const sp = Math.hypot(ship.vx, ship.vy); speedSum += sp; if (sp >= 1.5) drift++;
        distSum += Math.hypot(wrapD(ship.x - CX0, SX), wrapD(ship.y - CY0, SY));
        const up = !!keys['ArrowUp']; if (up && !prevUp) bursts++; prevUp = up;
        threatsNow = countThreats();
        if (isLaya) {
          if (layaLastAction !== prevAct) { answers++; prevAct = layaLastAction; }
          const c = layaLastAction.choice || 'none';
          choiceTicks[c] = (choiceTicks[c] || 0) + 1;
          if (prevChoice !== null && c !== prevChoice) choiceChanges++;
          prevChoice = c;
        }
      } else prevUp = false;
      DEATH = null;
      const lossesBefore = LOSS_LOG.length;
      update();
      if (LOSS_LOG.length > lossesBefore) threatsAtLoss[threatsNow] = (threatsAtLoss[threatsNow] || 0) + 1;
      if (isLaya) { while (layaPending && i + 1 >= reqTick + lag) await new Promise(r => setImmediate(r)); }
      if (gameState === 'gameover' && prev !== 'gameover') { games.push({ score: scores[0], ticks: i - startTick }); banked += scores[0]; }
      if (prev !== 'playing' && prev !== 'waveclear' && gameState === 'playing') startTick = i;
      prev = gameState;
    }
    while (layaPending) await new Promise(r => setImmediate(r));   // do not leak a request into the next seed
    const open = gameState === 'playing' || gameState === 'waveclear';
    const causes = {};
    for (const c of LOSS_LOG) causes[c] = (causes[c] || 0) + 1;
    return { games, causes, losses: LOSS_LOG.length, thrust, play, fallback, laya_error: LAYA_LAST_ERROR, hypers: HYPERS, points: banked + (open ? scores[0] : 0),
      shipTicks, speedSum, drift, distSum, bursts, threatsAtLoss, answers, choiceChanges, choiceTicks };
  })();
`;

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
const sh = cmd => { try { return execSync(cmd, { cwd: path.join(__dirname, '../..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };

async function layaModel() {
  try { return (await (await realFetch(LAYA_HEALTH)).json()).model; } catch { return null; }
}

async function main() {
  const needLaya = pilots.includes('layaPilot');
  const model = needLaya ? await layaModel() : null;
  if (needLaya && !model) {
    console.error('layaPilot needs the Laya server: .venv/bin/python scripts/dev/laya_server.py --port 8700');
    process.exit(2);
  }
  const meta = {
    date: new Date().toISOString(),
    command: 'node scripts/dev/measure_pilots.js ' + args.join(' '),
    file, fileSha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    gitCommit: sh('git rev-parse --short HEAD'), gitDirty: sh('git status --porcelain -- asteroids.html scripts').length > 0,
    node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model,
    memoryGB: Math.round(os.totalmem() / 2 ** 30), layaModel: model,
    ticksPerSeed: budget, seeds, answerCache: needLaya ? !flags['no-cache'] : null,
  };
  console.log(`Measuring ${pilots.join(', ')} on ${file}: ${seeds} seeds x ${budget} ticks`);

  const results = [];
  for (const name of pilots) {
    const t0 = Date.now();
    resetLayaStats();
    const rows = [];
    for (let seed = 0; seed < seeds; seed++) {
      const r = await run(body(name, seed));
      if (name === 'layaPilot' && r.fallback > 0) {
        console.error(`seed ${seed}: layaPilot fell back to smartPilot for ${r.fallback} ticks (${r.laya_error}); the result would not measure Laya. Aborting.`);
        process.exit(3);
      }
      rows.push({ seed, ...r, lossesPerHour: r.play ? r.losses / (r.play / 216000) : 0 });
      if (name === 'layaPilot') console.error(`  layaPilot seed ${seed} done: flying ${(r.play / 216000).toFixed(3)} h, ${r.losses} losses, ${r.points} points, ${JSON.stringify(r.causes)}; ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed, cache ${layaStats.hits} hits / ${layaStats.misses} misses`);
    }
    const tot = { losses: 0, points: 0, hypers: 0, thrust: 0, play: 0, causes: {}, games: [], shipTicks: 0, speedSum: 0, drift: 0, distSum: 0, bursts: 0, threats: {}, answers: 0, choiceChanges: 0, choiceTicks: {} };
    for (const r of rows) {
      tot.losses += r.losses; tot.points += r.points; tot.hypers += r.hypers; tot.thrust += r.thrust; tot.play += r.play;
      tot.games.push(...r.games);
      for (const [c, n] of Object.entries(r.causes)) tot.causes[c] = (tot.causes[c] || 0) + n;
      for (const k of ['shipTicks', 'speedSum', 'drift', 'distSum', 'bursts', 'answers', 'choiceChanges']) tot[k] += r[k];
      for (const [c, n] of Object.entries(r.threatsAtLoss)) tot.threats[c] = (tot.threats[c] || 0) + n;
      for (const [c, n] of Object.entries(r.choiceTicks)) tot.choiceTicks[c] = (tot.choiceTicks[c] || 0) + n;
    }
    const flyHours = tot.play / 216000, flyMin = tot.play / 3600;
    const sc = tot.games.map(g => g.score);
    const lph = rows.map(r => r.lossesPerHour);
    const res = {
      pilot: name, seeds, ticksPerSeed: budget,
      flyingHours: +flyHours.toFixed(2), flyingShare: +(tot.play / (seeds * budget)).toFixed(4),
      losses: tot.losses, lossesPerHour: +(tot.losses / flyHours).toFixed(1),
      lossesPerHourBySeedMin: +Math.min(...lph).toFixed(1), lossesPerHourBySeedMax: +Math.max(...lph).toFixed(1),
      pointsPerMin: Math.round(tot.points / flyMin),
      thrustPct: +(100 * tot.thrust / tot.play).toFixed(1), hyperspacePerHour: +(tot.hypers / flyHours).toFixed(1),
      gamesEnded: tot.games.length, medianGameScore: sc.length ? pct(sc, 0.5) : null,
      causes: tot.causes, rows: rows.map(({ games, ...r }) => ({ ...r, gamesEnded: games.length })),
      wallSeconds: +((Date.now() - t0) / 1000).toFixed(0),
    };
    const shipMin = tot.shipTicks / 3600;
    res.behaviour = {
      shipTicks: tot.shipTicks,
      meanSpeed: +(tot.speedSum / tot.shipTicks).toFixed(2),
      driftPct: +(100 * tot.drift / tot.shipTicks).toFixed(1),
      meanDistFromCentre: Math.round(tot.distSum / tot.shipTicks),
      thrustBurstsPerMin: +(tot.bursts / shipMin).toFixed(1),
      meanBurstTicks: tot.bursts ? +(tot.thrust / tot.bursts).toFixed(1) : null,
      threatsAtLoss: tot.threats,
    };
    if (name === 'layaPilot') {
      res.behaviour.answersPerSecond = +(tot.answers / (tot.shipTicks / 60)).toFixed(2);
      res.behaviour.choiceChangesPerMin = +(tot.choiceChanges / shipMin).toFixed(1);
      res.behaviour.choiceShare = Object.fromEntries(Object.entries(tot.choiceTicks).map(([c, n]) => [c, +(100 * n / tot.shipTicks).toFixed(1)]));
    }

    if (name === 'layaPilot') {
      res.laya = { requestsToServer: layaStats.misses, answersFromCache: layaStats.hits, transportRetries: layaStats.transportRetries,
        medianLatencyMs: +pct(layaStats.missMs, 0.5).toFixed(1), p95LatencyMs: +pct(layaStats.missMs, 0.95).toFixed(1) };
    }
    results.push(res);
    console.log(`${name.padEnd(12)} ${seeds} seeds x ${(budget / 216000).toFixed(2)} h   flying ${res.flyingHours} h   losses=${res.losses}   losses/hour=${String(res.lossesPerHour).padStart(5)} (seed range ${res.lossesPerHourBySeedMin} to ${res.lossesPerHourBySeedMax})   points/min=${String(res.pointsPerMin).padStart(6)}` +
      `   thrust=${res.thrustPct}%   hyperspace/hour=${res.hyperspacePerHour}   games ended=${res.gamesEnded}${res.medianGameScore !== null ? ` (median score ${res.medianGameScore})` : ''}   [${res.wallSeconds}s]`);
    console.log(`${' '.repeat(12)} losses by cause: ${Object.entries(tot.causes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ') || 'none'}`);
    { const b = res.behaviour;
      console.log(`${' '.repeat(12)} behaviour: mean speed ${b.meanSpeed}, drifting ${b.driftPct}% of ticks, mean distance from centre ${b.meanDistFromCentre}, thrust bursts ${b.thrustBurstsPerMin}/min (mean ${b.meanBurstTicks} ticks), threats closing at the tick before a loss: ${JSON.stringify(b.threatsAtLoss)}` +
        (b.answersPerSecond !== undefined ? `; laya answers ${b.answersPerSecond}/s, choice changes ${b.choiceChangesPerMin}/min, time per choice ${JSON.stringify(b.choiceShare)}` : '')); }
    if (res.laya) console.log(`${' '.repeat(12)} laya: ${res.laya.requestsToServer} requests to the server, ${res.laya.answersFromCache} answers from cache, ${res.laya.transportRetries} connection retries, latency median ${res.laya.medianLatencyMs} ms, p95 ${res.laya.p95LatencyMs} ms`);
  }
  if (flags.json) {
    fs.mkdirSync(path.dirname(path.resolve(flags.json)), { recursive: true });
    fs.writeFileSync(flags.json, JSON.stringify({ meta, results }, null, 2) + '\n');
    console.log(`wrote ${flags.json}`);
  }
  process.exit(0);   // the game script starts a health-check interval that would keep Node alive
}

main().catch(e => { console.error(e); process.exit(1); });
