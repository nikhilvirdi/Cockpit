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

export function loadTsConfig(targetDir: string, explicitConfigPath?: string): TsConfigInfo {
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
