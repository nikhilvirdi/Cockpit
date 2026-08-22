const MAX_SCAN_DEPTH = 3;

const IGNORED_DIRECTORIES = new Set([
    '.git',
    '.github',
    '.vscode',
    '.idea',
    'node_modules',
    'dist',
    'build',
    'target',
    'coverage',
    '.next',
    '.nuxt',
    '.cache',
    '.gradle',
    '__pycache__',
    '.pytest_cache',
    '.venv',
    'venv',
    'env',
    'vendor',
    'bin',
    'obj'
]);

module.exports = {
    MAX_SCAN_DEPTH,
    IGNORED_DIRECTORIES
};
