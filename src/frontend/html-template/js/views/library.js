/**
 * library.js — Game grid view
 *
 * Renders the main game library as a responsive grid of cover art tiles.
 * Features:
 *   • Fetches games on first load; uses state.games cache on re-renders
 *   • Live search filter (client-side, no re-fetch)
 *   • Keyboard navigation: arrow keys move focus, Enter opens detail
 *   • Running-game indicator (amber border + badge)
 *   • Skeleton loading tiles while fetching
 *   • Empty state with scan prompt
 */

import { api }           from "../api.js";
import { state, toast, setKeyHandler } from "../app.js";

// ── Keyboard state ────────────────────────────────────────────────────────

let _focusedIndex = 0;

function handleLibraryKeydown(e) {
  const tiles = [...document.querySelectorAll(".game-tile:not(.skeleton)")];
  if (tiles.length === 0) return;

  // Calculate how many columns the grid currently has
  const cols = getGridCols(tiles);

  let handled = true;
  switch (e.key) {
    case "ArrowRight": _focusedIndex = Math.min(_focusedIndex + 1, tiles.length - 1); break;
    case "ArrowLeft":  _focusedIndex = Math.max(_focusedIndex - 1, 0); break;
    case "ArrowDown":  _focusedIndex = Math.min(_focusedIndex + cols, tiles.length - 1); break;
    case "ArrowUp":    _focusedIndex = Math.max(_focusedIndex - cols, 0); break;
    case "Enter":
    case " ": {
      const tile = tiles[_focusedIndex];
      if (tile) { location.hash = `#game/${tile.dataset.id}`; }
      break;
    }
    default: handled = false;
  }

  if (handled) {
    e.preventDefault();
    updateTileFocus(tiles);
  }
}

function getGridCols(tiles) {
  if (tiles.length < 2) return 1;
  const firstTop = tiles[0].offsetTop;
  let cols = 1;
  for (let i = 1; i < tiles.length; i++) {
    if (tiles[i].offsetTop !== firstTop) break;
    cols++;
  }
  return Math.max(1, cols);
}

