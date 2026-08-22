const http = require('http');
const handleRoute = require('./routes');
const logger = require('./utils/logger');

// creating an http server

const server = http.createServer((req, res) => {
    logger.info(`Method: ${req.method}`);
    logger.info(`URL: ${req.url}`);

    handleRoute(req, res);
});

server.listen(4000, '127.0.0.1', () => {
    console.log('Cockpit server Running at http://localhost:4000');
});