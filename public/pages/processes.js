// public/pages/processes.js — Cockpit Processes page with inspection and safe termination flow
import { getProcesses, getProcess, terminateProcess } from '../js/api.js';
import { on, off } from '../js/sse.js';
import { escapeHtml, formatBytesFromKB, sortProcessesByUsage } from '../js/utils.js';

let selectedPid = null;
let selectedProcess = null;
let currentProcesses = [];
let isConfirmingTermination = false;
let processListener = null;

function updateDetailPanel() {
    const detailInfo = document.getElementById('proc-detail-info');
    const btnRefresh = document.getElementById('btn-refresh-proc');
    const btnTerminate = document.getElementById('btn-terminate-proc');

    if (!detailInfo || !btnRefresh || !btnTerminate) return;

    if (!selectedProcess) {
        detailInfo.innerHTML = '<span style="color: grey;">No process selected</span>';
        btnRefresh.disabled = true;
        btnTerminate.disabled = true;
        return;
    }

    const pid = selectedProcess.pid;
    const name = escapeHtml(selectedProcess.name || 'Unknown');
    const cpu = (typeof selectedProcess.cpuPercent === 'number') ? `${selectedProcess.cpuPercent.toFixed(1)}%` : '0.0%';
    const mem = formatBytesFromKB(selectedProcess.memory);

    detailInfo.innerHTML = `
        <span><strong>PID:</strong> ${pid}</span>
        <span><strong>Process:</strong> ${name}</span>
        <span><strong>CPU:</strong> ${cpu}</span>
        <span><strong>Memory:</strong> ${mem}</span>
    `;
    btnRefresh.disabled = false;
    btnTerminate.disabled = false;
}

function highlightSelectedRow() {
    const tbody = document.getElementById('proc-table-body');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr[data-pid]');
    rows.forEach(r => {
        const rowPid = parseInt(r.dataset.pid, 10);
        r.classList.toggle('highlighted', rowPid === selectedPid);
    });
}

function handleRowClick(pid) {
    const proc = currentProcesses.find(p => p.pid === pid);
    if (!proc) return;

    selectedPid = pid;
    selectedProcess = proc;
    hideConfirmation();
    clearStatusMessage();
    updateDetailPanel();
    highlightSelectedRow();
}

function showStatusMessage(text, color = 'black') {
    const msgEl = document.getElementById('proc-status-msg');
    if (msgEl) {
        msgEl.textContent = text;
        msgEl.style.color = color;
        msgEl.style.display = 'block';
    }
}

function clearStatusMessage() {
    const msgEl = document.getElementById('proc-status-msg');
    if (msgEl) {
        msgEl.textContent = '';
        msgEl.style.display = 'none';
    }
}

function hideConfirmation() {
    isConfirmingTermination = false;
    const confirmPanel = document.getElementById('proc-terminate-confirm');
    if (confirmPanel) confirmPanel.style.display = 'none';
}

function handleTerminateClick() {
    if (!selectedProcess) return;
    clearStatusMessage();
    isConfirmingTermination = true;

    const confirmPanel = document.getElementById('proc-terminate-confirm');
    const confirmText = document.getElementById('proc-confirm-text');
    if (confirmPanel && confirmText) {
        confirmText.textContent = `Terminate PID ${selectedProcess.pid} (${selectedProcess.name})?`;
        confirmPanel.style.display = 'block';
    }
}

