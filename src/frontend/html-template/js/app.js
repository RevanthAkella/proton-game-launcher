/**
 * app.js — Bootstrap, router, WebSocket, toast notifications
 *
 * Entry point. Responsibilities:
 *   • Load initial settings + Proton versions into shared state
 *   • Hash-based router (#home, #library, #game/<id>, #settings)
 *   • Home / Library tab bar management
 *   • Self-reconnecting WebSocket (launch_status, scan events, artwork_complete)
 *   • Toast notification helper (exported for use by views)
 *   • Scan banner visibility
 *   • Per-view keyboard handler registration
 *   • Search input → live-filter the library
 *   • previousHash tracking for Settings back button
 */

import { api }                      from "./api.js";
import { renderHome }                from "./views/home.js";
import { renderLibrary }             from "./views/library.js";
import { renderDetail }              from "./views/game-detail.js";
import { renderSettings }            from "./views/settings.js";
import { handleControllerMessage, startGamepadPolling } from "./controller.js";

// ── Shared state ──────────────────────────────────────────────────────────

export const state = {
  /** @type {object[]} */
  games: [],
  /** @type {{id:string, path:string, label:string}[]} */
  protonVersions: [],
  /** @type {Map<string, {pid:number, startedAt:number}>} */
  runningGames: new Map(),
  /** @type {object} */
  settings: {},
  /** Last non-settings, non-detail hash — used by Settings back button */
  previousHash: "#home",
};

// ── View elements ─────────────────────────────────────────────────────────

const VIEWS = {
  home:     document.getElementById("view-home"),
  library:  document.getElementById("view-library"),
  detail:   document.getElementById("view-detail"),
  settings: document.getElementById("view-settings"),
};

function showView(name) {
  for (const [n, el] of Object.entries(VIEWS)) {
    el.hidden = n !== name;
  }
  // body.no-tabs used by CSS to adjust main padding on detail/settings pages
  const showTabs = name === "home" || name === "library";
  document.body.classList.toggle("no-tabs", !showTabs);
}

// ── Tab bar ───────────────────────────────────────────────────────────────

const _tabBtns = [...document.querySelectorAll(".tab-btn")];

function updateTabs(hash) {
  _tabBtns.forEach((btn) => {
    const isActive =
      (btn.dataset.tab === "home"    && (!hash || hash === "#home")) ||
      (btn.dataset.tab === "library" && (hash === "#library" || hash.startsWith("#game/")));
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
}

_tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    location.hash = `#${btn.dataset.tab}`;
  });
});

// ── Settings button ───────────────────────────────────────────────────────

document.getElementById("nav-settings-btn")?.addEventListener("click", () => {
  location.hash = "#settings";
});

// ── Clock ─────────────────────────────────────────────────────────────────

const _clockEl = document.getElementById("nav-clock");

function updateClock() {
  if (!_clockEl) return;
  const now = new Date();
  const h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  _clockEl.textContent = `${h12}:${m} ${ampm}`;
}

updateClock();
setInterval(updateClock, 1000);

// ── Shoulder buttons (LB/RB) → cycle nav tabs ────────────────────────────

const _NAV_TABS = ["#home", "#library", "#settings"];

document.addEventListener("keydown", (e) => {
  if (e.key !== "PageUp" && e.key !== "PageDown") return;
  e.preventDefault();

  const current = location.hash || "#home";
  // Find current tab index; game detail counts as library
  let idx = _NAV_TABS.indexOf(current);
  if (idx === -1 && current.startsWith("#game/")) idx = 1; // library
  if (idx === -1) idx = 0;

  if (e.key === "PageDown") {
    idx = (idx + 1) % _NAV_TABS.length;
  } else {
    idx = (idx - 1 + _NAV_TABS.length) % _NAV_TABS.length;
  }
  location.hash = _NAV_TABS[idx];
});

// ── Keyboard handler (one active handler at a time) ───────────────────────

let _currentKeyHandler = null;

/**
 * Register a keydown handler for the active view.
 * @param {((e: KeyboardEvent) => void) | null} handler
 */
export function setKeyHandler(handler) {
  if (_currentKeyHandler) {
    document.removeEventListener("keydown", _currentKeyHandler);
  }
  _currentKeyHandler = handler;
  if (handler) {
    document.addEventListener("keydown", handler);
  }
}

// ── Toast notifications ───────────────────────────────────────────────────

const _toastContainer = document.getElementById("toast-container");

/**
 * @param {string} message
 * @param {"info"|"success"|"error"} [type]
 * @param {number} [duration] ms
 */
export function toast(message, type = "info", duration = 3200) {
  const el = document.createElement("div");
  el.className = `toast${type !== "info" ? ` toast-${type}` : ""}`;
  el.textContent = message;
  _toastContainer.appendChild(el);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("toast-visible"));
  });

  setTimeout(() => {
    el.classList.remove("toast-visible");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, duration);
}

// ── Scan banner ───────────────────────────────────────────────────────────

