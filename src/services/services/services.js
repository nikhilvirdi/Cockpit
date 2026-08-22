const net = require('net');
const { getConfig } = require('../../../config/loadConfig');
const eventBus = require('../../events/bus');

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

// -----------------------------------------------------------------------------
// Real-time Event Publisher
// -----------------------------------------------------------------------------

// Map to cache the last known status of each service ('host:port' -> 'status')
const previousStatus = new Map();

setInterval(async () => {
    // Gate: Only poll if someone is actively listening
    if (eventBus.listenerCount('service:statusChanged') === 0) return;

    try {
        const currentServices = await getServices();
        const changes = [];

        for (const service of currentServices) {
            const key = `${service.host}:${service.port}`;
            const oldStatus = previousStatus.get(key);

            // Only emit if the status actually changed
            if (oldStatus && oldStatus !== service.status) {
                changes.push({
                    name: service.name,
                    host: service.host,
                    port: service.port,
                    oldStatus: oldStatus,
                    newStatus: service.status
                });
            }

            // Always update cache
            previousStatus.set(key, service.status);
        }

        if (changes.length > 0) {
            // Emit each changed service individually (matches payload schema design)
            for (const change of changes) {
                eventBus.emit('service:statusChanged', change);
            }
        }
    } catch (error) {
        console.error('Service monitor polling error:', error);
    }
}, 5000);

module.exports = getServices;
