const fs = require('fs');
const path = require('path');

let cachedConfig = null;

function getConfig() {
    if (cachedConfig === null) {
        const configPath = path.join(__dirname, 'cockpit.json');
        cachedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    return cachedConfig;
}

function getFrontendConfig() {
    const config = getConfig();

    return {
        projectDirectories: config.projectDirectories || [],
        allowedCommands: Object.keys(config.allowedCommands || {}),
        services: (config.services || []).map(service => ({
            name: service.name,
            host: service.host,
            port: service.port
        })),
        server: {
            port: config.server?.port || 4000,
            host: config.server?.host || '127.0.0.1'
        }
    };
}

module.exports = { getConfig, getFrontendConfig };
