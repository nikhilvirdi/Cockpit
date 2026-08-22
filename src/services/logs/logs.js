const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../../../logs');

function validateLogPath(filename) {
    // Prevent path traversal attacks
    const resolved = path.resolve(LOGS_DIR, filename);
    if (!resolved.startsWith(LOGS_DIR + path.sep) && resolved !== LOGS_DIR) {
        throw new Error('Invalid log filename');
    }
    if (!fs.existsSync(resolved)) {
        throw new Error('Log file not found');
    }
    if (!fs.statSync(resolved).isFile()) {
        throw new Error('Not a file');
    }
    return resolved;
}

function getLogs(filename = 'cockpit.log', filters = {}) {
    // Validate and resolve the log file path - throws if invalid/missing
    const logFilePath = validateLogPath(filename);

    const content = fs.readFileSync(logFilePath, 'utf8');

    let lines = content
        .split(/\r?\n/)
        .filter(line => line.length > 0)
        .map(line => {
            const match = line.match(
                /^(\S+) \[([A-Z]+)\] (.*)$/
            );

            if(!match) {
                return {
                    timestamp: null,
                    level: 'UNKNOWN',
                    message: line
                };
            }

            return {
                timestamp: match[1],
                level: match[2],
                message: match[3]
            };
        });

    // Apply filters
    if (filters.level) {
        const levelUpper = filters.level.toUpperCase();
        lines = lines.filter(log => log.level === levelUpper);
    }

    if (filters.keyword) {
        const keywordLower = filters.keyword.toLowerCase();
        lines = lines.filter(log => log.message.toLowerCase().includes(keywordLower));
    }

    if (filters.startTime) {
        const start = new Date(filters.startTime);
        if (!isNaN(start)) {
            lines = lines.filter(log => {
                if (!log.timestamp) return false;
                return new Date(log.timestamp) >= start;
            });
        }
    }

    if (filters.endTime) {
        const end = new Date(filters.endTime);
        if (!isNaN(end)) {
            lines = lines.filter(log => {
                if (!log.timestamp) return false;
                return new Date(log.timestamp) <= end;
            });
        }
    }

    return lines;
}

module.exports = getLogs;
