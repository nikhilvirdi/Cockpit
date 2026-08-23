// public/pages/overview.js — Cockpit Overview page with live system & process metrics
import { getSystemInfo, getProcesses } from '../js/api.js';
import { on, off } from '../js/sse.js';
import { escapeHtml, formatBytesFromKB, sortProcessesByUsage } from '../js/utils.js';

let processListener = null;

function updateSystemInfo(systemInfo) {
    const memText = document.getElementById('memory-usage-text');
    const memBar = document.getElementById('memory-progress-bar');
    if (!memText || !memBar || !systemInfo) return;

    const total = systemInfo.totalMemoryGB || 0;
    const free = systemInfo.freeMemoryGB || 0;
    const used = Math.max(0, total - free);
    const percent = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : (systemInfo.memoryUsage || 0);

    memText.textContent = `${used.toFixed(2)} GB / ${total.toFixed(2)} GB (${percent.toFixed(1)}%)`;
    memBar.style.width = `${percent.toFixed(1)}%`;
}

function updateCpuBarFromProcesses(processes) {
    const cpuText = document.getElementById('cpu-usage-text');
    const cpuBar = document.getElementById('cpu-progress-bar');
    if (!cpuText || !cpuBar || !Array.isArray(processes)) return;

    const totalCpu = processes.reduce((sum, p) => sum + (Number(p.cpuPercent) || 0), 0);
    const clampedCpu = Math.min(100, Math.max(0, totalCpu));

    cpuText.textContent = `${clampedCpu.toFixed(1)}%`;
    cpuBar.style.width = `${clampedCpu.toFixed(1)}%`;
}

function renderProcessRows(processes) {
    const tbody = document.getElementById('process-table-body');
    if (!tbody) return;

    if (!Array.isArray(processes) || processes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:12px; color:grey;">No active processes found</td></tr>';
        return;
    }

    const sortedProcesses = sortProcessesByUsage(processes);

    const rowsHtml = sortedProcesses.map(p => {
        const pid = p.pid ?? '—';
        const name = escapeHtml(p.name || 'Unknown');
        const cpu = (typeof p.cpuPercent === 'number') ? `${p.cpuPercent.toFixed(1)}%` : '0.0%';
        const memory = formatBytesFromKB(p.memory);
        const status = 'RUNNING';

        return `<tr>
            <td style="text-align: left;">${pid}</td>
            <td style="text-align: left;" title="${name}">${name}</td>
            <td style="text-align: right;">${cpu}</td>
            <td style="text-align: right;">${memory}</td>
            <td style="text-align: center;">${status}</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml;

    const legend = document.getElementById('process-list-legend');
    if (legend) {
        legend.textContent = `Processes (${processes.length})`;
    }

    updateCpuBarFromProcesses(processes);
}

export async function render() {
    return `
<div class="page-overview" style="display: flex; flex-direction: column; height: 100%; gap: 8px;">
  <!-- System Resource Bars -->
  <fieldset style="flex-shrink: 0;">
    <legend>System Resources</legend>
    
    <div class="field-row-stacked" style="margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
        <span>CPU Usage:</span>
        <span id="cpu-usage-text" style="font-weight: bold;">—</span>
      </div>
      <div class="progress-indicator segmented" style="height: 20px;">
        <div class="progress-indicator-bar" id="cpu-progress-bar" style="width: 0%;"></div>
      </div>
    </div>

    <div class="field-row-stacked">
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
        <span>Memory:</span>
        <span id="memory-usage-text" style="font-weight: bold;">—</span>
      </div>
      <div class="progress-indicator segmented" style="height: 20px;">
        <div class="progress-indicator-bar" id="memory-progress-bar" style="width: 0%;"></div>
      </div>
    </div>
  </fieldset>

  <!-- Process Table -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px;">
    <legend id="process-list-legend">Processes</legend>
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
        <tbody id="process-table-body">
          <tr>
            <td colspan="5" style="text-align: center; padding: 12px; color: grey;">Loading processes...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </fieldset>
</div>
    `;
}

export async function afterRender() {
    // 1. Register SSE snapshot listener
    processListener = (payload) => {
        if (payload && Array.isArray(payload.processes)) {
            renderProcessRows(payload.processes);
        }
    };
    on('process:snapshot', processListener);

    // 2. Fetch initial system info (CPU + Memory totals)
    try {
        const sysInfo = await getSystemInfo();
        updateSystemInfo(sysInfo);
    } catch (err) {
        const memText = document.getElementById('memory-usage-text');
        if (memText) {
            memText.textContent = `Error: ${err.message}`;
            memText.style.color = 'red';
        }
    }

    // 3. Fetch initial process list
    try {
        const processes = await getProcesses();
        renderProcessRows(processes);
    } catch (err) {
        const tbody = document.getElementById('process-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:12px; color:red;">Failed to load processes: ${escapeHtml(err.message)}</td></tr>`;
        }
        const cpuText = document.getElementById('cpu-usage-text');
        if (cpuText) {
            cpuText.textContent = `Error`;
            cpuText.style.color = 'red';
        }
    }
}

export function cleanup() {
    if (processListener) {
        off('process:snapshot', processListener);
        processListener = null;
    }
}
