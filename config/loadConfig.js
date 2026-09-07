const fs = require('fs');
const path = require('path');
const os = require('os');

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
        scanRoots: config.scanRoots || [os.homedir()],
        server: {
            port: config.server?.port || 4000,
            host: config.server?.host || '127.0.0.1'
        }
    };
}

module.exports = { getConfig, getFrontendConfig };
