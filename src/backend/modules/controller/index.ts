// Phase 6 — Controller Input

export type ControllerAction =
  | "navigate-up"
  | "navigate-down"
  | "navigate-left"
  | "navigate-right"
  | "confirm"
  | "back"
  | "menu"
  | "start"
  | "shoulder-left"
  | "shoulder-right"
  | "trigger-left"
  | "trigger-right";

export interface InputAdapter {
  start(): void;
  stop(): void;
  on(event: "action", handler: (action: ControllerAction) => void): void;
  off(event: "action", handler: (action: ControllerAction) => void): void;
}

let _adapter: InputAdapter | null = null;

export function setInputAdapter(adapter: InputAdapter): void {
  _adapter = adapter;
}

export function getInputAdapter(): InputAdapter | null {
  return _adapter;
}

export { createSdlAdapter }           from "./sdl-adapter.js";
export { buttonToAction, axisToAction, BUTTON_MAP, AXIS_THRESHOLD, AXIS_REPEAT_MS } from "./input-map.js";
