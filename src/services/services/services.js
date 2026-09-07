const net = require('net');
const { getConfig } = require('../../../config/loadConfig');

const config = getConfig();
const services = config.services || [];
const TIMEOUT_MS = 1000;

function checkPort(host, port) {
    return new Promise(resolve => {
        const startTime = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(TIMEOUT_MS);

        socket.on('connect', () => {
            const responseTime = Date.now() - startTime;
            socket.destroy();
            resolve({ success: true, responseTime });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ success: false, responseTime: TIMEOUT_MS });
        });

        socket.on('error', () => {
            socket.destroy();
            resolve({ success: false, responseTime: null });
        });

        socket.connect(port, host);
    });
}

async function getServices() {

    const results = [];

    for(const service of services) {

        const result = await checkPort(
            service.host,
            service.port
        );

        results.push({
            name: service.name,
            host: service.host,
            port: service.port,
            status: result.success ? 'running' : 'stopped',
            responseTime: result.responseTime
        });
    }

    return results;
}

module.exports = getServices;

