const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../../logs/cockpit.log');

function writeLog(level,message){
    const timestamp = new Date().toISOString();
    const logEntry =  `${timestamp} [${level}] ${message}\n`;
    fs.appendFileSync(logFilePath,logEntry);
}

function info(message){
    writeLog('INFO', message);
}

function warn(message){
    writeLog('WARN', message);
}

function error(message){
    writeLog('ERROR', message);
}

module.exports = {info,warn,error};