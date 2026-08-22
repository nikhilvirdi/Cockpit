const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const getFileMetrics = require('./fileMetrics');
const detectProject = require('./projectDetector');
const { MAX_SCAN_DEPTH, IGNORED_DIRECTORIES } = require('./scanConstants');
const { getConfig } = require('../../../config/loadConfig');
const eventBus = require('../../events/bus');

function getProjectDirectories(){
    const config = getConfig();
    return config.projectDirectories;
}

function getGitInfo(projectPath){

    const gitPath = path.join(projectPath, '.git');

    if(!fs.existsSync(gitPath)){
        return{
            isGitRepository: false,
            currentBranch: null,
            gitStatus: null,
            modifiedFiles: 0,
            untrackedFiles: 0,
            lastCommit: null
        };
    }

    let currentBranch = null;
    let gitStatus = null;
    let modifiedFiles = 0;
    let untrackedFiles = 0;
    let lastCommit = null;

    try{
        currentBranch = execFileSync('git', [
            'branch',
            '--show-current'
        ], {
            cwd: projectPath,
            encoding: 'utf-8'
        }).trim();

        const status = execFileSync('git', [
            'status',
            '--porcelain'
        ], {
            cwd: projectPath,
            encoding: 'utf-8'
        }).trim();

        if(status === ''){
            gitStatus = 'clean';
        }
        else{
            gitStatus = 'modified';

            const statusLines = status.split('\n');

            for(const line of statusLines){
                if(line.startsWith('??')){
                    untrackedFiles++;
                }
                else{
                    modifiedFiles++;
                }
            }
        }

        const commitData = execFileSync('git', [
            'log',
            '-1',
            '--format=%h|%s|%cI'
        ], {
            cwd: projectPath,
            encoding: 'utf-8'
        }).trim();

        if(commitData){
            const [hash, message, date] = commitData.split('|');

            lastCommit = {
                hash: hash,
                message: message,
                date: date
            };
        }
    }
    catch(error){
        gitStatus = null;
    }

    return{
        isGitRepository: true,
        currentBranch: currentBranch,
        gitStatus: gitStatus,
        modifiedFiles: modifiedFiles,
        untrackedFiles: untrackedFiles,
        lastCommit: lastCommit
    };
}

function getProjectInfo(projectPath, projectName, detectedProject){

    let version = 'unknown';

    const packagePath = path.join(projectPath, 'package.json');

    if(fs.existsSync(packagePath)){
        try{
            const packageData = fs.readFileSync(packagePath, 'utf-8');
            const packageJson = JSON.parse(packageData);

            version = packageJson.version || 'unknown';
            projectName = packageJson.name || projectName;
        }
        catch(error){
            version = 'unknown';
        }
    }

    const gitInfo = getGitInfo(projectPath);
    const { fileCount, directoryCount, fileTypes } = getFileMetrics(projectPath);

    return{
        name: projectName,
        version: version,
        path: projectPath,
        language: detectedProject.language,
        projectType: detectedProject.projectType,
        detectionSource: detectedProject.detectionSource,
        ...gitInfo,
        fileCount: fileCount,
        directoryCount: directoryCount,
        fileTypes: fileTypes
    };
}

function scanDirectory(directoryPath, currentDepth, projects){

    if(currentDepth > MAX_SCAN_DEPTH){
        return;
    }

    let detectedProject = null;

    try{
        detectedProject = detectProject(directoryPath);
    }
    catch(error){
        console.log('Project scan error:', directoryPath);
        console.log(error.message);
        return;
    }

    if(detectedProject){

        const projectName = path.basename(directoryPath);

        projects.push(
            getProjectInfo(
                directoryPath,
                projectName,
                detectedProject
            )
        );

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

        if(!entry.isDirectory()){
            continue;
        }

        if(IGNORED_DIRECTORIES.has(entry.name)){
            continue;
        }

        const childPath = path.join(directoryPath, entry.name);

        scanDirectory(
            childPath,
            currentDepth + 1,
            projects
        );
    }
}

function getProjects(){

    const projectDirectories = getProjectDirectories();
    const projects = [];

    for(const projectDirectory of projectDirectories){

        scanDirectory(
            projectDirectory,
            0,
            projects
        );
    }

    return projects;
}

// -----------------------------------------------------------------------------
// Real-time Event Publisher
// -----------------------------------------------------------------------------

const activeWatchers = new Set();

function startFileWatchers() {
    if (activeWatchers.size > 0) return; // Already watching

    const projectDirectories = getProjectDirectories();
    const isRecursiveSupported = process.platform === 'win32' || process.platform === 'darwin';

    for (const projectDir of projectDirectories) {
        if (!fs.existsSync(projectDir)) continue;

        try {
            // Note: On Linux, recursive: true is not natively supported by Node's fs.watch.
            // Rather than pulling in a dependency like chokidar (violating zero-dependency rule),
            // we fall back to watching just the root directory.
            const watcher = fs.watch(projectDir, { recursive: isRecursiveSupported }, (eventType, filename) => {
                if (!filename || IGNORED_DIRECTORIES.has(filename.split(path.sep)[0])) return;
                
                eventBus.emit('file:changed', {
                    project: projectDir,
                    eventType,
                    relativePath: filename
                });
            });

            watcher.on('error', (err) => {
                console.error(`Watcher error on ${projectDir}:`, err.message);
            });

            activeWatchers.add(watcher);
        } catch (error) {
            console.error(`Failed to watch directory ${projectDir}:`, error.message);
        }
    }
}

function stopFileWatchers() {
    for (const watcher of activeWatchers) {
        watcher.close();
    }
    activeWatchers.clear();
}

// Lazy initialization: Only spin up OS file watchers if at least one client is listening
eventBus.on('newListener', (event) => {
    if (event === 'file:changed' && activeWatchers.size === 0) {
        startFileWatchers();
    }
});

eventBus.on('removeListener', (event) => {
    if (event === 'file:changed' && eventBus.listenerCount('file:changed') === 0) {
        stopFileWatchers();
    }
});

module.exports = getProjects;
