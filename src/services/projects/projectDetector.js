const fs = require('fs');
const path = require('path');
const detectionRules = require('../../../config/detectionRules');

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
                    marker: marker,
                    markerCount: rule.markers.length,
                    priority: rule.priority !== undefined ? rule.priority : 5
                });
            }
        }
    }

    if(matches.length === 0){
        return null;
    }

    const bestMatch = matches.reduce((best, current) => {
        if (current.markerCount < best.markerCount) {
            return current;
        }
        if (current.markerCount === best.markerCount) {
            if (current.priority < best.priority) {
                return current;
            }
        }
        return best;
    });

    return {
        language: bestMatch.rule.language,
        projectType: bestMatch.rule.projectType,
        detectionSource: bestMatch.marker
    };
}

module.exports = detectProject;
