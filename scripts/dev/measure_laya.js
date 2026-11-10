#!/usr/bin/env node
// Measures Laya-MLX against simplePilot and smartPilot over async headless game loops.
// Usage: node scripts/dev/measure_laya.js [file] [ticksPerSeed] [seeds]
//   e.g. node scripts/dev/measure_laya.js asteroids.html 10000 2

const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');
const budget = Number(process.argv[3] || 10000);
const seeds = Number(process.argv[4] || 2);

const html = fs.readFileSync(file, 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');

// Instrumentation patches for death causes and hyperspace tracking
src = src.replace('"use strict";', '"use strict"; var HYPERS = 0, DEATH = null;');
src = src.replace('function doHyperspace() {', 'function doHyperspace() { if (ship.alive && !ship.exploding && ship.visible) HYPERS++;');
src = src.replace('explodeShip(); splitAsteroid(a); return;', 'DEATH = "rock"; explodeShip(); splitAsteroid(a); return;');
src = src.replace('explodeShip(); explodeSaucer(); return;', 'DEATH = "saucer-body"; explodeShip(); explodeSaucer(); return;');
src = src.replace('t.alive = false; explodeShip(); return;', 't.alive = false; DEATH = "saucer-torpedo"; explodeShip(); return;');
src = src.replace('explodeShip();         // doomed by hyperspace', 'DEATH = "hyperspace"; explodeShip();');

// Stubs for headless VM execution
const noop = () => {};
const ctxStub = new Proxy({}, { get: () => noop, set: () => true });
const el = new Proxy({}, {
  get: (t, k) => k === 'getContext' ? () => ctxStub : k === 'classList' ? { toggle: noop } : k === 'style' ? {} : (k === 'width' || k === 'height') ? 800 : noop,
  set: () => true,
});
global.document = { getElementById: () => el, addEventListener: noop, createElement: () => el, body: el };
global.window = { addEventListener: noop, innerWidth: 1400, innerHeight: 800 };
global.requestAnimationFrame = noop;
global.AudioContext = undefined;

async function runPilot(pilotName) {
  const tot = { losses: 0, points: 0, ticks: 0, hypers: 0, thrust: 0, play: 0, causes: {}, games: [] };
  const t0 = Date.now();

  for (let seed = 0; seed < seeds; seed++) {
    const fn = new Function('return (async () => {' + src + `
      AUTOPILOT = ${pilotName};
      HYPERS = 0;
      initGame(1);
      for (let k = 0; k < ${seed} * 7; k++) rand();
      const games = [], causes = {};
      let startTick = 0, prev = '', thrust = 0, play = 0, losses = 0, prevLives = 3, banked = 0;

      for (let i = 0; i < ${budget}; i++) {
        applyAutopilot();
        if (gameState === 'playing') {
          play++;
          if (keys['ArrowUp']) thrust++;
        }
        DEATH = null;
        update();
        if (lives[0] < prevLives && gameState !== 'attract') {
          losses++;
          causes[DEATH || 'other'] = (causes[DEATH || 'other'] || 0) + 1;
        }
        prevLives = lives[0];
        if (gameState === 'gameover' && prev !== 'gameover') {
          games.push({ score: scores[0], ticks: i - startTick });
          banked += scores[0];
          prevLives = 3;
        }
        if (prev !== 'playing' && prev !== 'waveclear' && gameState === 'playing') startTick = i;
        prev = gameState;

        // Allow Node event loop to resolve fetch promises
        if (AUTOPILOT === layaPilot && i % 4 === 0) {
          await new Promise(r => setTimeout(r, 1));
        }
      }
      const open = gameState === 'playing' || gameState === 'waveclear';
      return { games, causes, losses, thrust, play, hypers: HYPERS, points: banked + (open ? scores[0] : 0) };
    })()`);

    const r = await fn();
    tot.losses += r.losses;
    tot.points += r.points;
    tot.ticks += budget;
    tot.hypers += r.hypers;
    tot.thrust += r.thrust;
    tot.play += r.play;
    tot.games.push(...r.games);
    for (const [c, n] of Object.entries(r.causes)) tot.causes[c] = (tot.causes[c] || 0) + n;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const hours = (tot.play / 60) / 3600;
  const minutes = (tot.play / 60) / 60;
  const lossesPerHour = hours > 0 ? (tot.losses / hours).toFixed(1) : '0.0';
  const pointsPerMin = minutes > 0 ? Math.round(tot.points / minutes) : 0;
  const thrustPct = tot.play > 0 ? ((tot.thrust / tot.play) * 100).toFixed(1) : '0.0';
  const hypersPerHour = hours > 0 ? (tot.hypers / hours).toFixed(1) : '0.0';

  console.log(`${pilotName.padEnd(12)}  ${seeds} seeds x ${(budget / 60 / 3600).toFixed(2)} h   ` +
              `losses/hour=${lossesPerHour.padStart(5)}   points/min=${String(pointsPerMin).padStart(6)}   ` +
              `thrust=${thrustPct}%   hyperspace/hour=${hypersPerHour.padStart(5)}   ` +
              `games ended=${tot.games.length}   [${elapsed}s]`);
  const causeList = Object.entries(tot.causes).map(([c, n]) => `${c} ${n}`).join(', ') || 'none';
  console.log(`             losses by cause: ${causeList}`);

  return { pilot: pilotName, lossesPerHour, pointsPerMin, thrustPct, hypersPerHour, gamesEnded: tot.games.length, causes: tot.causes };
}

async function main() {
  console.log(`Benchmarking pilots on ${file} (${budget} ticks/seed, ${seeds} seeds)...`);
  await runPilot('simplePilot');
  await runPilot('smartPilot');
  await runPilot('layaPilot');
}

main().catch(console.error);
