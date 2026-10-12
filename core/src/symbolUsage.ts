import * as path from 'path';
import {
  Project,
  Node,
  SyntaxKind,
  SourceFile,
  PropertyAccessExpression,
  ElementAccessExpression
} from 'ts-morph';
import { GraphNode, GraphEdge, SymbolUsageItem } from './types';
import { toPosixPath } from './scanner';
import { resolveImportTarget } from './resolver';
import { loadTsConfig } from './tsconfig';

/**
 * Determines the nearest enclosing named scope for an AST node:
 * - Function declaration/expression/arrow function (prefer nearest named one; for anonymous arrow assigned to const, const name)
 * - Class method (ClassName.methodName)
 * - Module-level / top-level code ("<module>")
 */
export function getEnclosingScopeName(refNode: Node): string {
  let curr: Node | undefined = refNode.getParent();

  while (curr && !Node.isSourceFile(curr)) {
    // 1. Class Method, Constructor, Getter, or Setter
    if (
      Node.isMethodDeclaration(curr) ||
      Node.isConstructorDeclaration(curr) ||
      Node.isGetAccessorDeclaration(curr) ||
      Node.isSetAccessorDeclaration(curr)
    ) {
      const classDecl =
        curr.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) ||
        curr.getFirstAncestorByKind(SyntaxKind.ClassExpression);
      const className = classDecl?.getName() || '<anonymous>';
      const memberName = Node.isConstructorDeclaration(curr)
        ? 'constructor'
        : curr.getName();
      return `${className}.${memberName}`;
    }

    // 2. Named Function Declaration
    if (Node.isFunctionDeclaration(curr)) {
      const name = curr.getName();
      if (name) return name;
    }

    // 3. Arrow Function or Function Expression
    if (Node.isArrowFunction(curr) || Node.isFunctionExpression(curr)) {
      // If function expression has an explicit name, prefer it
      if (Node.isFunctionExpression(curr) && curr.getName()) {
        return curr.getName()!;
      }

      // Check VariableDeclaration: const handleLogin = () => {}
      const varDecl = curr.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (varDecl) {
        return varDecl.getName();
      }

      // Check Class PropertyDeclaration: class Auth { handleLogin = () => {} }
      const propDecl = curr.getFirstAncestorByKind(SyntaxKind.PropertyDeclaration);
      if (propDecl) {
        const classDecl = propDecl.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
        const className = classDecl?.getName() || '<anonymous>';
        return `${className}.${propDecl.getName()}`;
      }

      // Check Object PropertyAssignment: const obj = { login: () => {} }
      const propAssign = curr.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
      if (propAssign) {
        return propAssign.getName();
      }
    }

    curr = curr.getParent();
  }

  return '<module>';
}

/**
 * Checks whether an AST reference is used strictly in a TypeScript type position.
 */
export function isTypeOnlyReference(refNode: Node, isTypeOnlyImport: boolean): boolean {
  if (isTypeOnlyImport) return true;

  let curr: Node | undefined = refNode;
  while (curr && !Node.isSourceFile(curr)) {
    if (
      Node.isTypeNode(curr) ||
      Node.isTypeAliasDeclaration(curr) ||
      Node.isInterfaceDeclaration(curr)
    ) {
      return true;
    }
    curr = curr.getParent();
  }

  return false;
}

/**
 * Finds all references to an AST identifier node within the project/source file.
 */
function findNodeReferences(node: Node, sourceFile: SourceFile): Node[] {
  try {
    if ('findReferencesAsNodes' in node && typeof (node as any).findReferencesAsNodes === 'function') {
      return (node as any).findReferencesAsNodes();
    }
  } catch {
    // fallback to identifier matching
  }
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(i => i.getText() === node.getText());
}

/**
 * Traces symbol-level usage for each import edge in the dependency graph.
 */