function updateTileFocus(tiles) {
  tiles.forEach((t, i) => t.classList.toggle("focused", i === _focusedIndex));
  tiles[_focusedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Generate a deterministic background gradient from a game name. */
function placeholderStyle(name) {
  let h = 0;
  for (const c of (name || "?")) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  const hue = h % 360;
  return `background: linear-gradient(145deg, hsl(${hue},35%,18%), hsl(${(hue+40)%360},25%,12%))`;
}

function formatLastPlayed(ts) {
  if (!ts) return null;
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── Tile rendering ────────────────────────────────────────────────────────

function renderTile(game, index, artworkMap) {
  const isRunning    = state.runningGames.has(game.id);
  const isUnlinked   = game.rootPath == null;
  const gridUrl      = artworkMap.get(`${game.id}:grid`);
  const lastP        = formatLastPlayed(game.lastPlayed);

  const classes = [
    "game-tile",
    isRunning  ? "running"     : "",
    isUnlinked ? "uninstalled" : "",
  ].filter(Boolean).join(" ");

  const imgHtml = gridUrl
    ? `<img src="${gridUrl}" alt="" loading="lazy" onerror="this.parentElement.replaceChild(Object.assign(document.createElement('div'),{className:'game-tile-placeholder',style:'${placeholderStyle(game.name)}',textContent:'${(game.name[0] || "?").toUpperCase()}'}), this)">`
    : `<div class="game-tile-placeholder" style="${placeholderStyle(game.name)}">${(game.name[0] || "?").toUpperCase()}</div>`;

  const runBadge = isRunning
    ? `<div class="game-tile-running-badge" aria-label="Running">▶</div>`
    : "";

  const uninstalledBadge = isUnlinked
    ? `<div class="game-tile-uninstalled-badge">Not Installed</div>`
    : "";

  return `
    <div class="${classes}" data-id="${game.id}" data-index="${index}" tabindex="-1" role="button" aria-label="${escHtml(game.name)}${isRunning ? " (running)" : ""}${isUnlinked ? " (not installed)" : ""}">
      ${imgHtml}
      ${runBadge}
      ${uninstalledBadge}
      <div class="game-tile-info">
        <div class="game-tile-name">${escHtml(game.name)}</div>
        ${lastP ? `<div style="font-size:0.68rem;color:rgba(255,255,255,0.55);margin-top:2px">${lastP}</div>` : ""}
      </div>
    </div>
  `.trim();
}

function renderSkeletons(count = 16) {
  return Array.from({ length: count }, () => `<div class="game-tile skeleton" aria-hidden="true"></div>`).join("");
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">🎮</div>
      <div class="empty-state-title">No games in your library</div>
      <p class="empty-state-body">
        Add your game directories in <a href="#settings" style="color:var(--accent)">Settings</a>
        and run a scan to find your games.
      </p>
    </div>
  `.trim();
}

// ── Pre-fetch artwork URLs for the visible games ──────────────────────────
// Returns a Map keyed by "<gameId>:<type>" → URL string.

async function buildArtworkMap(games) {
  const map = new Map();
  await Promise.allSettled(
    games.map(async (g) => {
      try {
        const records = await api.listArtwork(g.id);
        for (const r of records) {
          map.set(`${g.id}:${r.type}`, api.artworkUrl(g.id, r.type));
        }
      } catch { /* no artwork — use placeholder */ }
    })
  );
  return map;
}

// ── Main render ───────────────────────────────────────────────────────────

const _container = document.getElementById("view-library");

/** @param {typeof state} state */
export async function renderLibrary(appState) {
  // ── Step 1: Show skeletons immediately ──────────────────────────────────
  if (appState.games.length === 0) {
    _container.innerHTML = `
      <div class="library-header">
        <h1 class="library-title">Library</h1>
      </div>
      <div class="game-grid">${renderSkeletons()}</div>
    `;
  }

  // ── Step 2: Fetch games if needed ───────────────────────────────────────
  if (appState.games.length === 0) {
    try {
      appState.games = await api.listGames();
    } catch (err) {
      _container.innerHTML = `
        <div class="view-error">
          <strong>Failed to load library</strong>
          ${err.message}
        </div>
      `;
      setKeyHandler(null);
      return;
    }
  }

  // ── Step 3: Apply installation + search filters ─────────────────────────
  const showUninstalled = appState.settings?.showUninstalledGames === true;
  const installed = showUninstalled
    ? appState.games
    : appState.games.filter((g) => g.rootPath != null);

  const query   = document.getElementById("search-input")?.value?.toLowerCase().trim() ?? "";
  const visible = query
    ? installed.filter((g) => g.name.toLowerCase().includes(query))
    : installed;

  // ── Step 4: Build artwork map for visible games ─────────────────────────
  const artworkMap = await buildArtworkMap(visible);

  // ── Step 5: Render grid ──────────────────────────────────────────────────
  const count = visible.length;
  const total = appState.games.length;

  let gridHtml;
  if (total === 0) {
    gridHtml = renderEmptyState();
  } else if (count === 0) {
    gridHtml = `<div class="game-grid"></div><div class="no-results">No games match "<strong>${escHtml(query)}</strong>"</div>`;
  } else {
    const tiles = visible.map((g, i) => renderTile(g, i, artworkMap)).join("");
    gridHtml = `<div class="game-grid">${tiles}</div>`;
  }

  const countLabel = query
    ? `${count} of ${total}`
    : `${total} game${total !== 1 ? "s" : ""}`;

  _container.innerHTML = `
    <div class="library-header">
      <h1 class="library-title">Library</h1>
      ${total > 0 ? `<span class="library-count">${countLabel}</span>` : ""}
    </div>
    ${gridHtml}
  `;

  // ── Step 6: Wire up click handlers ──────────────────────────────────────
  _container.querySelectorAll(".game-tile:not(.skeleton)").forEach((tile) => {
    tile.addEventListener("click", () => {
      location.hash = `#game/${tile.dataset.id}`;
    });
    // Maintain focusedIndex on mouse enter so keyboard + mouse don't conflict
    tile.addEventListener("mouseenter", () => {
      _focusedIndex = Number(tile.dataset.index);
    });
  });

  // ── Step 7: Keyboard navigation ─────────────────────────────────────────
  _focusedIndex = Math.min(_focusedIndex, Math.max(0, visible.length - 1));
  setKeyHandler(visible.length > 0 ? handleLibraryKeydown : null);
}

// ── XSS guard ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
