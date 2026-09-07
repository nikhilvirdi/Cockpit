const getProjects = require('../services/projects/projects');
const getServices = require('../services/services/services');
const logger = require('../utils/logger');
const { getFrontendConfig } = require('../../config/loadConfig');

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json'
    });

    res.end(JSON.stringify(data));
}

async function handleApiRoute(req, res) {

    try {

        if(req.method === 'GET' && (req.url === '/api/projects' || req.url.startsWith('/api/projects?'))) {

            const url = new URL(req.url, 'http://localhost');
            const rescan = url.searchParams.get('rescan') === 'true';

            const projects = getProjects(rescan);

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

        if(req.method === 'GET' && req.url === '/api/services') {

            const services = await getServices();

            sendJson(res, 200, services);
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
