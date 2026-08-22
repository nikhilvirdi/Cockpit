const getProjects = require('../services/projects/projects');
const getSystemInfo = require('../services/system/system');
const getProcesses = require('../services/processes/processes');
const getLogs = require('../services/logs/logs');
const getServices = require('../services/services/services');
const getFiles = require('../services/files/files');
const logger = require('../utils/logger');
const { executeCommand } = require('../services/commands/commands');


function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', () => {
            try {

                resolve(JSON.parse(body));
            }
            catch(error) {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', reject);
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

            const body = await readJsonBody(req);

            if(!body.command) {
                sendJson(res, 400, {
                    error: 'Command is required'
                });

                return;
            }

            try {

                const result = await executeCommand(body.command);

                sendJson(res, 200, result);
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

        if(req.method === 'GET' && req.url === '/api/services') {

            const services = await getServices();

            sendJson(res, 200, services);
            return;
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
        if(req.method === 'GET' && req.url === '/api/logs') {

            const logs = getLogs();

            sendJson(res, 200, logs);
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
















