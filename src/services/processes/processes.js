const { execFile } = require('child_process');
const parseMemory = require('../../utils/parseMemory');
const os = require('os');

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

async function getProcesses() {
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

module.exports = getProcesses;