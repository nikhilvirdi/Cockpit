const fs = require('fs');
const path = require('path');

const MAX_SCAN_DEPTH = 3;

const IGNORED_DIRECTORIES = new Set([
    '.git',
    '.github',
    '.vscode',
    '.idea',
    'node_modules',
    'dist',
    'build',
    'target',
    'coverage',
    '.next',
    '.nuxt',
    '.cache',
    '.gradle',
    '__pycache__',
    '.pytest_cache',
    '.venv',
    'venv',
    'env',
    'vendor',
    'bin',
    'obj'
]);

function getFileStats(projectPath){

    let fileCount = 0;
    let directoryCount = 0;

    function scanDirectory(directoryPath, currentDepth){

        if(currentDepth > MAX_SCAN_DEPTH){
            return;
        }

        let entries;

        try{
            entries = fs.readdirSync(directoryPath,{
                withFileTypes: true
            });
        }
        catch(error){
            return;
        }

        for(const entry of entries){

            if(entry.isFile()){
                fileCount++;
                continue;
            }

            if(!entry.isDirectory()){
                continue;
            }

            if(IGNORED_DIRECTORIES.has(entry.name)){
                continue;
            }

            directoryCount++;

            const childPath = path.join(
                directoryPath,
                entry.name
            );

            scanDirectory(
                childPath,
                currentDepth + 1
            );
        }
    }

    scanDirectory(projectPath, 0);

    return {
        fileCount: fileCount,
        directoryCount: directoryCount
    };
}

module.exports = getFileStats;