export function traceSymbolUsages(
  project: Project,
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootDir: string
): SymbolUsageItem[] {
  const tsConfigInfo = loadTsConfig(rootDir);
  const projectFilesSet = new Set(nodes.map(n => path.resolve(n.path)));

  const nodeMap = new Map<string, GraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const usages: SymbolUsageItem[] = [];
  const visitedKeySet = new Set<string>();

  function recordUsage(item: SymbolUsageItem) {
    const key = `${item.fromFile}::${item.usedInFile}::${item.importedSymbol}::${item.usedInScope}::${item.line}::${item.typeOnly}`;
    if (!visitedKeySet.has(key)) {
      visitedKeySet.add(key);
      usages.push(item);
    }
  }

  // Iterate over every import edge in the graph: consumerFile (from) imports from supplierFile (to)
  for (const edge of edges) {
    const fromFile = edge.from;
    const toFile = edge.to;

    const consumerNode = nodeMap.get(fromFile);
    if (!consumerNode) continue;

    const sourceFileA = project.getSourceFile(consumerNode.path);
    if (!sourceFileA) continue;

    // 1. Process Import Declarations
    for (const importDecl of sourceFileA.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue();
      if (!specifier) continue;

      const resolvedPath = resolveImportTarget({
        rootDir,
        fromFilePath: consumerNode.path,
        specifier,
        tsConfigInfo,
        projectFilesSet
      });

      if (!resolvedPath) continue;
      const resolvedRel = toPosixPath(path.relative(rootDir, resolvedPath));
      if (resolvedRel !== toFile) continue;

      const isTypeOnlyDecl = importDecl.isTypeOnly();

      // A. Named Imports: import { X, Y as Z } from './B'
      for (const namedImport of importDecl.getNamedImports()) {
        const importedSymbol = namedImport.getName();
        const idNode = namedImport.getAliasNode() || namedImport.getNameNode();
        const isTypeOnly = isTypeOnlyDecl || namedImport.isTypeOnly();

        const refs = findNodeReferences(idNode, sourceFileA);

        for (const ref of refs) {
          if (ref.getSourceFile() !== sourceFileA) continue;
          if (ref === idNode || ref.getParent() === namedImport) continue;

          // Check if reference is in a destructured re-export: export { X as Y }
          const exportSpec = ref.getFirstAncestorByKind(SyntaxKind.ExportSpecifier);
          if (exportSpec) {
            const alias = exportSpec.getAliasNode()?.getText();
            recordUsage({
              importedSymbol,
              fromFile: toFile,
              usedInFile: fromFile,
              usedInScope: '<module>',
              line: ref.getStartLineNumber(),
              typeOnly: isTypeOnly,
              note: alias ? `Re-exported as ${alias}` : 'Re-exported'
            });
            continue;
          }

          const scope = getEnclosingScopeName(ref);
          const typeOnly = isTypeOnlyReference(ref, isTypeOnly);
          const line = ref.getStartLineNumber();

          recordUsage({
            importedSymbol,
            fromFile: toFile,
            usedInFile: fromFile,
            usedInScope: scope,
            line,
            typeOnly
          });
        }
      }

      // B. Default Import: import X from './B'
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        const importedSymbol = 'default';
        const idNode = defaultImport;
        const isTypeOnly = isTypeOnlyDecl;

        const refs = findNodeReferences(idNode, sourceFileA);

        for (const ref of refs) {
          if (ref.getSourceFile() !== sourceFileA) continue;
          if (ref === idNode || ref.getParent() === importDecl) continue;

          const scope = getEnclosingScopeName(ref);
          const typeOnly = isTypeOnlyReference(ref, isTypeOnly);
          const line = ref.getStartLineNumber();

          recordUsage({
            importedSymbol,
            fromFile: toFile,
            usedInFile: fromFile,
            usedInScope: scope,
            line,
            typeOnly
          });
        }
      }

      // C. Namespace Import: import * as utils from './B'
      const nsImport = importDecl.getNamespaceImport();
      if (nsImport) {
        const idNode = nsImport;
        const isTypeOnly = isTypeOnlyDecl;

        const refs = findNodeReferences(idNode, sourceFileA);

        for (const ref of refs) {
          if (ref.getSourceFile() !== sourceFileA) continue;
          if (ref === idNode || ref.getParent() === importDecl) continue;

          const parent = ref.getParent();
          if (parent && Node.isPropertyAccessExpression(parent) && parent.getExpression() === ref) {
            // Member access: utils.hashPassword()
            const propAccess = parent as PropertyAccessExpression;
            const importedSymbol = propAccess.getName();
            const scope = getEnclosingScopeName(propAccess);
            const typeOnly = isTypeOnlyReference(propAccess, isTypeOnly);
            const line = propAccess.getStartLineNumber();

            recordUsage({
              importedSymbol,
              fromFile: toFile,
              usedInFile: fromFile,
              usedInScope: scope,
              line,
              typeOnly
            });
          } else if (parent && Node.isElementAccessExpression(parent) && parent.getExpression() === ref) {
            // Bracket access: utils['hashPassword']
            const elemAccess = parent as ElementAccessExpression;
            const arg = elemAccess.getArgumentExpression();
            if (arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))) {
              const importedSymbol = arg.getLiteralValue();
              const scope = getEnclosingScopeName(elemAccess);
              const typeOnly = isTypeOnlyReference(elemAccess, isTypeOnly);
              const line = elemAccess.getStartLineNumber();

              recordUsage({
                importedSymbol,
                fromFile: toFile,
                usedInFile: fromFile,
                usedInScope: scope,
                line,
                typeOnly
              });
            } else {
              const scope = getEnclosingScopeName(elemAccess);
              const line = elemAccess.getStartLineNumber();
              recordUsage({
                importedSymbol: '<dynamic>',
                fromFile: toFile,
                usedInFile: fromFile,
                usedInScope: scope,
                line,
                typeOnly: false,
                note: `${elemAccess.getText()} — dynamic member access`
              });
            }
          } else {
            // Whole namespace used
            const scope = getEnclosingScopeName(ref);
            const typeOnly = isTypeOnlyReference(ref, isTypeOnly);
            const line = ref.getStartLineNumber();

            recordUsage({
              importedSymbol: '*',
              fromFile: toFile,
              usedInFile: fromFile,
              usedInScope: scope,
              line,
              typeOnly
            });
          }
        }
      }
    }

    // 2. Process Re-Export Declarations: export { X, Y as Z } from './B'
    for (const exportDecl of sourceFileA.getExportDeclarations()) {
      const specifier = exportDecl.getModuleSpecifierValue();
      if (!specifier) continue;

      const resolvedPath = resolveImportTarget({
        rootDir,
        fromFilePath: consumerNode.path,
        specifier,
        tsConfigInfo,
        projectFilesSet
      });

      if (!resolvedPath) continue;
      const resolvedRel = toPosixPath(path.relative(rootDir, resolvedPath));
      if (resolvedRel !== toFile) continue;

      const isTypeOnlyExport = exportDecl.isTypeOnly();

      for (const namedExport of exportDecl.getNamedExports()) {
        const importedSymbol = namedExport.getName();
        const alias = namedExport.getAliasNode()?.getText();
        const line = namedExport.getStartLineNumber();
        const typeOnly = isTypeOnlyExport || namedExport.isTypeOnly();

        recordUsage({
          importedSymbol,
          fromFile: toFile,
          usedInFile: fromFile,
          usedInScope: '<module>',
          line,
          typeOnly,
          note: alias ? `Re-exported as ${alias}` : 'Re-exported'
        });
      }
    }
  }

  // Sort usages deterministically: usedInFile, line, importedSymbol, usedInScope
  usages.sort((a, b) => {
    const fileDiff = a.usedInFile.localeCompare(b.usedInFile);
    if (fileDiff !== 0) return fileDiff;
    const lineDiff = a.line - b.line;
    if (lineDiff !== 0) return lineDiff;
    const symDiff = a.importedSymbol.localeCompare(b.importedSymbol);
    if (symDiff !== 0) return symDiff;
    return a.usedInScope.localeCompare(b.usedInScope);
  });

  return usages;
}
