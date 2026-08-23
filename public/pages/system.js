// public/pages/system.js — Cockpit System Information page with live resource metrics
import { getSystemInfo, getProcesses } from '../js/api.js';
import { on, off } from '../js/sse.js';
import { escapeHtml } from '../js/utils.js';

let processListener = null;

function updateCpuBarFromProcesses(processes) {
    const cpuText = document.getElementById('sys-cpu-usage-text');
    const cpuBar = document.getElementById('sys-cpu-progress-bar');
    if (!cpuText || !cpuBar || !Array.isArray(processes)) return;

    const totalCpu = processes.reduce((sum, p) => sum + (Number(p.cpuPercent) || 0), 0);
    const clampedCpu = Math.min(100, Math.max(0, totalCpu));

    cpuText.textContent = `${clampedCpu.toFixed(1)}%`;
    cpuBar.style.width = `${clampedCpu.toFixed(1)}%`;
}

function updateSystemInfo(systemInfo) {
    const memText = document.getElementById('sys-memory-usage-text');
    const memBar = document.getElementById('sys-memory-progress-bar');
    if (memText && memBar && systemInfo) {
        const total = systemInfo.totalMemoryGB || 0;
        const free = systemInfo.freeMemoryGB || 0;
        const used = Math.max(0, total - free);
        const percent = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : (systemInfo.memoryUsage || 0);

        memText.textContent = `${used.toFixed(2)} GB / ${total.toFixed(2)} GB (${percent.toFixed(1)}%)`;
        memBar.style.width = `${percent.toFixed(1)}%`;
    }

    const tbody = document.getElementById('system-info-table-body');
    if (tbody && systemInfo) {
        const rows = [
            { label: 'Operating System', value: systemInfo.platform },
            { label: 'OS Release', value: systemInfo.osRelease },
            { label: 'Architecture', value: systemInfo.architecture },
            { label: 'Hostname', value: systemInfo.hostname },
            { label: 'Node.js Version', value: systemInfo.nodeVersion },
            { label: 'CPU Model', value: systemInfo.cpuModel },
            { label: 'CPU Cores', value: systemInfo.cpuCount ? `${systemInfo.cpuCount} cores` : '—' },
            { label: 'Uptime', value: systemInfo.uptime },
            { label: 'Cockpit PID', value: systemInfo.processId },
            { label: 'Cockpit Process Memory', value: systemInfo.processMemoryMB !== undefined ? `${systemInfo.processMemoryMB} MB` : '—' },
            { label: 'Environment', value: systemInfo.environment }
        ];

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td style="font-weight: bold; width: 220px; padding: 4px 8px; border-bottom: 1px solid #dfdfdf;">${escapeHtml(r.label)}</td>
                <td style="padding: 4px 8px; border-bottom: 1px solid #dfdfdf;">${escapeHtml(r.value)}</td>
            </tr>
        `).join('');
    }
}

export async function render() {
    return `
<div class="page-system" style="display: flex; flex-direction: column; height: 100%; gap: 8px;">
  <!-- System Resource Bars -->
  <fieldset style="flex-shrink: 0;">
    <legend>System Resources</legend>
    
    <div class="field-row-stacked" style="margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
        <span>CPU Usage:</span>
        <span id="sys-cpu-usage-text" style="font-weight: bold;">—</span>
      </div>
      <div class="progress-indicator segmented" style="height: 20px;">
        <div class="progress-indicator-bar" id="sys-cpu-progress-bar" style="width: 0%;"></div>
      </div>
    </div>

    <div class="field-row-stacked">
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
        <span>Memory:</span>
        <span id="sys-memory-usage-text" style="font-weight: bold;">—</span>
      </div>
      <div class="progress-indicator segmented" style="height: 20px;">
        <div class="progress-indicator-bar" id="sys-memory-progress-bar" style="width: 0%;"></div>
      </div>
    </div>
  </fieldset>

  <!-- System Information Details -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px;">
    <legend>System Information</legend>
    <div class="sunken-panel" style="flex: 1; overflow: auto; background: #fff;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="width: 220px; text-align: left;">PROPERTY</th>
            <th style="text-align: left;">VALUE</th>
          </tr>
        </thead>
        <tbody id="system-info-table-body">
          <tr>
            <td colspan="2" style="text-align: center; padding: 12px; color: grey;">Loading system information...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </fieldset>
</div>
    `;
}

export async function afterRender() {
    // 1. Subscribe to SSE process snapshot for live CPU usage bar
    processListener = (payload) => {
        if (payload && Array.isArray(payload.processes)) {
            updateCpuBarFromProcesses(payload.processes);
        }
    };
    on('process:snapshot', processListener);

    // 2. Fetch initial system info
    try {
        const sysInfo = await getSystemInfo();
        updateSystemInfo(sysInfo);
    } catch (err) {
        const tbody = document.getElementById('system-info-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:12px; color:red;">Failed to load system information: ${escapeHtml(err.message)}</td></tr>`;
        }
        const memText = document.getElementById('sys-memory-usage-text');
        if (memText) {
            memText.textContent = `Error: ${err.message}`;
            memText.style.color = 'red';
        }
    }

    // 3. Fetch initial process list to populate CPU bar immediately
    try {
        const processes = await getProcesses();
        updateCpuBarFromProcesses(processes);
    } catch (err) {
        const cpuText = document.getElementById('sys-cpu-usage-text');
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
