/**
 * sdl-adapter.ts — SDL2 implementation of InputAdapter
 *
 * Uses @kmamal/sdl to enumerate gamepads and translate hardware events
 * into ControllerActions that the rest of the app understands.
 *
 * Usage:
 *   const adapter = createSdlAdapter();
 *   adapter.on("action", (action) => console.log(action));
 *   adapter.start();
 *   // ...
 *   adapter.stop();
 *
 * Design notes:
 *   • Only one adapter instance should be active at a time (module-level guard).
 *   • Axis events are rate-limited by AXIS_REPEAT_MS to avoid flooding navigation.
 *   • Each connected controller is tracked independently; disconnects are handled.
 *   • SDL2 must be available on the host system (ships with most desktop Linux distros).
 *
 * @kmamal/sdl API notes (v0.9.x):
 *   • sdl.controller.devices   — getter returning array of device objects
 *   • sdl.controller.openDevice(device) — returns ControllerInstance
 *   • sdl.controller.on("deviceAdd", handler) — hot-plug connect
 *   • sdl.controller.on("deviceRemove", handler) — hot-plug disconnect
 *   • instance.on("buttonDown", { button: string }) — named buttons
 *   • instance.on("axisMotion", { axis: string, value: number }) — named axes
 *   • instance.close() — release the device
 */

import type { InputAdapter, ControllerAction } from "./index.js";
import { buttonToAction, axisToAction, AXIS_REPEAT_MS } from "./input-map.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "sdl-adapter" });

// ── Types ─────────────────────────────────────────────────────────────────

type ActionHandler = (action: ControllerAction) => void;

// @kmamal/sdl controller event shapes (v0.9.x — uses string names)
interface SdlButtonEvent {
  button: string;
}

interface SdlAxisEvent {
  axis:  string;
  value: number;
}

interface SdlDevice {
  id:    number;
  name:  string;
  path?: string;
  guid?: string;
}

interface SdlControllerInstance {
  on(event: "buttonDown", handler: (e: SdlButtonEvent) => void): void;
  on(event: "axisMotion", handler: (e: SdlAxisEvent)  => void): void;
  off(event: "buttonDown", handler: (e: SdlButtonEvent) => void): void;
  off(event: "axisMotion", handler: (e: SdlAxisEvent)  => void): void;
  close(): void;
  readonly device: SdlDevice;
}

interface SdlControllerModule {
  readonly devices: SdlDevice[];
  openDevice(device: SdlDevice): SdlControllerInstance;
  on(event: "deviceAdd", handler: (e: { device: SdlDevice }) => void): void;
  on(event: "deviceRemove", handler: (e: { device: SdlDevice }) => void): void;
  off(event: "deviceAdd", handler: (e: { device: SdlDevice }) => void): void;
  off(event: "deviceRemove", handler: (e: { device: SdlDevice }) => void): void;
}

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * Create a new SDL2 input adapter.
 * Does not start listening until `.start()` is called.
 */
