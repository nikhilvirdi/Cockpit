const { execFile } = require('child_process');
const parseMemory = require('../../utils/parseMemory');
const os = require('os');
const eventBus = require('../../events/bus');

// -----------------------------------------------------------------------------
// Windows implementation
// Uses powershell Get-Process for two CPU snapshots 1 s apart (needed because
// Windows doesn't expose a ready-made % � only accumulated CPU seconds), then
// tasklist /FO CSV for the full process list including session/memory.
// -----------------------------------------------------------------------------

function getProcessSnapshot() {
    return new Promise((resolve, reject) => {
        execFile(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                'Get-Process | Select-Object Name,Id,CPU | ConvertTo-Json -Compress'
            ],
            {
                windowsHide: true
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }

                try {
                    const data = JSON.parse(stdout);

                    const processes = Array.isArray(data)
                        ? data
                        : [data];

                    const snapshot = new Map();

                    for (const process of processes) {
                        const pid = Number(process.Id);
                        const cpuTime = Number(process.CPU || 0);

                        snapshot.set(pid, {
                            name: process.Name,
                            cpuTime
                        });
                    }

                    resolve(snapshot);
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function getProcessList() {
    return new Promise((resolve, reject) => {
        execFile(
            'tasklist',
            [
                '/FO',
                'CSV',
                '/NH'
            ],
            {
                windowsHide: true
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }

                const lines = stdout
                    .trim()
                    .split(/\r?\n/);

                const processes = [];

                for (const line of lines) {
                    const values = line
                        .split('","')
                        .map(value => value.replace(/^"|"$/g, ''));

                    if (values.length < 5) {
                        continue;
                    }

                    processes.push({
                        name: values[0],
                        pid: Number(values[1]),
                        sessionName: values[2],
                        sessionNumber: Number(values[3]),
                        memory: parseMemory(values[4])
                    });
                }

                resolve(processes);
            }
        );
    });
}

async function getWindowsProcesses() {
    const firstSnapshot = await getProcessSnapshot();

    const startTime = process.hrtime.bigint();

    await new Promise(resolve => {
        setTimeout(resolve, 1000);
    });

    const endTime = process.hrtime.bigint();

    const secondSnapshot = await getProcessSnapshot();

    const elapsedTime =
        Number(endTime - startTime) / 1_000_000_000;

    const logicalProcessors = os.cpus().length;

    const processes = await getProcessList();

    return processes.map(process => {
        const previousProcess = firstSnapshot.get(process.pid);
        const currentProcess = secondSnapshot.get(process.pid);

        let cpuPercent = 0;

        if (previousProcess && currentProcess) {
            const cpuTimeDifference =
                currentProcess.cpuTime - previousProcess.cpuTime;

            cpuPercent =
                (cpuTimeDifference / elapsedTime) /
                logicalProcessors *
                100;

            if (cpuPercent < 0) {
                cpuPercent = 0;
            }
        }

        return {
            name: process.name,
            pid: process.pid,
            sessionName: process.sessionName,
            sessionNumber: process.sessionNumber,
            memory: process.memory,
            cpuTime: currentProcess?.cpuTime || 0,
            cpuPercent: Number(cpuPercent.toFixed(2))
        };
    });
}

// -----------------------------------------------------------------------------
// POSIX implementation (Linux / macOS)
// Uses a single `ps -eo pid,%cpu,rss,time,comm` invocation.
//
// Column choices and their units:
//   pid    � process ID
//   %cpu   � kernel-computed CPU % (rolling average since process start).
//            This is a ready-made percentage, so the two-snapshot diffing
//            approach Windows needs is unnecessary here.
//   rss    � resident set size in KB (same unit parseMemory returns for
//            Windows, so downstream consumers see identical numeric values).
//   time   � cumulative CPU time in [DD-]HH:MM:SS; parsed to seconds so
//            the cpuTime field stays in the same seconds unit as Windows.
//   comm   � short command/process name (typically =15 chars, no spaces).
//            Placed last so any rare spaced name doesn't break column parsing.
//
// sessionName / sessionNumber: These are Windows Session Manager concepts
// (e.g. the named "Console" or "Services" session). POSIX processes belong
// to TTYs and process groups, not to named sessions � there is no faithful
// 1-to-1 mapping. We emit null for both rather than fabricating a value,
// so API consumers can treat null as "not applicable on this platform".
// -----------------------------------------------------------------------------

function parsePsTime(timeStr) {
    // Handles [DD-]HH:MM:SS  ?  total seconds (integer)
    let total = 0;
    const dashIdx = timeStr.indexOf('-');
    if (dashIdx !== -1) {
        total += parseInt(timeStr.substring(0, dashIdx), 10) * 86400;
        timeStr = timeStr.substring(dashIdx + 1);
    }
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) total += parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) total += parts[0] * 60 + parts[1];
    return total;
}

function getPosixProcesses() {
    return new Promise((resolve, reject) => {
        execFile(
            'ps',
            ['-eo', 'pid,%cpu,rss,time,comm'],
            (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }

                const lines = stdout.trim().split(/\r?\n/);
                const processes = [];

                // lines[0] is the header row � skip it
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    // Split on any run of whitespace.
                    // Column order: pid, %cpu, rss, time, comm
                    // comm is taken as everything from index 4 onward so that
                    // any spaced name (rare for `comm`) is preserved correctly.
                    const parts = line.split(/\s+/);
                    if (parts.length < 5) continue;

                    const pid        = parseInt(parts[0], 10);
                    let cpuPercent   = parseFloat(parts[1]);
                    let memoryKB     = parseInt(parts[2], 10);
                    const cpuTime    = parsePsTime(parts[3]);
                    const name       = parts.slice(4).join(' ');

                    if (isNaN(pid)) continue;

                    if (isNaN(cpuPercent)) cpuPercent = 0;
                    if (isNaN(memoryKB)) memoryKB = 0;

                    processes.push({
                        name,
                        pid,
                        sessionName:   null,   // no Windows-style sessions on POSIX
                        sessionNumber: null,   // same reason � see file-level comment
                        memory:        memoryKB,
                        cpuTime:       Number(cpuTime.toFixed(2)),
                        cpuPercent:    Number(cpuPercent.toFixed(2))
                    });
                }

                resolve(processes);
            }
        );
    });
}

// -----------------------------------------------------------------------------
// Platform dispatcher
// -----------------------------------------------------------------------------

async function getProcesses() {
    if (process.platform === 'win32') {
        return getWindowsProcesses();
    }
    return getPosixProcesses();
}

// -----------------------------------------------------------------------------
// Real-time Event Publisher
// -----------------------------------------------------------------------------

setInterval(async () => {
    // Gate: Only poll if someone is actively listening
    if (eventBus.listenerCount('process:snapshot') === 0) return;

    try {
        const processes = await getProcesses();
        eventBus.emit('process:snapshot', { processes });
    } catch (error) {
        console.error('Process monitor polling error:', error);
    }
}, 3000);

module.exports = getProcesses;
