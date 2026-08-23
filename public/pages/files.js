// public/pages/files.js — Cockpit File Explorer with search, directory navigation, and file preview
import { getFiles, getFileContent, searchFiles } from '../js/api.js';
import { escapeHtml, formatBytesFromBytes } from '../js/utils.js';

let currentDirectory = '';
let selectedFilePath = null;
let isSearching = false;
let currentEntries = [];

function formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString();
    } catch {
        return '—';
    }
}

function getParentDirectory(dir) {
    if (!dir) return '';
    const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '');
    const parts = normalized.split('/');
    parts.pop();
    return parts.join('/');
}

function updatePathDisplay(pathStr) {
    const display = document.getElementById('current-path-display');
    const btnUp = document.getElementById('btn-up-dir');
    if (display) {
        const normalized = (pathStr || '').replace(/\\/g, '/');
        display.textContent = normalized ? `/${normalized}` : '/';
    }
    if (btnUp) {
        btnUp.disabled = !pathStr || isSearching;
    }
}

function highlightSelectedRow() {
    const tbody = document.getElementById('file-table-body');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr[data-path]');
    rows.forEach(r => {
        const rowPath = r.dataset.path;
        r.classList.toggle('highlighted', rowPath === selectedFilePath);
    });
}

async function loadFilePreview(filePath, fileName, fileSize) {
    selectedFilePath = filePath;
    highlightSelectedRow();

    const infoEl = document.getElementById('preview-file-info');
    const badgeEl = document.getElementById('preview-stream-badge');
    const contentEl = document.getElementById('file-preview-content');

    if (badgeEl) badgeEl.style.display = 'none';

    if (infoEl) {
        const sizeText = fileSize !== undefined && fileSize !== null ? ` (${formatBytesFromBytes(fileSize)})` : '';
        infoEl.textContent = `${fileName || filePath}${sizeText}`;
    }

    if (contentEl) {
        contentEl.textContent = 'Loading file content...';
        contentEl.style.color = '#555';
    }

    try {
        const data = await getFileContent(filePath);

        if (badgeEl && data.streamed) {
            badgeEl.style.display = 'inline-block';
        }

        if (contentEl) {
            contentEl.textContent = data.content !== undefined && data.content !== null ? data.content : '';
            contentEl.style.color = '#111';
        }
    } catch (err) {
        if (contentEl) {
            contentEl.textContent = err.message || 'Failed to load file content';
            contentEl.style.color = '#900000';
            contentEl.style.fontWeight = 'bold';
        }
    }
}

async function fetchDirectory(dir = '') {
    isSearching = false;
    currentDirectory = dir;
    updatePathDisplay(currentDirectory);

    const btnClearSearch = document.getElementById('btn-clear-search');
    if (btnClearSearch) btnClearSearch.style.display = 'none';

    const legend = document.getElementById('file-list-legend');
    if (legend) legend.textContent = 'Contents';

    const thead = document.getElementById('file-table-head');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="text-align: left;">NAME</th>
                <th style="width: 90px; text-align: center;">TYPE</th>
                <th style="width: 100px; text-align: right;">SIZE</th>
                <th style="width: 160px; text-align: left;">MODIFIED</th>
            </tr>
        `;
    }

    const tbody = document.getElementById('file-table-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:12px; color:grey;">Loading directory contents...</td></tr>';
    }

    try {
        const entries = await getFiles(dir);
        currentEntries = Array.isArray(entries) ? entries : [];

        if (!tbody) return;

        if (currentEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:12px; color:grey;">Directory is empty</td></tr>';
            return;
        }

        // Sort: directories first, then files alphabetically
        const sorted = [...currentEntries].sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return (a.name || '').localeCompare(b.name || '');
        });

        let rowsHtml = '';

        // Add ".." parent directory row if not at root
        if (currentDirectory) {
            const parentDir = getParentDirectory(currentDirectory);
            rowsHtml += `
                <tr class="dir-nav-row" data-nav-dir="${escapeHtml(parentDir)}" style="cursor: pointer; font-weight: bold; background: #f4f4f4;">
                    <td colspan="4">.. (Parent Directory)</td>
                </tr>
            `;
        }

        rowsHtml += sorted.map(e => {
            const isDir = e.type === 'directory';
            const typeLabel = isDir ? 'Folder' : 'File';
            const sizeStr = isDir ? '—' : formatBytesFromBytes(e.size);
            const modifiedStr = formatDate(e.modifiedAt);
            const isSelected = selectedFilePath === e.path;
            const rowClass = isSelected ? 'highlighted' : '';

            return `
                <tr class="${rowClass}" data-path="${escapeHtml(e.path)}" data-type="${e.type}" data-name="${escapeHtml(e.name)}" data-size="${e.size ?? ''}" style="cursor: pointer;">
                    <td style="text-align: left;" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</td>
                    <td style="text-align: center;">${typeLabel}</td>
                    <td style="text-align: right;">${sizeStr}</td>
                    <td style="text-align: left;">${modifiedStr}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
        highlightSelectedRow();
    } catch (err) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:12px; color:red;">Failed to open directory: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}

