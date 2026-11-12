# Write-up plan: three-part LinkedIn series

Working plan for the series "A journey in code modernization with Bob". The outlines are in [OUTLINES.md](OUTLINES.md). The finished LinkedIn texts go in [`linkedin/`](linkedin/).

## 1. Decisions taken

| Topic | Decision |
|-------|----------|
| Series title (working) | A journey in code modernization with Bob: from 6502 assembly to an AI autopilot |
| Platform, first | LinkedIn articles (technical view, not a marketing view) |
| Platform, later | IBM Developer. Keep a platform-neutral master text so the port is a copy edit, not a rewrite |
| Part 1 stance | Version 1 was produced by Bob, with no manual port. The article reports what worked and what did not when an LLM ports legacy code |
| Part 3 scope | Feasibility only (decided 2026-11-10): a pilot built on a decision model (`laya-mlx`) is possible and can play the game. First numbers and gameplay observations are reported with their limits. No verdict on rules against models: the Laya pilot is not optimized. Optimization (latency, prompts, questions) and other models (Kev, Jev, CLM, d1) are a possible Part 4 |
| Numbers | All pilots re-measured with the same script, ticks, seeds and metric definitions before publication (see section 3) |
| Voice pass | Every article goes through the `linkedin-humanizer` skill at the end, after the technical review |

## 2. Series structure

| Part | Working title | Versions | Core claim |
|------|---------------|----------|------------|
| 1 | Porting a 1979 arcade game with an LLM: what worked, what did not | original to v1, v1 to v2 | An LLM translates structure well and fails on conventions the source never states (radix, BCD, signs). Only running the code against the source found the errors |
| 2 | Once the code is modern, a game becomes something a program can play | v2, v3 (`smartPilot`) | Exposing state as data and decisions as five booleans turned the port into an agent environment for about 170 lines. A tiny rule is strong; a lookahead is much stronger |
| 3 | From rules to a decision model: a model can fly the ship | v3 (`layaPilot`) | A pilot built on a decision model is possible and can play the game. How it is wired, what it does on screen, first numbers, and what has not been tried yet. No verdict on rules against models |

## 3. Number integrity (status: N1 to N5 done on 2026-11-10; the lag-1 Laya run is the only open item)

The goal was one table of pilots measured the same way. The check found three problems (3.2), which are now fixed. The final numbers are in 3.1. Raw files and definitions: [`data/README.md`](data/README.md).

### 3.1 Final numbers (one script, one loss definition, one flying-time definition)

Flying time is the ticks in the `playing` state. A loss is a call that removes a life, counted in the game code.

Long run, 8 x 1,200,000 ticks (about 42 flying hours each):

| Pilot | Losses / hour (range) | Points / minute | Thrust | Hyperspace / hour | Games ended | Causes |
|-------|-----------------------|-----------------|--------|-------------------|-------------|--------|
| `simplePilot` | 69.1 (66.9 to 70.7) | 9,527 | 0.0% | 0.0 | 217 (median score 69,610) | rock 1,763, saucer torpedo 1,092, saucer body 45 |
| `smartPilot` | 5.7 (3.5 to 7.1) | 13,992 | 1.7% | 29.1 | 0 | hyperspace 123, rock 109, saucer body 7 |

Short run, all three pilots, 12 x 8,000 ticks (about 0.41 flying hours each), Laya with `--lag=6`:

| Pilot | Losses | Losses / hour | Points / minute | Thrust | Hyperspace / hour | Causes |
|-------|--------|---------------|-----------------|--------|-------------------|--------|
| `simplePilot` | 14 | 33.6 | 7,991 | 0.0% | 0.0 | rock 12, saucer torpedo 2 |
| `smartPilot` | 2 | 4.9 | 10,493 | 1.4% | 14.6 | hyperspace 2 |
| `layaPilot` | 22 | 53.3 | 10,096 | 3.8% | 19.4 | rock 22 |

Exact tests on loss counts: simple vs smart p = 0.0042; smart vs laya p < 0.0001; simple vs laya p = 0.18 (not distinguishable). Laya latency: median 137 ms, 95th percentile 156 ms during the run; 91 to 104 ms when idle.

