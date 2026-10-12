import * as path from 'path';
import * as assert from 'assert';
import { buildDependencyGraph, analyzeDependencyGraph } from '../src';

export function runSymbolUsageTests() {
  const fixturePath = path.resolve(__dirname, 'fixtures/symbol-project');
  console.log(`Running symbol usage precision tests against: ${fixturePath}`);

  const rawGraph = buildDependencyGraph(fixturePath);
  const graph = analyzeDependencyGraph(rawGraph, { rootDir: fixturePath });

  // 1. Verify symbolUsage key in output
  assert.ok(graph.symbolUsage, 'graph.symbolUsage must exist');
  assert.ok(Array.isArray(graph.symbolUsage), 'symbolUsage must be an array');

  const { symbolUsage } = graph;
  console.log(`Discovered ${symbolUsage.length} symbol usages:`);
  for (const usage of symbolUsage) {
    console.log(
      `  - ${usage.importedSymbol} from ${usage.fromFile} used in ${usage.usedInFile} at line ${usage.line} in scope "${usage.usedInScope}" (typeOnly: ${usage.typeOnly})`
    );
  }

  // 2. Validate total count
  assert.strictEqual(symbolUsage.length, 5, 'Should detect exactly 5 symbol usages in the fixture');

  // 3. Validate Module Top-Level usage: secretKey at line 5 -> "<module>"
  const moduleUsage = symbolUsage.find(
    u => u.importedSymbol === 'secretKey' && u.usedInScope === '<module>'
  );
  assert.ok(moduleUsage, 'Must detect module-level usage of secretKey in "<module>"');
  assert.strictEqual(moduleUsage.fromFile, 'src/auth-utils.ts');
  assert.strictEqual(moduleUsage.usedInFile, 'src/consumer.ts');
  assert.strictEqual(moduleUsage.line, 5);
  assert.strictEqual(moduleUsage.typeOnly, false);
  console.log('✓ Module top-level usage (<module>) verified');

  // 4. Validate Named Function usage: hashPassword at line 9 -> "handleLogin"
  const namedFnUsage = symbolUsage.find(
    u => u.importedSymbol === 'hashPassword' && u.usedInScope === 'handleLogin'
  );
  assert.ok(namedFnUsage, 'Must detect usage of hashPassword in "handleLogin"');
  assert.strictEqual(namedFnUsage.fromFile, 'src/auth-utils.ts');
  assert.strictEqual(namedFnUsage.usedInFile, 'src/consumer.ts');
  assert.strictEqual(namedFnUsage.line, 9);
  assert.strictEqual(namedFnUsage.typeOnly, false);
  console.log('✓ Named function scope (handleLogin) verified');

  // 5. Validate Anonymous Arrow assigned to const: hashPassword at line 14 -> "handleAuth"
  const arrowUsage = symbolUsage.find(
    u => u.importedSymbol === 'hashPassword' && u.usedInScope === 'handleAuth'
  );
  assert.ok(arrowUsage, 'Must detect usage of hashPassword in arrow function const "handleAuth"');
  assert.strictEqual(arrowUsage.fromFile, 'src/auth-utils.ts');
  assert.strictEqual(arrowUsage.usedInFile, 'src/consumer.ts');
  assert.strictEqual(arrowUsage.line, 14);
  assert.strictEqual(arrowUsage.typeOnly, false);
  console.log('✓ Anonymous arrow assigned to const (handleAuth) verified');

  // 6. Validate import type usage inside a function: UserToken at line 18 -> "verifyUser", typeOnly: true
  const typeUsage = symbolUsage.find(
    u => u.importedSymbol === 'UserToken' && u.usedInScope === 'verifyUser'
  );
  assert.ok(typeUsage, 'Must detect import type usage of UserToken in "verifyUser"');
  assert.strictEqual(typeUsage.fromFile, 'src/auth-utils.ts');
  assert.strictEqual(typeUsage.usedInFile, 'src/consumer.ts');
  assert.strictEqual(typeUsage.line, 18);
  assert.strictEqual(typeUsage.typeOnly, true);
  console.log('✓ Type-only usage (verifyUser, typeOnly: true) verified');

  // 7. Validate Class Method usage: hashPassword at line 25 -> "AuthService.login"
  const classMethodUsage = symbolUsage.find(
    u => u.importedSymbol === 'hashPassword' && u.usedInScope === 'AuthService.login'
  );
  assert.ok(classMethodUsage, 'Must detect usage of hashPassword in class method "AuthService.login"');
  assert.strictEqual(classMethodUsage.fromFile, 'src/auth-utils.ts');
  assert.strictEqual(classMethodUsage.usedInFile, 'src/consumer.ts');
  assert.strictEqual(classMethodUsage.line, 25);
  assert.strictEqual(classMethodUsage.typeOnly, false);
  console.log('✓ Class method scope (AuthService.login) verified');

  console.log('All symbol usage precision tests passed successfully! ✓\n');
}

runSymbolUsageTests();
