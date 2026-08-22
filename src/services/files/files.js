const fs = require('fs');
const path = require('path');

const fsConfig = require('../../../config/cockpit.json');
const rootDirectories = fsConfig.projectDirectories.map(dir => path.resolve(dir));

function getFiles(directory = '') {

    let requestedPath;
    let validRoot;

    for (const rootDir of rootDirectories) {
        const resolved = path.resolve(rootDir, directory);
        if (resolved.startsWith(rootDir + path.sep) || resolved === rootDir) {
            requestedPath = resolved;
            validRoot = rootDir;
            break;
        }
    }

    if (!requestedPath) {
        throw new Error('Invalid directory path');
    }

    const entries = fs.readdirSync(requestedPath, {
        withFileTypes: true
    });

    return entries.map(entry => {

        const entryPath = path.join(requestedPath, entry.name);
        const stats = fs.statSync(entryPath);

        return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: path.relative(validRoot, entryPath),
            size: entry.isFile() ? stats.size : null,
            modifiedAt: stats.mtime.toISOString()
        };
    });
}

module.exports = getFiles;
