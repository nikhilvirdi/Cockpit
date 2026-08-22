## About Cockpit

Cockpit is a local developer utility built with Node.js. It gives you one place to inspect and interact with your development environment instead of jumping between the terminal, file explorer, process monitor, and log files. It can show project and Git status, browse files, inspect running processes and system information, monitor logs and local services, and run selected developer commands. The project is being built from scratch with pure Node.js and a simple HTML/CSS/JavaScript frontend, so the goal is also to put the core Node.js concepts into practice before moving on to Express.

### Stack

| Part               | Technology                    |
| ------------------ | ----------------------------- |
| Backend            | Node.js                       |
| HTTP Server        | Node.js `http`                |
| Frontend           | HTML, CSS, Vanilla JavaScript |
| Filesystem         | Node.js `fs`, `fs/promises`   |
| System Information | Node.js `os`, `process`       |
| Process Management | Node.js `child_process`       |
| Events             | Node.js `EventEmitter`        |
| Data               | JSON                          |
| Package Management | npm                           |
| Version Control    | Git / GitHub                  |

The stack deliberately has **zero runtime dependencies**. No Express, frontend framework, database, UI library, or WebSocket library.

## Setup

1. Copy the example configuration file:
   ```bash
   cp config/cockpit.example.json config/cockpit.json
   ```
   *(On Windows Command Prompt / PowerShell: `copy config\cockpit.example.json config\cockpit.json`)*

2. Open `config/cockpit.json` and edit `projectDirectories` to point to your local project folders. You can also customize the monitored services and ports if needed.

3. Start Cockpit:
   ```bash
   npm start
   ```

4. Open `http://127.0.0.1:4000` (or your configured port) in your browser.
