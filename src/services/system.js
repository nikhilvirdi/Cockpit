const os = require('os');
const formatUptime = require('../utils/formatUptime');

// os module methods:

/**
console.log('Platform:', os.platform());
console.log('Architecture:', os.arch());
console.log('Hostname:', os.hostname());
console.log('OS release:', os.release());
console.log('CPU information:', os.cpus());
console.log('CPU count:', os.cpus().length);
console.log('Total memory:', os.totalmem());
console.log('Free memory:', os.freemem());
console.log('System uptime:', os.uptime());
console.log('Home directory:', os.homedir());
console.log('Temporary directory:', os.tmpdir());
console.log('Operating system user info:', os.userInfo());
console.log('Network interfaces:', os.networkInterfaces());
console.log('Endianness:', os.endianness());
console.log('Null device:', os.devNull);
*/

// process module methods:

/**
console.log('Process ID:', process.pid);
console.log('Parent process ID:', process.ppid);
console.log('Node.js version:', process.version);
console.log('Environment variables:', process.env);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Process uptime:', process.uptime());
console.log('Process memory usage:', process.memoryUsage());
console.log('Process CPU usage:', process.cpuUsage());
console.log('Command-line arguments:', process.argv);
console.log('Current working directory:', process.cwd());
console.log('Node.js executable path:', process.execPath);
console.log('Operating system platform:', process.platform);
console.log('CPU architecture:', process.arch);
console.log('Process resource usage:', process.resourceUsage());
*/

function getMemoryInfo(){

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = Number(((usedMemory / totalMemory) * 100).toFixed(2));
    const totalMemoryGB  = totalMemory/(1024**3);
    const freeMemoryGB = freeMemory / (1024**3);
    const usedMemoryGB = usedMemory / (1024**3);

    return{
        // totalMemory: totalMemory,
        // freeMemory: freeMemory,
        // usedMemory: usedMemory,
        memoryUsage: memoryUsage,
        totalMemoryGB: Number(totalMemoryGB.toFixed(2)),
        freeMemoryGB: Number(freeMemoryGB.toFixed(2)),
        usedMemoryGB: Number(usedMemoryGB.toFixed(2)),
    }
}

function getSystemInfo(){

    // const uptimeSecond = os.uptime();
    // const days = Math.floor(uptimeSecond / 86400);
    // const hours = Math.floor((uptimeSecond % 86400)/3600);
    // const minutes = Math.floor((uptimeSecond % 3600)/60);

    // const uptime = `${days} days, ${hours} hours, ${minutes} minutes`;

    const memoryInfo = getMemoryInfo();
    const uptime = formatUptime(os.uptime());

    return{
        platform : os.platform(),
        osRelease: os.release(),
        architecture: os.arch(),
        hostname: os.hostname(),
        processId: process.pid,
        environment: process.env.NODE_ENV || 'development',
        serverStartTime: new Date(Date.now()-(process.uptime()*1000)).toISOString(),
        processMemoryMB: Number((process.memoryUsage().rss/(1024**2)).toFixed(2)),
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        cpuModel: os.cpus()[0].model,
        ...memoryInfo,
        uptime: uptime
    };
}

module.exports = getSystemInfo;