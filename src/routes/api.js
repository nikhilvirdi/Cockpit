const getProjects = require('../services/projects/projects');
const getSystemInfo = require('../services/system/system');

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json'
    });

    res.end(JSON.stringify(data));
}

function handleApiRoute(req, res) {

    try {

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
 
        console.error('API error:', error);

        sendJson(res, 500, {
            error: 'Internal server error'
        });
    }
}

module.exports = handleApiRoute;
