import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";

// ---------------------------------------------------------------------------
// Connected clients registry
// Used by other modules to broadcast events (launch status, scan progress,
// controller input) without creating circular imports.
// ---------------------------------------------------------------------------
const clients = new Set<WebSocket>();

export function broadcast(payload: unknown): void {
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(message);
    }
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function registerWsRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);

    socket.send(
      JSON.stringify({ type: "connected", timestamp: Date.now() })
    );

    socket.on("message", (raw) => {
      // Clients can send ping to keep connection alive
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
    });

    socket.on("error", () => {
      clients.delete(socket);
    });
  });
}
