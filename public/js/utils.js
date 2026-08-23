// public/js/utils.js — Shared utility functions across Cockpit frontend pages

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {*} str 
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Formats process memory value given in kilobytes (KB).
 * @param {number|string|null} kb 
 * @returns {string}
 */
export function formatBytesFromKB(kb) {
    if (kb === null || kb === undefined || isNaN(kb)) return '0 KB';
    const num = Number(kb);
    if (num >= 1024 * 1024) {
        return (num / (1024 * 1024)).toFixed(2) + ' GB';
    }
    if (num >= 1024) {
        return (num / 1024).toFixed(1) + ' MB';
    }
    return Math.round(num).toLocaleString() + ' KB';
}

/**
 * Formats file size value given in raw bytes.
 * @param {number|string|null} bytes 
 * @returns {string}
 */
export function formatBytesFromBytes(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '—';
    const num = Number(bytes);
    if (num >= 1024 * 1024 * 1024) {
        return (num / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
    if (num >= 1024 * 1024) {
        return (num / (1024 * 1024)).toFixed(2) + ' MB';
    }
    if (num >= 1024) {
        return (num / 1024).toFixed(1) + ' KB';
    }
    return num + ' B';
}

/**
 * Sorts an array of process objects: primary sort by CPU% descending, secondary by Memory descending.
 * @param {Array} processes 
 * @returns {Array}
 */
export function sortProcessesByUsage(processes) {
    if (!Array.isArray(processes)) return [];
    return [...processes].sort((a, b) => {
        const cpuA = Number(a.cpuPercent) || 0;
        const cpuB = Number(b.cpuPercent) || 0;
        if (cpuB !== cpuA) {
            return cpuB - cpuA;
        }
        const memA = Number(a.memory) || 0;
        const memB = Number(b.memory) || 0;
        return memB - memA;
    });
}
