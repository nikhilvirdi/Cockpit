async function loadProcessCount() {
    const response = await fetch('/api/processes');
    const processes = await response.json();

    document.getElementById('process-count').textContent = processes.length;
}

loadProcessCount();
