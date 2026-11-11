# Laya Autopilot Implementation Guide

This document details the software architecture, data flow, and runtime implementation of the Laya neural autopilot (`layaPilot`) for Asteroids on Apple Silicon.

For model benchmarking and serving specifications, see [`docs/LAYA.md`](docs/LAYA.md). For decision model taxonomy, see [`docs/DECISION_MODELS.md`](docs/DECISION_MODELS.md).

---

## 1. System Architecture & End-to-End Flow

The Laya autopilot combines a high-speed 60 Hz deterministic game loop running in the browser with an asynchronous local neural decision server running on Apple Silicon Metal via the MLX framework.

```text
+-----------------------------------------------------------------------------------------+
| Browser / Game Engine (asteroids.html @ 60 Hz)                                          |
|                                                                                         |
|  1. Physics & Sensors     2. Situation Prompt       3. Asynchronous IPC                 |
|   +------------------+     +-------------------+     +------------------------------+   |
|   | Toroidal World   | --> | layaFormatState() | --> | fetch(/v1/systemone)         | --+
|   | Wrap & Distance  |     | Threat & TTC text |     | (Non-blocking, cached state) |   | |
|   +------------------+     +-------------------+     +------------------------------+   | |
|                                                                     ^                   | |
|                                                                     | ~90-140 ms latency| |
|  4. Low-Level Actuation                                             v                   | |
|   +---------------------------------------------------------------------------------+   | |
|   | * hyperspace            -> pulsed hyper key                                     |   | |
|   | * turn_left/right_thrust-> rotate + thrust vectoring                            |   | |
|   | * stay_and_fire         -> spPickTarget() geometric lead aiming & torpedo fire  |   | |
|   +---------------------------------------------------------------------------------+   | |
+-----------------------------------------------------------------------------------------+ |
                                                                                            |
            HTTP JSON (State text + Typed Choice Schema)                                    |
                                                                                            v
+-----------------------------------------------------------------------------------------+
| Local Python MLX Server (scripts/dev/laya_server.py on localhost:8700)                  |
|                                                                                         |
|   +---------------------------+       +---------------------------------------------+   |
|   | SystemOneHandler.do_POST  | ----> | Laya-MLX Neural Inference (Metal GPU/ANE)   |   |
|   | Parses state & questions  |       | Zero-shot typed classification + confidence |   |
|   +---------------------------+       +---------------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

---

## 2. State Extraction & Situation Prompting

On every tick, [`layaFormatState(s)`](asteroids.html:2399) converts the raw simulation snapshot into structured natural language:

### 2.1 Toroidal Coordinate Geometry
The Asteroids coordinate space spans $8192 \times 6144$ units with wraparound boundaries. Offsets are calculated using shortest-path wrapping:

```javascript
let dx = item.x - sh.x;
let dy = item.y - sh.y;
if (dx > 4096) dx -= 8192; else if (dx < -4096) dx += 8192;
if (dy > 3072) dy -= 6144; else if (dy < -3072) dy += 6144;
const dist = Math.hypot(dx, dy);
```

### 2.2 Relative Bearing and Closing Velocity
The heading of the target relative to the ship nose is normalized to $[-180^\circ, +180^\circ]$:

```javascript
const itemBearingDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
let rel = itemBearingDeg - shipAngleDeg;
while (rel > 180) rel -= 360;
while (rel < -180) rel += 360;
```

Closing velocity measures whether the object is on a collision vector:

```javascript
const relVx = (item.vx || 0) - (sh.vx || 0);
const relVy = (item.vy || 0) - (sh.vy || 0);
const closing = -Math.round((dx * relVx + dy * relVy) / (dist || 1));
```

### 2.3 Time-To-Collision (TTC) & Classification
Objects approaching with $\text{closing} > 0$ within a proximity radius of 1200 units are evaluated for Time-To-Collision ($\text{TTC} = \frac{\text{dist}}{\text{closing}}$):

1. **Fatal Emergency ($\text{TTC} \le 8$ ticks)**:
   ```text
   Situation: Fatal collision emergency. Unavoidable impact with <type> in <N> ticks. Emergency hyperspace jump required.
   ```
2. **Tactical Hazard ($\text{TTC} \le 60$ ticks)**:
   ```text
   Situation: Danger. <type> is incoming from the <left|right> on a collision path in <N> ticks. Pilot needs to turn <right|left> and thrust to dodge.
   ```
3. **Safe Operating Context**:
   ```text
   Situation: Safe. No collision danger. Ship speed is <V> px/tick. Target <type> is <D> units away. Ready to aim and shoot.
   ```

---

## 3. Structured Decision Schema

The prompt is submitted alongside [`LAYA_QUESTIONS`](asteroids.html:2461), a structured typed schema defining discrete actions and behavioral criteria:

```javascript
const LAYA_QUESTIONS = {
  action: {
    type: 'choice',
    instructions: 'Determine the required flight action for the spaceship.',
    criteria: {
      stay_and_fire: 'Safe situation. Aim weapons towards target rock and fire.',
      turn_left_and_thrust: 'Asteroid on right side. Turn left and thrust away to dodge.',
      turn_right_and_thrust: 'Asteroid on left side. Turn right and thrust away to dodge.',
      hyperspace: 'Fatal emergency when collision is unavoidable. Hyperspace escape jump.'
    }
  }
};
```

---

## 4. Asynchronous Non-Blocking HTTP Client

In [`asteroids.html`](asteroids.html:2478), [`layaPilot(s)`](asteroids.html:2478) executes inside the browser's 60 Hz animation loop.

### 4.1 Non-Blocking Dispatch & State Reuse
To avoid freezing the rendering frame, `fetch()` operations run asynchronously:
* When `!layaPending`, a new POST request is sent to `http://127.0.0.1:8700/v1/systemone`.
* `layaPending` is flagged `true` until the promise completes.
* While the HTTP request is in-flight, `layaPilot(s)` continues actuating the ship using the cached `layaLastAction` state.

