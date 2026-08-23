// public/pages/commands.js — Cockpit Command execution and streamed SSE output
import { getConfig, runCommand } from '../js/api.js';
import { on, off } from '../js/sse.js';
import { escapeHtml } from '../js/utils.js';

let trackedCommandId = null;
let commandListener = null;

function setCommandState(state, color = '#000') {
    const statusBadge = document.getElementById('cmd-info-status');
    if (statusBadge) {
        statusBadge.textContent = state;
        statusBadge.style.color = color;
    }
}

function updateCommandControls(enabled) {
    const select = document.getElementById('cmd-select');
    const btnRun = document.getElementById('btn-run-cmd');
    if (select) select.disabled = !enabled;
    if (btnRun) btnRun.disabled = !enabled;
}

function appendOutputChunk(htmlChunk) {
    const outputPre = document.getElementById('cmd-output-pre');
    if (!outputPre) return;

    outputPre.insertAdjacentHTML('beforeend', htmlChunk);

    // Auto-scroll output panel to bottom
    const panel = document.getElementById('cmd-output-panel');
    if (panel) {
        panel.scrollTop = panel.scrollHeight;
    }
}

function handleCommandOutput(payload) {
    if (!trackedCommandId || !payload || payload.commandId !== trackedCommandId) {
        return;
    }

    if (payload.stream === 'stdout') {
        const text = escapeHtml(payload.data || '');
        appendOutputChunk(`<span>${text}</span>`);
    } else if (payload.stream === 'stderr') {
        const text = escapeHtml(payload.data || '');
        appendOutputChunk(`<span style="color: #990000;">${text}</span>`);
    } else if (payload.stream === 'exit') {
        const isSuccess = payload.success !== false && payload.exitCode === 0;
        const exitColor = isSuccess ? '#008000' : '#990000';
        const exitText = `\n[Process exited with code ${payload.exitCode}]\n`;

        appendOutputChunk(`<div style="margin-top: 4px; font-weight: bold; color: ${exitColor};">${escapeHtml(exitText)}</div>`);

        setCommandState(isSuccess ? 'FINISHED' : 'FAILED', exitColor);
        updateCommandControls(true);
        trackedCommandId = null;
    }
}

async function handleRunClick() {
    const select = document.getElementById('cmd-select');
    if (!select || !select.value) return;

    const commandName = select.value;
    const outputPre = document.getElementById('cmd-output-pre');
    const infoName = document.getElementById('cmd-info-name');
    const infoId = document.getElementById('cmd-info-id');

    updateCommandControls(false);
    setCommandState('RUNNING', '#000080');

    if (infoName) infoName.textContent = commandName;
    if (infoId) infoId.textContent = 'Starting...';
    if (outputPre) outputPre.innerHTML = '';

    try {
        const res = await runCommand(commandName);
        trackedCommandId = res.commandId;

        if (infoId) infoId.textContent = trackedCommandId;

        appendOutputChunk(`<div style="font-weight: bold; color: #000080; margin-bottom: 4px;">$ ${escapeHtml(commandName)} (id: ${escapeHtml(trackedCommandId)})</div>\n`);
    } catch (err) {
        appendOutputChunk(`<div style="color: #990000; font-weight: bold;">Error executing command: ${escapeHtml(err.message)}</div>\n`);
        setCommandState('FAILED', '#990000');
        updateCommandControls(true);
        trackedCommandId = null;
    }
}

export async function render() {
    return `
<div class="page-commands" style="display: flex; flex-direction: column; height: 100%; gap: 6px;">
  <!-- Top: Controls -->
  <fieldset style="flex-shrink: 0; padding: 6px 8px; margin: 0;">
    <legend>Command Launcher</legend>
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <label for="cmd-select" style="font-size: 11px; font-weight: bold;">Command:</label>
        <select id="cmd-select" disabled style="min-width: 160px;">
          <option value="">Loading allowed commands...</option>
        </select>
      </div>

      <div>
        <button id="btn-run-cmd" disabled style="min-width: 70px;">Run</button>
      </div>
    </div>
  </fieldset>

  <!-- Output Area -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px; margin: 0;">
    <legend>Command Output</legend>
    
    <!-- Status Line -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px; color: #333;">
      <div>
        <span><strong>Command:</strong> <span id="cmd-info-name">—</span></span>
        <span style="margin-left: 12px;"><strong>ID:</strong> <span id="cmd-info-id" style="font-family: monospace;">—</span></span>
      </div>
      <div>
        <span><strong>State:</strong> <span id="cmd-info-status" style="font-weight: bold; color: #555;">IDLE</span></span>
      </div>
    </div>

    <!-- Preformatted Output Terminal -->
    <div id="cmd-output-panel" class="sunken-panel" style="flex: 1; overflow: auto; background: #fff; padding: 6px;">
      <pre id="cmd-output-pre" style="margin: 0; font-family: monospace, 'Courier New', Courier; font-size: 11px; line-height: 1.4; white-space: pre-wrap; word-break: break-all; color: #222;">Select a command and click Run.</pre>
    </div>
  </fieldset>
</div>
    `;
}

export async function afterRender() {
    trackedCommandId = null;

    // 1. Subscribe to command:output SSE stream
    commandListener = (payload) => {
        handleCommandOutput(payload);
    };
    on('command:output', commandListener);

    // 2. Attach button listener
    const btnRun = document.getElementById('btn-run-cmd');
    if (btnRun) {
        btnRun.addEventListener('click', handleRunClick);
    }

    // 3. Load config to populate dropdown
    const select = document.getElementById('cmd-select');
    try {
        const cfg = await getConfig();
        const allowed = Array.isArray(cfg.allowedCommands) ? cfg.allowedCommands : [];

        if (select) {
            if (allowed.length === 0) {
                select.innerHTML = '<option value="">No allowed commands configured</option>';
                select.disabled = true;
                if (btnRun) btnRun.disabled = true;
            } else {
                select.innerHTML = allowed.map(cmd => `<option value="${escapeHtml(cmd)}">${escapeHtml(cmd)}</option>`).join('');
                select.disabled = false;
                if (btnRun) btnRun.disabled = false;
            }
        }
    } catch (err) {
        if (select) {
            select.innerHTML = `<option value="">Error loading config: ${escapeHtml(err.message)}</option>`;
            select.disabled = true;
        }
        const outputPre = document.getElementById('cmd-output-pre');
        if (outputPre) {
            outputPre.innerHTML = `<div style="color: #990000; font-weight: bold;">Failed to load server configuration: ${escapeHtml(err.message)}</div>`;
        }
    }
}

export function cleanup() {
    if (commandListener) {
        off('command:output', commandListener);
        commandListener = null;
    }
    trackedCommandId = null;
}
