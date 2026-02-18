/**
 * settings.js — Settings page
 *
 * Sections:
 *   • Scan paths  — add / remove directory paths; triggers scan when saved
 *   • Default Proton version selector
 *   • SteamGridDB API key input (show/hide toggle)
 *   • Scan Now button
 *
 * Behaviour:
 *   • Loads current settings from state.settings on every render
 *   • "Save settings" persists everything via api.updateSettings()
 *   • "Scan Now" triggers api.startScan() — progress shown via WS banner
 *   • Escape key → back to #library
 */

import { api }                      from "../api.js";
import { state, toast, setKeyHandler } from "../app.js";

// ── Keyboard handler ──────────────────────────────────────────────────────

function handleSettingsKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    location.hash = state.previousHash || "#home";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function renderPathList(paths) {
  if (paths.length === 0) {
    return `<p class="settings-empty-paths">No scan paths configured. Add a path below.</p>`;
  }
  return paths
    .map(
      (p, i) => `
      <div class="scan-path-row" data-index="${i}">
        <span class="scan-path-text" title="${escHtml(p)}">${escHtml(p)}</span>
        <button class="btn btn-ghost remove-path-btn" data-index="${i}" aria-label="Remove path">✕</button>
      </div>
    `.trim()
    )
    .join("");
}

function renderProtonOptions(versions, currentId) {
  if (versions.length === 0) {
    return `<option value="">No Proton versions detected</option>`;
  }
  return versions
    .map(
      (v) =>
        `<option value="${escHtml(v.id)}" ${v.id === currentId ? "selected" : ""}>${escHtml(v.label)}</option>`
    )
    .join("");
}

// ── Main render ───────────────────────────────────────────────────────────

const _container = document.getElementById("view-settings");

