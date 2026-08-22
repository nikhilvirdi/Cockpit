const getProjects = require('../services/projects/projects');
const getSystemInfo = require('../services/system/system');
const getProcesses = require('../services/processes/processes');
const getLogs = require('../services/logs/logs');
const getServices = require('../services/services/services');
const getFiles = require('../services/files/files');
const { getFileContent, getFileInfo, createFileStream } = require('../services/files/content');
const searchFiles = require('../services/files/search');
const { executeCommand } = require('../services/commands/commands');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const eventBus = require('../events/bus');
const { getFrontendConfig } = require('../../config/loadConfig');

// Maximum accepted POST body size. /api/commands only needs a tiny
// { "command": "..." } payload, so 1 MB is already very generous.
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1 MB

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let bodySize = 0;
        let done = false;

        req.on('data', chunk => {
            if (done) return;
            bodySize += chunk.length;

            if (bodySize > MAX_BODY_SIZE) {
                done = true;
                // Discard buffered body to free memory immediately
                body = '';
                // Drain any further chunks from socket so TCP doesn't abruptly reset
                req.on('data', () => {});
                req.resume();
                reject(new Error('Payload too large'));
                return;
            }

            body += chunk;
        });

        req.on('end', () => {
            if (done) return;
            done = true;
            try {
                resolve(JSON.parse(body));
            }
            catch(error) {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', err => {
            if (done) return;
            done = true;
            reject(err);
        });
    });
}
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json'
    });

    res.end(JSON.stringify(data));
}

