const fs = require('fs');
const path = require('path');

function getProjectDetails(projectPath, projectInfo){

    const entries = fs.readdirSync(projectPath,{
        withFileTypes: true
    });

    const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);

    const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

    return{
        ...projectInfo,
        fileCount: files.length,
        directoryCount: directories.length
    };
}

module.exports = getProjectDetails;