const _scanBanner = document.getElementById("scan-banner");
const _scanText   = document.getElementById("scan-text");

function setScanBanner(visible, text = "Scanning library…") {
  _scanBanner.classList.toggle("visible", visible);
  _scanBanner.setAttribute("aria-hidden", String(!visible));
  document.body.classList.toggle("scanning", visible);
  if (text) _scanText.textContent = text;
}

// ── Nav link active state ─────────────────────────────────────────────────

function updateNavLinks(hash) {
  document.querySelectorAll(".nav-link[data-view]").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === "settings" && hash === "#settings");
  });
}

// ── Router ────────────────────────────────────────────────────────────────

async function router() {
  const hash = location.hash || "#home";
  updateNavLinks(hash);
  updateTabs(hash);

  // Track the last "primary" page so Settings can go back to it
  if (!hash.startsWith("#settings") && !hash.startsWith("#game/")) {
    state.previousHash = hash;
  }

  if (hash.startsWith("#game/")) {
    const id = hash.slice(6);
    if (!id) { location.hash = "#home"; return; }
    showView("detail");
    await renderDetail(id, state);

  } else if (hash === "#settings") {
    showView("settings");
    await renderSettings(state);

  } else if (hash === "#library") {
    showView("library");
    await renderLibrary(state);

  } else {
    // Default: #home (also handles empty hash / #)
    showView("home");
    await renderHome(state);
  }
}

// ── Search input ──────────────────────────────────────────────────────────

const _searchInput = document.getElementById("search-input");

_searchInput.addEventListener("input", () => {
  if (!location.hash || !location.hash.startsWith("#library")) {
    history.replaceState(null, "", "#library");
    showView("library");
    updateNavLinks("#library");
    updateTabs("#library");
  }
  renderLibrary(state);
});

// ── WebSocket ─────────────────────────────────────────────────────────────

let _ws;
let _wsReconnectTimer;

function connectWs() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  _ws = new WebSocket(`${proto}//${location.host}/ws`);

  _ws.addEventListener("message", (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleWsMessage(msg);
  });

  _ws.addEventListener("close", () => {
    clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = setTimeout(connectWs, 3000);
  });
}

function handleWsMessage(msg) {
  switch (msg.type) {

    case "launch_status":
      if (msg.status === "running") {
        state.runningGames.set(msg.gameId, { pid: msg.pid, startedAt: msg.timestamp });
      } else {
        state.runningGames.delete(msg.gameId);
      }
      refreshCurrentView();
      break;

    case "scan_started":
      setScanBanner(true, "Scanning library…");
      break;

    case "scan_progress":
      setScanBanner(true, `Scanning: ${msg.current || "…"}  (${msg.found} found)`);
      break;

    case "scan_complete":
      setScanBanner(false);
      {
        const parts = [`${msg.added} added`, `${msg.skipped} skipped`];
        if (msg.relinked > 0) parts.push(`${msg.relinked} re-linked`);
        toast(`Scan complete — ${parts.join(", ")}`, "success");
      }
      state.games = [];
      if (!location.hash || location.hash === "#library" || location.hash === "#home") {
        renderLibrary(state);
      }
      break;

    case "scan_error":
      setScanBanner(false);
      toast(`Scan failed: ${msg.message}`, "error");
      break;

    case "artwork_complete":
      // Background artwork fetch finished — re-render to show downloaded images
      refreshCurrentView();
      break;

    case "games_unlinked":
      // Games from a removed scan path were soft-unlinked — refresh the library
      state.games = [];
      toast(
        `Unlinked ${msg.count} game${msg.count === 1 ? "" : "s"} from removed scan path${msg.count === 1 ? "" : "s"}`,
        "info",
        4000
      );
      refreshCurrentView();
      break;

    case "controller":
      handleControllerMessage(msg);
      break;
  }
}

/** Re-render whichever view is currently visible without pushing history. */
async function refreshCurrentView() {
  const hash = location.hash || "#home";
  if (hash.startsWith("#game/")) {
    await renderDetail(hash.slice(6), state);
  } else if (hash === "#library") {
    await renderLibrary(state);
  } else if (hash === "#home" || !hash || hash === "#") {
    await renderHome(state);
  }
  // Settings: no refresh needed
}

// ── Initialise ────────────────────────────────────────────────────────────

async function init() {
  try {
    [state.settings, state.protonVersions] = await Promise.all([
      api.getSettings(),
      api.listProtonVersions(),
    ]);
  } catch (err) {
    console.error("[app] Failed to load initial state:", err);
    toast(`Server unreachable: ${err.message}`, "error", 8000);
  }

  connectWs();
  startGamepadPolling();

  try {
    const scanStatus = await api.getScanStatus();
    if (scanStatus.status === "running") {
      setScanBanner(true, "Scan in progress…");
    }
  } catch { /* non-critical */ }

  window.addEventListener("hashchange", router);
  await router();
}

init();
