function renderProjects(projects) {
    const tbody = document.querySelector('#projects-table tbody');
    tbody.innerHTML = '';

    for (const project of projects) {
        const row = document.createElement('tr');

        let statusClass = 'status-modified';
        let statusText = 'no git';

        if (project.isGitRepository) {
            if (project.gitStatus === 'clean') {
                statusClass = 'status-clean';
                statusText = 'clean';
            } else if (project.gitStatus === 'modified') {
                statusClass = 'status-modified';
                statusText = 'modified';
            } else {
                statusClass = 'status-error';
                statusText = 'error';
            }
        }
        const commitText = project.lastCommit ? project.lastCommit.message : '-';

        row.innerHTML = `
            <td>${project.name}</td>
            <td>${project.currentBranch || '-'}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>${commitText}</td>
        `;

        tbody.appendChild(row);
    }
}

function renderServices(services) {
    const tbody = document.querySelector('#services-table tbody');
    tbody.innerHTML = '';

    for (const service of services) {
        const row = document.createElement('tr');

        const statusClass = service.status === 'running' ? 'status-running' : 'status-stopped';

        row.innerHTML = `
            <td>${service.name}</td>
            <td>${service.host}</td>
            <td>${service.port}</td>
            <td class="${statusClass}">${service.status}</td>
        `;

        tbody.appendChild(row);
    }
}

async function loadProjects() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    renderProjects(projects);
}

async function loadServices() {
    const response = await fetch('/api/services');
    const services = await response.json();
    renderServices(services);
}

function refreshAll() {
    loadProjects();
    loadServices();
}

refreshAll();
