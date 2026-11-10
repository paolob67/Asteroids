// Headless smoke test for the high score table and initials entry in asteroids.html
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(__dirname + '/../../asteroids.html', 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\nloop\(\);\s*$/, '\n');
const noop = () => {};
const ctx = new Proxy({}, { get: () => noop, set: () => true });
const sandbox = {
  document: { getElementById: () => ({ getContext: () => ctx, style: {} }), addEventListener: noop },
  window: { addEventListener: noop, innerWidth: 1024, innerHeight: 768 },
  requestAnimationFrame: noop, console,
};
vm.createContext(sandbox);
vm.runInContext(src + `
;this.api = { registerHighScores, startEntry, updateEntry, draw, update,
  get: () => ({ gameState, hiTable, entryQueue, entryPos }),
  set: (o) => { if ('scores' in o) scores = o.scores; if ('nPlayers' in o) nPlayers = o.nPlayers; if ('gameState' in o) gameState = o.gameState; },
  keys };`, sandbox);
const a = sandbox.api, assert = require('assert');

a.set({ scores: [500, 300], nPlayers: 2 });
a.registerHighScores();
let s = a.get();
assert.strictEqual(JSON.stringify(s.hiTable.map(e => e.score)), '[500,300]');
assert.strictEqual(s.entryQueue.length, 2);

a.set({ gameState: 'gameover' });
a.startEntry();
const tick = (n = 1) => { for (let i = 0; i < n; i++) a.update(); };
const press = (k, n = 1) => { a.keys[k] = true; tick(n); a.keys[k] = false; tick(); };
// Player 1 entry: A -> rotate left twice -> C, accept; accept A; step right from A -> blank, accept
press('ArrowLeft'); tick(8); press('ArrowLeft');   // A -> B -> C (>=8 frames apart)
press('Shift');
press('Shift');
press('ArrowRight'); press('Shift');
a.draw();
s = a.get();
assert.strictEqual(JSON.stringify(s.hiTable[0].ini), '[3,1,0]');
assert.strictEqual(s.entryQueue.length, 1);
// Player 2 entry finishes with three accepts
press('Shift'); press('Shift'); press('Shift');
s = a.get();
assert.strictEqual(s.gameState, 'attract');
a.draw();
// Timeout abandons entry
a.set({ scores: [900, 0], nPlayers: 1 }); a.registerHighScores(); a.startEntry();
tick(3841);
assert.strictEqual(a.get().gameState, 'attract');
console.log('OK', JSON.stringify(a.get().hiTable));
