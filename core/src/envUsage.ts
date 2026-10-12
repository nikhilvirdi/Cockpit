import * as fs from 'fs';
import * as path from 'path';
import {
  Project,
  Node,
  SyntaxKind,
  SourceFile,
  PropertyAccessExpression,
  ElementAccessExpression,
  VariableDeclaration,
  BindingElement,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression
} from 'ts-morph';
import {
  GraphNode,
  GraphEdge,
  DeclaredEnvKey,
  DirectUsagePattern,
  DirectEnvUsage,
  TransitiveEnvUsage,
  EnvUsageItem,
  DynamicAccess,
  EnvUsageResult
} from './types';
import { toPosixPath } from './scanner';
import { resolveImportTarget } from './resolver';
import { loadTsConfig } from './tsconfig';

const EXCLUDED_SCAN_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  '.system_generated',
  '.tempmediaStorage',
  'scratch'
]);

/**
 * Scans the root directory and one level of common subdirectories
 * for .env, .env.example, .env.local, .env.* files, extracting declared keys.
 */
export function extractDeclaredEnvKeys(rootDir: string): DeclaredEnvKey[] {
  const envFiles: string[] = [];

  function checkDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('.env')) {
          envFiles.push(path.join(dirPath, entry.name));
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  // 1. Scan root dir
  checkDir(rootDir);

  // 2. Scan 1 level of subdirectories
  try {
    const rootEntries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isDirectory() && !EXCLUDED_SCAN_DIRS.has(entry.name)) {
        checkDir(path.join(rootDir, entry.name));
      }
    }
  } catch {
    // Ignore directory read errors
  }

  const keyMap = new Map<string, Set<string>>();

  for (const envFilePath of envFiles) {
    const relPath = toPosixPath(path.relative(rootDir, envFilePath));
    try {
      const content = fs.readFileSync(envFilePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.startsWith('export ')) {
          line = line.slice(7).trim();
        }
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          if (!keyMap.has(key)) {
            keyMap.set(key, new Set());
          }
          keyMap.get(key)!.add(relPath);
        }
      }
    } catch {
      // Ignore file read errors
    }
  }

  const declaredKeys: DeclaredEnvKey[] = [];
  for (const [key, fileSet] of keyMap.entries()) {
    declaredKeys.push({
      key,
      declaredIn: Array.from(fileSet).sort()
    });
  }

  declaredKeys.sort((a, b) => a.key.localeCompare(b.key));
  return declaredKeys;
}

/**
 * Unwraps parenthesized, as-cast, non-null, or type assertions from an expression node.
 */
function unwrapExpression(node: Node): Node {
  let curr = node;
  while (curr) {
    if (Node.isParenthesizedExpression(curr)) {
      curr = curr.getExpression();
    } else if (Node.isAsExpression(curr)) {
      curr = curr.getExpression();
    } else if (Node.isNonNullExpression(curr)) {
      curr = curr.getExpression();
    } else if (Node.isTypeAssertion(curr)) {
      curr = curr.getExpression();
    } else {
      break;
    }
  }
  return curr;
}

/**
 * Checks if a node expression resolves to `process.env`.
 */
function isProcessEnvExpr(node: Node | undefined): boolean {
  if (!node) return false;
  const unwrapped = unwrapExpression(node);
  if (Node.isPropertyAccessExpression(unwrapped)) {
    const expr = unwrapExpression(unwrapped.getExpression());
    if (Node.isIdentifier(expr) && expr.getText() === 'process' && unwrapped.getName() === 'env') {
      return true;
    }
  }
  return false;
}

interface ExportCarrier {
  carrierName: string; // e.g. "dbUrl", "config", "getDbUrl", "default"
  key: string;         // e.g. "DATABASE_URL"
  carrierType: 'value' | 'object' | 'function';
  property?: string;   // if object, e.g. "dbUrl"
}

/**
 * Checks whether an identifier name is exported from the given source file.
 */
