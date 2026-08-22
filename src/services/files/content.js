const fs = require('fs');
const path = require('path');

const fsConfig = require('../../../config/cockpit.json');
const rootDirectories = fsConfig.projectDirectories.map(dir => path.resolve(dir));

// Files larger than this should be streamed instead of loaded into memory.
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Extensions that are always binary — no need to sniff these files.
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
    '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm',
    '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
    '.ttf', '.otf', '.woff', '.woff2',
    '.db', '.sqlite', '.sqlite3'
]);

// Read up to `sampleBytes` from the file and check for null bytes, which are
// the most reliable portable indicator that a file contains binary data.
function isBinaryFile(filePath, sampleBytes = 8192) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const buf = Buffer.alloc(Math.min(sampleBytes, MAX_FILE_SIZE));
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        for (let i = 0; i < bytesRead; i++) {
            if (buf[i] === 0) return true;
        }
        return false;
    } finally {
        fs.closeSync(fd);
    }
}

function validatePath(filePath, allowBinary = false) {
    let requestedPath;

    for (const rootDir of rootDirectories) {
        const resolved = path.resolve(rootDir, filePath);
        if (resolved.startsWith(rootDir + path.sep) || resolved === rootDir) {
            requestedPath = resolved;
            break;
        }
    }

    if (!requestedPath) {
        throw new Error('Invalid file path');
    }

    if (!fs.existsSync(requestedPath)) {
        throw new Error('File not found');
    }

    const stats = fs.statSync(requestedPath);

    if (!stats.isFile()) {
        throw new Error('Path is not a file');
    }

    // Only check binary if allowBinary is false (for reading/displaying)
    if (!allowBinary) {
        const ext = path.extname(requestedPath).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext) || isBinaryFile(requestedPath)) {
            throw new Error('Binary file, cannot display as text');
        }
    }

    return { path: requestedPath, stats };
}

function getFileInfo(filePath) {
    // Get size without binary check - we need size first to decide streaming
    let requestedPath;
    for (const rootDir of rootDirectories) {
        const resolved = path.resolve(rootDir, filePath);
        if (resolved.startsWith(rootDir + path.sep) || resolved === rootDir) {
            requestedPath = resolved;
            break;
        }
    }

    if (!requestedPath) {
        throw new Error('Invalid file path');
    }
    if (!fs.existsSync(requestedPath)) {
        throw new Error('File not found');
    }
    const stats = fs.statSync(requestedPath);
    if (!stats.isFile()) {
        throw new Error('Path is not a file');
    }

    return {
        size: stats.size,
        shouldStream: stats.size > MAX_FILE_SIZE
    };
}

function getFileContent(filePath) {
    const { path: requestedPath, stats } = validatePath(filePath, false);

    // Size guard — checked before any read attempt.
    if (stats.size > MAX_FILE_SIZE) {
        throw new Error('File too large');
    }

    return fs.readFileSync(requestedPath, 'utf8');
}

function createFileStream(filePath) {
    // First get size to determine if streaming is needed
    const { path: requestedPath, stats } = validatePath(filePath, true);

    // Now check for binary - after size check, before streaming
    const ext = path.extname(requestedPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext) || isBinaryFile(requestedPath)) {
        throw new Error('Binary file, cannot display as text');
    }

    return {
        stream: fs.createReadStream(requestedPath, { encoding: 'utf8' }),
        size: stats.size,
        shouldStream: stats.size > MAX_FILE_SIZE
    };
}

module.exports = {
    getFileContent,
    getFileInfo,
    createFileStream,
    MAX_FILE_SIZE
};