/** @param {typeof state} appState */
export async function renderSettings(appState) {
  setKeyHandler(handleSettingsKeydown);

  // Work off a mutable local copy of settings so we can track edits
  const cfg = { ...appState.settings };
  // scanPaths may be missing from older settings — default to empty array
  const scanPaths = Array.isArray(cfg.scanPaths) ? [...cfg.scanPaths] : [];

  function rebuild() {
    const protonOptions = renderProtonOptions(
      appState.protonVersions,
      cfg.defaultProtonVersion ?? ""
    );

    _container.innerHTML = `
      <div class="settings-page">
        <div class="settings-header">
          <a href="${escHtml(appState.previousHash || "#home")}" class="btn btn-ghost settings-back-btn" aria-label="Go back">←</a>
          <h1 class="settings-title">Settings</h1>
        </div>

        <!-- ── Scan paths ──────────────────────────────────────────────── -->
        <section class="settings-section" aria-labelledby="scan-paths-heading">
          <h2 class="settings-section-title" id="scan-paths-heading">Scan Paths</h2>
          <p class="settings-section-desc">
            Directories LPGL will search for Windows game executables.
          </p>

          <div id="path-list" class="scan-path-list">
            ${renderPathList(scanPaths)}
          </div>

          <div class="scan-path-add-row">
            <input
              type="text"
              id="new-path-input"
              class="input"
              placeholder="/home/user/Games"
              aria-label="New scan path"
              autocomplete="off"
            >
            <button id="add-path-btn" class="btn btn-secondary">Add path</button>
          </div>
        </section>

        <!-- ── Default Proton ──────────────────────────────────────────── -->
        <section class="settings-section" aria-labelledby="proton-heading">
          <h2 class="settings-section-title" id="proton-heading">Default Proton Version</h2>
          <p class="settings-section-desc">
            Used when a game has no per-game override.
          </p>
          <select id="default-proton-select" class="select" ${appState.protonVersions.length === 0 ? "disabled" : ""}>
            ${protonOptions}
          </select>
        </section>

        <!-- ── SteamGridDB API key ─────────────────────────────────────── -->
        <section class="settings-section" aria-labelledby="api-key-heading">
          <h2 class="settings-section-title" id="api-key-heading">SteamGridDB API Key</h2>
          <p class="settings-section-desc">
            Required for automatic artwork downloads.
            Get a free key at
            <a href="https://www.steamgriddb.com/profile/preferences/api" target="_blank" rel="noopener"
               style="color:var(--accent)">steamgriddb.com</a>.
          </p>
          <div class="api-key-row">
            <input
              type="password"
              id="api-key-input"
              class="input"
              value="${escHtml(cfg.steamGridDbApiKey ?? "")}"
              placeholder="Paste your API key…"
              autocomplete="off"
              aria-label="SteamGridDB API key"
            >
            <button id="api-key-toggle" class="btn btn-ghost" aria-label="Show / hide API key">Show</button>
          </div>
        </section>

        <!-- ── Library refresh ────────────────────────────────────────── -->
        <section class="settings-section" aria-labelledby="library-refresh-heading">
          <h2 class="settings-section-title" id="library-refresh-heading">Library</h2>
          <p class="settings-section-desc">
            Re-download all artwork and game info from scratch. This cannot be undone.
          </p>
          <button id="refresh-library-btn" class="btn btn-secondary">Refresh Library</button>
        </section>

        <!-- ── Advanced ─────────────────────────────────────────────── -->
        <section class="settings-section" aria-labelledby="advanced-heading">
          <h2 class="settings-section-title" id="advanced-heading">Advanced</h2>

          <label class="settings-toggle-row">
            <input
              type="checkbox"
              id="show-uninstalled-toggle"
              ${cfg.showUninstalledGames ? "checked" : ""}
            >
            <span>Show uninstalled games in Library</span>
          </label>
          <p class="settings-section-desc" style="margin-top:4px">
            Display soft-unlinked games (greyed out) alongside installed games.
          </p>
        </section>

        <!-- ── Tools ──────────────────────────────────────────────────── -->
        <section class="settings-section" aria-labelledby="tools-heading">
          <h2 class="settings-section-title" id="tools-heading">Tools</h2>
          <a href="/controller-test.html" target="_blank" rel="noopener"
             class="btn btn-secondary" style="display:inline-block;text-decoration:none">Controller Tester</a>
          <p class="settings-section-desc" style="margin-top:4px">
            Open the gamepad diagnostic page to test controller inputs.
          </p>
        </section>

        <!-- ── Actions ────────────────────────────────────────────────── -->
        <div class="settings-actions">
          <button id="save-btn" class="btn btn-primary">Save settings</button>
          <button id="scan-btn" class="btn btn-secondary">Scan Now</button>
        </div>

        <div id="settings-error" class="detail-error" hidden></div>
      </div>
    `.trim();

    wireEvents();
  }

  // ── Event wiring (called after every rebuild) ────────────────────────────

  function wireEvents() {

    // Remove path
    _container.querySelectorAll(".remove-path-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index);
        scanPaths.splice(idx, 1);
        cfg.scanPaths = [...scanPaths];
        rebuild();
      });
    });

    // Add path
    const addBtn      = _container.querySelector("#add-path-btn");
    const newPathInput = _container.querySelector("#new-path-input");

    addBtn.addEventListener("click", addPath);
    newPathInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addPath(); }
    });

    function addPath() {
      const val = newPathInput.value.trim();
      if (!val) return;
      if (scanPaths.includes(val)) {
        toast("Path already in list", "info", 2000);
        return;
      }
      scanPaths.push(val);
      cfg.scanPaths = [...scanPaths];
      rebuild();
    }

    // Default Proton selector — update cfg immediately (no network call yet)
    const protonSel = _container.querySelector("#default-proton-select");
    if (protonSel) {
      protonSel.addEventListener("change", () => {
        cfg.defaultProtonVersion = protonSel.value || null;
      });
    }

    // API key show/hide
    const apiKeyInput  = _container.querySelector("#api-key-input");
    const apiKeyToggle = _container.querySelector("#api-key-toggle");
    apiKeyToggle.addEventListener("click", () => {
      const isPassword = apiKeyInput.type === "password";
      apiKeyInput.type    = isPassword ? "text" : "password";
      apiKeyToggle.textContent = isPassword ? "Hide" : "Show";
    });
    apiKeyInput.addEventListener("input", () => {
      cfg.steamGridDbApiKey = apiKeyInput.value;
    });

    // Show uninstalled games toggle
    const uninstalledToggle = _container.querySelector("#show-uninstalled-toggle");
    uninstalledToggle.addEventListener("change", () => {
      cfg.showUninstalledGames = uninstalledToggle.checked;
    });

    // Save
    const saveBtn = _container.querySelector("#save-btn");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled     = true;
      saveBtn.textContent  = "Saving…";
      hideError();

      const patch = {
        scanPaths:            [...scanPaths],
        defaultProtonVersion: cfg.defaultProtonVersion ?? null,
        steamGridDbApiKey:    cfg.steamGridDbApiKey ?? "",
        showUninstalledGames: cfg.showUninstalledGames ?? false,
      };

      try {
        const saved = await api.updateSettings(patch);
        // Push into shared state so other views see the update
        Object.assign(appState.settings, saved);
        toast("Settings saved", "success", 2500);
      } catch (err) {
        showError(`Failed to save settings: ${err.message}`);
      } finally {
        saveBtn.disabled    = false;
        saveBtn.textContent = "Save settings";
      }
    });

    // Refresh Library
    const refreshLibraryBtn = _container.querySelector("#refresh-library-btn");
    refreshLibraryBtn.addEventListener("click", async () => {
      refreshLibraryBtn.disabled    = true;
      refreshLibraryBtn.textContent = "Refreshing…";
      hideError();
      try {
        await api.refreshLibrary();
        toast("Library refresh started — artwork and game info will re-download in the background", "info", 5000);
      } catch (err) {
        showError(`Failed to refresh library: ${err.message}`);
      } finally {
        refreshLibraryBtn.disabled    = false;
        refreshLibraryBtn.textContent = "Refresh Library";
      }
    });

    // Scan Now
    const scanBtn = _container.querySelector("#scan-btn");
    scanBtn.addEventListener("click", async () => {
      if (scanPaths.length === 0) {
        toast("Add at least one scan path first", "info");
        return;
      }
      scanBtn.disabled    = true;
      scanBtn.textContent = "Starting scan…";
      hideError();

      try {
        await api.startScan(scanPaths);
        toast("Scan started", "info", 2000);
      } catch (err) {
        showError(`Failed to start scan: ${err.message}`);
      } finally {
        scanBtn.disabled    = false;
        scanBtn.textContent = "Scan Now";
      }
    });
  }

  // First render
  rebuild();
}

// ── Error helpers ─────────────────────────────────────────────────────────

function showError(msg) {
  const el = document.querySelector("#settings-error");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideError() {
  const el = document.querySelector("#settings-error");
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
