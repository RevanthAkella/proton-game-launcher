/**
 * home.js — Home page (recently played carousel + full-page info panel)
 *
 * Layout (top to bottom):
 *   1. Horizontal carousel — wide hero-art cards; active card is wider
 *   2. Info panel — hero image fills the remaining page height;
 *      title, short description, play stats overlaid (no thumbnail)
 *
 * Behaviour:
 *   • Games sorted by lastPlayed DESC, top 10 shown
 *   • Click card → update info panel
 *   • Double-click card → launch game
 *   • Arrow keys Left/Right → move carousel focus + update info panel
 *   • Enter / Space on focused card → launch game
 */

import { api }                         from "../api.js";
import { state, toast, setKeyHandler } from "../app.js";

// ── Keyboard / focus state ────────────────────────────────────────────────

let _focusedIndex = 0;
let _homeGames    = [];
let _artworkMap   = new Map();
let _infoMap      = new Map();

function handleHomeKeydown(e) {
  if (_homeGames.length === 0) return;

  let handled = true;
  switch (e.key) {
    case "ArrowRight":
      _focusedIndex = Math.min(_focusedIndex + 1, _homeGames.length - 1);
      break;
    case "ArrowLeft":
      _focusedIndex = Math.max(_focusedIndex - 1, 0);
      break;
    case "Enter":
    case " ": {
      const g = _homeGames[_focusedIndex];
      if (g) launchGame(g.id, g.name);
      break;
    }
    default:
      handled = false;
  }

  if (handled) {
    e.preventDefault();
    updateCarouselFocus();
    updateInfoPanel(_homeGames[_focusedIndex]);
  }
}

// ── Formatters ────────────────────────────────────────────────────────────