export function createSdlAdapter(): InputAdapter {
  const _handlers = new Set<ActionHandler>();

  // Per-axis last-fired timestamp for rate limiting (keyed by `${deviceId}:${axis}`)
  const _axisLastFired = new Map<string, number>();

  // Active SDL controller instances and their bound event listeners (for cleanup)
  const _controllers = new Map<
    number,
    {
      instance: SdlControllerInstance;
      onButtonDown: (e: SdlButtonEvent) => void;
      onAxisMotion: (e: SdlAxisEvent)  => void;
    }
  >();

  let _controllerModule: SdlControllerModule | null = null;
  let _running = false;

  // Hot-plug listeners
  let _onDeviceAdd:    ((e: { device: SdlDevice }) => void) | null = null;
  let _onDeviceRemove: ((e: { device: SdlDevice }) => void) | null = null;

  // ── Emit helper ───────────────────────────────────────────────────────

  function emit(action: ControllerAction): void {
    for (const h of _handlers) {
      try { h(action); } catch { /* isolate handler errors */ }
    }
  }

  // ── Per-controller binding ─────────────────────────────────────────────

  function attachController(device: SdlDevice): void {
    if (_controllers.has(device.id)) return; // already tracked

    let instance: SdlControllerInstance;
    try {
      instance = _controllerModule!.openDevice(device);
    } catch (err) {
      log.warn({ err, deviceId: device.id, name: device.name }, "Failed to open controller");
      return;
    }

    const onButtonDown = (e: SdlButtonEvent) => {
      const action = buttonToAction(e.button);
      if (action) emit(action);
    };

    const onAxisMotion = (e: SdlAxisEvent) => {
      const action = axisToAction(e.axis, e.value);
      if (!action) return;

      // Rate-limit repeated axis actions
      const key = `${device.id}:${e.axis}`;
      const now = Date.now();
      const last = _axisLastFired.get(key) ?? 0;
      if (now - last < AXIS_REPEAT_MS) return;
      _axisLastFired.set(key, now);

      emit(action);
    };

    instance.on("buttonDown", onButtonDown);
    instance.on("axisMotion",  onAxisMotion);
    _controllers.set(device.id, { instance, onButtonDown, onAxisMotion });
    log.info({ deviceId: device.id, name: device.name }, "Controller attached");
  }

  function detachController(deviceId: number): void {
    const entry = _controllers.get(deviceId);
    if (!entry) return;
    entry.instance.off("buttonDown", entry.onButtonDown);
    entry.instance.off("axisMotion",  entry.onAxisMotion);
    try { entry.instance.close(); } catch { /* may already be closed */ }
    _controllers.delete(deviceId);
    log.info({ deviceId }, "Controller detached");
  }

  // ── InputAdapter implementation ───────────────────────────────────────

  return {
    start() {
      if (_running) return;
      _running = true;

      let sdl: typeof import("@kmamal/sdl");
      try {
        // Dynamic import — SDL2 may not be available in all environments
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        sdl = require("@kmamal/sdl") as typeof import("@kmamal/sdl");
      } catch (err) {
        log.warn({ err }, "@kmamal/sdl not available — controller support disabled");
        _running = false;
        return;
      }

      _controllerModule = (sdl as any).controller as SdlControllerModule;

      // Enumerate already-connected controllers
      try {
        const existing = _controllerModule.devices ?? [];
        for (const device of existing) {
          attachController(device);
        }
      } catch (err) {
        log.warn({ err }, "Failed to enumerate existing controllers");
      }

      // Listen for hot-plug events
      _onDeviceAdd = (e: { device: SdlDevice }) => {
        attachController(e.device);
      };
      _onDeviceRemove = (e: { device: SdlDevice }) => {
        detachController(e.device.id);
      };

      _controllerModule.on("deviceAdd",    _onDeviceAdd);
      _controllerModule.on("deviceRemove", _onDeviceRemove);

      log.info({ controllers: _controllers.size }, "SDL2 adapter started");
    },

    stop() {
      if (!_running) return;
      _running = false;

      // Detach all controllers
      for (const id of [..._controllers.keys()]) {
        detachController(id);
      }
      _axisLastFired.clear();

      // Remove hot-plug listeners
      if (_controllerModule && _onDeviceAdd) {
        _controllerModule.off("deviceAdd",    _onDeviceAdd);
      }
      if (_controllerModule && _onDeviceRemove) {
        _controllerModule.off("deviceRemove", _onDeviceRemove);
      }
      _onDeviceAdd    = null;
      _onDeviceRemove = null;
      _controllerModule = null;

      log.info("SDL2 adapter stopped");
    },

    on(_event: "action", handler: ActionHandler) {
      _handlers.add(handler);
    },

    off(_event: "action", handler: ActionHandler) {
      _handlers.delete(handler);
    },
  };
}
