/**
 * game-detail.js — Single game detail page
 *
 * Layout:
 *   • Full-width hero banner (hero artwork or gradient fallback)
 *   • Back button overlaid top-left of hero
 *   • Two-column body: cover art (left) | info panel (right)
 *   • Info panel: title + running badge, play stats, Proton selector,
 *                 Launch / Kill button, error display
 *
 * Behaviour:
 *   • Fetches game record + artwork map on every render
 *   • Proton selector auto-saves on change (no explicit Save button)
 *   • Launch / Kill button toggled by state.runningGames
 *   • Escape key → back to #library
 *   • Running state refreshed via WS → refreshCurrentView in app.js
 */

import { api }                      from "../api.js";
import { state, toast, setKeyHandler } from "../app.js";

// ── Keyboard handler ──────────────────────────────────────────────────────

function handleDetailKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    location.hash = "#library";
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

/** Deterministic hue from game name — used for fallback gradients. */
function nameHue(name) {
  let h = 0;
  for (const c of (name || "?")) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h % 360;
}

// ── Section renderers ─────────────────────────────────────────────────────

function renderHero(game, artworkMap) {
  const heroUrl = artworkMap.get(`${game.id}:hero`);
  const hue     = nameHue(game.name);
  const isUnlinked = game.rootPath == null;

  const heroStyle = heroUrl
    ? `background-image: url('${heroUrl}'); background-size: cover; background-position: center top;`
    : `background: linear-gradient(160deg, hsl(${hue},35%,15%), hsl(${(hue+50)%360},25%,8%));`;

  const unlinkedFilter = isUnlinked ? " filter: grayscale(1) opacity(0.5);" : "";

  return `
    <div class="detail-hero" style="${heroStyle}${unlinkedFilter}" aria-hidden="true">
      <div class="detail-hero-scrim"></div>
      <button class="detail-back-btn" aria-label="Back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
    </div>
  `.trim();
}

function renderCover(game, artworkMap) {
  const gridUrl = artworkMap.get(`${game.id}:grid`);
  const hue     = nameHue(game.name);
  const isUnlinked = game.rootPath == null;
  const unlinkedStyle = isUnlinked ? " filter: grayscale(1) opacity(0.5);" : "";

  if (gridUrl) {
    return `
      <div class="detail-cover" style="${unlinkedStyle}">
        <img src="${gridUrl}" alt="${escHtml(game.name)} cover art"
             onerror="this.parentElement.innerHTML='<div class=detail-cover-placeholder style=background:linear-gradient(145deg,hsl(${hue},35%,18%),hsl(${(hue+40)%360},25%,12%))>${escHtml((game.name[0] || "?").toUpperCase())}</div>'">
      </div>
    `.trim();
  }

  return `
    <div class="detail-cover" style="${unlinkedStyle}">
      <div class="detail-cover-placeholder"
           style="background: linear-gradient(145deg, hsl(${hue},35%,18%), hsl(${(hue+40)%360},25%,12%))">
        ${escHtml((game.name[0] || "?").toUpperCase())}
      </div>
    </div>
  `.trim();
}

function renderProtonSelector(game, protonVersions) {
  if (protonVersions.length === 0) {
    return `
      <div class="detail-stat">
        <span class="detail-stat-label">Proton</span>
        <span class="detail-stat-value" style="color:var(--text-muted)">No Proton versions detected</span>
      </div>
    `.trim();
  }

  const currentId = game.protonId ?? "";
  const options = [
    `<option value="">Use default (${escHtml(protonVersions[0]?.label ?? "—")})</option>`,
    ...protonVersions.map(
      (v) => `<option value="${escHtml(v.id)}" ${v.id === currentId ? "selected" : ""}>${escHtml(v.label)}</option>`
    ),
  ].join("");

  return `
    <div class="detail-stat">
      <label class="detail-stat-label" for="proton-select">Proton version</label>
      <select id="proton-select" class="select" style="margin-top:4px">
        ${options}
      </select>
    </div>
  `.trim();
}

