import { connect } from './sse.js';
import { initMenu } from './menu.js';
import * as overview from '../pages/overview.js';
import * as projects from '../pages/projects.js';
import * as files from '../pages/files.js';
import * as processes from '../pages/processes.js';
import * as logs from '../pages/logs.js';
import * as services from '../pages/services.js';
import * as commands from '../pages/commands.js';
import * as system from '../pages/system.js';

const pages = { overview, projects, files, processes, logs, services, commands, system };
let currentPage = null;

export async function showPage(pageName) {
    if (!pages[pageName]) return;

    // Call cleanup() on the outgoing page if it exists, BEFORE switching —
    // this matters later when pages have SSE subscriptions or intervals 
    // that must be torn down on navigation away. Every page module should 
    // export both render() and cleanup() even if cleanup() does nothing yet.
    if (currentPage && typeof pages[currentPage].cleanup === 'function') {
        pages[currentPage].cleanup();
    }

    document.querySelectorAll('.sidebar-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === pageName);
    });

    const container = document.getElementById('page-content');
    container.innerHTML = await pages[pageName].render();

    if (typeof pages[pageName].afterRender === 'function') {
        pages[pageName].afterRender(); // attach event listeners, start fetches, etc.
    }

    currentPage = pageName;
}

export function getCurrentPageName() {
    return currentPage;
}

export async function refreshCurrentPage() {
    if (currentPage) {
        await showPage(currentPage);
    }
}

document.getElementById('sidebar-list').addEventListener('click', (e) => {
    const item = e.target.closest('.sidebar-item');
    if (!item) return;
    showPage(item.dataset.page);
});

initMenu({ showPage, getCurrentPageName, refreshCurrentPage }); // Initialize top menu bar actions and dropdown behaviors
connect(); // single SSE connection for the whole app lifetime
showPage('overview'); // default page on load