async function handleSearch() {
    const searchInput = document.getElementById('file-search-input');
    const query = searchInput ? searchInput.value.trim() : '';
    if (!query) return;

    const modeRadio = document.querySelector('input[name="file-search-mode"]:checked');
    const mode = modeRadio ? modeRadio.value : 'filename';

    isSearching = true;
    updatePathDisplay(`Search: "${query}" (${mode})`);

    const btnClearSearch = document.getElementById('btn-clear-search');
    if (btnClearSearch) btnClearSearch.style.display = 'inline-block';

    const legend = document.getElementById('file-list-legend');
    if (legend) legend.textContent = `Search Results for "${query}"`;

    const thead = document.getElementById('file-table-head');
    if (thead) {
        if (mode === 'content') {
            thead.innerHTML = `
                <tr>
                    <th style="text-align: left;">NAME</th>
                    <th style="text-align: left;">PATH</th>
                    <th style="width: 100px; text-align: center;">MATCHES</th>
                </tr>
            `;
        } else {
            thead.innerHTML = `
                <tr>
                    <th style="text-align: left;">NAME</th>
                    <th style="text-align: left;">PATH</th>
                </tr>
            `;
        }
    }

    const tbody = document.getElementById('file-table-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:12px; color:grey;">Searching files...</td></tr>';
    }

    try {
        const data = await searchFiles(query, mode);
        const results = Array.isArray(data.results) ? data.results : [];

        if (!tbody) return;

        if (results.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:12px; color:grey;">No matching files found for "${escapeHtml(query)}"</td></tr>`;
            return;
        }

        const rowsHtml = results.map(r => {
            const isSelected = selectedFilePath === r.path;
            const rowClass = isSelected ? 'highlighted' : '';
            const matchesCell = mode === 'content' ? `<td style="text-align: center; font-weight: bold;">${r.matches ?? 1}</td>` : '';

            return `
                <tr class="${rowClass}" data-path="${escapeHtml(r.path)}" data-type="file" data-name="${escapeHtml(r.name)}" style="cursor: pointer;">
                    <td style="text-align: left;" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</td>
                    <td style="text-align: left; color: #555;" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</td>
                    ${matchesCell}
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
        highlightSelectedRow();
    } catch (err) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:12px; color:red;">Search failed: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}

function handleTableClick(e) {
    // 1. Check if clicking parent directory ".." row
    const navRow = e.target.closest('.dir-nav-row');
    if (navRow) {
        const parentDir = navRow.dataset.navDir ?? '';
        fetchDirectory(parentDir);
        return;
    }

    // 2. Check if clicking regular item row
    const row = e.target.closest('tr[data-path]');
    if (!row) return;

    const path = row.dataset.path;
    const type = row.dataset.type;
    const name = row.dataset.name;
    const size = row.dataset.size ? Number(row.dataset.size) : null;

    if (type === 'directory') {
        fetchDirectory(path);
    } else {
        loadFilePreview(path, name, size);
    }
}

export async function render() {
    return `
<div class="page-files" style="display: flex; flex-direction: column; height: 100%; gap: 6px;">
  <!-- Top: Controls & Path Bar -->
  <fieldset style="flex-shrink: 0; padding: 6px 8px; margin: 0;">
    <legend>File Explorer</legend>
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
      <!-- Path Bar & Up button -->
      <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 260px;">
        <button id="btn-up-dir" disabled style="min-width: 45px;">Up</button>
        <label style="font-size: 11px; font-weight: bold;">Path:</label>
        <div class="sunken-panel" id="current-path-display" style="flex: 1; padding: 2px 6px; background: #fff; font-family: monospace; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          /
        </div>
      </div>

      <!-- Search Controls -->
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <input type="text" id="file-search-input" placeholder="Search files..." style="width: 130px;" />
        <div style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
          <input type="radio" name="file-search-mode" id="mode-filename" value="filename" checked />
          <label for="mode-filename">Name</label>
          <input type="radio" name="file-search-mode" id="mode-content" value="content" />
          <label for="mode-content">Content</label>
        </div>
        <button id="btn-search-files" style="min-width: 60px;">Search</button>
        <button id="btn-clear-search" style="min-width: 75px; display: none;">Clear Search</button>
      </div>
    </div>
  </fieldset>

  <!-- Middle: Directory / Search Listing Table -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px; margin: 0;">
    <legend id="file-list-legend">Contents</legend>
    <div class="sunken-panel" style="flex: 1; overflow: auto; background: #fff;">
      <table class="interactive" style="width: 100%; border-collapse: collapse;">
        <thead id="file-table-head">
          <tr>
            <th style="text-align: left;">NAME</th>
            <th style="width: 90px; text-align: center;">TYPE</th>
            <th style="width: 100px; text-align: right;">SIZE</th>
            <th style="width: 160px; text-align: left;">MODIFIED</th>
          </tr>
        </thead>
        <tbody id="file-table-body">
          <tr>
            <td colspan="4" style="text-align: center; padding: 12px; color: grey;">Loading directory contents...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </fieldset>

  <!-- Bottom: File Preview Fieldset -->
  <fieldset style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 6px; margin: 0;">
    <legend id="file-preview-legend">File Preview</legend>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px;">
      <span id="preview-file-info" style="font-weight: bold; color: #333;">No file selected</span>
      <span id="preview-stream-badge" style="display: none; color: #000080; font-weight: bold; background: #e0e0e0; padding: 1px 4px; border: 1px solid #808080;">Large file — streamed</span>
    </div>
    <div id="file-preview-panel" class="sunken-panel" style="flex: 1; overflow: auto; background: #fff; padding: 6px;">
      <pre id="file-preview-content" style="margin: 0; font-family: monospace, 'Courier New', Courier; font-size: 11px; line-height: 1.4; white-space: pre-wrap; word-break: break-all; color: #222;">Select a file to preview its content</pre>
    </div>
  </fieldset>
</div>
    `;
}

export async function afterRender() {
    selectedFilePath = null;
    isSearching = false;

    const tbody = document.getElementById('file-table-body');
    if (tbody) {
        tbody.addEventListener('click', handleTableClick);
    }

    const btnUp = document.getElementById('btn-up-dir');
    if (btnUp) {
        btnUp.addEventListener('click', () => {
            if (currentDirectory) {
                const parentDir = getParentDirectory(currentDirectory);
                fetchDirectory(parentDir);
            }
        });
    }

    const btnSearch = document.getElementById('btn-search-files');
    if (btnSearch) {
        btnSearch.addEventListener('click', handleSearch);
    }

    const btnClearSearch = document.getElementById('btn-clear-search');
    if (btnClearSearch) {
        btnClearSearch.addEventListener('click', () => {
            const searchInput = document.getElementById('file-search-input');
            if (searchInput) searchInput.value = '';
            fetchDirectory(currentDirectory);
        });
    }

    const searchInput = document.getElementById('file-search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    }

    // Initial load
    await fetchDirectory('');
}

export function cleanup() {
    selectedFilePath = null;
    isSearching = false;
    currentEntries = [];
}
