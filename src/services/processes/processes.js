const { execFile } = require('child_process');

function getProcesses(){
    return new Promise((resolve,reject)=>{
        execFile('tasklist',[
            '/FO', 
            'CSV',
            '/NH'
        ],{
            windowsHide: true
        },(error,stdout,stderr)=>{
            if(error){
                reject(error);
                return;
            }
            const lines = stdout.trim.split('\r\n');
            const processes = [];
            for(const line of lines){
                const vaalues = line.split('",').map(value=> value.replace(/^"|"$/g, ''));
                if(vaalues.length<5){
                    continue;
                }
                processes.push({
                    name: value[0];
                    pid: Number(values[1]),
                    sessionName: values[2],
                    sessionNumber: Number(values[3]),
                    memory: values[4]
                });
            }
            resolve(processes);
        });
    });
}

module.exports = getProcesses;