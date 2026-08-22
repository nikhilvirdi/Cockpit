const fs = require('fs');
const path = require('path');
const { MAX_SCAN_DEPTH, IGNORED_DIRECTORIES } = require('./scanConstants');

function getFileMetrics(projectPath) {
    let fileCount = 0;
    let directoryCount = 0;
    const fileTypes = {};

    function scanDirectory(directoryPath, currentDepth) {
        if (currentDepth > MAX_SCAN_DEPTH) {
            return;
        }

        let entries;
        try {
            entries = fs.readdirSync(directoryPath, {
                withFileTypes: true
            });
        } catch (error) {
            return;
        }

        for (const entry of entries) {
            if (entry.isFile()) {
                fileCount++;

                const extension = path.extname(entry.name).toLowerCase();
                const type = extension === '' ? '[no extension]' : extension;

                if (fileTypes[type]) {
                    fileTypes[type]++;
                } else {
                    fileTypes[type] = 1;
                }

                continue;
            }

            if (!entry.isDirectory()) {
                continue;
            }

            if (IGNORED_DIRECTORIES.has(entry.name)) {
                continue;
            }

            directoryCount++;

            const childPath = path.join(directoryPath, entry.name);
            scanDirectory(childPath, currentDepth + 1);
        }
    }

    scanDirectory(projectPath, 0);

    return {
        fileCount,
        directoryCount,
        fileTypes
    };
}

module.exports = getFileMetrics;
