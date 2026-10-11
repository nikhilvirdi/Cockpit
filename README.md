## Cockpit

<img width="450" alt="cockpit" src="https://github.com/user-attachments/assets/b092d9b9-64f2-42b0-932a-148284d51bb3" />


Cockpit is a local developer utility built with Node.js. It gives you one place to check the state of your dev projects instead of jumping between terminal tabs; whether your local git repos have uncommitted changes, and whether the dev services you rely on are actually running.

Cockpit automatically scans your filesystem for git-tracked projects (no manual list to maintain) and checks a fixed set of common dev service ports on localhost.

## Stack

| Part | Technology |
|---|---|
| Backend | Node.js |
| HTTP Server | Node.js core |
| Frontend | HTML, CSS, vanilla JavaScript |
| Data | JSON |

The stack deliberately has zero runtime dependencies. No Express, frontend framework, database, UI library, or WebSocket library.

## Configuration

Copy `config/cockpit.example.json` to `config/cockpit.json` and set `scanRoots` — the folders Cockpit should search for git repositories (defaults to your home directory if omitted).

## Usage

    npm start

Open `http://127.0.0.1:4000`. Reload the page to refresh. To pick up newly created or cloned repos without restarting the server, visit `/api/projects?rescan=true` once, then reload.
