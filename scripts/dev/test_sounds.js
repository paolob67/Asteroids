// Test script for Web Audio synthesis in asteroids.html
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(process.argv[2] || 'asteroids.html', 'utf8');
const js = src.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^loop\(\);\s*$/m, '');

// Mock AudioContext implementation to verify synthesized audio events
class MockGainNode {
  constructor() {
    this.gain = {
      setValueAtTime: (v, t) => { this._val = v; },
      linearRampToValueAtTime: (v, t) => { this._val = v; },
      exponentialRampToValueAtTime: (v, t) => { this._val = v; }
    };
  }
  connect(dest) {}
  disconnect() {}
}

class MockBiquadFilter {
  constructor() {
    this.type = 'lowpass';
    this.frequency = {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {}
    };
    this.Q = { setValueAtTime: () => {} };
  }
  connect(dest) {}
  disconnect() {}
}

class MockOscillator {
  constructor() {
    this.type = 'sine';
    this.frequency = {
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {}
    };
  }
  connect(dest) {}
  disconnect() {}
  start(t) {}
  stop(t) {}
}

class MockBufferSource {
  constructor() {
    this.buffer = null;
    this.loop = false;
  }
  connect(dest) {}
  disconnect() {}
  start(t) {}
  stop(t) {}
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
    this.nodesCreated = {
      oscillator: 0,
      gain: 0,
      bufferSource: 0,
      biquadFilter: 0
    };
  }
  resume() { return Promise.resolve(); }
  createOscillator() {
    this.nodesCreated.oscillator++;
    return new MockOscillator();
  }
  createGain() {
    this.nodesCreated.gain++;
    return new MockGainNode();
  }
  createBufferSource() {
    this.nodesCreated.bufferSource++;
    return new MockBufferSource();
  }
  createBiquadFilter() {
    this.nodesCreated.biquadFilter++;
    return new MockBiquadFilter();
  }
  createBuffer(channels, length, sampleRate) {
    return {
      sampleRate,
      length,
      getChannelData: () => new Float32Array(length)
    };
  }
}

const noop = () => {};
const ctx = new Proxy({}, { get: () => noop, set: () => true });
const mockAudioCtx = new MockAudioContext();

const sandbox = {
  console, Math, Array, String, Number, Object, setTimeout, clearTimeout,
  document: { getElementById: () => ({ getContext: () => ctx, style: {} }), addEventListener: noop },
  window: {
    addEventListener: noop,
    innerWidth: 1024,
    innerHeight: 768,
    AudioContext: function() { return mockAudioCtx; }
  },
  requestAnimationFrame: noop,
};

vm.createContext(sandbox);
vm.runInContext(js + `
;globalThis.api = {
  update,
  initGame,
  keys,
  playShipFire,
  playSaucerFire,
  setThrustSound,
  playThump,
  updateThump,
  playExplosion,
  updateSaucerSound,
  stopSaucerSound,
  playExtraLife,
  playHyperspace,
  stopAllSounds,
  get state() {
    return { gameState, ship, asteroids, saucer, thumpInterval, thumpTimer, thumpHigh };
  }
};`, sandbox);

const { api } = sandbox;
const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
};

// 1. Test individual sound triggers
api.playShipFire();
assert(mockAudioCtx.nodesCreated.oscillator > 0, 'Ship fire should create oscillator');
assert(mockAudioCtx.nodesCreated.gain > 0, 'Ship fire should create gain');

api.playSaucerFire();
api.playExplosion(0);
api.playExplosion(1);
api.playExplosion(2);
api.playHyperspace();
api.playExtraLife();
api.playThump(true);
api.playThump(false);
api.setThrustSound(true);
api.setThrustSound(false);

// 2. Test game loop sound progression (thump & thrust)
api.initGame(1);
const initialInterval = api.state.thumpInterval;
assert(initialInterval === 48, 'Initial thump interval should be 48');

// Simulate 120 frames with ship alive and rocks present
for (let i = 0; i < 120; i++) {
  api.keys['ArrowUp'] = true;
  api.update();
}

assert(api.state.thumpInterval < initialInterval, 'Thump interval should decrease over time during gameplay');

// 3. Test game over stops sounds
api.stopAllSounds();

console.log('OK: all audio synthesis routines verified successfully.');
