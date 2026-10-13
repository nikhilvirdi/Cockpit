import * as fs from 'fs';
import * as path from 'path';
import { ts } from 'ts-morph';

export interface TsConfigInfo {
  configPath?: string;
  baseUrl?: string;
  paths?: Record<string, string[]>;
  compilerOptions: ts.CompilerOptions;
}

function parseConfigFile(configPath: string): { options: ts.CompilerOptions; references?: readonly ts.ProjectReference[] } | null {
  try {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      return null;
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    return {
      options: parsed.options,
      references: parsed.projectReferences
    };
  } catch {
    return null;
  }
}

// Cache for tsconfig lookups by directory to avoid repeated file system checks
const tsconfigCache = new Map<string, TsConfigInfo>();

/**
 * Find the nearest tsconfig.json or jsconfig.json by walking up from the given directory.
 * Respects extends chains and merges configurations.
 */
export function findNearestTsConfig(startDir: string, rootDir: string): TsConfigInfo {
  // Normalize paths
  const normalizedStart = path.resolve(startDir);
  const normalizedRoot = path.resolve(rootDir);

  // Check cache first
  if (tsconfigCache.has(normalizedStart)) {
    return tsconfigCache.get(normalizedStart)!;
  }

  let currentDir = normalizedStart;
  let foundConfigPath: string | undefined;

  // Walk up from startDir to rootDir looking for tsconfig/jsconfig
  while (currentDir.startsWith(normalizedRoot)) {
    const candidates = [
      path.join(currentDir, 'tsconfig.json'),
      path.join(currentDir, 'jsconfig.json'),
      path.join(currentDir, 'tsconfig.app.json'),
      path.join(currentDir, 'tsconfig.base.json')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        foundConfigPath = candidate;
        break;
      }
    }

    if (foundConfigPath) break;

    // Move up one directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached filesystem root
    currentDir = parentDir;
  }

  // If no config found, try root level
  if (!foundConfigPath) {
    const rootCandidates = [
      path.join(normalizedRoot, 'tsconfig.json'),
      path.join(normalizedRoot, 'jsconfig.json')
    ];
    
    for (const candidate of rootCandidates) {
      if (fs.existsSync(candidate)) {
        foundConfigPath = candidate;
        break;
      }
    }
  }

  let compilerOptions: ts.CompilerOptions = {};
  let paths: Record<string, string[]> | undefined;
  let baseUrl: string | undefined;

  if (foundConfigPath) {
    const parsed = parseConfigFile(foundConfigPath);
    if (parsed) {
      compilerOptions = { ...parsed.options };
      baseUrl = parsed.options.baseUrl;
      paths = parsed.options.paths;

      // Handle project references
      if (parsed.references && parsed.references.length > 0) {
        for (const ref of parsed.references) {
          const refPath = path.resolve(path.dirname(foundConfigPath), ref.path);
          const actualRefPath = fs.statSync(refPath, { throwIfNoEntry: false })?.isDirectory()
            ? path.join(refPath, 'tsconfig.json')
            : refPath;

          if (fs.existsSync(actualRefPath)) {
            const refParsed = parseConfigFile(actualRefPath);
            if (refParsed) {
              if (refParsed.options.baseUrl && !baseUrl) {
                baseUrl = refParsed.options.baseUrl;
              }
              if (refParsed.options.paths) {
                paths = { ...(paths || {}), ...refParsed.options.paths };
              }
            }
          }
        }
      }
    }
  }

  const result: TsConfigInfo = {
    configPath: foundConfigPath,
    baseUrl,
    paths,
    compilerOptions
  };

  // Cache the result
  tsconfigCache.set(normalizedStart, result);

  return result;
}

/**
 * Load tsconfig for a specific file, finding the nearest config in the directory hierarchy.
 * This is the new primary API for per-file resolution.
 */
export function loadTsConfigForFile(filePath: string, rootDir: string): TsConfigInfo {
  const fileDir = path.dirname(path.resolve(filePath));
  return findNearestTsConfig(fileDir, rootDir);
}

/**
 * Load tsconfig for the entire project (root-level).
 * Kept for backward compatibility and global config needs.
 */
export function loadTsConfig(targetDir: string, explicitConfigPath?: string): TsConfigInfo {
  // Clear cache when loading root config
  tsconfigCache.clear();

  const candidateConfigs: string[] = [];

  if (explicitConfigPath) {
    candidateConfigs.push(path.resolve(explicitConfigPath));
  } else {
    candidateConfigs.push(
      path.join(targetDir, 'tsconfig.json'),
      path.join(targetDir, 'jsconfig.json'),
      path.join(targetDir, 'tsconfig.app.json'),
      path.join(targetDir, 'tsconfig.base.json')
    );
  }

  let primaryConfigPath: string | undefined;
  let compilerOptions: ts.CompilerOptions = {};
  let paths: Record<string, string[]> | undefined;
  let baseUrl: string | undefined;

  for (const candidate of candidateConfigs) {
    if (fs.existsSync(candidate)) {
      const parsed = parseConfigFile(candidate);
      if (parsed) {
        primaryConfigPath = primaryConfigPath || candidate;
        compilerOptions = { ...compilerOptions, ...parsed.options };

        if (parsed.options.baseUrl && !baseUrl) {
          baseUrl = parsed.options.baseUrl;
        }

        if (parsed.options.paths) {
          paths = { ...(paths || {}), ...parsed.options.paths };
        }

        // Check project references (e.g. Vite's tsconfig.app.json)
        if (parsed.references && parsed.references.length > 0) {
          for (const ref of parsed.references) {
            const refPath = path.resolve(path.dirname(candidate), ref.path);
            const actualRefPath = fs.statSync(refPath, { throwIfNoEntry: false })?.isDirectory()
              ? path.join(refPath, 'tsconfig.json')
              : refPath;

            if (fs.existsSync(actualRefPath)) {
              const refParsed = parseConfigFile(actualRefPath);
              if (refParsed) {
                if (refParsed.options.baseUrl && !baseUrl) {
                  baseUrl = refParsed.options.baseUrl;
                }
                if (refParsed.options.paths) {
                  paths = { ...(paths || {}), ...refParsed.options.paths };
                }
              }
            }
          }
        }

        // If we found paths, we can stop searching fallback files
        if (paths && Object.keys(paths).length > 0) {
          break;
        }
      }
    }
  }

  return {
    configPath: primaryConfigPath,
    baseUrl,
    paths,
    compilerOptions
  };
}