async function handleApiRoute(req, res) {

    try {


        if(req.method === 'POST' && req.url === '/api/commands') {

            let body;
            try {
                body = await readJsonBody(req);
            }
            catch(error) {
                if(error.message === 'Payload too large') {
                    res.writeHead(413, {
                        'Content-Type': 'application/json',
                        'Connection': 'close'
                    });
                    res.end(JSON.stringify({
                        error: 'Payload too large'
                    }));
                    return;
                }

                if(error.message === 'Invalid JSON') {
                    sendJson(res, 400, {
                        error: 'Invalid JSON'
                    });
                    return;
                }

                throw error;
            }

            if(!body.command) {
                sendJson(res, 400, {
                    error: 'Command is required'
                });

                return;
            }

            try {

                const result = await executeCommand(body.command);

                sendJson(res, 202, result);
                return;
            }
            catch(error) {

                if(error.message === 'Command not allowed') {
                    sendJson(res, 400, {
                        error: 'Command not allowed'
                    });

                    return;
                }

                throw error;
            }
        }
        if(req.method === 'GET' && req.url === '/api/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            // Send initial comment to establish connection and flush headers
            res.write(': connected\n\n');

            // Centralized SSE listener function
            const sseListener = (eventType, payload) => {
                const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
                res.write(message);
            };

            // Individual event listeners bound to this specific request
            const logNewListener = payload => sseListener('log:new', payload);
            const processSnapshotListener = payload => sseListener('process:snapshot', payload);
            const serviceStatusListener = payload => sseListener('service:statusChanged', payload);
            const fileChangedListener = payload => sseListener('file:changed', payload);
            const commandOutputListener = payload => sseListener('command:output', payload);

            // Subscribe
            eventBus.on('log:new', logNewListener);
            eventBus.on('process:snapshot', processSnapshotListener);
            eventBus.on('service:statusChanged', serviceStatusListener);
            eventBus.on('file:changed', fileChangedListener);
            eventBus.on('command:output', commandOutputListener);

            // Cleanup on client disconnect
            req.on('close', () => {
                eventBus.removeListener('log:new', logNewListener);
                eventBus.removeListener('process:snapshot', processSnapshotListener);
                eventBus.removeListener('service:statusChanged', serviceStatusListener);
                eventBus.removeListener('file:changed', fileChangedListener);
                eventBus.removeListener('command:output', commandOutputListener);
            });

            return;
        }

        if(req.method === 'GET' && req.url === '/api/system') {

            const systemInfo = getSystemInfo();

            sendJson(res, 200, systemInfo);
            return;
        }

        if(req.method === 'GET' && req.url === '/api/projects') {

            const projects = getProjects();

            sendJson(res, 200, projects);
            return;
        }

                if(req.method === 'GET' && req.url === '/api/status') {

            sendJson(res, 200, {
                status: 'running'
            });

            return;
        }

        if(req.method === 'GET' && req.url === '/api/config') {

            const config = getFrontendConfig();

            sendJson(res, 200, config);
            return;
        }

        if(req.method === 'GET' && req.url.startsWith('/api/projects/')) {

            const projectName = decodeURIComponent(
                req.url.substring('/api/projects/'.length)
            );

            const projects = getProjects();

            const project = projects.find(
                project => project.name === projectName
            );

            if(!project) {

                sendJson(res, 404, {
                    error: 'Project not found'
                });

                return;
            }

            sendJson(res, 200, project);
            return;
        }

        if(req.method === 'GET' && req.url === '/api/processes'){
            const proceesses = await getProcesses();
            sendJson(res,200,proceesses);
            return;
        }

        if(req.method === 'GET' && req.url.startsWith('/api/processes/')) {
            const pid = parseInt(req.url.substring('/api/processes/'.length), 10);
            if (isNaN(pid)) {
                sendJson(res, 400, { error: 'Invalid PID' });
                return;
            }
            const processes = await getProcesses();
            const targetProcess = processes.find(p => p.pid === pid);
            if (!targetProcess) {
                sendJson(res, 404, { error: 'Process not found' });
                return;
            }
            sendJson(res, 200, targetProcess);
            return;
        }
        if(req.method === 'POST' && req.url.match(/^\/api\/processes\/\d+\/terminate$/)) {
            const pidMatch = req.url.match(/^\/api\/processes\/(\d+)\/terminate$/);
            const pid = parseInt(pidMatch[1], 10);

            let body;
            try {
                body = await readJsonBody(req);
            } catch (error) {
                if (error.message === 'Payload too large') {
                    res.writeHead(413, {
                        'Content-Type': 'application/json',
                        'Connection': 'close'
                    });
                    res.end(JSON.stringify({
                        error: 'Payload too large'
                    }));
                    return;
                }
                if (error.message === 'Invalid JSON') {
                    sendJson(res, 400, {
                        error: 'Invalid JSON'
                    });
                    return;
                }
                throw error;
            }

            // Security check 1: Verify request includes process name for confirmation
            if (!body.name) {
                sendJson(res, 400, {
                    pid,
                    success: false,
                    message: 'Process name required for confirmation'
                });
                return;
            }

            // Security check 2: Deny termination of Cockpit itself
            if (pid === process.pid) {
                sendJson(res, 403, {
                    pid,
                    success: false,
                    message: 'Cannot terminate Cockpit itself'
                });
                return;
            }

            // Security check 3: Deny critical system processes
            const CRITICAL_PIDS = [0, 1, 4]; // PID 0 (Idle), PID 1 (init/systemd on Linux), PID 4 (System on Windows)
            const CRITICAL_PROCESS_NAMES = [
                'System', 'System Idle Process', 'systemd', 'init',
                'kernel_task', 'launchd', 'csrss.exe', 'wininit.exe',
                'services.exe', 'lsass.exe', 'winlogon.exe', 'svchost.exe'
            ];

            if (CRITICAL_PIDS.includes(pid)) {
                sendJson(res, 403, {
                    pid,
                    success: false,
                    message: 'Cannot terminate critical system process (protected PID)'
                });
                return;
            }

            if (CRITICAL_PROCESS_NAMES.some(name => 
                body.name.toLowerCase() === name.toLowerCase() ||
                body.name.toLowerCase().includes(name.toLowerCase())
            )) {
                sendJson(res, 403, {
                    pid,
                    success: false,
                    message: 'Cannot terminate critical system process (protected name)'
                });
                return;
            }

            // Security check 4: Verify PID exists in current process list
            try {
                const processes = await getProcesses();
                const targetProcess = processes.find(p => p.pid === pid);

                if (!targetProcess) {
                    sendJson(res, 404, {
                        pid,
                        success: false,
                        message: 'Process not found in current process list'
                    });
                    return;
                }

                // Security check 5: Verify name matches (prevent stale PID reuse)
                if (targetProcess.name !== body.name) {
                    sendJson(res, 409, {
                        pid,
                        success: false,
                        message: `Process name mismatch: expected "${targetProcess.name}", got "${body.name}"`
                    });
                    return;
                }

                // Attempt termination
                try {
                    // process.kill() works cross-platform via libuv
                    process.kill(pid, 'SIGTERM');
                    sendJson(res, 200, {
                        pid,
                        success: true,
                        message: `Process ${pid} (${body.name}) termination signal sent`
                    });
                } catch (killError) {
                    if (killError.code === 'ESRCH') {
                        sendJson(res, 404, {
                            pid,
                            success: false,
                            message: 'Process no longer exists'
                        });
                    } else if (killError.code === 'EPERM') {
                        sendJson(res, 403, {
                            pid,
                            success: false,
                            message: 'Permission denied: insufficient privileges to terminate process'
                        });
                    } else {
                        sendJson(res, 500, {
                            pid,
                            success: false,
                            message: `Termination failed: ${killError.message}`
                        });
                    }
                }
            } catch (error) {
                logger.error(`Process termination error: ${error.message}`);
                sendJson(res, 500, {
                    pid,
                    success: false,
                    message: 'Internal error while attempting termination'
                });
            }
            return;
        }

        if(req.method === 'GET' && req.url === '/api/services') {

            const services = await getServices();

            sendJson(res, 200, services);
            return;
        }
        if(req.method === 'GET' && req.url.startsWith('/api/files/search')) {

            const url = new URL(req.url, 'http://localhost');
            const query = url.searchParams.get('query');
            const mode = url.searchParams.get('mode') || 'filename';

            if(!query) {
                sendJson(res, 400, {
                    error: 'Search query is required'
                });

                return;
            }

            const results = searchFiles(query, mode);

            sendJson(res, 200, {
                query,
                mode,
                results
            });

            return;
        }
        if(req.method === 'GET' && req.url.startsWith('/api/files/content')) {

            const url = new URL(req.url, 'http://localhost');
            const filePath = url.searchParams.get('path');

            if(!filePath) {
                sendJson(res, 400, {
                    error: 'File path is required'
                });

                return;
            }

            try {
                // First, check if file should be streamed
                const { shouldStream } = getFileInfo(filePath);

                if (shouldStream) {
                    const { stream, size } = createFileStream(filePath);
                    res.writeHead(200, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Content-Length': size
                    });
                    stream.pipe(res);
                    return;
                }

                // Small file: return as JSON (original behavior)
                const content = getFileContent(filePath);

                sendJson(res, 200, {
                    path: filePath,
                    content
                });

                return;
            }
            catch(error) {

                if(
                    error.message === 'Invalid file path' ||
                    error.message === 'File not found'    ||
                    error.message === 'Path is not a file'
                ) {
                    sendJson(res, 404, {
                        error: error.message
                    });

                    return;
                }

                if(error.message === 'File too large') {
                    // This case should now be handled by streaming above,
                    // but keep for safety
                    sendJson(res, 413, {
                        error: 'File too large'
                    });

                    return;
                }

                if(error.message === 'Binary file, cannot display as text') {
                    sendJson(res, 415, {
                        error: 'Binary file, cannot display as text'
                    });

                    return;
                }

                throw error;
            }
        }
        if(req.method === 'GET' && req.url.startsWith('/api/files')) {

            const directory = req.url
                .substring('/api/files'.length)
                .replace(/^\/+/, '');

            try {

                const files = getFiles(directory);

                sendJson(res, 200, files);
                return;
            }
            catch(error) {

                if(error.message === 'Invalid directory path') {
                    sendJson(res, 400, {
                        error: 'Invalid directory path'
                    });

                    return;
                }

                if(error.code === 'ENOENT') {
                    sendJson(res, 404, {
                        error: 'Directory not found'
                    });

                    return;
                }

                throw error;
            }
        }
                if(req.method === 'GET' && req.url.startsWith('/api/logs')) {

            const url = new URL(req.url, 'http://localhost');
            let filename = 'cockpit.log';

            // Use URL pathname to extract filename reliably (works with query strings)
            const pathname = url.pathname;
            if (pathname.startsWith('/api/logs/')) {
                filename = pathname.substring('/api/logs/'.length);
            }

            const level = url.searchParams.get('level');
            const keyword = url.searchParams.get('keyword');
            const startTime = url.searchParams.get('startTime');
            const endTime = url.searchParams.get('endTime');

            const filters = {};
            if (level) filters.level = level;
            if (keyword) filters.keyword = keyword;
            if (startTime) filters.startTime = startTime;
            if (endTime) filters.endTime = endTime;

            try {
                const logs = getLogs(filename, filters);
                sendJson(res, 200, logs);
            } catch (error) {
                if (error.message === 'Invalid log filename' || error.message === 'Log file not found') {
                    sendJson(res, 404, { error: error.message });
                    return;
                }
                throw error;
            }
            return;
        }
        if(req.method === 'GET' && req.url === '/api/summary') {

            const projects = getProjects();

            const summary = {
                totalProjects: projects.length,

                gitRepositories: projects.filter(
                    project => project.isGitRepository
                ).length,

                cleanRepositories: projects.filter(
                    project => project.gitStatus === 'clean'
                ).length,

                modifiedRepositories: projects.filter(
                    project => project.gitStatus === 'modified'
                ).length,

                languages: {},

                projectTypes: {}
            };

            for(const project of projects) {

                if(summary.languages[project.language]) {
                    summary.languages[project.language]++;
                }
                else {
                    summary.languages[project.language] = 1;
                }

                if(summary.projectTypes[project.projectType]) {
                    summary.projectTypes[project.projectType]++;
                }
                else {
                    summary.projectTypes[project.projectType] = 1;
                }
            }

            sendJson(res, 200, summary);
            return;
        }

        sendJson(res, 404, {
            error: 'API route not found'
        });

    }
    catch(error) {
 
        logger.error(`API error: ${error.message}`);

        sendJson(res, 500, {
            error: 'Internal server error'
        });
    }
}

module.exports = handleApiRoute;