async function handleConfirmTerminate() {
    if (!selectedProcess) return;
    const pidToKill = selectedProcess.pid;
    const nameToKill = selectedProcess.name;
    hideConfirmation();

    const btnTerminate = document.getElementById('btn-terminate-proc');
    const btnRefresh = document.getElementById('btn-refresh-proc');
    if (btnTerminate) btnTerminate.disabled = true;
    if (btnRefresh) btnRefresh.disabled = true;

    try {
        const res = await terminateProcess(pidToKill, nameToKill);
        const httpStatus = res.httpStatus;

        if (httpStatus === 200 && res.success) {
            showStatusMessage(`Process ${pidToKill} (${nameToKill}) terminated successfully.`, 'green');
            selectedPid = null;
            selectedProcess = null;
            updateDetailPanel();
            // Automatically refresh process list
            try {
                const freshList = await getProcesses();
                currentProcesses = freshList;
                renderProcessRows(freshList);
            } catch (e) {}
        } else if (httpStatus === 403) {
            showStatusMessage(`Access Denied: ${res.message || 'Cannot terminate critical process'}`, 'red');
        } else if (httpStatus === 404) {
            showStatusMessage(`Process ${pidToKill} not found (already exited).`, '#800000');
            selectedPid = null;
            selectedProcess = null;
            updateDetailPanel();
            try {
                const freshList = await getProcesses();
                currentProcesses = freshList;
                renderProcessRows(freshList);
            } catch (e) {}
        } else if (httpStatus === 409) {
            showStatusMessage(`Conflict: ${res.message}`, 'red');
            try {
                const freshList = await getProcesses();
                currentProcesses = freshList;
                renderProcessRows(freshList);
            } catch (e) {}
        } else {
            showStatusMessage(`Termination failed: ${res.message || 'HTTP ' + httpStatus}`, 'red');
        }
    } catch (err) {
        showStatusMessage(`Error: ${err.message}`, 'red');
    } finally {
        if (btnRefresh) btnRefresh.disabled = (selectedPid === null);
        if (btnTerminate) btnTerminate.disabled = (selectedPid === null);
    }
}

async function handleRefreshClick() {
    if (selectedPid === null) return;
    clearStatusMessage();

    const btnRefresh = document.getElementById('btn-refresh-proc');
    if (btnRefresh) btnRefresh.disabled = true;

    try {
        const proc = await getProcess(selectedPid);
        if (proc) {
            selectedProcess = proc;
            const idx = currentProcesses.findIndex(p => p.pid === selectedPid);
            if (idx !== -1) currentProcesses[idx] = proc;
            updateDetailPanel();
            showStatusMessage(`Refreshed details for PID ${selectedPid}.`, 'green');
        }
    } catch (err) {
        if (err.message.includes('404') || err.message.includes('not found')) {
            showStatusMessage(`Process ${selectedPid} no longer exists.`, 'red');
            const btnTerminate = document.getElementById('btn-terminate-proc');
            if (btnTerminate) btnTerminate.disabled = true;
        } else {
            showStatusMessage(`Refresh error: ${err.message}`, 'red');
        }
    } finally {
        if (btnRefresh) btnRefresh.disabled = (selectedPid === null);
    }
}

