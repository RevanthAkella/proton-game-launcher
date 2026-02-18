/**
 * input-map.ts — Button / axis → ControllerAction mapping
 *
 * Pure module — no SDL2 imports, fully unit-testable.
 *
 * @kmamal/sdl controller API uses named buttons and axes (strings),
 * mapped to the Xbox / XInput standard layout:
 *
 *   Buttons (name):
 *     "a"              — confirm
 *     "b"              — back
 *     "x"              — menu
 *     "y"              — menu
 *     "back"           — back
 *     "guide"          — menu
 *     "start"          — start
 *     "leftStick"      — (unmapped)
 *     "rightStick"     — (unmapped)
 *     "leftShoulder"   — shoulder-left
 *     "rightShoulder"  — shoulder-right
 *     "dpadUp"         — navigate-up
 *     "dpadDown"       — navigate-down
 *     "dpadLeft"       — navigate-left
 *     "dpadRight"      — navigate-right
 *
 *   Left stick axes:
 *     "leftStickX"  — navigate-left / navigate-right  (|value| > AXIS_THRESHOLD)
 *     "leftStickY"  — navigate-up   / navigate-down   (|value| > AXIS_THRESHOLD)
 *
 *   Right stick axes:
 *     "rightStickX" — navigate-left / navigate-right  (|value| > AXIS_THRESHOLD)
 *     "rightStickY" — navigate-up   / navigate-down   (|value| > AXIS_THRESHOLD)
 *
 *   Trigger axes (unmapped — analog drift causes constant false fires):
 *     "leftTrigger"  — (ignored; "leftShoulder" button covers shoulder-left)
 *     "rightTrigger" — (ignored; "rightShoulder" button covers shoulder-right)
 *
 * Axis values range from -1.0 to +1.0.
 * AXIS_THRESHOLD prevents accidental triggers from stick drift.
 */

import type { ControllerAction } from "./index.js";

// ── Constants ────────────────────────────────────────────────────────────

/** Dead-zone threshold for analogue stick navigation. */
export const AXIS_THRESHOLD = 0.5;

/** Minimum ms between repeated axis-triggered actions (prevents flooding). */
export const AXIS_REPEAT_MS = 180;

// ── Button map ────────────────────────────────────────────────────────────

/**
 * Maps @kmamal/sdl button name → ControllerAction.
 * Entries absent from this map are intentionally ignored.
 */
export const BUTTON_MAP: ReadonlyMap<string, ControllerAction> = new Map([
  ["a",              "confirm"],
  ["b",              "back"],
  ["x",              "menu"],
  ["y",              "menu"],
  ["back",           "back"],
  ["guide",          "menu"],
  ["start",          "start"],
  ["leftShoulder",   "shoulder-left"],
  ["rightShoulder",  "shoulder-right"],
  ["leftTrigger",   "trigger-left"],
  ["rightTrigger",  "trigger-right"],
  ["dpadUp",         "navigate-up"],
  ["dpadDown",       "navigate-down"],
  ["dpadLeft",       "navigate-left"],
  ["dpadRight",      "navigate-right"],
]);

// ── Axis helpers ──────────────────────────────────────────────────────────

/**
 * Resolve a left-stick axis event to a ControllerAction (or null if below threshold).
 *
 * @param axisName  "leftStickX" or "leftStickY"
 * @param value     Normalised axis value in [-1.0, 1.0]
 */
export function axisToAction(
  axisName: string,
  value: number
): ControllerAction | null {
  if (Math.abs(value) < AXIS_THRESHOLD) return null;

  if (axisName === "leftStickX" || axisName === "rightStickX") {
    return value < 0 ? "navigate-left" : "navigate-right";
  }
  if (axisName === "leftStickY" || axisName === "rightStickY") {
    return value < 0 ? "navigate-up" : "navigate-down";
  }
  // Trigger axes intentionally unmapped — analog drift causes constant
  // false fires. Shoulder buttons already cover shoulder-left/right.

  return null;
}

/**
 * Map a button name to its ControllerAction.
 * Returns null for unmapped buttons.
 */
export function buttonToAction(buttonName: string): ControllerAction | null {
  return BUTTON_MAP.get(buttonName) ?? null;
}
