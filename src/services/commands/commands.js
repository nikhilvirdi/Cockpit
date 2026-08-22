const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const { getConfig } = require('../../../config/loadConfig');
const eventBus = require('../../events/bus');

function executeCommand(commandName) {
    return new Promise((resolve, reject) => {
        const config = getConfig();
        const commands = config.allowedCommands || {};
        
        const commandString = commands[commandName];

        if (!commandString) {
            reject(new Error('Command not allowed'));
            return;
        }

        const commandId = crypto.randomUUID();
        const timeoutMs = config.commandTimeoutMs || 60000;

        const child = spawn(commandString, {
            shell: true,
            windowsHide: true
        });

        // Resolve immediately to acknowledge start
        resolve({ commandId, status: 'started' });

        // Stream stdout
        child.stdout.on('data', (chunk) => {
            eventBus.emit('command:output', {
                commandId,
                stream: 'stdout',
                data: chunk.toString()
            });
        });

        // Stream stderr
        child.stderr.on('data', (chunk) => {
            eventBus.emit('command:output', {
                commandId,
                stream: 'stderr',
                data: chunk.toString()
            });
        });

        // Timeout safety
        const timer = setTimeout(() => {
            if (process.platform === 'win32') {
                execFile('taskkill', ['/PID', child.pid.toString(), '/T', '/F'], { windowsHide: true }, () => {});
            } else {
                try {
                    child.kill('SIGKILL');
                } catch (e) {}
            }

            eventBus.emit('command:output', {
                commandId,
                stream: 'stderr',
                data: `\n[Cockpit] Command timed out after ${timeoutMs}ms and was forcibly killed.\n`
            });
        }, timeoutMs);

        // Completion
        child.on('close', (code) => {
            clearTimeout(timer);
            eventBus.emit('command:output', {
                commandId,
                stream: 'exit',
                exitCode: code,
                success: code === 0
            });
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            eventBus.emit('command:output', {
                commandId,
                stream: 'stderr',
                data: `\n[Cockpit] Failed to spawn command: ${err.message}\n`
            });
            eventBus.emit('command:output', {
                commandId,
                stream: 'exit',
                exitCode: 1,
                success: false
            });
        });
    });
}

module.exports = {
    executeCommand
};
