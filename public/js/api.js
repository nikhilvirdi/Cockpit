// js/api.js — ALL fetch() calls live here, nothing else.

export async function getStatus() {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    return res.json();
}

export async function getSystemInfo() {
    const res = await fetch('/api/system');
    if (!res.ok) throw new Error(`System info failed: ${res.status}`);
    return res.json();
}

export async function getConfig() {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
    return res.json();
}

export async function getProjects() {
    const res = await fetch('/api/projects');
    if (!res.ok) throw new Error(`Projects fetch failed: ${res.status}`);
    return res.json();
}

export async function getProject(name) {
    const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`Project fetch failed: ${res.status}`);
    return res.json();
}

export async function getSummary() {
    const res = await fetch('/api/summary');
    if (!res.ok) throw new Error(`Summary fetch failed: ${res.status}`);
    return res.json();
}

export async function getProcesses() {
    const res = await fetch('/api/processes');
    if (!res.ok) throw new Error(`Process list failed: ${res.status}`);
    return res.json();
}

export async function getProcess(pid) {
    const res = await fetch(`/api/processes/${encodeURIComponent(pid)}`);
    if (!res.ok) throw new Error(`Process fetch failed: ${res.status}`);
    return res.json();
}

export async function terminateProcess(pid, name) {
    const res = await fetch(`/api/processes/${pid}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    const data = await res.json();
    // Don't throw on non-2xx here — the response body itself carries 
    // success:false with a message (403/404/409 are meaningful, not just 
    // errors) — let the caller decide what to show the user.
    return { httpStatus: res.status, ...data };
}

export async function getServices() {
    const res = await fetch('/api/services');
    if (!res.ok) throw new Error(`Services fetch failed: ${res.status}`);
    return res.json();
}

export async function getFiles(directory = '') {
    const cleanDir = directory ? `/${directory.replace(/^\/+/, '')}` : '';
    const res = await fetch(`/api/files${cleanDir}`);
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Files fetch failed: ${res.status}`);
    }
    return res.json();
}

export async function getFileContent(filePath) {
    const res = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `File content failed: ${res.status}`);
    }
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
        const data = await res.json();
        return { path: data.path, content: data.content, streamed: false };
    }
    // Large file: raw streamed text
    const text = await res.text();
    return { path: filePath, content: text, streamed: true };
}

export async function searchFiles(query, mode = 'filename') {
    const params = new URLSearchParams({ query, mode });
    const res = await fetch(`/api/files/search?${params.toString()}`);
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Search files failed: ${res.status}`);
    }
    return res.json();
}

export async function getLogs(filename = 'cockpit.log', filters = {}) {
    const params = new URLSearchParams();
    if (filters.level) params.append('level', filters.level);
    if (filters.keyword) params.append('keyword', filters.keyword);
    if (filters.startTime) params.append('startTime', filters.startTime);
    if (filters.endTime) params.append('endTime', filters.endTime);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const cleanFilename = filename ? encodeURIComponent(filename) : 'cockpit.log';
    const res = await fetch(`/api/logs/${cleanFilename}${queryString}`);
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Logs fetch failed: ${res.status}`);
    }
    return res.json();
}

export async function runCommand(command) {
    const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || `Run command failed: ${res.status}`);
    }
    return data;
}
