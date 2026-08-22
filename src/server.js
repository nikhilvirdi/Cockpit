const http = require('http');
const handleRoute = require('./routes');
const logger = require('./utils/logger');
const { getConfig } = require('../config/loadConfig');

// Load server config from cockpit.json, then allow env var overrides.
const config = getConfig();
const serverConfig = config.server || {};

const PORT = process.env.PORT || serverConfig.port || 4000;
const HOST = process.env.HOST || serverConfig.host || '127.0.0.1';

// creating an http server

const server = http.createServer((req, res) => {
    logger.info(`Method: ${req.method}`);
    logger.info(`URL: ${req.url}`);

    handleRoute(req, res);
});

server.listen(PORT, HOST, () => {
    console.log(`Cockpit server Running at http://${HOST}:${PORT}`);
});
