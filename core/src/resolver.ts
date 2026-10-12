import * as path from 'path';
import { ts } from 'ts-morph';
import { TsConfigInfo } from './tsconfig';

export interface ResolveOptions {
  rootDir: string;
  fromFilePath: string;
  specifier: string;
  tsConfigInfo: TsConfigInfo;
  projectFilesSet: Set<string>;
}

const EXTENSIONS_TO_TRY = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

export function tryCandidatePath(candidate: string, projectFilesSet: Set<string>): string | null {
  const normalizedCandidate = path.resolve(candidate);

  // 1. Direct match
  if (projectFilesSet.has(normalizedCandidate)) {
    return normalizedCandidate;
  }

  // 2. ESM extension mapping (.js -> .ts / .tsx, .jsx -> .tsx / .ts, etc.)
  const parsed = path.parse(normalizedCandidate);
  if (parsed.ext === '.js') {
    const tsCandidate = path.join(parsed.dir, `${parsed.name}.ts`);
    if (projectFilesSet.has(tsCandidate)) return tsCandidate;
    const tsxCandidate = path.join(parsed.dir, `${parsed.name}.tsx`);
    if (projectFilesSet.has(tsxCandidate)) return tsxCandidate;
  } else if (parsed.ext === '.jsx') {
    const tsxCandidate = path.join(parsed.dir, `${parsed.name}.tsx`);
    if (projectFilesSet.has(tsxCandidate)) return tsxCandidate;
    const tsCandidate = path.join(parsed.dir, `${parsed.name}.ts`);
    if (projectFilesSet.has(tsCandidate)) return tsCandidate;
  } else if (parsed.ext === '.mjs') {
    const mtsCandidate = path.join(parsed.dir, `${parsed.name}.mts`);
    if (projectFilesSet.has(mtsCandidate)) return mtsCandidate;
  } else if (parsed.ext === '.cjs') {
    const ctsCandidate = path.join(parsed.dir, `${parsed.name}.cts`);
    if (projectFilesSet.has(ctsCandidate)) return ctsCandidate;
  }

  // 3. Try appending extensions
  for (const ext of EXTENSIONS_TO_TRY) {
    const withExt = `${normalizedCandidate}${ext}`;
    if (projectFilesSet.has(withExt)) {
      return withExt;
    }
  }

  // 4. Barrel files (directory with index.*)
  for (const ext of EXTENSIONS_TO_TRY) {
    const indexCandidate = path.join(normalizedCandidate, `index${ext}`);
    if (projectFilesSet.has(indexCandidate)) {
      return indexCandidate;
    }
  }

  return null;
}

function resolvePathAliases(
  specifier: string,
  tsConfigInfo: TsConfigInfo,
  rootDir: string,
  projectFilesSet: Set<string>
): string | null {
  const { paths, baseUrl, configPath } = tsConfigInfo;
  const configDir = configPath ? path.dirname(configPath) : rootDir;
  const baseDir = baseUrl ? path.resolve(configDir, baseUrl) : configDir;

  if (paths) {
    // Sort patterns by prefix specificity descending (longest prefix before wildcard first)
    const sortedPatterns = Object.keys(paths).sort((a, b) => {
      const aPrefix = a.includes('*') ? a.substring(0, a.indexOf('*')) : a;
      const bPrefix = b.includes('*') ? b.substring(0, b.indexOf('*')) : b;
      return bPrefix.length - aPrefix.length;
    });

    for (const pattern of sortedPatterns) {
      const targets = paths[pattern];
      if (!targets || targets.length === 0) continue;

      if (pattern.includes('*')) {
        const starIdx = pattern.indexOf('*');
        const prefix = pattern.substring(0, starIdx);
        const suffix = pattern.substring(starIdx + 1);

        if (specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length) {
          const matched = specifier.substring(prefix.length, specifier.length - suffix.length);

          for (const target of targets) {
            const replaced = target.replace('*', matched);
            const candidate = path.resolve(baseDir, replaced);
            const resolved = tryCandidatePath(candidate, projectFilesSet);
            if (resolved) {
              return resolved;
            }
          }
        }
      } else if (specifier === pattern) {
        for (const target of targets) {
          const candidate = path.resolve(baseDir, target);
          const resolved = tryCandidatePath(candidate, projectFilesSet);
          if (resolved) {
            return resolved;
          }
        }
      }
    }
  }

  // If baseUrl is set without matching paths, non-relative imports can resolve relative to baseUrl
  if (baseUrl && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('\\')) {
    const candidate = path.resolve(baseDir, specifier);
    const resolved = tryCandidatePath(candidate, projectFilesSet);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function resolveImportTarget(options: ResolveOptions): string | null {
  const { rootDir, fromFilePath, specifier, tsConfigInfo, projectFilesSet } = options;

  if (!specifier || typeof specifier !== 'string') {
    return null;
  }

  const trimmed = specifier.trim();
  if (trimmed === '') {
    return null;
  }

  let resolvedPath: string | null = null;

  // 1. Relative imports
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed === '.' || trimmed === '..') {
    const candidate = path.resolve(path.dirname(fromFilePath), trimmed);
    resolvedPath = tryCandidatePath(candidate, projectFilesSet);
  } else {
    // 2. Check path aliases and baseUrl
    resolvedPath = resolvePathAliases(trimmed, tsConfigInfo, rootDir, projectFilesSet);

    // 3. Optional fallback: ts.resolveModuleName using tsConfig compiler options
    if (!resolvedPath && tsConfigInfo.compilerOptions) {
      try {
        const resolution = ts.resolveModuleName(
          trimmed,
          fromFilePath,
          tsConfigInfo.compilerOptions,
          ts.sys
        );
        if (resolution.resolvedModule?.resolvedFileName) {
          const resolvedCandidate = path.resolve(resolution.resolvedModule.resolvedFileName);
          resolvedPath = tryCandidatePath(resolvedCandidate, projectFilesSet);
        }
      } catch {
        // Fallback resolution failed, ignore
      }
    }
  }

  if (!resolvedPath) {
    return null;
  }

  // Verify that the resolved path is within the project rootDir and not inside node_modules
  const normalizedRoot = path.resolve(rootDir);
  const normalizedResolved = path.resolve(resolvedPath);
  const relative = path.relative(normalizedRoot, normalizedResolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  const parts = relative.split(/[\\/]/);
  if (parts.includes('node_modules')) {
    return null;
  }

  return normalizedResolved;
}
