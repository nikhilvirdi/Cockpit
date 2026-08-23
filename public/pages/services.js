// public/pages/services.js — Cockpit Services status monitoring page
import { getServices } from '../js/api.js';
import { on, off } from '../js/sse.js';
import { escapeHtml } from '../js/utils.js';

let servicesList = [];
let selectedServiceKey = null; // 'host:port'
let serviceListener = null;

function formatResponseTime(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    return `${ms} ms`;
}

function formatStatus(status) {
    return (status || 'UNKNOWN').toUpperCase();
}

function getSelectedService() {
    if (!selectedServiceKey) return null;
    return servicesList.find(s => `${s.host}:${s.port}` === selectedServiceKey) || null;
}

function updateDetailPanel() {
    const detailInfo = document.getElementById('service-detail-info');
    if (!detailInfo) return;

    const selected = getSelectedService();
    if (!selected) {
        detailInfo.innerHTML = '<span style="color: grey;">No service selected</span>';
        return;
    }

    const name = escapeHtml(selected.name || 'Unknown');
    const address = escapeHtml(`${selected.host}:${selected.port}`);
    const status = formatStatus(selected.status);
    const statusColor = status === 'RUNNING' ? '#008000' : '#800000';
    const response = formatResponseTime(selected.responseTime);

    detailInfo.innerHTML = `
        <span><strong>Service:</strong> ${name}</span>
        <span><strong>Address:</strong> ${address}</span>
        <span><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${status}</span></span>
        <span><strong>Response Time:</strong> ${response}</span>
    `;
}

function highlightSelectedRow() {
    const tbody = document.getElementById('services-table-body');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr[data-key]');
    rows.forEach(r => {
        r.classList.toggle('highlighted', r.dataset.key === selectedServiceKey);
    });
}

function handleRowClick(key) {
    selectedServiceKey = key;
    highlightSelectedRow();
    updateDetailPanel();
}

function renderServicesTable(services) {
    servicesList = Array.isArray(services) ? services : [];
    const tbody = document.getElementById('services-table-body');
    if (!tbody) return;

    if (servicesList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:12px; color:grey;">No configured services found</td></tr>';
        updateDetailPanel();
        return;
    }

    const rowsHtml = servicesList.map(s => {
        const key = `${s.host}:${s.port}`;
        const name = escapeHtml(s.name || 'Unknown');
        const address = escapeHtml(key);
        const status = formatStatus(s.status);
        const statusColor = status === 'RUNNING' ? '#008000' : '#800000';
        const response = formatResponseTime(s.responseTime);
        const isSelected = key === selectedServiceKey;
        const rowClass = isSelected ? 'highlighted' : '';

        return `
            <tr class="${rowClass}" data-key="${escapeHtml(key)}" style="cursor: pointer;">
                <td style="text-align: left;" title="${name}">${name}</td>
                <td style="text-align: left; font-family: monospace;">${address}</td>
                <td style="text-align: center; font-weight: bold; color: ${statusColor};">${status}</td>
                <td style="text-align: right;">${response}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml;
    highlightSelectedRow();
    updateDetailPanel();
}

function handleServiceStatusChanged(change) {
    const key = `${change.host}:${change.port}`;
    const target = servicesList.find(s => `${s.host}:${s.port}` === key);

    if (target) {
        target.status = change.newStatus;
        if (change.newStatus === 'stopped') {
            target.responseTime = null;
        }

        // Update the specific row in place
        const tbody = document.getElementById('services-table-body');
        if (tbody) {
            const row = tbody.querySelector(`tr[data-key="${key}"]`);
            if (row) {
                const statusCell = row.cells[2];
                const responseCell = row.cells[3];
                const formattedStatus = formatStatus(change.newStatus);
                const statusColor = formattedStatus === 'RUNNING' ? '#008000' : '#800000';

                if (statusCell) {
                    statusCell.textContent = formattedStatus;
                    statusCell.style.color = statusColor;
                }
                if (responseCell && change.newStatus === 'stopped') {
                    responseCell.textContent = '—';
                }
            }
        }

        // Update detail panel if this service is currently selected
        if (selectedServiceKey === key) {
            updateDetailPanel();
        }
    }
}

async function fetchAndRefreshServices() {
    const btnCheck = document.getElementById('btn-check-services');
    if (btnCheck) {
        btnCheck.disabled = true;
        btnCheck.textContent = 'Checking...';
    }

    try {
        const services = await getServices();
        renderServicesTable(services);
    } catch (err) {
        const tbody = document.getElementById('services-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:12px; color:red;">Failed to check services: ${escapeHtml(err.message)}</td></tr>`;
        }
    } finally {
        if (btnCheck) {
            btnCheck.disabled = false;
            btnCheck.textContent = 'Check';
        }
    }
}

export async function render() {
    return `
<div class="page-services" style="display: flex; flex-direction: column; height: 100%; gap: 6px;">
  <!-- Top: Services Table -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px; margin: 0;">
    <legend>Monitored Services</legend>
    <div class="sunken-panel" style="flex: 1; overflow: auto; background: #fff;">
      <table class="interactive" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left;">SERVICE</th>
            <th style="width: 180px; text-align: left;">ADDRESS</th>
            <th style="width: 110px; text-align: center;">STATUS</th>
            <th style="width: 120px; text-align: right;">RESPONSE</th>
          </tr>
        </thead>
        <tbody id="services-table-body">
          <tr>
            <td colspan="4" style="text-align: center; padding: 12px; color: grey;">Loading services...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </fieldset>

  <!-- Bottom: Service Details Panel -->
  <fieldset style="flex-shrink: 0; padding: 6px 8px; margin: 0;">
    <legend>Service Details</legend>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div id="service-detail-info" style="font-size: 11px; display: flex; gap: 16px; align-items: center;">
        <span style="color: grey;">No service selected</span>
      </div>

      <div>
        <button id="btn-check-services" style="min-width: 75px;">Check</button>
      </div>
    </div>
  </fieldset>
</div>
    `;
}

export async function afterRender() {
    const tbody = document.getElementById('services-table-body');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-key]');
            if (!row) return;
            const key = row.dataset.key;
            if (key) {
                handleRowClick(key);
            }
        });
    }

    const btnCheck = document.getElementById('btn-check-services');
    if (btnCheck) {
        btnCheck.addEventListener('click', fetchAndRefreshServices);
    }

    // Subscribe to SSE service:statusChanged events
    serviceListener = (payload) => {
        if (payload && payload.host && payload.port) {
            handleServiceStatusChanged(payload);
        }
    };
    on('service:statusChanged', serviceListener);

    // Initial load
    await fetchAndRefreshServices();
}

export function cleanup() {
    if (serviceListener) {
        off('service:statusChanged', serviceListener);
        serviceListener = null;
    }
    servicesList = [];
    selectedServiceKey = null;
}
