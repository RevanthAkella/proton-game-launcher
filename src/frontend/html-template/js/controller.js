/**
 * controller.js — Controller → KeyboardEvent bridge
 *
 * Two input sources:
 *
 * 1. **Browser Gamepad API** (primary) — polls navigator.getGamepads() via
 *    requestAnimationFrame and translates standard-mapping button presses
 *    into KeyboardEvents.  Works with any gamepad the browser recognises
 *    (Bluetooth, USB, etc.) without requiring any backend support.
 *
 * 2. **WebSocket** (fallback) — receives { type: "controller", action }
 *    messages from the SDL2 backend bridge and dispatches the same
 *    KeyboardEvents.  Useful when SDL2 is running on the backend.
 *
 * The full action → key mapping:
 *
 *   navigate-up    → ArrowUp
 *   navigate-down  → ArrowDown
 *   navigate-left  → ArrowLeft
 *   navigate-right → ArrowRight
 *   confirm        → Enter
 *   back           → Escape
 *   start          → Enter
 *   menu           → m
 *   shoulder-left   → PageUp
 *   shoulder-right  → PageDown
 */

// ── Action → KeyboardEvent.key mapping ───────────────────────────────────

/** @type {ReadonlyMap<string, string>} */
const ACTION_KEY_MAP = new Map([
  ["navigate-up",    "ArrowUp"],
  ["navigate-down",  "ArrowDown"],
  ["navigate-left",  "ArrowLeft"],
  ["navigate-right", "ArrowRight"],
  ["confirm",        "Enter"],
  ["back",           "Escape"],
  ["start",          "Enter"],
  ["menu",           "m"],
  ["shoulder-left",   "PageUp"],
  ["shoulder-right",  "PageDown"],
  ["trigger-left",   ""],
  ["trigger-right",  ""],
]);

// ── Standard Gamepad button index → action name ─────────────────────────
// W3C Standard Gamepad mapping:
//   0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT,
//   8=Back, 9=Start, 10=L3, 11=R3,
//   12=DpadUp, 13=DpadDown, 14=DpadLeft, 15=DpadRight, 16=Guide
//
// NOTE: Buttons 6/7 (LT/RT) are analog triggers — NOT mapped here because
// they can have resting drift that causes constant false presses. Shoulder
// buttons (4/5, LB/RB) already cover shoulder-left/right actions.

/** @type {ReadonlyMap<number, string>} */
const GAMEPAD_BTN_MAP = new Map([
  [0,  "confirm"],          // A / Cross
  [1,  "back"],             // B / Circle
  [2,  "menu"],             // X / Square
  [3,  "menu"],             // Y / Triangle
  [4,  "shoulder-left"],     // LB / L1
  [5,  "shoulder-right"],    // RB / R1
  [6,  "trigger-left"],
  [7,  "trigger-right"],
  [8,  "back"],             // Back / Select
  [9,  "start"],            // Start / Options
  [12, "navigate-up"],      // D-pad Up
  [13, "navigate-down"],    // D-pad Down
  [14, "navigate-left"],    // D-pad Left
  [15, "navigate-right"],   // D-pad Right
  [16, "menu"],             // Guide / Xbox / PS button
]);

const STICK_THRESHOLD   = 0.5;
const AXIS_REPEAT_MS    = 180;
const TRIGGER_THRESHOLD = 0.15;

// ── Dispatch helper ───────────────────────────────────────────────────────

/**
 * Synthesise and dispatch a KeyboardEvent for the given key string.
 * Both keydown and keyup are dispatched so handlers that listen to either
 * event fire correctly.
 *
 * @param {string} key  — KeyboardEvent.key value (e.g. "ArrowUp", "Enter")
 */
function dispatchKey(key) {
  const init = {
    key,
    bubbles:    true,
    cancelable: true,
    composed:   true,
  };
  document.dispatchEvent(new KeyboardEvent("keydown", init));
  document.dispatchEvent(new KeyboardEvent("keyup",   init));
}

// ── Browser Gamepad API polling ──────────────────────────────────────────

/** @type {Map<number, boolean[]>} Previous button states per gamepad index */
const _prevButtons = new Map();

/** @type {Map<number, boolean[]>} Previous analog trigger states per gamepad index (btn 6=LT, 7=RT) */
const _prevTriggers = new Map();

/** @type {Map<string, number>} Last-fired timestamp for axis actions */
const _axisLastFired = new Map();

let _polling    = false;
let _rafId      = 0;
let _started    = false;
let _connectedCount = 0;

function _startLoop() {
  if (_polling) return;
  _polling = true;
  _rafId = requestAnimationFrame(pollGamepads);
}

function _stopLoop() {
  if (!_polling) return;
  _polling = false;
  cancelAnimationFrame(_rafId);
  _prevButtons.clear();
  _prevTriggers.clear();
  _axisLastFired.clear();
}