What changed against the old docs:
- The old `simplePilot` 43.9 and `smartPilot` 7.7 were the 6 x 20,000 tick figures, mislabelled as 8 x 1,200,000. The long run gives 69.1 and 5.7. The ratio is about 12 times, not 6.
- "Laya dodges saucer torpedoes (2 losses against 7)" is not supported: Laya had 0 torpedo losses, simple had 2, in a run too short to show a saucer effect.
- "Laya never presses hyperspace" is false: 19.4 per hour.
- "Laya answers in about 11 ms, sub-frame" is withdrawn. Measured 90 to 140 ms (5 to 8 ticks). Why the earlier figure was 7.4 to 13.9 ms is unknown (different checkpoint, machine state, or an early measurement). **Open question for the author.**
- Do not compare rows from the two runs with each other.

### 3.2 Problems found (all fixed)

1. **The published table does not match the text around it.** [`VERSION_3.md`](../VERSION_3.md#3-how-well-it-plays) says `simplePilot` and `smartPilot` ran for 8 starting points of 1,200,000 ticks, but the table values (43.9, 7.7, 9,017, 11,842) are the 20,000 tick, 6 seed values from [`LAYA.md`](../LAYA.md#7-empirical-performance--benchmark-results). The long-run values are different: `simplePilot` is worse (68.8) and `smartPilot` is better (5.4) than documented. The ratio between them grows from about 6 times to about 13 times. The article must use the long run and the docs need a correction.
2. **Two scripts, two definitions of "losses per hour".** `measure_pilots.js` divides by all ticks (`tot.ticks`). `measure_laya.js` divides by ticks spent in the `playing` state (`tot.play`). They differ whenever games end and restart, which happens for `simplePilot`. `layaPilot` can only be measured by `measure_laya.js`, so its row is not comparable with the others until the metric is unified.
3. **Laya was measured on a much shorter run.** 6 x 20,000 ticks is 33 minutes of play, against 44 hours for the long run. Few events means a wide margin of error. Also, `measure_laya.js` yields to the Node event loop every 4 ticks for the HTTP call, so the model's decisions are applied on a different cadence than in the browser. The article must say how this was simulated.

### 3.3 Work items

| # | Task | Status |
|---|------|--------|
| N1 | One definition for losses per hour (play ticks only) in one script | Done: `scripts/dev/measure_pilots.js` |
| N2 | `layaPilot` runnable from that script | Done (with `--lag`, answer cache, fallback abort) |
| N3 | Re-run all three pilots | Partly done, closed by decision on 2026-11-11. Rule pilots: full budget (8 x 1,200,000 ticks). Laya: 12 x 8,000 ticks only, because the full budget would take days at about 90 ms per answer. The articles use this data and state its limits: see [FINDINGS.md](FINDINGS.md) |
| N4 | Correct `VERSION_3.md`, `LAYA.md`, `DECISION_MODELS.md`, `LAYA_IMPLEMENTATION.md` | Done 2026-11-10. Each table now says which run produced it |
| N5 | Record machine, Node, Python, model id, commit | Done: JSON metadata and [`data/README.md`](data/README.md) |

Everything the articles quote must trace to a file in `docs/articles/data/` or to a command in the README.

## 4. Part 1 evidence still to collect

Part 1 claims that Bob ported the code. The repo shows the result, not the process. These facts must come from the author, because they are not in the files and must not be guessed:

| # | Fact needed | Why |
|---|-------------|-----|
| E1 | Which Bob mode and model produced v1, and how many sessions and prompts it took | Readers will ask how to reproduce it |
| E2 | The prompts used (or a representative sample), including how the source files were given to Bob | The article is about method |
| E3 | Which parts Bob got right on the first try | The "what worked" half |
| E4 | Which errors Bob made that were found later, and who found them (a script, a human, Bob itself) | The "what did not" half |
| E5 | Wall-clock time and effort for v1, and for the v2 fixes | A grounded cost statement |
| E6 | Whether Bob's attribution data can be shown. The repository has git notes under `refs/notes/bob` recording which edits came from the tool | Possible evidence for the AI-authored share of the code |

Evidence already in the repo (see [`VERSION_1.md`](../VERSION_1.md#known-deviations-from-the-original) and [`VERSION_2.md`](../VERSION_2.md#1-behavior-restored-from-the-original)):

- Three constants read with the wrong radix (`.RADIX 16`).
- The BCD score threshold read as 3,000 instead of 30,000, and the same error again at 35.
- A wrong direction-change interval (256 frames against 128).
- Additions that were not in the original (particles, fade-in), and a wave-clear delay of 90 against 127.
- Two regressions introduced while fixing v1 (two-player switch, aim threshold), found by running the code.

Two statements in the repo describe v1 as hand-made and now contradict the series premise: [`VERSION_1.md`](../VERSION_1.md) ("translated by hand", "careful manual port"), [`ARCHITECTURE.md`](../ARCHITECTURE.md) ("ported by hand" in the diagram alt text), plus the README and [`versions/v1/README.md`](../../versions/v1/README.md) ("manual port"). They need rewording before publication. This is task D1 below.

A cautious wording is needed for the article: the errors are interesting because they are the kind a human porter also makes. The article should not claim that an LLM is worse or better than a person without a comparison, which this series does not have.

## 5. Visual assets

### 5.1 Diagrams (draw.io, per project rules)

Sources go in [`../diagrams/`](../diagrams/) as `.drawio` with a `.png` export. Existing ones are reused.

| ID | Diagram | Part | Status |
|----|---------|------|--------|
| G0 | 1979 cabinet to 2026 browser (replaces the ASCII box in Part 1) | 1 | Done |
| G1 | 6502 source set mapped to the single JavaScript file | 1 | Done |
| G2 | Hardware to browser mapping (vector beam to canvas, analog sound to Web Audio, 6502 clock to a fixed 60 Hz step) | 1 | Done |
| G3 | Where the errors came from: translation, convention, and verification gaps | 1 | Done |
| G4 | Validation harness (headless `vm` sandbox, scripts, seeds) | 1 and 2 | Done |
| G5 | v1 architecture | 1 | Exists: `v1-architecture` |
| G6 | v1 game states | 1 | Exists: `v1-game-states` |
| G7 | State to decision loop | 2 | Exists: `v2-state-decision-loop` |
| G7b | Three pilots behind one selector, Laya round trip and fallback | 3 | Exists: `v3-pilots` |
| G8 | Lead-aim geometry for `simplePilot` | 2 | Dropped |
| G9 | `smartPilot` decision flow | 2 | Done |
| G10 | Candidate manoeuvres (16 headings x 5 thrust lengths) | 2 | Done |
| G11 | Key to physics proof loop (`check_thrust_physics`) | 2 | Done |
| G12 | System One against System Two | 3 | Done |
| G13 | End-to-end sequence, browser and MLX server | 3 | Done |
| G14 | Responsibility split between model and code | 3 | Done (as table image `p3-responsibility-split`) |
| G15 | Fallback state machine (server offline to `smartPilot`) | 3 | Done |
| G16 | Where rules and models each win (decision matrix) | 3 | Dropped |

#### Table images

LinkedIn articles have no table support, so every markdown table in the articles is exported as a PNG. Specs are in [`linkedin/tables.json`](linkedin/tables.json); [`make_article_tables.js`](../../scripts/dev/make_article_tables.js) builds one `.drawio` per table (`node scripts/dev/make_article_tables.js docs/articles/linkedin/tables.json docs/diagrams`), then each is exported to PNG with the draw.io CLI. All are Done and referenced from the articles.

| ID | Table | Part |
|----|-------|------|
| `p1-error-catalogue` | Eight v1 fidelity errors | 1 |
| `p1-bug-vs-enhancement` | Bugs against intentional enhancements | 1 |
| `p2-baselines` | Idle, random and `simplePilot` baselines | 2 |
| `p2-long-run` | `simplePilot` against `smartPilot`, long run | 2 |
| `p2-loss-causes` | What killed each pilot | 2 |
| `p3-model-candidates` | Candidate decision models | 3 |
| `p3-responsibility-split` | Model decides, code decides | 3 |
| `p3-short-run-results` | Three pilots, 12 short games | 3 |
| `p3-behaviour` | Behaviour counters, `smartPilot` against `layaPilot` | 3 |
| `p3-not-tried` | Open questions | 3 |

Any edit to a table in an article must be made in `tables.json` and re-exported.

### 5.2 Charts

Dropped 2026-11-11. The table images already carry the numbers; none of the charts were referenced in the article drafts.

### 5.3 Code snippets

Short, each under about 12 lines, taken from the real files so line references can be checked.

LinkedIn articles have no code blocks, so every snippet is exported as a PNG in the Carbon Gray 100 theme (IBM Plex Mono). Specs are in [`linkedin/snippets.json`](linkedin/snippets.json); [`make_snippet_images.js`](../../scripts/dev/make_snippet_images.js) renders them with a local Google Chrome (`node scripts/dev/make_snippet_images.js docs/articles/linkedin/snippets.json docs/diagrams`), producing `docs/diagrams/snippet-<id>.png`. All 11 are Done and referenced from the articles. Any edit to a snippet must be made in `snippets.json` and re-exported. The `bash` blocks under "Commands to Reproduce" stay as text.

| Part | Snippet |
|------|---------|
| 1 | `.RADIX 16` and `LDA I,10.` next to the wrong and right JavaScript constant |
| 1 | BCD threshold: `CMP I,30` on `SCORE+1` |
| 1 | The two-player switch regression and the one-line fix |
| 2 | `snapshot()` output shape |
| 2 | The interception equation and its solver |
| 2 | The five-boolean controller contract |
| 3 | The `/v1/systemone` request and response |
| 3 | Toroidal shortest-path offset and time to collision |
| 3 | The mapping from model choice to keys |

### 5.4 Clips

The game is deterministic (bit-exact `RAND`, fixed seeds), so every clip can be regenerated from a pilot name, a seed and a tick range.

One clip per article, all recorded with QuickTime screen capture from a browser window. LinkedIn supports native video upload (75 KB to 5 GB, 3 s to 15 min, 256x144 to 4096x2304, 10 to 60 fps).

| ID | Clip | What to show | Part | Length | How | Filename |
|----|------|-------------|------|--------|-----|----------|
| C-A | Author plays v1 | A human game on `versions/v1/asteroids.html`: the game looks right, plays correctly | 1 | ~15 s | Author plays, QuickTime records the browser window | `docs/articles/linkedin/clip-part1-gameplay.mov` |
| C-B | `simplePilot` in action | `simplePilot` running in v2 or the working copy: rotates, fires, never moves, eventually gets hit | 2 | ~15 s | Open the page, switch to Simple, QuickTime records | `docs/articles/linkedin/clip-part2-gameplay.mov` |
| C-C | `smartPilot`, then `layaPilot` | One game played by `smartPilot`, then after a while switched to `layaPilot` with the selector | 3 | ~42 s | Open the page, start with Smart, switch to Laya with the Laya server running, QuickTime records | `docs/articles/linkedin/clip-part3-gameplay.mov` |

Filenames use `.mov` (QuickTime native). If converted to MP4 for upload, keep both with the same base name. Both extensions are in `.gitignore`: clips are too large for git; keep locally and upload to LinkedIn directly.

Old clips V1 to V9 dropped 2026-11-11 in favour of one clip per article.

## 6. Work breakdown

Order matters: numbers first, because Parts 2 and 3 quote them.

| # | Task | Depends on | Part |
|---|------|------------|------|
| D1 | Reword "by hand" and "manual port" in the repo docs to match how v1 was made | E1 | 1 | Done 2026-11-11. The old phrases were already gone; `versions/v1/README.md` updated to name Bob explicitly. |
| N1 to N5 | Number integrity (section 3.3) | none | 2, 3 |
| E1 to E6 | Collect Part 1 evidence from the author | none | 1 |
| G1 to G16 | Diagrams | outlines | all |
| C-A, C-B, C-C | Clips (one per article) | none | all |
| W1 | Draft Part 1 | E1 to E6, G1 to G6 | 1 |
| W2 | Draft Part 2 | G7 to G11 | 2 |
| W3 | Draft Part 3 | G12 to G16 | 3 |
| T1 | Technical review: every number, snippet and link checked against the repo | W1 to W3 | all | Done 2026-11-12. Fixed: source set size (15 files, 5,511 lines), BCD digit description and `CMP`/`BCS` snippet, `CPY I,35`, `simplePilot` physics check tick count (257,464), latency arithmetic in Part 3. Not checked: author-supplied facts (session times, prompts) and the claim that small saucers appeared after two waves. |
| H1 | Humanizer pass (`linkedin-humanizer`, default forensic plus strict mode), then audit mode | T1 | all |
| P1 | Final formatting for LinkedIn (cover image, snippet images, clip upload) | H1 | all |
| P2 | Adapt for IBM Developer | P1 | all |

## 6b. Part 3 data decision and optimization backlog (2026-11-10)

Because the author judged the 12 x 8,000 tick result insufficient for a verdict, Part 3 claims feasibility only (see [OUTLINES.md](OUTLINES.md)). Points are the headline measure for Part 3. The quick single-seed look (seed 0, 3,000 / 6,000 / 9,000 ticks, [data/README.md](data/README.md#single-seed-three-budgets-points)) gave:

| Budget | `simplePilot` | `smartPilot` | `layaPilot` |
|--------|---------------|--------------|-------------|
| 3,000 ticks | 6,560 | 7,270 | 6,970 |
| 6,000 ticks | 12,190 | 17,900 | 12,910 |
| 9,000 ticks | 16,810 | 25,780 | 23,260 |

It is one game, so it supports "Laya plays and scores in the same range as the other pilots" and nothing more. For the article, a table like this is fine as an illustration if it carries that caveat.

Backlog for a possible Part 4 (hypotheses, none tested yet):

| # | Question | How to test |
|---|----------|-------------|
| O1 | Where do the 85 to 105 ms go? | **Done 2026-11-10** ([data/README.md](data/README.md#laya-latency-tests-o1-and-o2-2026-11-10)). It is the model forward pass (88 ms in-process, HTTP adds a few ms), it grows with text length, and the 322M checkpoint takes 27 to 35 ms. Still open: the documented 7.4 ms was not reached |
| O2 | Is the GPU the right device for such a small model? | **Done.** Yes: CPU is 3 to 4 times slower. fp16 is the fastest precision; `compile` and `cache_prompts` do not help |
| O2b | Does the faster checkpoint (322M) fly as well? | Not done. Run the single seed points test with `--model aac6fef/laya-multilingual-mlx` on the server, and with the shortened question |
| O3 | Does the state wording change the answers or the speed? | Speed: partly answered (shorter question text 88 to 66 ms). Answers in play: not tested |
| O4 | Do different questions or actions help? | Add `turn_left_only`, `turn_right_only`, `thrust_only` (already described in `LAYA.md` section 5); change the criteria text |
| O5 | Does a lower lag change results? | `--lag=1` with a faster model or smaller prompt; the 669 s per seed cost at 85 ms makes this impractical until O1 and O2 are done |
| O6 | Is a safety veto worth it? | The shielded mode planned in `LAYA.md` Phase 4 |

## 7. Style rules for the articles

- Technical reader first. Say what was measured, how, and what the limits are.
- Every claim about performance carries its run: seeds, ticks, date.
- State failures plainly. Part 3 reports that the decision model flies, and also that it loses ships to rocks and reacts late; it does not claim more than the data supports.
- No em dashes anywhere (project rule). Use commas, colons, semicolons or parentheses.
- Do not invent process details for Bob (prompts, timings, counts). Use only facts from the author or from the repo.
- Keep the repo as the source of truth: each article ends with the commands to reproduce its numbers.

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| The long-run numbers change the story (they already did: the ratio between pilots roughly doubled) | Re-measure first (N1 to N5), then write |
| The Laya long run takes too long or the model degrades over time | Part 3 uses the short run only and says so. A longer comparison waits for the latency work (section 6b) |
| Readers take Part 3 as "models are worse than rules" | The article states that Laya is untuned and the claim is feasibility only |
| Part 1 sounds like an advertisement | Lead with the failures; show the verification that caught them |
| Original source licensing | The 6502 source is not in this repository (no licence file upstream). Quote only short snippets with a link, as the README already does |
| Platform limits for code and video on LinkedIn | Use images for code, check video handling before production |
