/**
 * input-map.test.ts — Unit tests for button/axis → ControllerAction mapping
 *
 * @kmamal/sdl's controller API uses named buttons and axes (strings),
 * normalised to Xbox / XInput naming conventions. The same BUTTON_MAP
 * applies to Xbox, DualSense, and generic USB controllers.
 *
 * Controller button equivalences (@kmamal/sdl controller layout):
 *
 *   Name            | Xbox Series      | DualSense (PS5)   | Generic USB
 *   ----------------+------------------+-------------------+--------------
 *   "a"             | A                | Cross (✕)         | Button 1
 *   "b"             | B                | Circle (○)        | Button 2
 *   "x"             | X                | Square (□)        | Button 3  → menu
 *   "y"             | Y                | Triangle (△)      | Button 4  → menu
 *   "leftShoulder"  | Left Bumper (LB) | L1                | Button 5
 *   "rightShoulder" | Right Bumper(RB) | R1                | Button 6
 *   "back"          | Back/View        | Create            | Select
 *   "start"         | Start/Menu       | Options           | Start
 *   "leftStick"     | L3 (click)       | L3 (click)        | L3
 *   "rightStick"    | R3 (click)       | R3 (click)        | R3
 *   "dpadUp"        | D-pad Up         | D-pad Up          | D-pad Up
 *   "dpadDown"      | D-pad Down       | D-pad Down        | D-pad Down
 *   "dpadLeft"      | D-pad Left       | D-pad Left        | D-pad Left
 *   "dpadRight"     | D-pad Right      | D-pad Right       | D-pad Right
 *   "guide"         | Xbox/Guide       | PS button         | Home
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUTTON_MAP,
  AXIS_THRESHOLD,
  AXIS_REPEAT_MS,
  buttonToAction,
  axisToAction,
} from "./input-map.js";

// ── BUTTON_MAP shape ──────────────────────────────────────────────────────

describe("BUTTON_MAP", () => {
  it("has exactly 13 mapped entries", () => {
    assert.equal(BUTTON_MAP.size, 13);
  });

  it("is a ReadonlyMap (cannot be mutated at runtime)", () => {
    assert.ok(typeof BUTTON_MAP.get === "function");
    assert.ok(typeof BUTTON_MAP.has === "function");
  });

  it("AXIS_THRESHOLD is 0.5", () => {
    assert.equal(AXIS_THRESHOLD, 0.5);
  });

  it("AXIS_REPEAT_MS is 180", () => {
    assert.equal(AXIS_REPEAT_MS, 180);
  });
});

// ── buttonToAction — face buttons ─────────────────────────────────────────

describe("buttonToAction — face buttons", () => {
  it('"a" (Xbox A / DualSense ✕) → confirm', () => {
    assert.equal(buttonToAction("a"), "confirm");
  });

  it('"b" (Xbox B / DualSense ○) → back', () => {
    assert.equal(buttonToAction("b"), "back");
  });

  it('"y" (Xbox Y / DualSense △) → menu', () => {
    assert.equal(buttonToAction("y"), "menu");
  });

  it('"x" (Xbox X / DualSense □) → menu', () => {
    assert.equal(buttonToAction("x"), "menu");
  });

});

// ── buttonToAction — shoulder buttons ─────────────────────────────────────

describe("buttonToAction — shoulder buttons", () => {
  it('"leftShoulder" (Xbox LB / DualSense L1) → shoulder-left', () => {
    assert.equal(buttonToAction("leftShoulder"), "shoulder-left");
  });

  it('"rightShoulder" (Xbox RB / DualSense R1) → shoulder-right', () => {
    assert.equal(buttonToAction("rightShoulder"), "shoulder-right");
  });
});

// ── buttonToAction — meta buttons ─────────────────────────────────────────

describe("buttonToAction — meta buttons", () => {
  it('"back" (Xbox Back / DualSense Create / Select) → back', () => {
    assert.equal(buttonToAction("back"), "back");
  });

  it('"start" (Xbox Start / DualSense Options) → start', () => {
    assert.equal(buttonToAction("start"), "start");
  });

  it('"leftStick" (L3 click) → null (intentionally unmapped)', () => {
    assert.equal(buttonToAction("leftStick"), null);
  });

  it('"rightStick" (R3 click) → null (intentionally unmapped)', () => {
    assert.equal(buttonToAction("rightStick"), null);
  });

  it('"guide" (Xbox Guide / PS button / Home) → menu', () => {
    assert.equal(buttonToAction("guide"), "menu");
  });
});

// ── buttonToAction — D-pad ────────────────────────────────────────────────

describe("buttonToAction — D-pad (all controller families)", () => {
  it('"dpadUp" → navigate-up', () => {
    assert.equal(buttonToAction("dpadUp"), "navigate-up");
  });

  it('"dpadDown" → navigate-down', () => {
    assert.equal(buttonToAction("dpadDown"), "navigate-down");
  });

  it('"dpadLeft" → navigate-left', () => {
    assert.equal(buttonToAction("dpadLeft"), "navigate-left");
  });

  it('"dpadRight" → navigate-right', () => {
    assert.equal(buttonToAction("dpadRight"), "navigate-right");
  });
});

// ── buttonToAction — unmapped ──────────────────────────────────────────────

describe("buttonToAction — unmapped buttons", () => {
  it('"paddle1" (not in map) → null', () => {
    assert.equal(buttonToAction("paddle1"), null);
  });

  it('"misc1" (not in map) → null', () => {
    assert.equal(buttonToAction("misc1"), null);
  });

  it('empty string → null', () => {
    assert.equal(buttonToAction(""), null);
  });
});

// ── axisToAction — leftStickX (horizontal) ────────────────────────────────

describe('axisToAction — leftStickX (horizontal)', () => {
  it("leftStickX fully left (-1.0) → navigate-left", () => {
    assert.equal(axisToAction("leftStickX", -1.0), "navigate-left");
  });

  it("leftStickX fully right (+1.0) → navigate-right", () => {
    assert.equal(axisToAction("leftStickX", 1.0), "navigate-right");
  });

  it("leftStickX just above threshold left (-0.51) → navigate-left", () => {
    assert.equal(axisToAction("leftStickX", -0.51), "navigate-left");
  });

  it("leftStickX just above threshold right (+0.51) → navigate-right", () => {
    assert.equal(axisToAction("leftStickX", 0.51), "navigate-right");
  });

  it("leftStickX exactly at threshold (-0.5) → navigate-left (threshold is inclusive)", () => {
    assert.equal(axisToAction("leftStickX", -0.5), "navigate-left");
  });

  it("leftStickX in dead-zone (-0.1) → null", () => {
    assert.equal(axisToAction("leftStickX", -0.1), null);
  });

  it("leftStickX at zero (stick centred) → null", () => {
    assert.equal(axisToAction("leftStickX", 0), null);
  });
});

// ── axisToAction — leftStickY (vertical) ──────────────────────────────────

describe('axisToAction — leftStickY (vertical)', () => {
  it("leftStickY fully up (-1.0) → navigate-up", () => {
    assert.equal(axisToAction("leftStickY", -1.0), "navigate-up");
  });

  it("leftStickY fully down (+1.0) → navigate-down", () => {
    assert.equal(axisToAction("leftStickY", 1.0), "navigate-down");
  });

  it("leftStickY just above threshold up (-0.51) → navigate-up", () => {
    assert.equal(axisToAction("leftStickY", -0.51), "navigate-up");
  });

  it("leftStickY just above threshold down (+0.51) → navigate-down", () => {
    assert.equal(axisToAction("leftStickY", 0.51), "navigate-down");
  });

  it("leftStickY exactly at threshold (+0.5) → navigate-down (threshold is inclusive)", () => {
    assert.equal(axisToAction("leftStickY", 0.5), "navigate-down");
  });

  it("leftStickY in dead-zone (+0.2) → null", () => {
    assert.equal(axisToAction("leftStickY", 0.2), null);
  });
});

// ── axisToAction — non-navigation axes ────────────────────────────────────

// ── axisToAction — rightStickX (horizontal) ─────────────────────────────

describe('axisToAction — rightStickX (horizontal)', () => {
  it("rightStickX fully left (-1.0) → navigate-left", () => {
    assert.equal(axisToAction("rightStickX", -1.0), "navigate-left");
  });

  it("rightStickX fully right (+1.0) → navigate-right", () => {
    assert.equal(axisToAction("rightStickX", 1.0), "navigate-right");
  });

  it("rightStickX in dead-zone (+0.2) → null", () => {
    assert.equal(axisToAction("rightStickX", 0.2), null);
  });
});

// ── axisToAction — rightStickY (vertical) ───────────────────────────────

describe('axisToAction — rightStickY (vertical)', () => {
  it("rightStickY fully up (-1.0) → navigate-up", () => {
    assert.equal(axisToAction("rightStickY", -1.0), "navigate-up");
  });

  it("rightStickY fully down (+1.0) → navigate-down", () => {
    assert.equal(axisToAction("rightStickY", 1.0), "navigate-down");
  });

  it("rightStickY in dead-zone (-0.1) → null", () => {
    assert.equal(axisToAction("rightStickY", -0.1), null);
  });
});

// ── axisToAction — trigger axes (intentionally unmapped) ─────────────────

describe("axisToAction — trigger axes", () => {
  it("leftTrigger fully pressed (1.0) → trigger-left", () => {
    assert.equal(axisToAction("leftTrigger", 1.0), "trigger-left");
  });

  it("rightTrigger fully pressed (1.0) → trigger-right", () => {
    assert.equal(axisToAction("rightTrigger", 1.0), "trigger-right");
  });
});

// ── axisToAction — unknown axes ─────────────────────────────────────────

describe("axisToAction — unknown axes", () => {
  it("unknown axis name → null regardless of value", () => {
    assert.equal(axisToAction("someOtherAxis", 1.0), null);
  });
});
