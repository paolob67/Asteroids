// Shared headless loader: reads the inline script of an asteroids HTML file, stubs the
// browser objects, and returns run(body) which executes `body` in the same scope as the
// game code (so it can call update(), snapshot(), simplePilot(), and read ship, scores...).
// `patches` is a list of [searchString, replacement] applied to the source first, used by
// measurement scripts to add instrumentation without touching the game file.
const fs = require('fs');

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

function loadGame(file, patches = []) {
  const html = fs.readFileSync(file, 'utf8');
  let src = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');
  for (const [from, to] of patches) {
    if (!src.includes(from)) throw new Error('patch target not found: ' + from);
    src = src.split(from).join(to);
  }
  return body => new Function(src + '\n' + body)();
}

module.exports = { loadGame };
