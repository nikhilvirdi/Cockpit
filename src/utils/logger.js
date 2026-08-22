const fs = require('fs');
const path = require('path');

const eventBus = require('../events/bus');

const logDir      = path.join(__dirname, '../../logs');
const logFilePath = path.join(logDir, 'cockpit.log');

// Ensure the logs directory exists before the stream is opened.
// recursive: true is a no-op if the directory already exists, so this is
// safe to call unconditionally on every startup.
fs.mkdirSync(logDir, { recursive: true });

// Open a single append-mode write stream once at module load and reuse it
// for every log call. stream.write() is non-blocking — it queues the data
// in the internal buffer and returns immediately, keeping the event loop free.
// Contrast with appendFileSync, which blocks until the OS write completes.
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// If the write stream encounters an error (e.g. disk full, permissions revoked),
// catch it so it doesn't crash the process as an uncaught exception.
logStream.on('error', (err) => {
    console.error('Failed to write to log file:', err);
});

function writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const logEntry  = `${timestamp} [${level}] ${message}\n`;
    logStream.write(logEntry);

    // Emit event for real-time SSE updates
    eventBus.emit('log:new', {
        timestamp,
        level,
        message
    });
}

function info(message) {
    writeLog('INFO', message);
}

function warn(message) {
    writeLog('WARN', message);
}

function error(message) {
    writeLog('ERROR', message);
}

module.exports = { info, warn, error };