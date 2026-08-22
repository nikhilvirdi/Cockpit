const net = require('net');

const services = [
    {
        name: 'Cockpit',
        host: '127.0.0.1',
        port: 4000
    },
    {
        name: 'PostgreSQL',
        host: '127.0.0.1',
        port: 5432
    },
    {
        name: 'Redis',
        host: '127.0.0.1',
        port: 6379
    },
    {
        name: 'MongoDB',
        host: '127.0.0.1',
        port: 27017
    }
];

function checkPort(host, port) {
    return new Promise(resolve => {

        const socket = new net.Socket();

        socket.setTimeout(1000);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            resolve(false);
        });

        socket.connect(port, host);
    });
}

async function getServices() {

    const results = [];

    for(const service of services) {

        const isRunning = await checkPort(
            service.host,
            service.port
        );

        results.push({
            name: service.name,
            host: service.host,
            port: service.port,
            status: isRunning ? 'running' : 'stopped'
        });
    }

    return results;
}

module.exports = getServices;
