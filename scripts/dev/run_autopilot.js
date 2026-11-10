// Headless smoke test: runs asteroids.html logic with simplePilot for N ticks.
// Usage: node scripts/dev/run_autopilot.js [ticks] [file]   (default: 20000, working copy)
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.argv[3] || path.join(__dirname, '../../asteroids.html'), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];

const noop = () => {};
const ctxStub = new Proxy({}, { get: () => noop, set: () => true });
const el = new Proxy({}, { get: (t, k) => k === 'getContext' ? () => ctxStub : k === 'classList' ? { toggle: noop } : (k === 'width' || k === 'height') ? 800 : noop, set: () => true });
global.document = { getElementById: () => el, addEventListener: noop, createElement: () => el, body: el };
global.window = { addEventListener: noop, innerWidth: 800, innerHeight: 600 };
global.requestAnimationFrame = noop;
global.AudioContext = undefined;

const ticks = Number(process.argv[2] || 20000);
const body = src + `
AUTOPILOT = simplePilot;
let maxScore = 0, waves = 0, games = 0;
for (let i = 0; i < ${ticks}; i++) {
  applyAutopilot(); update();
  maxScore = Math.max(maxScore, scores[0]);
}
return { frame, gameState, scores: scores[0], maxScore, lives: lives[0], rocks: asteroids.filter(a=>a.alive).length };
`;
console.log(new Function(body)());
