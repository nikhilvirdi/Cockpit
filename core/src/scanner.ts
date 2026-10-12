import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts'
]);

export const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build'
]);

export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function isSourceFile(fileName: string): boolean {
  if (fileName.endsWith('.d.ts') || fileName.endsWith('.d.mts') || fileName.endsWith('.d.cts')) {
    return false;
  }
  const ext = path.extname(fileName).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function walkDirectory(dirPath: string): string[] {
  const results: string[] = [];
  const normalizedDir = path.resolve(dirPath);

  if (!fs.existsSync(normalizedDir)) {
    return results;
  }

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (isSourceFile(entry.name)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(normalizedDir);
  return results;
}
