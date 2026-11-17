#!/usr/bin/env node
// Evaluates Laya-MLX offline on pilot log records (JSONL from export_pilot_log.js).
// Usage: node scripts/dev/eval_laya_offline.js [log.jsonl] [limit] [level] [endpoint] [game.html]
//   e.g. node scripts/dev/eval_laya_offline.js /tmp/smart_0.jsonl 400 facts
//
// The state text is built from the recorded snapshot ONLY, by the game's own layaFormatState
// (loaded from the game file), at the chosen prompt level (verdict, facts or raw, see
// measure_pilots.js). The recorded decision and the situation label are used only to score the
// answer, never to write the prompt. An earlier version of this script chose its sentence from
// the situation label (hyper, dodge, brake), which handed the model the answer; any figure from
// that version should be discarded.
//
// Label: smartPilot's keys mapped onto the four actions of the prompt:
//   hyper -> hyperspace; left+thrust -> turn_left_and_thrust; right+thrust -> turn_right_and_thrust;
//   anything else (aim, turn only, brake) -> stay_and_fire.
// The mapping is coarse (a brake is thrust without a turn, and has no option), so the per-situation
// rows matter more than the total. The majority-class rate is printed as the baseline to beat.

const fs = require('fs');
const path = require('path');
const { loadGame } = require('./lib/load_game');

const logFile = process.argv[2] || '/tmp/smartPilot_0.jsonl';
const limit = Number(process.argv[3] || 400);
const level = process.argv[4] || 'facts';
const endpoint = process.argv[5] || 'http://127.0.0.1:8700/v1/systemone';
const gameFile = process.argv[6] || path.join(__dirname, '../../asteroids.html');
const onlySituations = process.argv[7] && process.argv[7] !== 'all' ? process.argv[7].split(',') : null;   // e.g. dodge,hyper to enrich the rare cases
// Option wording: by default the one that goes with the level (verdict text for verdict, neutral for the others).
// Setting it separately crosses state text and option text (the 2x2 that tells which of the two matters).
const options = process.argv[8] || (level === 'verdict' ? 'verdict' : 'neutral');
if (!['verdict', 'neutral'].includes(options)) { console.error('options must be verdict or neutral'); process.exit(2); }
if (!['verdict', 'facts', 'raw'].includes(level)) { console.error('level must be verdict, facts or raw'); process.exit(2); }

const game = loadGame(gameFile)(`
  return {
    text: snap => { layaPromptLevel = '${level}'; return layaFormatState(snap); },
    // What the original verdict sentence for the same snapshot tells the model to do (the code's rule).
    verdictText: snap => { layaPromptLevel = 'verdict'; return layaFormatState(snap); },
    questions: ${options === 'verdict' ? 'LAYA_QUESTIONS' : 'LAYA_QUESTIONS_NEUTRAL'},
  };
`);

// The action a verdict sentence spells out: Fatal -> hyperspace, "turn left/right and thrust" -> that, Safe -> stay_and_fire.
function impliedAction(text) {
  if (/Fatal collision emergency/.test(text)) return 'hyperspace';
  const m = /turn (left|right) and thrust/.exec(text);
  return m ? `turn_${m[1]}_and_thrust` : 'stay_and_fire';
}

function mapExpertAction(rec) {
  const d = rec.decision;
  if (d.hyper || rec.situation === 'hyper') return 'hyperspace';
  if (d.left && d.thrust) return 'turn_left_and_thrust';
  if (d.right && d.thrust) return 'turn_right_and_thrust';
  return 'stay_and_fire';
}

async function evaluate() {
  if (!fs.existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
  const all = lines.map(l => JSON.parse(l)).filter(r => game.text(r.snapshot) && (!onlySituations || onlySituations.includes(r.situation)));
  const stride = Math.max(1, Math.floor(all.length / limit));   // evenly spaced, not the first N (those are early-game "stay" ticks)
  const sample = all.filter((_, i) => i % stride === 0).slice(0, limit);

  console.log(`Evaluating ${sample.length} records, level='${level}', options='${options}', against ${endpoint}...`);

  const classes = {};
  const rule = { total: 0, agree: 0, byAction: {} };   // agreement with the verdict sentence's own advice
  let correct = 0;
  const sitStats = {};
  const confusion = {};
  const latencies = [];

  for (const rec of sample) {
    const expert = mapExpertAction(rec);
    classes[expert] = (classes[expert] || 0) + 1;
    const t0 = performance.now();
    let data;
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: game.text(rec.snapshot), questions: game.questions }),
      });
      data = await resp.json();
    } catch (e) {
      console.error('request failed:', e.message);
      continue;
    }
    latencies.push(performance.now() - t0);
    const predicted = data.answers?.action?.choice;
    const ok = predicted === expert;
    if (ok) correct++;
    const sit = rec.situation || 'unknown';
    sitStats[sit] = sitStats[sit] || { total: 0, ok: 0 };
    sitStats[sit].total++;
    if (ok) sitStats[sit].ok++;
    const implied = impliedAction(game.verdictText(rec.snapshot));
    rule.total++;
    rule.byAction[implied] = rule.byAction[implied] || { total: 0, agree: 0 };
    rule.byAction[implied].total++;
    if (predicted === implied) { rule.agree++; rule.byAction[implied].agree++; }
    const key = `${expert} -> ${predicted}`;
    confusion[key] = (confusion[key] || 0) + 1;
  }

  const n = sample.length;
  const majority = Math.max(...Object.values(classes));
  latencies.sort((a, b) => a - b);
  console.log('\n================ OFFLINE EVALUATION RESULTS ================');
  console.log(`Level: ${level}   options: ${options}   records: ${n}`);
  console.log(`Accuracy:            ${correct}/${n} (${(100 * correct / n).toFixed(1)}%)`);
  console.log(`Majority baseline:   ${majority}/${n} (${(100 * majority / n).toFixed(1)}%)   labels: ${JSON.stringify(classes)}`);
  console.log(`Median latency:      ${latencies.length ? latencies[Math.floor(latencies.length / 2)].toFixed(1) : 'n/a'} ms`);
  console.log('By situation (smartPilot):');
  for (const [sit, st] of Object.entries(sitStats)) console.log(`  ${sit.padEnd(8)} ${st.ok}/${st.total} (${(100 * st.ok / st.total).toFixed(1)}%)`);
  console.log(`Agreement with the action the verdict sentence implies (the code's rule): ${rule.agree}/${rule.total} (${(100 * rule.agree / rule.total).toFixed(1)}%)`);
  for (const [a, v] of Object.entries(rule.byAction)) console.log(`  rule says ${a.padEnd(22)} ${v.agree}/${v.total} (${(100 * v.agree / v.total).toFixed(1)}%)`);
  console.log('Confusion (expert -> model):');
  for (const [k, v] of Object.entries(confusion).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log('============================================================');
  process.exit(0);   // the game script starts a health-check interval that would keep Node alive
}

evaluate();
