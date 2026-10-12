import * as path from 'path';
import { Project, SyntaxKind, Node } from 'ts-morph';
import { DependencyGraph, GraphEdge, GraphNode, GraphEngineOptions } from './types';
import { walkDirectory, toPosixPath } from './scanner';
import { loadTsConfig } from './tsconfig';
import { resolveImportTarget } from './resolver';

/**
 * Builds a dependency graph for a TypeScript/JavaScript project folder.
 * 
 * @param targetPath Absolute or relative path to the project directory
 * @param options Optional configuration (e.g. custom tsconfig path)
 * @returns DependencyGraph containing nodes and edges
 */
export function buildDependencyGraph(targetPath: string, options?: GraphEngineOptions): DependencyGraph {
  const rootDir = path.resolve(targetPath);

  // 1. Walk filesystem for .ts, .tsx, .js, .jsx files (excluding node_modules, .git, dist, build)
  const scannedFiles = walkDirectory(rootDir);
  const projectFilesSet = new Set(scannedFiles.map(f => path.resolve(f)));

  // 2. Load tsconfig / jsconfig compiler options, paths, and baseUrl
  const tsConfigInfo = loadTsConfig(rootDir, options?.tsConfigPath);

  // 3. Initialize ts-morph Project to parse source files via AST
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      ...tsConfigInfo.compilerOptions
    }
  });

  // Load scanned files into the ts-morph Project
  for (const filePath of scannedFiles) {
    project.addSourceFileAtPath(filePath);
  }

  // 4. Construct nodes
  const nodes: GraphNode[] = scannedFiles.map(filePath => {
    const relPath = path.relative(rootDir, filePath);
    return {
      id: toPosixPath(relPath),
      path: toPosixPath(path.resolve(filePath))
    };
  });

  // Sort nodes alphabetically by id for deterministic output
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  // 5. Extract imports and requires, resolve targets to build edges
  const edges: GraphEdge[] = [];
  const edgeKeySet = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    const fromFilePath = path.resolve(sourceFile.getFilePath());
    const fromRelative = toPosixPath(path.relative(rootDir, fromFilePath));
    const rawSpecifiers: string[] = [];

    // Static imports: import ... from '...' and import '...'
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue();
      if (specifier) {
        rawSpecifiers.push(specifier);
      }
    }

    // Re-exports with module specifiers: export ... from '...'
    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const specifier = exportDecl.getModuleSpecifierValue();
      if (specifier) {
        rawSpecifiers.push(specifier);
      }
    }

    // TypeScript import equals: import x = require('...')
    for (const importEquals of sourceFile.getDescendantsOfKind(SyntaxKind.ImportEqualsDeclaration)) {
      const moduleRef = importEquals.getModuleReference();
      if (Node.isExternalModuleReference(moduleRef)) {
        const expr = moduleRef.getExpression();
        if (expr) {
          const rawText = expr.getText();
          const clean = rawText.replace(/^['"`]|['"`]$/g, '').trim();
          if (clean) {
            rawSpecifiers.push(clean);
          }
        }
      }
    }

    // Call expressions: require('...') and dynamic import(...) check
    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = callExpr.getExpression();

      // Dynamic import(): import('...')
      // TODO: Dynamic import() support can be added in a future phase.
      if (expr.getKind() === SyntaxKind.ImportKeyword || expr.getText() === 'import') {
        // Flagged as TODO, skip for v1 without failing
        continue;
      }

      // CommonJS require('...')
      if (expr.getText() === 'require') {
        const args = callExpr.getArguments();
        if (args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg) || Node.isNoSubstitutionTemplateLiteral(firstArg)) {
            const val = firstArg.getLiteralValue();
            if (val) {
              rawSpecifiers.push(val);
            }
          }
        }
      }
    }

    // Resolve each specifier to a project file
    for (const specifier of rawSpecifiers) {
      const resolvedTarget = resolveImportTarget({
        rootDir,
        fromFilePath,
        specifier,
        tsConfigInfo,
        projectFilesSet
      });

      if (resolvedTarget) {
        const toRelative = toPosixPath(path.relative(rootDir, resolvedTarget));

        // Skip self-references if any, and deduplicate edges
        const edgeKey = `${fromRelative}->${toRelative}`;
        if (!edgeKeySet.has(edgeKey)) {
          edgeKeySet.add(edgeKey);
          edges.push({
            from: fromRelative,
            to: toRelative
          });
        }
      }
    }
  }

  // Sort edges deterministically by from, then by to
  edges.sort((a, b) => {
    const fromDiff = a.from.localeCompare(b.from);
    if (fromDiff !== 0) return fromDiff;
    return a.to.localeCompare(b.to);
  });

  const graph: DependencyGraph = {
    nodes,
    edges
  };
  (graph as any)._project = project;

  return graph;
}
