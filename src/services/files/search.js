const fs = require('fs');
const path = require('path');

const fsConfig = require('../../../config/cockpit.json');
const rootDirectories = fsConfig.projectDirectories.map(dir => path.resolve(dir));

const MAX_CONTENT_MATCHES = 100;
const MAX_FILE_SIZE_TO_SEARCH = 1024 * 1024; // 1MB max file size to search content

const IGNORED_DIRECTORIES = new Set([
    '.git', '.github', '.vscode', '.idea',
    'node_modules', 'dist', 'build', 'target',
    'coverage', '.next', '.nuxt', '.cache',
    '.gradle', '__pycache__', '.pytest_cache',
    '.venv', 'venv', 'env', 'vendor', 'bin', 'obj'
]);

const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
    '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm',
    '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
    '.ttf', '.otf', '.woff', '.woff2',
    '.db', '.sqlite', '.sqlite3'
]);

function isBinaryFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) return true;
    // Quick null-byte check
    const fd = fs.openSync(filePath, 'r');
    try {
        const buf = Buffer.alloc(8192);
        const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
        for (let i = 0; i < bytesRead; i++) {
            if (buf[i] === 0) return true;
        }
        return false;
    } finally {
        fs.closeSync(fd);
    }
}

function searchFileNames(query, directory, results) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;

        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            searchFileNames(query, entryPath, results);
            continue;
        }

        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
            // Find relative path
            for (const rootDir of rootDirectories) {
                if (entryPath.startsWith(rootDir + path.sep) || entryPath === rootDir) {
                    results.push({
                        name: entry.name,
                        path: path.relative(rootDir, entryPath)
                    });
                    break;
                }
            }
        }
    }
}

function searchFileContents(query, directory, results, foundCount = { count: 0 }) {
    if (foundCount.count >= MAX_CONTENT_MATCHES) return;

    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        if (foundCount.count >= MAX_CONTENT_MATCHES) break;

        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            searchFileContents(query, entryPath, results, foundCount);
            continue;
        }

        // Skip binary and too-large files
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        let stats;
        try {
            stats = fs.statSync(entryPath);
        } catch {
            continue;
        }
        if (stats.size > MAX_FILE_SIZE_TO_SEARCH) continue;

        // Try to read and search
        try {
            if (isBinaryFile(entryPath)) continue;

            const content = fs.readFileSync(entryPath, 'utf8');
            const lowerContent = content.toLowerCase();
            const lowerQuery = query.toLowerCase();

            if (lowerContent.includes(lowerQuery)) {
                for (const rootDir of rootDirectories) {
                    if (entryPath.startsWith(rootDir + path.sep) || entryPath === rootDir) {
                        results.push({
                            name: entry.name,
                            path: path.relative(rootDir, entryPath),
                            matches: (content.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
                        });
                        foundCount.count++;
                        break;
                    }
                }
            }
        } catch {
            // Skip files that can't be read as text
            continue;
        }
    }
}

function searchFiles(query, mode = 'filename') {
    const results = [];

    if (mode === 'content') {
        // Search all configured root directories
        for (const rootDir of rootDirectories) {
            if (fs.existsSync(rootDir)) {
                searchFileContents(query, rootDir, results);
            }
        }
    } else {
        // Default: filename search (original behavior)
        for (const rootDir of rootDirectories) {
            if (fs.existsSync(rootDir)) {
                searchFileNames(query, rootDir, results);
            }
        }
    }

    return results;
}

module.exports = searchFiles;
