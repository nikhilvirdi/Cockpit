// public/js/menu.js — Top menu bar interactions and modal/action handlers
import { 
    getStatus, 
    getSystemInfo, 
    getConfig, 
    getProjects, 
    getProcesses, 
    terminateProcess, 
    getServices, 
    getFiles, 
    searchFiles, 
    getLogs, 
    runCommand 
} from './api.js';
import { connect, disconnect } from './sse.js';
import { showModal, showToast } from './modal.js';
import { escapeHtml } from './utils.js';

// Router functions injected via initMenu() to avoid circular import
let _showPage = () => {};
let _getCurrentPageName = () => null;
let _refreshCurrentPage = () => Promise.resolve();

function showPage(name) { return _showPage(name); }
function getCurrentPageName() { return _getCurrentPageName(); }
function refreshCurrentPage() { return _refreshCurrentPage(); }

let isLiveUpdatesEnabled = true;

function closeAllDropdowns() {
    document.querySelectorAll('.menu-dropdown').forEach(dd => {
        dd.style.display = 'none';
    });
}

function handleFileRefresh() {
    refreshCurrentPage();
    showToast('Refreshed current view');
}

async function handleFileExportJson() {
    const pageName = getCurrentPageName() || 'overview';
    showToast(`Exporting ${pageName} data...`);

    const fetchers = {
        overview: async () => ({ system: await getSystemInfo(), processes: await getProcesses() }),
        system: getSystemInfo,
        processes: getProcesses,
        services: getServices,
        logs: () => getLogs('cockpit.log', {}),
        files: () => getFiles(''),
        projects: getProjects,
        commands: getConfig
    };

    try {
        const fetcher = fetchers[pageName] || getSystemInfo;
        const data = await fetcher();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const filename = `cockpit-${pageName}-${Date.now()}.json`;

        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Saved ${filename}`);
    } catch (err) {
        showToast(`Export failed: ${err.message}`);
    }
}

async function handleFileOpenProject() {
    const modal = showModal({
        title: 'Open Project...',
        width: '480px',
        contentHtml: `
            <div style="margin-bottom: 6px;">Select a configured project directory to inspect:</div>
            <div class="sunken-panel" id="modal-project-list" style="max-height: 240px; overflow: auto; background: #fff; padding: 4px;">
                <div style="padding: 8px; color: grey; text-align: center;">Loading projects...</div>
            </div>
        `,
        buttons: [
            { label: 'Close', onClick: (m) => m.close() }
        ]
    });

    try {
        const projects = await getProjects();
        const container = modal.element.querySelector('#modal-project-list');
        if (!container) return;

        if (!projects || projects.length === 0) {
            container.innerHTML = '<div style="padding: 8px; color: grey; text-align: center;">No projects configured</div>';
            return;
        }

        container.innerHTML = projects.map(p => `
            <div class="modal-project-item" data-name="${escapeHtml(p.name)}" style="padding: 4px 6px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${escapeHtml(p.name)}</strong>
                    <div style="font-size: 10px; color: #666; font-family: monospace;">${escapeHtml(p.path || '')}</div>
                </div>
                ${p.isGit ? `<span style="font-size: 10px; background: #e0e0e0; padding: 1px 4px; border: 1px solid #999;">git: ${escapeHtml(p.branch || 'main')}</span>` : ''}
            </div>
        `).join('');

        container.querySelectorAll('.modal-project-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.background = 'navy';
                item.style.color = '#fff';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = '#fff';
                item.style.color = '#000';
            });
            item.addEventListener('click', () => {
                showPage('projects');
                modal.close();
            });
        });
    } catch (err) {
        const container = modal.element.querySelector('#modal-project-list');
        if (container) {
            container.innerHTML = `<div style="padding: 8px; color: red; text-align: center;">Failed to load projects: ${escapeHtml(err.message)}</div>`;
        }
    }
}

function handleViewToggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('hidden');
        const isHidden = sidebar.classList.contains('hidden');
        showToast(isHidden ? 'Sidebar hidden' : 'Sidebar visible');
    }
}

function handleViewCompactMode() {
    document.body.classList.toggle('compact');
    const isCompact = document.body.classList.contains('compact');
    showToast(isCompact ? 'Compact mode enabled' : 'Compact mode disabled');
}

function handleViewLiveUpdates() {
    if (isLiveUpdatesEnabled) {
        disconnect();
        isLiveUpdatesEnabled = false;
        showToast('Live updates: OFF (disconnected)');
    } else {
        connect();
        isLiveUpdatesEnabled = true;
        showToast('Live updates: ON (connected)');
    }
}

async function handleToolsRunCommand() {
    const modal = showModal({
        title: 'Run Command...',
        width: '420px',
        contentHtml: `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label for="modal-cmd-select" style="font-weight: bold;">Select Command:</label>
                    <select id="modal-cmd-select" style="flex: 1;">
                        <option value="">Loading allowed commands...</option>
                    </select>
                </div>
                <div id="modal-cmd-status" style="font-size: 11px; min-height: 36px; padding: 4px;">
                    Choose a command from the allowed list to execute.
                </div>
            </div>
        `,
        buttons: [
            {
                label: 'Run',
                primary: true,
                onClick: async (m) => {
                    const select = m.element.querySelector('#modal-cmd-select');
                    const statusDiv = m.element.querySelector('#modal-cmd-status');
                    if (!select || !select.value) return;

                    const cmdName = select.value;
                    if (statusDiv) {
                        statusDiv.innerHTML = '<span style="color: navy;">Spawning command...</span>';
                    }

                    try {
                        const res = await runCommand(cmdName);
                        if (statusDiv) {
                            statusDiv.innerHTML = `
                                <div style="color: #008000; font-weight: bold;">Command started!</div>
                                <div>Command ID: <code style="font-family: monospace;">${escapeHtml(res.commandId)}</code></div>
                                <div style="margin-top: 4px; color: #555;">Output is streaming live to the <strong>Commands</strong> page.</div>
                            `;
                        }
                    } catch (err) {
                        if (statusDiv) {
                            statusDiv.innerHTML = `<span style="color: red; font-weight: bold;">Error: ${escapeHtml(err.message)}</span>`;
                        }
                    }
                }
            },
            {
                label: 'Go to Commands',
                onClick: (m) => {
                    showPage('commands');
                    m.close();
                }
            },
            {
                label: 'Close',
                onClick: (m) => m.close()
            }
        ]
    });

    try {
        const cfg = await getConfig();
        const select = modal.element.querySelector('#modal-cmd-select');
        const allowed = Array.isArray(cfg.allowedCommands) ? cfg.allowedCommands : [];
        if (select) {
            if (allowed.length === 0) {
                select.innerHTML = '<option value="">No allowed commands configured</option>';
            } else {
                select.innerHTML = allowed.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            }
        }
    } catch (err) {
        const select = modal.element.querySelector('#modal-cmd-select');
        if (select) {
            select.innerHTML = `<option value="">Error loading config: ${escapeHtml(err.message)}</option>`;
        }
    }
}

function handleToolsTerminateProcess() {
    const modal = showModal({
        title: 'Terminate Process...',
        width: '420px',
        contentHtml: `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <label for="modal-term-pid" style="font-weight: bold; width: 100px;">Process PID:</label>
                        <input id="modal-term-pid" type="number" placeholder="e.g. 12345" style="flex: 1;" />
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <label for="modal-term-name" style="font-weight: bold; width: 100px;">Process Name:</label>
                        <input id="modal-term-name" type="text" placeholder="e.g. node.exe" style="flex: 1;" />
                    </div>
                </div>

                <!-- Confirmation panel hidden by default -->
                <div id="modal-term-confirm" class="sunken-panel" style="display: none; padding: 6px; background: #ffffcc; border: 1px solid #808080;">
                    <div id="modal-term-confirm-text" style="color: #990000; font-weight: bold; margin-bottom: 6px;"></div>
                    <div style="display: flex; justify-content: flex-end; gap: 6px;">
                        <button id="modal-btn-confirm-yes" style="font-weight: bold; min-width: 60px;">Confirm</button>
                        <button id="modal-btn-confirm-no" style="min-width: 60px;">Cancel</button>
                    </div>
                </div>

                <div id="modal-term-status" style="font-size: 11px; min-height: 20px;"></div>
            </div>
        `,
        buttons: [
            {
                label: 'Terminate',
                primary: true,
                onClick: (m) => {
                    const pidInput = m.element.querySelector('#modal-term-pid');
                    const nameInput = m.element.querySelector('#modal-term-name');
                    const confirmBox = m.element.querySelector('#modal-term-confirm');
                    const confirmText = m.element.querySelector('#modal-term-confirm-text');
                    const statusDiv = m.element.querySelector('#modal-term-status');

                    const pid = parseInt(pidInput.value, 10);
                    const name = nameInput.value.trim();

                    if (isNaN(pid) || pid <= 0) {
                        if (statusDiv) statusDiv.innerHTML = '<span style="color: red;">Please enter a valid PID number.</span>';
                        return;
                    }

                    if (statusDiv) statusDiv.innerHTML = '';
                    if (confirmText) confirmText.textContent = `Are you sure you want to terminate PID ${pid}${name ? ` (${name})` : ''}?`;
                    if (confirmBox) confirmBox.style.display = 'block';
                }
            },
            {
                label: 'Close',
                onClick: (m) => m.close()
            }
        ]
    });

    const confirmBox = modal.element.querySelector('#modal-term-confirm');
    const btnYes = modal.element.querySelector('#modal-btn-confirm-yes');
    const btnNo = modal.element.querySelector('#modal-btn-confirm-no');
    const statusDiv = modal.element.querySelector('#modal-term-status');
    const pidInput = modal.element.querySelector('#modal-term-pid');
    const nameInput = modal.element.querySelector('#modal-term-name');

    if (btnNo) {
        btnNo.addEventListener('click', () => {
            if (confirmBox) confirmBox.style.display = 'none';
        });
    }

    if (btnYes) {
        btnYes.addEventListener('click', async () => {
            const pid = parseInt(pidInput.value, 10);
            const name = nameInput.value.trim();

            if (confirmBox) confirmBox.style.display = 'none';
            if (statusDiv) statusDiv.innerHTML = '<span style="color: navy;">Terminating process...</span>';

            try {
                const res = await terminateProcess(pid, name);
                const httpStatus = res.httpStatus || 200;

                if (httpStatus === 200) {
                    if (statusDiv) {
                        statusDiv.innerHTML = `<span style="color: #008000; font-weight: bold;">Process ${pid} (${escapeHtml(name || res.name || '')}) terminated successfully.</span>`;
                    }
                    if (getCurrentPageName() === 'processes') {
                        refreshCurrentPage();
                    }
                } else if (httpStatus === 403) {
                    if (statusDiv) {
                        statusDiv.innerHTML = `<span style="color: #990000; font-weight: bold;">Access Denied: ${escapeHtml(res.message || 'Cannot terminate Cockpit or critical process')}</span>`;
                    }
                } else if (httpStatus === 404) {
                    if (statusDiv) {
                        statusDiv.innerHTML = `<span style="color: #b8860b; font-weight: bold;">Process not found: PID ${pid} has already exited.</span>`;
                    }
                } else if (httpStatus === 409) {
                    if (statusDiv) {
                        statusDiv.innerHTML = `<span style="color: #990000; font-weight: bold;">Conflict: ${escapeHtml(res.message || 'Process mismatch')}</span>`;
                    }
                } else {
                    if (statusDiv) {
                        statusDiv.innerHTML = `<span style="color: #990000; font-weight: bold;">Error (${httpStatus}): ${escapeHtml(res.message || 'Termination failed')}</span>`;
                    }
                }
            } catch (err) {
                if (statusDiv) {
                    statusDiv.innerHTML = `<span style="color: #990000; font-weight: bold;">Network/Server Error: ${escapeHtml(err.message)}</span>`;
                }
            }
        });
    }
}

function handleToolsSearchFiles() {
    const modal = showModal({
        title: 'Search Files...',
        width: '520px',
        contentHtml: `
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; gap: 6px; align-items: center;">
                    <input id="modal-file-search-input" type="text" placeholder="Search query..." style="flex: 1;" />
                    <label style="font-size: 11px; display: flex; align-items: center; gap: 2px;">
                        <input type="radio" name="modal-search-mode" value="name" checked /> Name
                    </label>
                    <label style="font-size: 11px; display: flex; align-items: center; gap: 2px;">
                        <input type="radio" name="modal-search-mode" value="content" /> Content
                    </label>
                    <button id="modal-btn-file-search" style="min-width: 60px;">Search</button>
                </div>
                <div class="sunken-panel" id="modal-search-results" style="max-height: 220px; overflow: auto; background: #fff; padding: 4px; font-size: 11px;">
                    <div style="padding: 8px; color: grey; text-align: center;">Enter a query and click Search</div>
                </div>
            </div>
        `,
        buttons: [
            {
                label: 'Go to Files Page',
                onClick: (m) => {
                    showPage('files');
                    m.close();
                }
            },
            {
                label: 'Close',
                onClick: (m) => m.close()
            }
        ]
    });

    const searchInput = modal.element.querySelector('#modal-file-search-input');
    const searchBtn = modal.element.querySelector('#modal-btn-file-search');
    const resultsContainer = modal.element.querySelector('#modal-search-results');

    async function executeSearch() {
        const query = searchInput ? searchInput.value.trim() : '';
        const modeRadio = modal.element.querySelector('input[name="modal-search-mode"]:checked');
        const mode = modeRadio ? modeRadio.value : 'name';

        if (!query) {
            if (resultsContainer) resultsContainer.innerHTML = '<div style="padding: 8px; color: grey; text-align: center;">Please enter a search query</div>';
            return;
        }

        if (resultsContainer) {
            resultsContainer.innerHTML = '<div style="padding: 8px; color: navy; text-align: center;">Searching files...</div>';
        }

        try {
            const data = await searchFiles(query, mode);
            const results = data.results || [];

            if (results.length === 0) {
                resultsContainer.innerHTML = `<div style="padding: 8px; color: grey; text-align: center;">No matches found for "${escapeHtml(query)}"</div>`;
                return;
            }

            resultsContainer.innerHTML = results.map(r => `
                <div class="modal-search-result-item" data-path="${escapeHtml(r.path || '')}" style="padding: 4px 6px; cursor: pointer; border-bottom: 1px solid #eee;">
                    <div style="font-weight: bold;">${escapeHtml(r.name || r.path)}</div>
                    <div style="font-size: 10px; color: #666; font-family: monospace;">${escapeHtml(r.path || '')}</div>
                    ${r.matches ? `<div style="font-size: 10px; color: navy;">Matches: ${r.matches} line(s)</div>` : ''}
                </div>
            `).join('');

            resultsContainer.querySelectorAll('.modal-search-result-item').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    item.style.background = 'navy';
                    item.style.color = '#fff';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = '#fff';
                    item.style.color = '#000';
                });
                item.addEventListener('click', () => {
                    showPage('files');
                    modal.close();
                });
            });
        } catch (err) {
            if (resultsContainer) {
                resultsContainer.innerHTML = `<div style="padding: 8px; color: red; text-align: center;">Search failed: ${escapeHtml(err.message)}</div>`;
            }
        }
    }

    if (searchBtn) searchBtn.addEventListener('click', executeSearch);
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') executeSearch();
        });
    }
}

async function handleToolsCheckServices() {
    showToast('Checking services status...');
    try {
        const services = await getServices();
        const total = services.length;
        const running = services.filter(s => s.status === 'running').length;
        const stopped = total - running;

        showToast(`Services: ${running} running, ${stopped} stopped (${total} total)`);
        if (getCurrentPageName() === 'services') {
            refreshCurrentPage();
        }
    } catch (err) {
        showToast(`Failed to check services: ${err.message}`);
    }
}

async function handleHelpAbout() {
    const modal = showModal({
        title: 'About Cockpit',
        width: '420px',
        contentHtml: `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="font-size: 12px; font-weight: bold; border-bottom: 1px solid #808080; padding-bottom: 4px;">
                    Cockpit — Local Developer Operations Dashboard
                </div>
                <div id="modal-about-body" style="font-size: 11px;">
                    <div style="text-align: center; color: grey; padding: 12px;">Loading system information...</div>
                </div>
            </div>
        `,
        buttons: [
            { label: 'OK', primary: true, onClick: (m) => m.close() }
        ]
    });

    try {
        const [sys, status] = await Promise.all([getSystemInfo(), getStatus()]);
        const body = modal.element.querySelector('#modal-about-body');
        if (!body) return;

        body.innerHTML = `
            <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
                <tr><td style="padding: 2px 4px; font-weight: bold; width: 120px;">Version:</td><td>1.0.0</td></tr>
                <tr><td style="padding: 2px 4px; font-weight: bold;">Server Status:</td><td style="color: #008000; font-weight: bold;">${escapeHtml(status.status || 'OK')}</td></tr>
                <tr><td style="padding: 2px 4px; font-weight: bold;">Node.js:</td><td>${escapeHtml(sys.nodeVersion || '—')}</td></tr>
                <tr><td style="padding: 2px 4px; font-weight: bold;">Hostname:</td><td>${escapeHtml(sys.hostname || '—')}</td></tr>
                <tr><td style="padding: 2px 4px; font-weight: bold;">Platform:</td><td>${escapeHtml(sys.platform || '—')} (${escapeHtml(sys.architecture || '—')})</td></tr>
                <tr><td style="padding: 2px 4px; font-weight: bold;">Uptime:</td><td>${escapeHtml(sys.uptime || '—')}</td></tr>
                <tr><td style="padding: 2px 4px; font-weight: bold;">Cockpit PID:</td><td>${escapeHtml(sys.processId ?? '—')}</td></tr>
            </table>
            <div style="margin-top: 8px; font-size: 10px; color: #555;">
                Zero-dependency local developer utility powered by Node.js and 98.css.
            </div>
        `;
    } catch (err) {
        const body = modal.element.querySelector('#modal-about-body');
        if (body) {
            body.innerHTML = `<div style="color: red; padding: 8px;">Error loading system information: ${escapeHtml(err.message)}</div>`;
        }
    }
}

function handleHelpDocumentation() {
    showToast('Documentation: Coming soon.');
}

function handleHelpApi() {
    showToast('API Reference: Coming soon.');
}

export function initMenu({ showPage: sp, getCurrentPageName: gcpn, refreshCurrentPage: rcp }) {
    _showPage = sp;
    _getCurrentPageName = gcpn;
    _refreshCurrentPage = rcp;
    // 1. Menu button toggle behavior
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menuName = btn.dataset.menu;
            const dropdown = document.getElementById(`menu-${menuName}`);
            if (!dropdown) return;

            const isAlreadyOpen = dropdown.style.display === 'block';
            closeAllDropdowns();

            if (!isAlreadyOpen) {
                dropdown.style.display = 'block';
            }
        });
    });

    // 2. Global outside click closes dropdowns
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-item-container')) {
            closeAllDropdowns();
        }
    });

    // 3. Menu items click dispatcher
    document.querySelectorAll('.menu-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const action = item.dataset.action;
            closeAllDropdowns();

            switch (action) {
                case 'file-refresh':
                    handleFileRefresh();
                    break;
                case 'file-export-json':
                    handleFileExportJson();
                    break;
                case 'file-open-project':
                    handleFileOpenProject();
                    break;
                case 'view-toggle-sidebar':
                    handleViewToggleSidebar();
                    break;
                case 'view-compact-mode':
                    handleViewCompactMode();
                    break;
                case 'view-live-updates':
                    handleViewLiveUpdates();
                    break;
                case 'tools-run-command':
                    handleToolsRunCommand();
                    break;
                case 'tools-terminate-process':
                    handleToolsTerminateProcess();
                    break;
                case 'tools-search-files':
                    handleToolsSearchFiles();
                    break;
                case 'tools-check-services':
                    handleToolsCheckServices();
                    break;
                case 'help-about':
                    handleHelpAbout();
                    break;
                case 'help-docs':
                    handleHelpDocumentation();
                    break;
                case 'help-api':
                    handleHelpApi();
                    break;
                default:
                    break;
            }
        });
    });
}