function isExportedFromFile(sourceFile: SourceFile, name: string): boolean {
  const exported = sourceFile.getExportedDeclarations();
  if (exported.has(name)) return true;

  // Check export { name } declarations
  for (const expDecl of sourceFile.getExportDeclarations()) {
    for (const spec of expDecl.getNamedExports()) {
      if (spec.getName() === name || spec.getAliasNode()?.getText() === name) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Priority for direct usage patterns when deduplicating multiple usages of the same key in a file.
 */
const PATTERN_PRIORITY: Record<DirectUsagePattern, number> = {
  'export-const': 5,
  'export-object': 4,
  'function-return': 3,
  'destructure': 2,
  'member-access': 1
};

/**
 * Traces direct and transitive env usage across all source files in the project graph.
 */
export function traceEnvUsage(
  project: Project,
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootDir: string
): EnvUsageResult {
  const declaredKeys = extractDeclaredEnvKeys(rootDir);
  const tsConfigInfo = loadTsConfig(rootDir);
  const projectFilesSet = new Set(nodes.map(n => path.resolve(n.path)));

  const nodeMap = new Map<string, GraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const directUsageCandidates: DirectEnvUsage[] = [];
  const dynamicAccesses: DynamicAccess[] = [];
  const carriersByFile = new Map<string, ExportCarrier[]>();

  function addCarrier(fileRel: string, carrier: ExportCarrier) {
    if (!carriersByFile.has(fileRel)) {
      carriersByFile.set(fileRel, []);
    }
    const list = carriersByFile.get(fileRel)!;
    // Deduplicate carriers
    const exists = list.some(
      c => c.carrierName === carrier.carrierName &&
           c.key === carrier.key &&
           c.carrierType === carrier.carrierType &&
           c.property === carrier.property
    );
    if (!exists) {
      list.push(carrier);
    }
  }

  // 1. Scan each source file for direct process.env usage and dynamic accesses
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.resolve(sourceFile.getFilePath());
    const fileRel = toPosixPath(path.relative(rootDir, filePath));
    if (!nodeMap.has(fileRel)) continue;

    // A. Element accesses: process.env['KEY'] or process.env[someVar]
    for (const elemAccess of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
      if (isProcessEnvExpr(elemAccess.getExpression())) {
        const arg = elemAccess.getArgumentExpression();
        if (arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))) {
          const key = arg.getLiteralValue();
          if (key) {
            handleDirectUsage(elemAccess, key, fileRel, sourceFile);
          }
        } else {
          // Dynamic bracket access!
          const rawExpr = elemAccess.getText();
          dynamicAccesses.push({
            file: fileRel,
            note: `${rawExpr} — key not statically resolvable`
          });
        }
      }
    }

    // B. Property accesses: process.env.KEY
    for (const propAccess of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      if (isProcessEnvExpr(propAccess.getExpression())) {
        const key = propAccess.getName();
        handleDirectUsage(propAccess, key, fileRel, sourceFile);
      }
    }

    // C. Destructuring: const { KEY1, KEY2: alias } = process.env
    for (const varDecl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const init = varDecl.getInitializer();
      if (init && isProcessEnvExpr(init)) {
        const nameNode = varDecl.getNameNode();
        if (Node.isObjectBindingPattern(nameNode)) {
          for (const el of nameNode.getElements()) {
            const propNameNode = el.getPropertyNameNode();
            let key = '';
            let localName = '';

            if (propNameNode) {
              if (Node.isIdentifier(propNameNode)) {
                key = propNameNode.getText();
                localName = el.getName();
              } else if (Node.isStringLiteral(propNameNode)) {
                key = propNameNode.getLiteralValue();
                localName = el.getName();
              } else {
                // Dynamic computed property in destructuring
                dynamicAccesses.push({
                  file: fileRel,
                  note: `${el.getText()} — key not statically resolvable`
                });
                continue;
              }
            } else {
              key = el.getName();
              localName = key;
            }

            if (!key) continue;

            const isExported = isExportedFromFile(sourceFile, localName);
            const pattern: DirectUsagePattern = isExported ? 'export-const' : 'destructure';

            directUsageCandidates.push({
              key,
              file: fileRel,
              kind: 'direct',
              pattern
            });

            if (isExported) {
              addCarrier(fileRel, {
                carrierName: localName,
                key,
                carrierType: 'value'
              });
            }
          }
        }
      }
    }

    function handleDirectUsage(
      accessNode: Node,
      key: string,
      currentFileRel: string,
      sf: SourceFile
    ) {
      let pattern: DirectUsagePattern = 'member-access';
      let carrier: ExportCarrier | null = null;

      // Check if accessNode is inside a function directly returning it
      const enclosingReturn = accessNode.getFirstAncestorByKind(SyntaxKind.ReturnStatement);
      const enclosingArrow = accessNode.getFirstAncestorByKind(SyntaxKind.ArrowFunction);

      if (enclosingReturn) {
        const returnedExpr = enclosingReturn.getExpression();
        if (returnedExpr && unwrapExpression(returnedExpr) === unwrapExpression(accessNode)) {
          const fnDecl = enclosingReturn.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
          const varDecl = enclosingReturn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
          const fnName = fnDecl?.getName() || varDecl?.getName();
          if (fnName && isExportedFromFile(sf, fnName)) {
            pattern = 'function-return';
            carrier = {
              carrierName: fnName,
              key,
              carrierType: 'function'
            };
          }
        }
      } else if (enclosingArrow) {
        // Concise arrow function body: () => process.env.KEY
        const body = enclosingArrow.getBody();
        if (body && unwrapExpression(body) === unwrapExpression(accessNode)) {
          const varDecl = enclosingArrow.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
          const fnName = varDecl?.getName();
          if (fnName && isExportedFromFile(sf, fnName)) {
            pattern = 'function-return';
            carrier = {
              carrierName: fnName,
              key,
              carrierType: 'function'
            };
          }
        }
      }

      // Check if accessNode is inside an ObjectLiteralProperty of an exported const
      if (!carrier) {
        const propAssignment = accessNode.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
        if (propAssignment) {
          const propName = propAssignment.getName();
          const objLiteral = propAssignment.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression);
          const varDecl = objLiteral?.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
          const exportAssignment = objLiteral?.getFirstAncestorByKind(SyntaxKind.ExportAssignment);

          if (varDecl) {
            const varName = varDecl.getName();
            if (isExportedFromFile(sf, varName)) {
              pattern = 'export-const';
              carrier = {
                carrierName: varName,
                key,
                carrierType: 'object',
                property: propName
              };
            }
          } else if (exportAssignment) {
            pattern = 'export-const';
            carrier = {
              carrierName: 'default',
              key,
              carrierType: 'object',
              property: propName
            };
          }
        }
      }

      // Check if accessNode is the initializer of an exported VariableDeclaration
      if (!carrier) {
        const varDecl = accessNode.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
        if (varDecl) {
          const init = varDecl.getInitializer();
          // Check if accessNode is at the top of initializer or part of it
          if (init && init.getText().includes(accessNode.getText())) {
            const varName = varDecl.getName();
            if (isExportedFromFile(sf, varName)) {
              pattern = 'export-const';
              carrier = {
                carrierName: varName,
                key,
                carrierType: 'value'
              };
            }
          }
        }
      }

      // Check if accessNode is in an ExportAssignment (export default process.env.KEY)
      if (!carrier) {
        const exportAssignment = accessNode.getFirstAncestorByKind(SyntaxKind.ExportAssignment);
        if (exportAssignment) {
          pattern = 'export-const';
          carrier = {
            carrierName: 'default',
            key,
            carrierType: 'value'
          };
        }
      }

      directUsageCandidates.push({
        key,
        file: currentFileRel,
        kind: 'direct',
        pattern
      });

      if (carrier) {
        addCarrier(currentFileRel, carrier);
      }
    }
  }

  // Deduplicate direct usages per (file, key), keeping highest priority pattern
  const directUsageMap = new Map<string, DirectEnvUsage>();
  for (const usage of directUsageCandidates) {
    const keyId = `${usage.key}::${usage.file}`;
    const existing = directUsageMap.get(keyId);
    if (!existing || PATTERN_PRIORITY[usage.pattern] > PATTERN_PRIORITY[existing.pattern]) {
      directUsageMap.set(keyId, usage);
    }
  }

  const directUsages = Array.from(directUsageMap.values());
  const directKeysByFile = new Set(directUsages.map(u => `${u.key}::${u.file}`));

  // 2. Transitive Usage Tracing across the import graph
  const transitiveUsageMap = new Map<string, TransitiveEnvUsage>();

  // Iteratively propagate carriers and discover transitive usages until a fixed point
  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(10, nodes.length);

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const sourceFile of project.getSourceFiles()) {
      const consumerPath = path.resolve(sourceFile.getFilePath());
      const consumerRel = toPosixPath(path.relative(rootDir, consumerPath));
      if (!nodeMap.has(consumerRel)) continue;

      // Inspect imports in consumerFile
      for (const importDecl of sourceFile.getImportDeclarations()) {
        const specifier = importDecl.getModuleSpecifierValue();
        if (!specifier) continue;

        const resolvedSupplier = resolveImportTarget({
          rootDir,
          fromFilePath: consumerPath,
          specifier,
          tsConfigInfo,
          projectFilesSet
        });

        if (!resolvedSupplier) continue;
        const supplierRel = toPosixPath(path.relative(rootDir, resolvedSupplier));
        const supplierCarriers = carriersByFile.get(supplierRel);
        if (!supplierCarriers || supplierCarriers.length === 0) continue;

        for (const carrier of supplierCarriers) {
          let consumed = false;
          let reExportedAs: string | null = null;

          // Pattern A: Named imports
          for (const namedImport of importDecl.getNamedImports()) {
            if (namedImport.getName() === carrier.carrierName) {
              const localName = namedImport.getAliasNode()?.getText() || namedImport.getName();

              if (carrier.carrierType === 'value') {
                consumed = true;
                if (isExportedFromFile(sourceFile, localName)) {
                  reExportedAs = localName;
                }
              } else if (carrier.carrierType === 'object') {
                // Check if consumer accesses localName.property or destructures it
                if (carrier.property) {
                  const accessesProp = doesAccessProperty(sourceFile, localName, carrier.property);
                  if (accessesProp.accessed) {
                    consumed = true;
                    if (accessesProp.destructuredLocal && isExportedFromFile(sourceFile, accessesProp.destructuredLocal)) {
                      reExportedAs = accessesProp.destructuredLocal;
                    }
                  }
                }
              } else if (carrier.carrierType === 'function') {
                // Check if consumer calls localName()
                if (doesCallFunction(sourceFile, localName)) {
                  consumed = true;
                }
              }
            }
          }

          // Pattern B: Namespace imports (import * as mod from './supplier')
          const nsImport = importDecl.getNamespaceImport();
          if (nsImport) {
            const nsName = nsImport.getText();
            if (carrier.carrierType === 'value') {
              if (doesAccessProperty(sourceFile, nsName, carrier.carrierName).accessed) {
                consumed = true;
              }
            } else if (carrier.carrierType === 'object' && carrier.property) {
              // mod.config.property
              if (doesAccessNestedProperty(sourceFile, nsName, carrier.carrierName, carrier.property)) {
                consumed = true;
              }
            } else if (carrier.carrierType === 'function') {
              if (doesCallMemberFunction(sourceFile, nsName, carrier.carrierName)) {
                consumed = true;
              }
            }
          }

          // Pattern C: Default import (import mod from './supplier')
          const defaultImport = importDecl.getDefaultImport();
          if (defaultImport && carrier.carrierName === 'default') {
            const defName = defaultImport.getText();
            if (carrier.carrierType === 'value') {
              consumed = true;
              if (isExportedFromFile(sourceFile, defName)) {
                reExportedAs = defName;
              }
            } else if (carrier.carrierType === 'object' && carrier.property) {
              const accessesProp = doesAccessProperty(sourceFile, defName, carrier.property);
              if (accessesProp.accessed) {
                consumed = true;
                if (accessesProp.destructuredLocal && isExportedFromFile(sourceFile, accessesProp.destructuredLocal)) {
                  reExportedAs = accessesProp.destructuredLocal;
                }
              }
            } else if (carrier.carrierType === 'function') {
              if (doesCallFunction(sourceFile, defName)) {
                consumed = true;
              }
            }
          }

          if (consumed) {
            const usageKey = `${carrier.key}::${consumerRel}`;
            if (!directKeysByFile.has(usageKey) && !transitiveUsageMap.has(usageKey)) {
              transitiveUsageMap.set(usageKey, {
                key: carrier.key,
                file: consumerRel,
                kind: 'transitive',
                via: supplierRel
              });
              changed = true;
            }

            if (reExportedAs) {
              const beforeCount = (carriersByFile.get(consumerRel) || []).length;
              addCarrier(consumerRel, {
                carrierName: reExportedAs,
                key: carrier.key,
                carrierType: 'value'
              });
              const afterCount = (carriersByFile.get(consumerRel) || []).length;
              if (afterCount > beforeCount) {
                changed = true;
              }
            }
          }
        }
      }

      // Check re-export declarations: export { X } from './supplier'
      for (const exportDecl of sourceFile.getExportDeclarations()) {
        const specifier = exportDecl.getModuleSpecifierValue();
        if (!specifier) continue;

        const resolvedSupplier = resolveImportTarget({
          rootDir,
          fromFilePath: consumerPath,
          specifier,
          tsConfigInfo,
          projectFilesSet
        });

        if (!resolvedSupplier) continue;
        const supplierRel = toPosixPath(path.relative(rootDir, resolvedSupplier));
        const supplierCarriers = carriersByFile.get(supplierRel);
        if (!supplierCarriers || supplierCarriers.length === 0) continue;

        for (const carrier of supplierCarriers) {
          for (const namedExport of exportDecl.getNamedExports()) {
            if (namedExport.getName() === carrier.carrierName) {
              const exportedName = namedExport.getAliasNode()?.getText() || namedExport.getName();
              const beforeCount = (carriersByFile.get(consumerRel) || []).length;
              addCarrier(consumerRel, {
                carrierName: exportedName,
                key: carrier.key,
                carrierType: carrier.carrierType,
                property: carrier.property
              });
              const afterCount = (carriersByFile.get(consumerRel) || []).length;
              if (afterCount > beforeCount) {
                changed = true;
              }
            }
          }
        }
      }
    }
  }

  // Combine usages: direct + transitive
  const allUsages: EnvUsageItem[] = [
    ...directUsages,
    ...Array.from(transitiveUsageMap.values())
  ];

  // Sort usages deterministically: key, kind ('direct' before 'transitive'), file
  allUsages.sort((a, b) => {
    const keyDiff = a.key.localeCompare(b.key);
    if (keyDiff !== 0) return keyDiff;
    if (a.kind !== b.kind) {
      return a.kind === 'direct' ? -1 : 1;
    }
    return a.file.localeCompare(b.file);
  });

  // Deduplicate and sort dynamic accesses
  const uniqueDynamic = new Map<string, DynamicAccess>();
  for (const d of dynamicAccesses) {
    const id = `${d.file}::${d.note}`;
    if (!uniqueDynamic.has(id)) {
      uniqueDynamic.set(id, d);
    }
  }
  const dynamicList = Array.from(uniqueDynamic.values());
  dynamicList.sort((a, b) => {
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    return a.note.localeCompare(b.note);
  });

  return {
    declaredKeys,
    usages: allUsages,
    dynamicAccesses: dynamicList
  };
}

