const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../../../logs/cockpit.log');

function getLogs() {
    const content = fs.readFileSync(logFilePath, 'utf8');

    return content
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
}

module.exports = getLogs;
