// Checks the Manual | Simple | Smart selector with a small fake DOM: clicking a button must set
// AUTOPILOT to the right function (or null), mark only that button as pressed, and release held keys.
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '../../asteroids.html');
const src = fs.readFileSync(file, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');

if (!src.includes('const CONTROLLERS')) { console.log('SKIP: ' + path.basename(path.dirname(file)) + ' has no controller selector (added in version 3)'); process.exit(0); }

const noop = () => {};
const ctxStub = new Proxy({}, { get: () => noop, set: () => true });
const els = {};
function makeEl(id) {
  const attrs = {}, listeners = {};
  return new Proxy({
    setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k],
    addEventListener: (ev, fn) => { listeners[ev] = fn; }, click: () => listeners.click && listeners.click(),
    blur: noop, classList: { toggle: noop }, style: {},
  }, { get: (t, k) => k in t ? t[k] : (k === 'getContext' ? () => ctxStub : (k === 'width' || k === 'height') ? 800 : noop), set: (t, k, v) => { t[k] = v; return true; } });
}
global.document = { getElementById: id => els[id] || (els[id] = makeEl(id)), addEventListener: noop, createElement: () => makeEl('x'), body: makeEl('body') };
global.window = { addEventListener: noop, innerWidth: 1400, innerHeight: 800 };
global.requestAnimationFrame = noop;
global.AudioContext = undefined;

const r = new Function(src + `
const out = [];
const check = (name, fn) => { out.push([name, fn()]); };
const press = n => document.getElementById('ctl-' + n).click();
const pressed = () => Object.keys(CONTROLLERS).filter(n => document.getElementById('ctl-' + n).getAttribute('aria-pressed') === 'true');
keys['ArrowUp'] = true; keys[' '] = true;
press('smart');  check('smart sets smartPilot', () => AUTOPILOT === smartPilot);
check('smart marks only smart', () => pressed().join() === 'smart');
check('switching releases held keys', () => !keys['ArrowUp'] && !keys[' ']);
press('simple'); check('simple sets simplePilot', () => AUTOPILOT === simplePilot);
check('simple marks only simple', () => pressed().join() === 'simple');
press('manual'); check('manual clears the autopilot', () => AUTOPILOT === null);
check('manual marks only manual', () => pressed().join() === 'manual');
// each controller can really play a few thousand ticks through applyAutopilot()
for (const n of ['simple', 'smart', 'manual']) {
  press(n); initGame(1);
  let ok = true;
  try { for (let i = 0; i < 5000; i++) { applyAutopilot(); update(); updatePanels(); } } catch (e) { ok = e.message; }
  check(n + ' runs 5000 ticks with panels', () => ok === true ? true : ok);
}
return out;`)();
let fail = 0;
for (const [name, ok] of r) { console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (ok === true ? '' : ' -> ' + ok)); if (ok !== true) fail++; }
process.exit(fail ? 1 : 0);
