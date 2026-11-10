#!/usr/bin/env node
// Evaluates Laya-MLX offline on pilot log records (JSONL).
// Usage: node scripts/dev/eval_laya_offline.js [log.jsonl] [limit] [format] [endpoint]
//   e.g. node scripts/dev/eval_laya_offline.js /tmp/smart_test.jsonl 100 egocentric http://127.0.0.1:8700/v1/systemone

const fs = require('fs');

const logFile = process.argv[2] || '/tmp/smart_test.jsonl';
const limit = Number(process.argv[3] || 100);
const format = process.argv[4] || 'egocentric'; // 'egocentric', 'why_summary', 'keyvalue'
const endpoint = process.argv[5] || 'http://127.0.0.1:8700/v1/systemone';

function mapExpertAction(rec) {
  const d = rec.decision;
  const sit = rec.situation;
  if (d.hyper || sit === 'hyper') return 'hyperspace';
  if (d.left && d.thrust) return 'turn_left_and_thrust';
  if (d.right && d.thrust) return 'turn_right_and_thrust';
  if (d.thrust && !d.left && !d.right) return 'thrust_only';
  if (d.left && !d.thrust) return 'turn_left_only';
  if (d.right && !d.thrust) return 'turn_right_only';
  return 'stay_and_fire';
}

function formatEgocentricState(snap, why, sit) {
  const ship = snap.ship || {};
  const shipAngleDeg = ((ship.angle || 0) * 360) / 256;
  const speed = Math.hypot(ship.vx || 0, ship.vy || 0);

  let nearestDist = Infinity;
  let nearestRelAngle = 0;
  let nearestClosingSpeed = 0;
  let nearestType = 'none';

  const items = (snap.asteroids || []).filter(a => !a.exploding);
  if (snap.saucer && !snap.saucer.exploding) items.push({ ...snap.saucer, isSaucer: true });

  for (const item of items) {
    let dx = item.x - ship.x;
    let dy = item.y - ship.y;
    if (dx > 4096) dx -= 8192; else if (dx < -4096) dx += 8192;
    if (dy > 3072) dy -= 6144; else if (dy < -3072) dy += 6144;
    const dist = Math.hypot(dx, dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestType = item.isSaucer ? 'saucer' : (item.size === 2 ? 'large rock' : item.size === 1 ? 'medium rock' : 'small rock');
      const itemBearingDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      let rel = itemBearingDeg - shipAngleDeg;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      nearestRelAngle = Math.round(rel);
      const relVx = (item.vx || 0) - (ship.vx || 0);
      const relVy = (item.vy || 0) - (ship.vy || 0);
      nearestClosingSpeed = -Math.round((dx * relVx + dy * relVy) / (dist || 1));
    }
  }

  if (sit === 'hyper') {
    return `Critical collision emergency. An unavoidable impact is occurring in fewer than 8 ticks. Steering cannot clear the ship.`;
  }
  if (sit === 'dodge') {
    const side = nearestRelAngle > 0 ? 'right' : 'left';
    const dodgeDir = side === 'right' ? 'left' : 'right';
    return `Warning: collision threat from ${nearestType} approaching from the ${side} at closing speed ${nearestClosingSpeed} px/tick. Pilot must turn ${dodgeDir} and thrust to clear flight path.`;
  }
  if (sit === 'brake') {
    return `Drift warning: ship speed is ${speed.toFixed(1)} px/tick. Pilot needs to counter-steer and thrust to stabilize and brake.`;
  }
  return `Safe conditions: airspace clear of immediate collisions. Ship heading ${Math.round(shipAngleDeg)} deg, nearest rock at safe distance ${Math.round(nearestDist)} units. Aim nose at target and fire.`;
}

function formatWhySummary(snap, why, sit) {
  return `Flight situation (${sit}): ${why}`;
}

function formatKeyValueState(snap) {
  const ship = snap.ship || {};
  return `Ship: pos=(${ship.x}, ${ship.y}), speed=${Math.hypot(ship.vx || 0, ship.vy || 0).toFixed(1)}, angle=${ship.angle}. ` +
    `Asteroids count=${(snap.asteroids || []).length}. Saucer=${snap.saucer ? 'active' : 'none'}.`;
}

