const { exec } = require('child_process');

const commands = {
    nodeVersion: 'node --version',
    npmVersion: 'npm --version',
    gitVersion: 'git --version'
};

function executeCommand(commandName) {
    return new Promise((resolve, reject) => {

        const command = commands[commandName];

        if(!command) {
            reject(new Error('Command not allowed'));
            return;
        }

        exec(
            command,
            {
                windowsHide: true
            },
            (error, stdout, stderr) => {

                if(error) {
                    resolve({
                        command: commandName,
                        success: false,
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        exitCode: error.code ?? 1
                    });

                    return;
                }

                resolve({
                    command: commandName,
                    success: true,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: 0
                });
            }
        );
    });
}

module.exports = {
    executeCommand
};