function renderGameInfo(info) {
  if (!info) return "";

  const rows = [];

  if (info.shortDesc) {
    rows.push(`<p class="detail-game-desc">${escHtml(info.shortDesc)}</p>`);
  }

  const meta = [];
  if (info.developer)   meta.push({ label: "Developer",    value: info.developer });
  if (info.publisher)   meta.push({ label: "Publisher",     value: info.publisher });
  if (info.releaseDate) meta.push({ label: "Release date",  value: info.releaseDate });
  if (info.metacritic)  meta.push({ label: "Metacritic",    value: String(info.metacritic) });

  if (info.genres) {
    try {
      const parsed = JSON.parse(info.genres);
      if (Array.isArray(parsed) && parsed.length > 0) {
        meta.push({ label: "Genres", value: parsed.join(", ") });
      }
    } catch { /* malformed — skip */ }
  }

  if (meta.length > 0) {
    const metaHtml = meta.map(
      (m) => `
        <div class="detail-stat">
          <span class="detail-stat-label">${escHtml(m.label)}</span>
          <span class="detail-stat-value">${escHtml(m.value)}</span>
        </div>`
    ).join("");
    rows.push(`<div class="detail-stats detail-game-meta">${metaHtml}</div>`);
  }

  return rows.length > 0
    ? `<div class="detail-game-info">${rows.join("")}</div>`
    : "";
}

// ── Progress circle ──────────────────────────────────────────────────────

/**
 * SVG donut ring showing game completion percentage.
 * - Green arc proportional to `progress` (0–100)
 * - Percentage number centered inside the ring
 * - Pencil icon to open inline edit; hidden when progress is 0 and no override
 */
function renderProgressCircle(game) {
  const pct    = game.progress ?? 0;
  const hasOverride = game.progressOverride !== null && game.progressOverride !== undefined;

  const size   = 44;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return `
    <div class="progress-circle-wrapper" title="Progress: ${pct}%${hasOverride ? " (manual)" : ""}">
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
      <button class="progress-edit-btn" aria-label="Edit progress" title="Edit progress">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
  `.trim();
}

/**
 * Inline progress edit form — number input (0–100) + Save + Reset to auto.
 * Rendered hidden; toggled visible by the pencil button click.
 */
function renderProgressEditor(game) {
  const pct = game.progress ?? 0;
  const hasOverride = game.progressOverride !== null && game.progressOverride !== undefined;

  return `
    <div id="progress-editor" class="progress-editor" hidden>
      <label class="detail-stat-label" for="progress-input">Set progress (%)</label>
      <div class="progress-editor-row">
        <input type="number" id="progress-input" class="input" min="0" max="100" step="1"
               value="${hasOverride ? game.progressOverride : pct}"
               style="width:70px" aria-label="Progress percentage">
        <button id="progress-save-btn" class="btn btn-primary">Save</button>
        ${hasOverride ? `<button id="progress-reset-btn" class="btn btn-ghost">Reset to auto</button>` : ""}
        <button id="progress-cancel-btn" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `.trim();
}

function renderActionButton(game, isRunning, protonVersions) {
  // Unlinked game — show "Add to Library" path input instead of Launch
  if (game.rootPath == null) {
    return `
      <div class="detail-add-to-library">
        <button id="add-library-btn" class="btn btn-primary">Add to Library</button>
        <div id="add-library-form" class="detail-add-form" hidden>
          <label class="detail-stat-label" for="game-path-input">Game directory path</label>
          <div class="detail-add-form-row">
            <input type="text" id="game-path-input" class="input"
                   placeholder="/home/user/Games/${escHtml(game.name)}"
                   autocomplete="off" aria-label="Game directory path">
            <button id="submit-path-btn" class="btn btn-primary">Set Path</button>
          </div>
        </div>
      </div>
    `.trim();
  }

  if (isRunning) {
    return `<button id="kill-btn" class="btn btn-kill" data-id="${game.id}">■ Close Game</button>`;
  }
  // No Proton installed and no per-game override — launch would fail immediately
  if (protonVersions.length === 0 && !game.protonId) {
    return `
      <button id="launch-btn" class="btn btn-launch" disabled
              title="No Proton version installed — install Proton-GE or another Proton build first">
        ▶ Launch (no Proton)
      </button>
    `.trim();
  }
  return `<button id="launch-btn" class="btn btn-launch" data-id="${game.id}">▶ Launch</button>`;
}

// ── Main render ───────────────────────────────────────────────────────────

const _container = document.getElementById("view-detail");

