/**
 * controller.ts — Controller input → WebSocket bridge
 *
 * Starts the SDL2 adapter (when controllerEnabled is true in settings) and
 * broadcasts each ControllerAction to all connected WebSocket clients as:
 *
 *   { type: "controller", action: ControllerAction, timestamp: number }
 *
 * The frontend receives this and synthesises an equivalent KeyboardEvent,
 * so all existing keyboard handlers work identically for controller input.
 *
 * Lifecycle:
 *   • startControllerBridge() — called once at server startup
 *   • stopControllerBridge()  — called on graceful shutdown
 *
 * No Fastify routes are registered here — this module is purely a backend
 * service. It is intentionally separate from ws.ts to keep concerns isolated.
 */

import { getSettings }                   from "../modules/settings/index.js";
import { createSdlAdapter, setInputAdapter, getInputAdapter } from "../modules/controller/index.js";
import { broadcast }                      from "./ws.js";
import type { ControllerAction }          from "../modules/controller/index.js";
import { logger }                         from "../logger.js";

const log = logger.child({ module: "controller" });

let _actionHandler: ((action: ControllerAction) => void) | null = null;

/**
 * Start the controller bridge.
 * Safe to call multiple times — subsequent calls are no-ops if already running.
 */
export function startControllerBridge(): void {
  if (getInputAdapter()) return; // already running

  const settings = getSettings();
  if (!settings.controllerEnabled) {
    log.info("Controller support disabled in settings — skipping SDL2 init");
    return;
  }

  const adapter = createSdlAdapter();

  _actionHandler = (action: ControllerAction) => {
    broadcast({ type: "controller", action, timestamp: Date.now() });
  };

  adapter.on("action", _actionHandler);
  adapter.start();
  setInputAdapter(adapter);

  log.info("Controller bridge started");
}

/**
 * Stop the controller bridge and release SDL2 resources.
 * Safe to call when not running.
 */
export function stopControllerBridge(): void {
  const adapter = getInputAdapter();
  if (!adapter) return;

  if (_actionHandler) {
    adapter.off("action", _actionHandler);
    _actionHandler = null;
  }

  adapter.stop();
  // Clear the registry so startControllerBridge() can be called again
  setInputAdapter(null as unknown as ReturnType<typeof createSdlAdapter>);

  log.info("Controller bridge stopped");
}
