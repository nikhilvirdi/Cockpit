import JSZip from 'jszip';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts'
]);

const ALLOWED_CONFIG_FILES = new Set(['package.json', 'index.html']);

export function isAllowedFile(name: string): boolean {
  if (name.endsWith('.d.ts') || name.endsWith('.d.mts') || name.endsWith('.d.cts')) {
    return false;
  }
  const lower = name.toLowerCase();
  if (ALLOWED_CONFIG_FILES.has(lower)) {
    return true;
  }
  if (lower.startsWith('tsconfig') && lower.endsWith('.json')) {
    return true;
  }
  if (lower.startsWith('jsconfig') && lower.endsWith('.json')) {
    return true;
  }
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = lower.slice(dotIdx);
  return ALLOWED_EXTENSIONS.has(ext);
}

export interface ScannedFile {
  relativePath: string;
  file: File;
}

export async function walkDirectoryHandle(
  dirHandle: any,
  currentPath = ''
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        const subFiles = await walkDirectoryHandle(entry, nextPath);
        files.push(...subFiles);
      }
    } else if (entry.kind === 'file') {
      if (isAllowedFile(entry.name)) {
        const file = await entry.getFile();
        const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        files.push({ relativePath: relPath, file });
      }
    }
  }

  return files;
}

export function filterFileList(fileList: FileList): ScannedFile[] {
  const files: ScannedFile[] = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const rawPath = file.webkitRelativePath || file.name;
    const parts = rawPath.replace(/\\/g, '/').split('/');

    // Strip top-level selected folder name if present in webkitRelativePath
    const pathParts = parts.length > 1 ? parts.slice(1) : parts;

    // Check if any directory part is in EXCLUDED_DIRS
    const isExcluded = pathParts.slice(0, -1).some(dir => EXCLUDED_DIRS.has(dir));
    if (isExcluded) continue;

    const fileName = pathParts[pathParts.length - 1];
    if (isAllowedFile(fileName)) {
      files.push({
        relativePath: pathParts.join('/'),
        file
      });
    }
  }

  return files;
}

export async function createZipBundle(files: ScannedFile[]): Promise<Blob> {
  const zip = new JSZip();

  for (const item of files) {
    zip.file(item.relativePath, item.file);
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