/**
 * Checks whether an object identifier's property is accessed (via .prop, ['prop'], or destructuring).
 */
function doesAccessProperty(
  sourceFile: SourceFile,
  objName: string,
  propertyName: string
): { accessed: boolean; destructuredLocal?: string } {
  // 1. obj.propertyName
  for (const propAccess of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (propAccess.getName() === propertyName) {
      const expr = unwrapExpression(propAccess.getExpression());
      if (Node.isIdentifier(expr) && expr.getText() === objName) {
        return { accessed: true };
      }
    }
  }

  // 2. obj['propertyName']
  for (const elemAccess of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const expr = unwrapExpression(elemAccess.getExpression());
    if (Node.isIdentifier(expr) && expr.getText() === objName) {
      const arg = elemAccess.getArgumentExpression();
      if (arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))) {
        if (arg.getLiteralValue() === propertyName) {
          return { accessed: true };
        }
      }
    }
  }

  // 3. const { propertyName } = obj
  for (const varDecl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = varDecl.getInitializer();
    if (init) {
      const unwrappedInit = unwrapExpression(init);
      if (Node.isIdentifier(unwrappedInit) && unwrappedInit.getText() === objName) {
        const nameNode = varDecl.getNameNode();
        if (Node.isObjectBindingPattern(nameNode)) {
          for (const el of nameNode.getElements()) {
            const propNameNode = el.getPropertyNameNode();
            if (propNameNode && propNameNode.getText() === propertyName) {
              return { accessed: true, destructuredLocal: el.getName() };
            } else if (!propNameNode && el.getName() === propertyName) {
              return { accessed: true, destructuredLocal: el.getName() };
            }
          }
        }
      }
    }
  }

  return { accessed: false };
}