function getStateText(snap, why, sit, fmt) {
  if (fmt === 'egocentric') return formatEgocentricState(snap, why, sit);
  if (fmt === 'why_summary') return formatWhySummary(snap, why, sit);
  return formatKeyValueState(snap);
}

const actionQuestions = {
  action: {
    type: 'choice',
    instructions: 'Determine the best tactical flight maneuver for the ship.',
    criteria: {
      stay_and_fire: 'Safe airspace. Aim weapons and fire torpedoes at target rocks or saucer.',
      turn_left_and_thrust: 'Threat approaching from right. Turn counter-clockwise and accelerate away to dodge.',
      turn_right_and_thrust: 'Threat approaching from left. Turn clockwise and accelerate away to dodge.',
      turn_left_only: 'Adjust heading left towards target without accelerating.',
      turn_right_only: 'Adjust heading right towards target without accelerating.',
      thrust_only: 'Accelerate forward or counter-thrust against drift.',
      hyperspace: 'Unavoidable collision within 8 ticks. Emergency hyperspace escape jump.'
    }
  }
};

async function evaluate() {
  if (!fs.existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
  const sample = lines.slice(0, limit).map(l => JSON.parse(l));

  console.log(`Evaluating ${sample.length} records using format='${format}' against ${endpoint}...`);

  let correct = 0;
  let top2Correct = 0;
  const sitStats = {};
  const latencies = [];

  for (let i = 0; i < sample.length; i++) {
    const rec = sample[i];
    const expertAction = mapExpertAction(rec);
    const stateText = getStateText(rec.snapshot, rec.why, rec.situation, format);

    const payload = {
      state: stateText,
      questions: actionQuestions
    };

    const t0 = performance.now();
    let resData;
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      resData = await resp.json();
    } catch (e) {
      console.error(`Request ${i} failed:`, e.message);
      continue;
    }
    const t1 = performance.now();
    latencies.push(t1 - t0);

    const ans = resData.answers?.action;
    const predicted = ans?.choice;
    const probs = ans?.probabilities || {};

    const sortedOptions = Object.entries(probs).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const isTop1 = predicted === expertAction;
    const isTop2 = sortedOptions.slice(0, 2).includes(expertAction);

    if (isTop1) correct++;
    if (isTop2) top2Correct++;

    const sit = rec.situation || 'unknown';
    if (!sitStats[sit]) sitStats[sit] = { total: 0, top1: 0, top2: 0 };
    sitStats[sit].total++;
    if (isTop1) sitStats[sit].top1++;
    if (isTop2) sitStats[sit].top2++;

    if (i < 8 || (!isTop1 && i < 20)) {
      console.log(`[#${i}] sit=${sit.padEnd(5)} expert=${expertAction.padEnd(20)} pred=${(predicted || '').padEnd(20)} top1=${isTop1 ? 'PASS' : 'FAIL'} conf=${(ans?.confidence || 0).toFixed(3)} lat=${(t1-t0).toFixed(1)}ms`);
    }
  }

  const avgLatency = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : 0;
  const p95Latency = latencies.length ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)].toFixed(1) : 0;

  console.log('\n================ OFFLINE EVALUATION RESULTS ================');
  console.log(`Total records evaluated: ${sample.length}`);
  console.log(`Top-1 Accuracy:          ${correct}/${sample.length} (${((correct / sample.length) * 100).toFixed(1)}%)`);
  console.log(`Top-2 Accuracy:          ${top2Correct}/${sample.length} (${((top2Correct / sample.length) * 100).toFixed(1)}%)`);
  console.log(`Mean Latency:            ${avgLatency} ms (p95: ${p95Latency} ms)`);
  console.log('------------------------------------------------------------');
  console.log('Breakdown by situation:');
  for (const [sit, st] of Object.entries(sitStats)) {
    const pct1 = ((st.top1 / st.total) * 100).toFixed(1);
    const pct2 = ((st.top2 / st.total) * 100).toFixed(1);
    console.log(`  ${sit.padEnd(8)}: Top-1 = ${st.top1}/${st.total} (${pct1}%), Top-2 = ${st.top2}/${st.total} (${pct2}%)`);
  }
  console.log('============================================================');
}

evaluate();