function renderProcessRows(processes) {
    currentProcesses = processes;
    const tbody = document.getElementById('proc-table-body');
    if (!tbody) return;

    if (!Array.isArray(processes) || processes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:12px; color:grey;">No active processes found</td></tr>';
        return;
    }

    const sorted = sortProcessesByUsage(processes);

    const rowsHtml = sorted.map(p => {
        const pid = p.pid ?? '—';
        const name = escapeHtml(p.name || 'Unknown');
        const cpu = (typeof p.cpuPercent === 'number') ? `${p.cpuPercent.toFixed(1)}%` : '0.0%';
        const mem = formatBytesFromKB(p.memory);
        const status = 'RUNNING';
        const isSelected = (selectedPid !== null && p.pid === selectedPid);
        const rowClass = isSelected ? 'highlighted' : '';

        return `<tr class="${rowClass}" data-pid="${pid}" style="cursor: pointer;">
            <td style="text-align: left;">${pid}</td>
            <td style="text-align: left;" title="${name}">${name}</td>
            <td style="text-align: right;">${cpu}</td>
            <td style="text-align: right;">${mem}</td>
            <td style="text-align: center;">${status}</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml;

    const legend = document.getElementById('proc-list-legend');
    if (legend) {
        legend.textContent = `Processes (${processes.length})`;
    }

    // Keep detail panel updated with fresh numbers if selected process still exists
    if (selectedPid !== null) {
        const match = processes.find(p => p.pid === selectedPid);
        if (match) {
            selectedProcess = match;
            updateDetailPanel();
        } else if (!isConfirmingTermination) {
            // Process exited externally
            selectedPid = null;
            selectedProcess = null;
            updateDetailPanel();
        }
    }
}

export async function render() {
    return `
<div class="page-processes" style="display: flex; flex-direction: column; height: 100%; gap: 6px;">
  <!-- Process Table -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px; margin: 0;">
    <legend id="proc-list-legend">Processes</legend>
    <div class="sunken-panel" style="flex: 1; overflow: auto; background: #fff;">
      <table class="interactive" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="width: 80px; text-align: left;">PID</th>
            <th style="text-align: left;">PROCESS</th>
            <th style="width: 80px; text-align: right;">CPU</th>
            <th style="width: 110px; text-align: right;">MEMORY</th>
            <th style="width: 90px; text-align: center;">STATUS</th>
          </tr>
        </thead>
        <tbody id="proc-table-body">
          <tr>
            <td colspan="5" style="text-align: center; padding: 12px; color: grey;">Loading processes...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </fieldset>

  <!-- Selected Process Detail Panel -->
  <fieldset style="flex-shrink: 0; padding: 6px; margin: 0;">
    <legend>Selected Process</legend>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div id="proc-detail-info" style="font-size: 11px; display: flex; gap: 16px; align-items: center;">
        <span style="color: grey;">No process selected</span>
      </div>

      <div style="display: flex; gap: 6px; align-items: center;">
        <button id="btn-refresh-proc" disabled style="min-width: 70px;">Refresh</button>
        <button id="btn-terminate-proc" disabled style="min-width: 75px;">Terminate</button>
      </div>
    </div>

    <!-- Inline Confirmation Box -->
    <div id="proc-terminate-confirm" style="display: none; margin-top: 8px; padding: 6px 8px; background: #ffffcc; border: 1px solid #808080; box-shadow: inset 1px 1px #fff, inset -1px -1px grey;">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <span id="proc-confirm-text" style="font-weight: bold; font-size: 11px; color: #800000;">
          Terminate process?
        </span>
        <div style="display: flex; gap: 6px;">
          <button id="btn-confirm-terminate" style="min-width: 65px; color: red; font-weight: bold;">Confirm</button>
          <button id="btn-cancel-terminate" style="min-width: 65px;">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Notification Message Area -->
    <div id="proc-status-msg" style="display: none; margin-top: 6px; font-size: 11px; font-weight: bold;"></div>
  </fieldset>
</div>
    `;
}

export async function afterRender() {
    // 1. Attach table click delegation
    const tbody = document.getElementById('proc-table-body');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-pid]');
            if (!row) return;
            const pid = parseInt(row.dataset.pid, 10);
            if (!isNaN(pid)) {
                handleRowClick(pid);
            }
        });
    }

    // 2. Attach button listeners
    const btnRefresh = document.getElementById('btn-refresh-proc');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', handleRefreshClick);
    }

    const btnTerminate = document.getElementById('btn-terminate-proc');
    if (btnTerminate) {
        btnTerminate.addEventListener('click', handleTerminateClick);
    }

    const btnCancel = document.getElementById('btn-cancel-terminate');
    if (btnCancel) {
        btnCancel.addEventListener('click', hideConfirmation);
    }

    const btnConfirm = document.getElementById('btn-confirm-terminate');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', handleConfirmTerminate);
    }

    // 3. Register SSE listener for live process updates
    processListener = (payload) => {
        if (payload && Array.isArray(payload.processes)) {
            renderProcessRows(payload.processes);
        }
    };
    on('process:snapshot', processListener);

    // 4. Initial fetch
    try {
        const processes = await getProcesses();
        renderProcessRows(processes);
    } catch (err) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:12px; color:red;">Failed to load processes: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}

export function cleanup() {
    if (processListener) {
        off('process:snapshot', processListener);
        processListener = null;
    }
    selectedPid = null;
    selectedProcess = null;
    currentProcesses = [];
    isConfirmingTermination = false;
}
