// Measures the real browser, to check that the headless measurements (measure_pilots.js) are not
// distorted by how the browser runs the game. Drives Chrome over the DevTools protocol (no extra
// packages; needs Node with a global WebSocket and Google Chrome on macOS).
//
// Usage: node scripts/dev/browser_check.js [secondsPerPilot=60] [pilots=smart,laya] [--json=path] [--headed]
// --headed opens a visible Chrome window (keep it in front and do not touch it while it runs).
//
// For every pilot it plays a new game in a real (headless) Chrome page and reports:
//   game ticks per real second    (60 if drawing never slows the game down)
//   animation frames per second, slow frames (> 25 ms apart), longest gap between frames
//   Laya only: wall-clock latency of each request and its gap in game ticks
//     (ticks between the request being sent and the answer arriving)
//   points, ship losses. Games that end are banked and a new one is started.
// The Laya server must be running on port 8700 for 'laya'.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
const pos = args.filter(a => !a.startsWith('--'));
const secs = Number(pos[0] || 60);
const pilots = (pos[1] || 'smart,laya').split(',');
const file = path.resolve(__dirname, '../../asteroids.html');
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null;
const round = (x, d = 1) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d;

async function main() {
  const profile = fs.mkdtempSync('/tmp/bob-chrome-');
  const chrome = spawn(CHROME, [...(flags.headed === undefined ? ['--headless=new'] : []), `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1400,900',
    'file://' + file], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page' && t.url.startsWith('file:')); } catch {}
    }
    if (!target) throw new Error('Chrome page not found');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    let id = 0; const waiting = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
    const evalJs = async expr => {
      const mid = ++id;
      const p = new Promise(r => waiting.set(mid, r));
      ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
      const m = await p;
      if (m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400));
      return m.result.result.value;
    };

    const env = await evalJs(`JSON.stringify({ ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight, laya: typeof layaPilot })`);
    console.log('page:', env);

    // Instrumentation, installed once. Wrappers only observe; they call the original functions.
    await evalJs(`(() => {
      window.__m = null;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => raf(t => {
        const m = window.__m; if (m) { m.rafs++; if (m.last != null) { const g = t - m.last; if (g > m.maxGap) m.maxGap = g; if (g > 25) m.slow++; } m.last = t; }
        cb(t);
      });
      const f = window.fetch.bind(window);
      window.fetch = (url, o) => {
        const m = window.__m, f0 = frame, t0 = performance.now();
        return f(url, o).then(r => { if (m && String(url).includes('systemone')) { m.lat.push(performance.now() - t0); m.gap.push(frame - f0); } return r; });
      };
      const ex = window.explodeShip;
      window.explodeShip = function () { const m = window.__m; if (m && ship.alive && !ship.exploding) m.losses++; return ex.apply(this, arguments); };
    })()`);

    const results = [];
    for (const name of pilots) {
      await evalJs(`(() => {
        initGame(1); setController(${JSON.stringify(name)});
        window.__m = { rafs: 0, last: null, maxGap: 0, slow: 0, lat: [], gap: [], losses: 0, banked: 0, games: 0, f0: frame, t0: performance.now() };
      })()`);
      const start = Date.now();
      while (Date.now() - start < secs * 1000) {
        await sleep(250);
        await evalJs(`(() => { if (gameState !== 'playing' && gameState !== 'waveclear') { __m.banked += scores[0]; __m.games++; initGame(1); setController(${JSON.stringify(name)}); } })()`);
      }
      const out = JSON.parse(await evalJs(`JSON.stringify({ ...__m, ticks: frame - __m.f0, ms: performance.now() - __m.t0, points: __m.banked + scores[0], state: gameState })`));
      const row = {
        pilot: name, seconds: round(out.ms / 1000), ticks: out.ticks, ticksPerSecond: round(out.ticks / (out.ms / 1000), 2),
        framesPerSecond: round(out.rafs / (out.ms / 1000), 2), slowFrames: out.slow, longestGapMs: round(out.maxGap),
        points: out.points, losses: out.losses, gamesEnded: out.games,
      };
      if (out.lat.length) {
        row.laya = { requests: out.lat.length, latencyMs: { median: round(pct(out.lat, 0.5)), p95: round(pct(out.lat, 0.95)), max: round(Math.max(...out.lat)) },
          gapTicks: { median: pct(out.gap, 0.5), p95: pct(out.gap, 0.95), max: Math.max(...out.gap), mean: round(out.gap.reduce((a, b) => a + b, 0) / out.gap.length, 2) } };
      }
      console.log(JSON.stringify(row));
      results.push(row);
    }
    ws.close();
    if (flags.json) {
      fs.writeFileSync(flags.json, JSON.stringify({ date: new Date().toISOString(), command: process.argv.slice(1).join(' '), env: JSON.parse(env), secondsPerPilot: secs, results }, null, 2) + '\n');
      console.log('wrote', flags.json);
    }
  } finally {
    chrome.kill();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
