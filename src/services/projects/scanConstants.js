const MAX_SCAN_DEPTH = 5;

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
    'obj',
    'AppData',
    'Application Data',
    'Local Settings',
    '$Recycle.Bin',
    'System Volume Information',
    'Recovery',
    'Windows',
    'Program Files',
    'Program Files (x86)',
    'ProgramData',
    'Users'
]);

module.exports = {
    MAX_SCAN_DEPTH,
    IGNORED_DIRECTORIES
};
