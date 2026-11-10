// Measures mean rock speed (internal units/frame, 8 units = 1 px) at each split generation using the NEWVEL algorithm.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'asteroids.html', 'utf8');
const js = src.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');
const noop = () => {};
const ctx = new Proxy({}, { get: () => noop, set: () => true });
const sb = { console, Math, Array, String, Number, Object,
  document: { getElementById: () => ({ getContext: () => ctx, style: {} }), addEventListener: noop },
  window: { addEventListener: noop, innerWidth: 1100, innerHeight: 860 }, requestAnimationFrame: noop };
vm.createContext(sb);
vm.runInContext(js + ';globalThis.nv = newVelComp;', sb);
const N = 20000, gen = [[], [], []];
for (let i = 0; i < N; i++) {
  let vx = sb.nv(0), vy = sb.nv(0);
  gen[0].push(Math.hypot(vx, vy));
  for (let g = 1; g < 3; g++) { vx = sb.nv(vx); vy = sb.nv(vy); gen[g].push(Math.hypot(vx, vy)); }
}
['large', 'medium', 'small'].forEach((n, g) => {
  const a = gen[g], m = a.reduce((s, x) => s + x, 0) / N;
  console.log(n.padEnd(7), 'mean speed', (m / 8).toFixed(2), 'px/frame', (m / 8 * 60).toFixed(0), 'px/s at 60 Hz');
});