/** @param {string} id  @param {typeof state} appState */
export async function renderDetail(id, appState) {
  // Show loading skeleton while fetching
  _container.innerHTML = `<div class="detail-loading" aria-label="Loading game details…"></div>`;
  setKeyHandler(handleDetailKeydown);

  // ── Fetch game record ────────────────────────────────────────────────────
  let game;
  try {
    game = await api.getGame(id);
  } catch (err) {
    _container.innerHTML = `
      <div class="view-error">
        <strong>Game not found</strong>
        <p>${escHtml(err.message)}</p>
        <a href="#library" class="btn btn-secondary" style="margin-top:12px">← Back to Library</a>
      </div>
    `;
    return;
  }

  // ── Fetch artwork + game info in parallel ─────────────────────────────────
  const artworkMap = new Map();
  let gameInfoData = null;

  await Promise.allSettled([
    (async () => {
      try {
        const records = await api.listArtwork(id);
        for (const r of records) {
          artworkMap.set(`${id}:${r.type}`, api.artworkUrl(id, r.type));
        }
      } catch { /* no artwork — placeholders will render */ }
    })(),
    (async () => {
      try {
        gameInfoData = await api.getGameInfo(id);
      } catch { /* no game info yet — will show nothing */ }
    })(),
  ]);

  // ── Running state ────────────────────────────────────────────────────────
  const isRunning  = appState.runningGames.has(id);
  const runInfo    = appState.runningGames.get(id);

  // ── Play stats ───────────────────────────────────────────────────────────
  const playTime   = formatPlayTime(game.playTimeSeconds);
  const lastPlayed = formatLastPlayed(game.lastPlayed);

  const isUnlinked = game.rootPath == null;

  const runningBadge = isRunning
    ? `<span class="running-badge" aria-label="Running"><span class="running-dot"></span>Running</span>`
    : "";

  const uninstalledBadge = isUnlinked
    ? `<span class="uninstalled-badge" aria-label="Not Installed">Not Installed</span>`
    : "";

  // ── Assemble page ────────────────────────────────────────────────────────
  _container.innerHTML = `
    ${renderHero(game, artworkMap)}

    <div class="detail-body">
      ${renderCover(game, artworkMap)}

      <div class="detail-info">

        <div class="detail-title-row">
          <h1 class="detail-title">${escHtml(game.name)}</h1>
          ${runningBadge}
          ${uninstalledBadge}
          ${renderProgressCircle(game)}
        </div>

        <div class="detail-stats">
          <div class="detail-stat">
            <span class="detail-stat-label">Play time</span>
            <span class="detail-stat-value">${escHtml(playTime)}</span>
          </div>
          ${lastPlayed ? `
          <div class="detail-stat">
            <span class="detail-stat-label">Last played</span>
            <span class="detail-stat-value">${escHtml(lastPlayed)}</span>
          </div>` : ""}
          ${isRunning && runInfo ? `
          <div class="detail-stat">
            <span class="detail-stat-label">Session started</span>
            <span class="detail-stat-value">${escHtml(formatLastPlayed(runInfo.startedAt)) ?? "Just now"}</span>
          </div>` : ""}
        </div>

        ${renderProgressEditor(game)}

        ${renderGameInfo(gameInfoData)}

        ${isUnlinked ? "" : renderProtonSelector(game, appState.protonVersions)}

        <div class="detail-actions">
          ${renderActionButton(game, isRunning, appState.protonVersions)}
        </div>

        <div id="detail-error" class="detail-error" hidden></div>

      </div>
    </div>
  `.trim();

  // ── Wire back button ─────────────────────────────────────────────────────
  const backBtn = _container.querySelector(".detail-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      location.hash = state.previousHash || "#library";
    });
  }

  // ── Wire Proton selector ─────────────────────────────────────────────────
  const protonSelect = _container.querySelector("#proton-select");
  if (protonSelect) {
    protonSelect.addEventListener("change", async () => {
      const newId = protonSelect.value || null;
      try {
        await api.updateGame(id, { protonId: newId });
        toast("Proton version saved", "success", 2000);
      } catch (err) {
        toast(`Failed to save: ${err.message}`, "error");
        // Revert selector to previous value
        protonSelect.value = game.protonId ?? "";
      }
    });
  }

  // ── Wire progress circle edit ─────────────────────────────────────────────
  const progressEditBtn = _container.querySelector(".progress-edit-btn");
  const progressEditor  = _container.querySelector("#progress-editor");
  if (progressEditBtn && progressEditor) {
    progressEditBtn.addEventListener("click", () => {
      progressEditor.hidden = !progressEditor.hidden;
      if (!progressEditor.hidden) {
        _container.querySelector("#progress-input")?.focus();
      }
    });

    const cancelBtn = _container.querySelector("#progress-cancel-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => { progressEditor.hidden = true; });
    }

    const saveBtn   = _container.querySelector("#progress-save-btn");
    const progInput = _container.querySelector("#progress-input");
    if (saveBtn && progInput) {
      saveBtn.addEventListener("click", async () => {
        const val = parseInt(progInput.value, 10);
        if (isNaN(val) || val < 0 || val > 100) {
          showDetailError("Progress must be 0–100");
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        hideDetailError();
        try {
          await api.setProgress(id, val);
          toast("Progress saved", "success", 2000);
          appState.games = [];
          renderDetail(id, appState);
        } catch (err) {
          showDetailError(`Failed to save progress: ${err.message}`);
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
        }
      });
    }

    const resetBtn = _container.querySelector("#progress-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        resetBtn.disabled = true;
        resetBtn.textContent = "Resetting…";
        hideDetailError();
        try {
          await api.setProgress(id, null);
          toast("Progress reset to auto", "success", 2000);
          appState.games = [];
          renderDetail(id, appState);
        } catch (err) {
          showDetailError(`Failed to reset progress: ${err.message}`);
          resetBtn.disabled = false;
          resetBtn.textContent = "Reset to auto";
        }
      });
    }
  }

  // ── Wire Launch button ───────────────────────────────────────────────────
  const launchBtn = _container.querySelector("#launch-btn");
  if (launchBtn) {
    launchBtn.addEventListener("click", async () => {
      launchBtn.disabled = true;
      launchBtn.textContent = "Launching…";
      hideDetailError();
      try {
        await api.launchGame(id);
        // Running state update arrives via WS launch_status event
      } catch (err) {
        showDetailError(`Failed to launch: ${err.message}`);
        launchBtn.disabled = false;
        launchBtn.textContent = "▶ Launch";
      }
    });
  }

  // ── Wire Add to Library button ───────────────────────────────────────────
  const addLibraryBtn = _container.querySelector("#add-library-btn");
  if (addLibraryBtn) {
    const addForm = _container.querySelector("#add-library-form");
    addLibraryBtn.addEventListener("click", () => {
      addLibraryBtn.hidden = true;
      addForm.hidden = false;
      _container.querySelector("#game-path-input")?.focus();
    });

    const submitPathBtn = _container.querySelector("#submit-path-btn");
    const pathInput     = _container.querySelector("#game-path-input");

    submitPathBtn.addEventListener("click", () => submitPath());
    pathInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitPath(); }
    });

    async function submitPath() {
      const rootPath = pathInput.value.trim();
      if (!rootPath) return;
      submitPathBtn.disabled = true;
      submitPathBtn.textContent = "Setting…";
      hideDetailError();
      try {
        await api.setGamePath(id, rootPath);
        toast("Game path set — re-linked!", "success", 3000);
        // Invalidate game cache and re-render to show installed state
        appState.games = [];
        renderDetail(id, appState);
      } catch (err) {
        showDetailError(`Failed to set path: ${err.message}`);
        submitPathBtn.disabled = false;
        submitPathBtn.textContent = "Set Path";
      }
    }
  }

  // ── Wire Kill button ─────────────────────────────────────────────────────
  const killBtn = _container.querySelector("#kill-btn");
  if (killBtn) {
    killBtn.addEventListener("click", async () => {
      killBtn.disabled = true;
      killBtn.textContent = "Stopping…";
      hideDetailError();
      try {
        await api.killGame(id);
      } catch (err) {
        showDetailError(`Failed to close: ${err.message}`);
        killBtn.disabled = false;
        killBtn.textContent = "■ Close Game";
      }
    });
  }
}

// ── Error helpers ─────────────────────────────────────────────────────────

function showDetailError(msg) {
  const el = _container.querySelector("#detail-error");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideDetailError() {
  const el = _container.querySelector("#detail-error");
  if (el) el.hidden = true;
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
