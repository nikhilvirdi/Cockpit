const fs = require('fs');
const path = require('path');
const detectionRules = require('../../config/detectionRules');

function detectProject(projectPath){

    const entries = fs.readdirSync(projectPath,{
        withFileTypes: true
    });

    const files = entries
        .filter(entry => entry.isFile())
        .map(entry => entry.name);

    const directories = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

    const matches = [];

    for(const rule of detectionRules){

        for(const marker of rule.markers){

            let matched = false;

            if(marker.includes('*')){

                const extension = marker.replace('*', '');

                matched = files.some(file => file.endsWith(extension));
            }
            else{
                matched = files.includes(marker);
            }

            if(matched){

                matches.push({
                    rule: rule,
                    marker: marker
                });
            }
        }
    }

    if(matches.length === 0){
        return null;
    }

    const bestMatch = matches[0];

    return {
        language: bestMatch.rule.language,
        projectType: bestMatch.rule.projectType,
        detectionSource: bestMatch.marker
    };
}

module.exports = detectProject;