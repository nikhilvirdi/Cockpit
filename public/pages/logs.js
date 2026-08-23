// public/pages/logs.js — Cockpit Logs viewer with filtering and live tail streaming
import { getLogs } from '../js/api.js';
import { on, off } from '../js/sse.js';
import { escapeHtml } from '../js/utils.js';

let isLive = false;
let logListener = null;
let currentLoadedCount = 0;
let currentFilename = 'cockpit.log';
let activeFilters = { level: 'ALL', keyword: '' };

function getLevelColor(level) {
    const lvl = (level || '').toUpperCase();
    if (lvl === 'ERROR') return '#990000';
    if (lvl === 'WARN') return '#8B5A00';
    if (lvl === 'INFO') return '#222222';
    return '#555555';
}

function formatLogLine(log) {
    const time = log.timestamp ? `[${escapeHtml(log.timestamp)}]` : '[—]';
    const lvl = (log.level || 'UNKNOWN').toUpperCase();
    const lvlColor = getLevelColor(lvl);
    const msg = escapeHtml(log.message || '');

    return `<div class="log-line" style="padding: 1px 0; border-bottom: 1px dotted #ececec; font-family: monospace, 'Courier New', Courier; font-size: 11px; line-height: 1.4; white-space: pre-wrap; word-break: break-all;">
        <span style="color: #666; margin-right: 6px;">${time}</span>
        <span style="font-weight: bold; color: ${lvlColor}; margin-right: 8px; min-width: 50px; display: inline-block;">[${lvl}]</span>
        <span>${msg}</span>
    </div>`;
}

function updateStatusLine(count, filename) {
    currentLoadedCount = count;
    currentFilename = filename;
    const statusText = document.getElementById('log-status-text');
    if (statusText) {
        statusText.textContent = `Showing ${count} entries from ${filename}`;
    }
}

function matchesFilter(log, filters) {
    if (!log) return false;
    // Check level filter
    if (filters.level && filters.level !== 'ALL') {
        if ((log.level || '').toUpperCase() !== filters.level.toUpperCase()) {
            return false;
        }
    }
    // Check keyword filter
    if (filters.keyword && filters.keyword.trim() !== '') {
        const kw = filters.keyword.trim().toLowerCase();
        const msg = (log.message || '').toLowerCase();
        if (!msg.includes(kw)) {
            return false;
        }
    }
    return true;
}

function handleIncomingLog(log) {
    // Only append if it matches the current active filters
    if (!matchesFilter(log, activeFilters)) {
        return;
    }

    const container = document.getElementById('log-content-body');
    if (!container) return;

    // If empty placeholder is shown, clear it first
    if (container.querySelector('.log-empty-msg')) {
        container.innerHTML = '';
    }

    const lineHtml = formatLogLine(log);
    container.insertAdjacentHTML('beforeend', lineHtml);

    currentLoadedCount++;
    updateStatusLine(currentLoadedCount, currentFilename);

    // Auto-scroll to bottom
    const panel = document.getElementById('log-display-panel');
    if (panel) {
        panel.scrollTop = panel.scrollHeight;
    }
}

async function fetchAndRenderLogs() {
    const fileInput = document.getElementById('log-file-input');
    const levelSelect = document.getElementById('log-level-select');
    const keywordInput = document.getElementById('log-keyword-input');
    const container = document.getElementById('log-content-body');
    const panel = document.getElementById('log-display-panel');

    if (!container) return;

    const filename = fileInput ? fileInput.value.trim() || 'cockpit.log' : 'cockpit.log';
    const level = levelSelect ? levelSelect.value : 'ALL';
    const keyword = keywordInput ? keywordInput.value.trim() : '';

    activeFilters = { level, keyword };

    const filters = {};
    if (level !== 'ALL') filters.level = level;
    if (keyword !== '') filters.keyword = keyword;

    container.innerHTML = '<div class="log-empty-msg" style="color: grey; padding: 12px; font-family: monospace; font-size: 11px;">Loading logs...</div>';

    try {
        const logs = await getLogs(filename, filters);

        if (!Array.isArray(logs) || logs.length === 0) {
            container.innerHTML = '<div class="log-empty-msg" style="color: grey; padding: 12px; font-family: monospace; font-size: 11px;">No matching log entries found.</div>';
            updateStatusLine(0, filename);
            return;
        }

        container.innerHTML = logs.map(formatLogLine).join('');
        updateStatusLine(logs.length, filename);

        // Auto-scroll to bottom so recent logs are in view
        if (panel) {
            panel.scrollTop = panel.scrollHeight;
        }
    } catch (err) {
        container.innerHTML = `<div class="log-empty-msg" style="color: red; padding: 12px; font-family: monospace; font-size: 11px; font-weight: bold;">Error loading log file "${escapeHtml(filename)}": ${escapeHtml(err.message)}</div>`;
        updateStatusLine(0, filename);
    }
}

