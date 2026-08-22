const fs = require('fs');
const path = require('path');

const rootDirectory = path.resolve(__dirname, '../../..');

function getFiles(directory = '') {

    const requestedPath = path.resolve(rootDirectory, directory);

    if(
        requestedPath !== rootDirectory &&
        !requestedPath.startsWith(rootDirectory + path.sep)
    ) {
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
            path: path.relative(rootDirectory, entryPath),
            size: entry.isFile() ? stats.size : null,
            modifiedAt: stats.mtime.toISOString()
        };
    });
}

module.exports = getFiles;