```javascript
fetch(LAYA_ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state: stateText, questions: LAYA_QUESTIONS })
}).then(r => {
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}).then(data => {
  const ans = data.answers?.action;
  const choice = ans?.choice || 'stay_and_fire';
  const prob = ans?.probabilities?.[choice] ?? ans?.confidence ?? 1;
  const conf = ans?.confidence ?? prob;
  layaLastAction = { choice, prob, conf, isFallback: false, ... };
});
```

### 4.2 Latency Profiling
Execution latency is tracked via `performance.now()`. A 30-frame rolling window (`layaLatencies`) computes the average round-trip latency, displayed in real-time in the browser's Decision panel.

---

## 5. Local Python Server Backend

The backend [`scripts/dev/laya_server.py`](scripts/dev/laya_server.py:1) hosts the MLX model:

### 5.1 Service Endpoints
* `POST /v1/systemone` or `/systemone`: Receives JSON `{ state, questions }`, executes `agent.predict(state, questions)`, and returns the choice probabilities.
* `GET /health` or `/`: Health check returning server status and model ID.
* `GET /v1/models` or `/models`: Model catalog metadata.

### 5.2 Server Execution
The server runs on port 8700 by default:
```bash
.venv/bin/python scripts/dev/laya_server.py --port 8700 --model aac6fef/laya-mlx
```

---

## 6. Low-Level Ship Actuation & Hybrid Targeting

Once a discrete decision is received from the model, [`layaPilot(s)`](asteroids.html:2561) maps it to virtual keystrokes:

### 6.1 Maneuver Mappings
* **`hyperspace`**: Triggers `hyper = s.frame % 2 === 0` to activate the emergency jump.
* **`turn_left_and_thrust`**: Sets `left = true`, `thrust = true`, and pulses `fire = s.frame % 2 === 0`.
* **`turn_right_and_thrust`**: Sets `right = true`, `thrust = true`, and pulses `fire = s.frame % 2 === 0`.

### 6.2 Geometric Aiming for `stay_and_fire`
When in `stay_and_fire`, low-level tactical gunnery is delegated to [`spPickTarget(s, null)`](asteroids.html:2580):

```javascript
const target = spPickTarget(s, null);
if (target) {
  const aimAt = spAngle(target.ax, -target.ay);
  const d = spSigned(aimAt - sh.angle);
  left = d > 3;
  right = d < -3;
  const aimed = Math.abs(d) <= 3;
  fire = aimed && s.frame % 2 === 0;
}
```

This hybrid separation allows the neural model to handle high-level situation awareness (evasion vs attack) while the local math routines handle sub-pixel lead aiming.

---

## 7. Fault Tolerance, Offline Fallback & Auto-Recovery

If the Python server is offline or encounters an error, [`layaPilot(s)`](asteroids.html:2528) provides automated recovery:

1. **Automatic Error Catching**: Catches connection failures, updates `layaServerOnline = false`, and sets `layaLastAction.isFallback = true`.
2. **Seamless Fallback**: When `isFallback` is active, control is automatically delegated to [`smartPilot(s)`](asteroids.html:2550) (the deterministic 90-tick lookahead simulation).
3. **Throttled Reconnection**: Re-connection attempts are throttled to once every 3000 ms (`now - layaLastFailTime > 3000`) to avoid flooding the browser network stack.
4. **Resumption**: Once the local server becomes reachable, neural decision control resumes without requiring a game reload.