function toggleLiveMode() {
    const btnLive = document.getElementById('btn-live-logs');
    isLive = !isLive;

    if (isLive) {
        if (btnLive) {
            btnLive.style.boxShadow = 'inset 1px 1px #0a0a0a, inset -1px -1px #fff, inset 2px 2px grey, inset -2px -2px #dfdfdf';
            btnLive.style.background = '#e0e0e0';
            btnLive.style.color = '#008000';
            btnLive.style.fontWeight = 'bold';
            btnLive.textContent = '● Live: ON';
        }

        logListener = (payload) => {
            handleIncomingLog(payload);
        };
        on('log:new', logListener);
    } else {
        if (btnLive) {
            btnLive.style.boxShadow = '';
            btnLive.style.background = '';
            btnLive.style.color = '';
            btnLive.style.fontWeight = 'normal';
            btnLive.textContent = 'Live';
        }

        if (logListener) {
            off('log:new', logListener);
            logListener = null;
        }
    }
}

function handleClearFilters() {
    const fileInput = document.getElementById('log-file-input');
    const levelSelect = document.getElementById('log-level-select');
    const keywordInput = document.getElementById('log-keyword-input');

    if (fileInput) fileInput.value = 'cockpit.log';
    if (levelSelect) levelSelect.value = 'ALL';
    if (keywordInput) keywordInput.value = '';

    fetchAndRenderLogs();
}

export async function render() {
    return `
<div class="page-logs" style="display: flex; flex-direction: column; height: 100%; gap: 6px;">
  <!-- Filter Controls Fieldset -->
  <fieldset style="flex-shrink: 0; padding: 6px 8px; margin: 0;">
    <legend>Log Filters</legend>
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 4px;">
          <label for="log-file-input" style="font-size: 11px;">File:</label>
          <input type="text" id="log-file-input" value="cockpit.log" style="width: 120px;" />
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <label for="log-level-select" style="font-size: 11px;">Level:</label>
          <select id="log-level-select" style="min-width: 75px;">
            <option value="ALL">ALL</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <label for="log-keyword-input" style="font-size: 11px;">Keyword:</label>
          <input type="text" id="log-keyword-input" placeholder="Search..." style="width: 140px;" />
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 6px;">
        <button id="btn-apply-logs" style="min-width: 65px;">Apply</button>
        <button id="btn-live-logs" style="min-width: 75px;">Live</button>
        <button id="btn-clear-logs" style="min-width: 65px;">Clear</button>
      </div>
    </div>
  </fieldset>

  <!-- Log Content Display -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px; margin: 0;">
    <legend>Log Output</legend>
    <div id="log-display-panel" class="sunken-panel" style="flex: 1; overflow-y: auto; overflow-x: auto; background: #fff; padding: 6px;">
      <div id="log-content-body">
        <div class="log-empty-msg" style="color: grey; padding: 12px; font-family: monospace; font-size: 11px;">Loading logs...</div>
      </div>
    </div>
    
    <!-- Footer / Status Area -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 11px; color: #333;">
      <span id="log-status-text">Showing 0 entries from cockpit.log</span>
      <span style="color: grey;">UTF-8 log stream</span>
    </div>
  </fieldset>
</div>
    `;
}

export async function afterRender() {
    isLive = false;
    logListener = null;

    const btnApply = document.getElementById('btn-apply-logs');
    if (btnApply) {
        btnApply.addEventListener('click', fetchAndRenderLogs);
    }

    const btnLive = document.getElementById('btn-live-logs');
    if (btnLive) {
        btnLive.addEventListener('click', toggleLiveMode);
    }

    const btnClear = document.getElementById('btn-clear-logs');
    if (btnClear) {
        btnClear.addEventListener('click', handleClearFilters);
    }

    // Allow Enter key in filter inputs to trigger Apply
    const inputs = [document.getElementById('log-file-input'), document.getElementById('log-keyword-input')];
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') fetchAndRenderLogs();
            });
        }
    });

    const levelSelect = document.getElementById('log-level-select');
    if (levelSelect) {
        levelSelect.addEventListener('change', fetchAndRenderLogs);
    }

    // Initial fetch on page load
    await fetchAndRenderLogs();
}

export function cleanup() {
    if (logListener) {
        off('log:new', logListener);
        logListener = null;
    }
    isLive = false;
}
