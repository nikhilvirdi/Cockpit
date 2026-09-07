const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const getFileMetrics = require('./fileMetrics');
const detectProject = require('./projectDetector');
const { MAX_SCAN_DEPTH, IGNORED_DIRECTORIES } = require('./scanConstants');
const { getConfig } = require('../../../config/loadConfig');

let cachedProjects = null;

function getScanRoots(){
    const config = getConfig();
    const roots = config.scanRoots;

    if(Array.isArray(roots) && roots.length > 0){
        return roots;
    }

    return [os.homedir()];
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
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        const status = execFileSync('git', [
            'status',
            '--porcelain'
        ], {
            cwd: projectPath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
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
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
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
        language: detectedProject ? detectedProject.language : 'unknown',
        projectType: detectedProject ? detectedProject.projectType : 'unknown',
        detectionSource: detectedProject ? detectedProject.detectionSource : null,
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

    const isScanRootContainer = directoryPath === os.homedir() || directoryPath === path.parse(directoryPath).root;
    let hasGit = false;

    if(!isScanRootContainer){
        try{
            hasGit = fs.existsSync(path.join(directoryPath, '.git'));
        }
        catch(error){
            hasGit = false;
        }
    }

    if(hasGit){

        const projectName = path.basename(directoryPath);
        let detectedProject = null;

        try{
            detectedProject = detectProject(directoryPath);
        }
        catch(error){
            detectedProject = null;
        }

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

        if(entry.name.startsWith('.') || entry.name.startsWith('$') || IGNORED_DIRECTORIES.has(entry.name)){
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

function getProjects(rescan = false){

    if(cachedProjects !== null && !rescan){
        return cachedProjects;
    }

    const scanRoots = getScanRoots();
    const projects = [];

    for(const scanRoot of scanRoots){

        if(!fs.existsSync(scanRoot)){
            continue;
        }

        scanDirectory(
            scanRoot,
            0,
            projects
        );
    }

    const seen = new Set();
    const uniqueProjects = [];

    for(const project of projects){
        const normalized = path.resolve(project.path).toLowerCase();
        if(!seen.has(normalized)){
            seen.add(normalized);
            uniqueProjects.push(project);
        }
    }

    cachedProjects = uniqueProjects;
    return cachedProjects;
}

module.exports = getProjects;