function pollGamepads() {
  const gamepads = navigator.getGamepads?.() ?? [];

  for (const gp of gamepads) {
    if (!gp || !gp.connected) continue;

    const prev = _prevButtons.get(gp.index) ?? [];

    // ── Buttons (edge detection — fire on press, not hold) ───────────
    // Skip 6/7 (LT/RT) — handled as analog triggers below
    for (let i = 0; i < gp.buttons.length; i++) {
      if (i === 6 || i === 7) continue;
      const pressed = gp.buttons[i].pressed;
      if (pressed && !prev[i]) {
        const action = GAMEPAD_BTN_MAP.get(i);
        if (action) {
          const key = ACTION_KEY_MAP.get(action);
          if (key) dispatchKey(key);
        }
      }
    }

    // Save current button states for next frame
    _prevButtons.set(
      gp.index,
      gp.buttons.map((b) => b.pressed)
    );

    // ── Analog triggers — read from axes (Linux: axis 4=LT, axis 5=RT)
    // Range: -1.0 (released) → +1.0 (fully pressed). Normalise to 0–1.
    // Falls back to buttons 6/7 for standard-mapping gamepads (Windows/macOS).
    const prevTrig = _prevTriggers.get(gp.index) ?? [false, false];
    const triggerAxes   = [4, 5];   // axis indices
    const triggerBtnIdx = [6, 7];   // GAMEPAD_BTN_MAP keys for action lookup
    for (let t = 0; t < triggerAxes.length; t++) {
      let val = 0;
      if (gp.axes.length > triggerAxes[t]) {
        val = (gp.axes[triggerAxes[t]] + 1) / 2;  // -1..+1 → 0..1
      } else if (gp.buttons[triggerBtnIdx[t]]) {
        val = gp.buttons[triggerBtnIdx[t]].value;  // 0..1 already
      }

      const engaged = val > TRIGGER_THRESHOLD;
      if (engaged && !prevTrig[t]) {
        const action = GAMEPAD_BTN_MAP.get(triggerBtnIdx[t]);
        if (action) {
          const key = ACTION_KEY_MAP.get(action);
          if (key) dispatchKey(key);
        }
      }
      prevTrig[t] = engaged;
    }
    _prevTriggers.set(gp.index, prevTrig);

    // ── Left stick → navigation (rate-limited) ──────────────────────
    const now = Date.now();
    if (gp.axes.length >= 2) {
      const x = gp.axes[0];
      const y = gp.axes[1];

      if (Math.abs(x) > STICK_THRESHOLD) {
        const action = x < 0 ? "navigate-left" : "navigate-right";
        const key    = `${gp.index}:lx`;
        if (now - (_axisLastFired.get(key) ?? 0) >= AXIS_REPEAT_MS) {
          _axisLastFired.set(key, now);
          const k = ACTION_KEY_MAP.get(action);
          if (k) dispatchKey(k);
        }
      } else {
        _axisLastFired.delete(`${gp.index}:lx`);
      }

      if (Math.abs(y) > STICK_THRESHOLD) {
        const action = y < 0 ? "navigate-up" : "navigate-down";
        const key    = `${gp.index}:ly`;
        if (now - (_axisLastFired.get(key) ?? 0) >= AXIS_REPEAT_MS) {
          _axisLastFired.set(key, now);
          const k = ACTION_KEY_MAP.get(action);
          if (k) dispatchKey(k);
        }
      } else {
        _axisLastFired.delete(`${gp.index}:ly`);
      }
    }

    // ── Right stick → navigation (rate-limited) ─────────────────────
    if (gp.axes.length >= 4) {
      const rx = gp.axes[2];
      const ry = gp.axes[3];

      if (Math.abs(rx) > STICK_THRESHOLD) {
        const action = rx < 0 ? "navigate-left" : "navigate-right";
        const key    = `${gp.index}:rx`;
        if (now - (_axisLastFired.get(key) ?? 0) >= AXIS_REPEAT_MS) {
          _axisLastFired.set(key, now);
          const k = ACTION_KEY_MAP.get(action);
          if (k) dispatchKey(k);
        }
      } else {
        _axisLastFired.delete(`${gp.index}:rx`);
      }

      if (Math.abs(ry) > STICK_THRESHOLD) {
        const action = ry < 0 ? "navigate-up" : "navigate-down";
        const key    = `${gp.index}:ry`;
        if (now - (_axisLastFired.get(key) ?? 0) >= AXIS_REPEAT_MS) {
          _axisLastFired.set(key, now);
          const k = ACTION_KEY_MAP.get(action);
          if (k) dispatchKey(k);
        }
      } else {
        _axisLastFired.delete(`${gp.index}:ry`);
      }
    }
  }

  if (_polling) _rafId = requestAnimationFrame(pollGamepads);
}

/**
 * Start listening for gamepads via the browser Gamepad API.
 * Polling only runs while at least one gamepad is connected AND the tab
 * is visible.  This avoids unnecessary hardware queries that keep
 * wireless controllers awake and drain their batteries.
 *
 * Safe to call multiple times — only one set of listeners is registered.
 */
export function startGamepadPolling() {
  if (_started) return;
  _started = true;

  window.addEventListener("gamepadconnected", (e) => {
    console.log(`[controller] Gamepad connected: ${e.gamepad.id}`);
    _connectedCount++;
    if (!document.hidden) _startLoop();
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    console.log(`[controller] Gamepad disconnected: ${e.gamepad.id}`);
    _prevButtons.delete(e.gamepad.index);
    _prevTriggers.delete(e.gamepad.index);
    _connectedCount = Math.max(0, _connectedCount - 1);
    if (_connectedCount === 0) _stopLoop();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      _stopLoop();
    } else if (_connectedCount > 0) {
      _startLoop();
    }
  });

  // If a gamepad is already connected before this call (e.g. page refresh)
  const existing = navigator.getGamepads?.() ?? [];
  for (const gp of existing) {
    if (gp && gp.connected) _connectedCount++;
  }
  if (_connectedCount > 0 && !document.hidden) _startLoop();
}

/**
 * Stop polling the browser Gamepad API.
 */
export function stopGamepadPolling() {
  _started = false;
  _connectedCount = 0;
  _stopLoop();
}

// ── WebSocket handler (backend SDL2 bridge) ──────────────────────────────

/**
 * Handle a parsed WebSocket message from the server.
 * Called by app.js handleWsMessage for messages with type === "controller".
 *
 * @param {{ type: string, action: string, timestamp: number }} msg
 */
export function handleControllerMessage(msg) {
  const key = ACTION_KEY_MAP.get(msg.action);
  if (!key) return;
  dispatchKey(key);
}