/**
 * Checks for nested property access: nsName.carrierName.property.
 */
function doesAccessNestedProperty(
  sourceFile: SourceFile,
  nsName: string,
  carrierName: string,
  propertyName: string
): boolean {
  for (const propAccess of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (propAccess.getName() === propertyName) {
      const innerExpr = unwrapExpression(propAccess.getExpression());
      if (Node.isPropertyAccessExpression(innerExpr) && innerExpr.getName() === carrierName) {
        const rootExpr = unwrapExpression(innerExpr.getExpression());
        if (Node.isIdentifier(rootExpr) && rootExpr.getText() === nsName) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Checks whether an imported function is called in the source file: fnName(...).
 */
function doesCallFunction(sourceFile: SourceFile, fnName: string): boolean {
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = unwrapExpression(callExpr.getExpression());
    if (Node.isIdentifier(expr) && expr.getText() === fnName) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a namespace member function is called: nsName.fnName(...).
 */
function doesCallMemberFunction(sourceFile: SourceFile, nsName: string, fnName: string): boolean {
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = unwrapExpression(callExpr.getExpression());
    if (Node.isPropertyAccessExpression(expr) && expr.getName() === fnName) {
      const rootExpr = unwrapExpression(expr.getExpression());
      if (Node.isIdentifier(rootExpr) && rootExpr.getText() === nsName) {
        return true;
      }
    }
  }
  return false;
}
