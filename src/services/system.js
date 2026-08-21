const os = require('os');

// os module methods:

/**
console.log('Platform:', os.platform());
console.log('Architecture:', os.arch());
console.log('Hostname:', os.hostname());
console.log('CPU count:', os.cpus().length);
console.log('Total memory:', os.totalmem());
console.log('Free memory:', os.freemem());
console.log('Uptime:', os.uptime());
 */

function getSystemInfo(){
    return{
        platform : os.platform(),
        architecture: os.arch(),
        hostname: os.hostname(),
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime()
    };
}

module.exports = getSystemInfo;