function formatPlayTime(seconds) {
  if (!seconds || seconds < 60) return "Never played";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatLastPlayed(ts) {
  if (!ts) return null;
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

function nameHue(name) {
  let h = 0;
  for (const c of (name || "?")) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h % 360;
}

// ── Artwork / info fetchers ───────────────────────────────────────────────

async function buildArtworkMap(games) {
  const map = new Map();
  await Promise.allSettled(
    games.map(async (g) => {
      try {
        const records = await api.listArtwork(g.id);
        for (const r of records) {
          map.set(`${g.id}:${r.type}`, api.artworkUrl(g.id, r.type));
        }
      } catch { /* no artwork — use placeholders */ }
    })
  );
  return map;
}

async function buildInfoMap(games) {
  const map = new Map();
  await Promise.allSettled(
    games.map(async (g) => {
      try {
        const info = await api.getGameInfo(g.id);
        map.set(g.id, info);
      } catch { /* not yet fetched */ }
    })
  );
  return map;
}

// ── Launch helper ─────────────────────────────────────────────────────────

async function launchGame(id, name) {
  if (state.runningGames.has(id)) {
    toast(`${name} is already running`, "info", 2000);
    return;
  }
  try {
    await api.launchGame(id);
    toast(`Launching ${name}…`, "info", 2000);
  } catch (err) {
    toast(`Failed to launch ${name}: ${err.message}`, "error");
  }
}

// ── Card renderer (carousel) ──────────────────────────────────────────────
//
// Inactive cards: portrait grid art (2:3).
// Active card:    landscape "home" art (460×215) — the SteamGridDB header image.
// Hero URL stored as data attribute only for page background updates.

function buildCardHtml(game, index) {
  const hue      = nameHue(game.name);
  const heroUrl  = _artworkMap.get(`${game.id}:hero`)  || "";
  const homeUrl  = _artworkMap.get(`${game.id}:home`)  || "";
  const gridUrl  = _artworkMap.get(`${game.id}:grid`)  || "";
  const isActive = index === _focusedIndex;

  // Active card: home (landscape 460×215); fallback to portrait grid (cropped/zoomed in).
  // Hero is used only for the page background — not as a card fallback.
  const src = isActive
    ? (homeUrl || gridUrl)
    : (gridUrl || homeUrl);
  const fallbackBg = `linear-gradient(145deg,hsl(${hue},35%,18%),hsl(${(hue+40)%360},25%,12%))`;
  const initial  = escHtml((game.name[0] || "?").toUpperCase());

  const imgHtml = src
    ? `<img class="home-card-img" src="${escHtml(src)}" alt="" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
        ><div class="home-card-placeholder" style="display:none;background:${fallbackBg}">${initial}</div>`
    : `<div class="home-card-placeholder" style="background:${fallbackBg}">${initial}</div>`;

  return `
    <div class="home-card${isActive ? " active" : ""}"
         data-id="${escHtml(game.id)}"
         data-index="${index}"
         data-hero-url="${escHtml(heroUrl)}"
         data-home-url="${escHtml(homeUrl)}"
         data-grid-url="${escHtml(gridUrl)}"
         tabindex="${isActive ? "0" : "-1"}"
         role="option"
         aria-selected="${isActive}">
      ${imgHtml}
    </div>
  `.trim();
}

// ── Page background helper ────────────────────────────────────────────────
// Sets the hero image (or gradient fallback) on #view-home itself so it
// extends behind both the carousel and the info panel.

function updatePageBackground(game) {
  const hue    = nameHue(game.name);
  const heroUrl = _artworkMap.get(`${game.id}:hero`);
  _container.style.backgroundImage = heroUrl
    ? `url('${heroUrl}')`
    : `linear-gradient(160deg, hsl(${hue},35%,15%), hsl(${(hue + 50) % 360},25%,8%))`;
}

// ── Info panel renderer ───────────────────────────────────────────────────

function buildProgressCircle(game) {
  const pct = game.progress ?? 0;
  const size   = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return `
    <div class="progress-circle-wrapper progress-circle-sm" title="Progress: ${pct}%">
      <svg class="progress-circle" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="Progress ${pct}%">
        <circle class="progress-circle-bg"
                cx="${size/2}" cy="${size/2}" r="${radius}"
                stroke-width="${stroke}" fill="none"/>
        <circle class="progress-circle-fill"
                cx="${size/2}" cy="${size/2}" r="${radius}"
                stroke-width="${stroke}" fill="none"
                stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                transform="rotate(-90 ${size/2} ${size/2})"/>
        <text x="${size/2}" y="${size/2}" class="progress-circle-text"
              text-anchor="middle" dominant-baseline="central">${pct}%</text>
      </svg>
    </div>
  `.trim();
}

function buildInfoHtml(game) {
  const info = _infoMap.get(game.id);

  const shortDesc = info?.shortDesc
    ? escHtml(info.shortDesc)
    : `<span style="color:var(--text-3);font-style:italic">No description available</span>`;

  const playTime   = formatPlayTime(game.playTimeSeconds);
  const lastPlayed = formatLastPlayed(game.lastPlayed);
  const metaLine   = lastPlayed
    ? `${escHtml(playTime)} &middot; Last played ${escHtml(lastPlayed)}`
    : escHtml(playTime);

  const isRunning = state.runningGames.has(game.id);
  const runBadge  = isRunning
    ? `<span class="running-badge" aria-live="polite"><span class="running-dot"></span>Running</span>`
    : "";

  const actionBtn = isRunning
    ? `<button id="home-close-btn" class="btn btn-kill home-action-btn" data-id="${escHtml(game.id)}">■ Close Game</button>`
    : `<button id="home-launch-btn" class="btn btn-launch home-action-btn" data-id="${escHtml(game.id)}">▶ Launch Game</button>`;

  return `
    <div class="home-info" data-id="${escHtml(game.id)}">
      <div class="home-info-scrim"></div>
      <div class="home-info-body">
        <div class="home-info-title-row">
          <h2 class="home-info-title">${escHtml(game.name)}</h2>
          ${runBadge}
          ${buildProgressCircle(game)}
        </div>
        <div class="home-info-meta">${metaLine}</div>
        <p class="home-info-desc">${shortDesc}</p>
        <div class="home-info-actions">${actionBtn}</div>
      </div>
    </div>
  `.trim();
}

// ── Update carousel focus without full re-render ──────────────────────────

function updateCarouselFocus() {
  const cards = [...document.querySelectorAll(".home-card")];
  cards.forEach((c, i) => {
    const shouldBeActive = i === _focusedIndex;
    const wasActive      = c.classList.contains("active");

    c.classList.toggle("active", shouldBeActive);
    c.setAttribute("aria-selected", String(shouldBeActive));
    c.setAttribute("tabindex", shouldBeActive ? "0" : "-1");

    // Swap between home (460×215) and grid (portrait) art on activation change
    if (shouldBeActive !== wasActive) {
      const img = c.querySelector(".home-card-img");
      if (img) {
        img.src = shouldBeActive
          ? (c.dataset.homeUrl || c.dataset.gridUrl || "")
          : (c.dataset.gridUrl || c.dataset.homeUrl || "");
      }
    }
  });
  updatePageBackground(_homeGames[_focusedIndex]);
  const active = cards[_focusedIndex];
  if (active) active.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function wireInfoPanelButtons(game) {
  const launchBtn = _container.querySelector("#home-launch-btn");
  const closeBtn  = _container.querySelector("#home-close-btn");

  if (launchBtn) {
    launchBtn.addEventListener("click", () => launchGame(game.id, game.name));
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", async () => {
      closeBtn.disabled    = true;
      closeBtn.textContent = "Stopping…";
      try {
        await api.killGame(game.id);
      } catch (err) {
        toast(`Failed to close ${game.name}: ${err.message}`, "error");
        closeBtn.disabled    = false;
        closeBtn.textContent = "■ Close Game";
      }
    });
  }
}

function updateInfoPanel(game) {
  const el = _container.querySelector(".home-info");
  if (!el) return;
  el.outerHTML = buildInfoHtml(game);
  updatePageBackground(game);
  wireInfoPanelButtons(game);
}

// ── Main render ───────────────────────────────────────────────────────────

const _container = document.getElementById("view-home");

/** @param {typeof state} appState */
export async function renderHome(appState) {
  setKeyHandler(handleHomeKeydown);

  // ── Fetch games if cache is empty ────────────────────────────────────────
  if (appState.games.length === 0) {
    _container.innerHTML = `
      <div class="home-scroll" style="padding-top:28px">
        ${Array.from({length:5}, () => `<div class="home-card" style="opacity:0.3"><div class="home-card-placeholder" style="background:var(--surface-2)"></div></div>`).join("")}
      </div>
    `;
    try {
      appState.games = await api.listGames();
    } catch (err) {
      _container.innerHTML = `
        <div class="view-error">
          <strong>Could not load games</strong>
          <p>${escHtml(err.message)}</p>
        </div>
      `;
      return;
    }
  }

  // ── Sort by lastPlayed DESC; unplayed games by createdAt ─────────────────
  const sorted = [...appState.games]
    .filter((g) => !g.hidden && g.rootPath != null)
    .sort((a, b) => {
      if (b.lastPlayed && a.lastPlayed) return b.lastPlayed - a.lastPlayed;
      if (b.lastPlayed) return 1;
      if (a.lastPlayed) return -1;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    })
    .slice(0, 10);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (sorted.length === 0) {
    _container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎮</div>
        <div class="empty-state-title">No games in your library yet</div>
        <p class="empty-state-body">
          Add your game directories in
          <a href="#settings" style="color:var(--accent)">Settings</a>
          and run a scan to find your games.
        </p>
      </div>
    `;
    return;
  }

  // ── Clamp focused index ───────────────────────────────────────────────────
  _homeGames    = sorted;
  _focusedIndex = Math.max(0, Math.min(_focusedIndex, sorted.length - 1));

  // ── Fetch artwork + info in parallel ─────────────────────────────────────
  [_artworkMap, _infoMap] = await Promise.all([
    buildArtworkMap(sorted),
    buildInfoMap(sorted),
  ]);

  // ── Set page background (hero image behind carousel + info panel) ─────────
  updatePageBackground(sorted[_focusedIndex]);

  // ── Build HTML: scrim, carousel, then info panel ──────────────────────────
  const cardsHtml = sorted.map((g, i) => buildCardHtml(g, i)).join("");
  const infoHtml  = buildInfoHtml(sorted[_focusedIndex]);

  _container.innerHTML = `
    <div class="home-bg-scrim" aria-hidden="true"></div>
    <div class="home-scroll" role="listbox" aria-label="Recently played games">
      ${cardsHtml}
    </div>
    ${infoHtml}
  `;

  // ── Wire card events ──────────────────────────────────────────────────────
  _container.querySelectorAll(".home-card").forEach((card) => {
    const idx  = Number(card.dataset.index);
    const game = sorted[idx];
    if (!game) return;

    card.addEventListener("click", () => {
      _focusedIndex = idx;
      updateCarouselFocus();
      updateInfoPanel(game);
    });

    card.addEventListener("dblclick", () => launchGame(game.id, game.name));
  });

  // ── Wire info panel action button ─────────────────────────────────────────
  wireInfoPanelButtons(sorted[_focusedIndex]);
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
