import * as path from 'path';
import * as assert from 'assert';
import { buildDependencyGraph, analyzeDependencyGraph } from '../src';

export function runEnvUsageTests() {
  const fixturePath = path.resolve(__dirname, 'fixtures/env-project');
  console.log(`Running env usage tests against: ${fixturePath}`);

  const rawGraph = buildDependencyGraph(fixturePath);
  const graph = analyzeDependencyGraph(rawGraph, { rootDir: fixturePath });

  // 1. Verify top-level structure
  assert.ok(graph.nodes, 'graph.nodes must exist');
  assert.ok(graph.edges, 'graph.edges must exist');
  assert.ok(graph.analysis, 'graph.analysis must exist');
  assert.ok(graph.envUsage, 'graph.envUsage must exist');

  const { envUsage } = graph;

  // 2. Part A: Declared key enumeration
  console.log('Declared keys:', envUsage.declaredKeys);
  assert.strictEqual(envUsage.declaredKeys.length, 3, 'Should detect exactly 3 declared keys');

  const apiSecretDecl = envUsage.declaredKeys.find(k => k.key === 'API_SECRET');
  assert.ok(apiSecretDecl, 'API_SECRET must be declared');
  assert.deepStrictEqual(apiSecretDecl.declaredIn, ['.env.example']);

  const dbUrlDecl = envUsage.declaredKeys.find(k => k.key === 'DATABASE_URL');
  assert.ok(dbUrlDecl, 'DATABASE_URL must be declared');
  assert.deepStrictEqual(dbUrlDecl.declaredIn, ['.env', '.env.example']);

  const portDecl = envUsage.declaredKeys.find(k => k.key === 'PORT');
  assert.ok(portDecl, 'PORT must be declared');
  assert.deepStrictEqual(portDecl.declaredIn, ['.env', '.env.example']);
  console.log('✓ Part A: Declared key enumeration passed');

  // 3. Part B: Direct usage detection
  const directUsages = envUsage.usages.filter(u => u.kind === 'direct');
  console.log('Direct usages:', directUsages);
  assert.ok(directUsages.length >= 3, 'Should detect at least 3 direct usages');

  // DATABASE_URL in config.ts (export-const)
  const configDbUrl = directUsages.find(u => u.key === 'DATABASE_URL' && u.file === 'src/config.ts');
  assert.ok(configDbUrl, 'Should find direct usage of DATABASE_URL in src/config.ts');
  assert.strictEqual(configDbUrl.pattern, 'export-const', 'DATABASE_URL in src/config.ts should be export-const');

  // API_SECRET in direct.ts (destructure)
  const directApiSecret = directUsages.find(u => u.key === 'API_SECRET' && u.file === 'src/direct.ts');
  assert.ok(directApiSecret, 'Should find direct usage of API_SECRET in src/direct.ts');
  assert.strictEqual(directApiSecret.pattern, 'destructure', 'API_SECRET in src/direct.ts should be destructure');

  // PORT in direct.ts (export-const)
  const directPort = directUsages.find(u => u.key === 'PORT' && u.file === 'src/direct.ts');
  assert.ok(directPort, 'Should find direct usage of PORT in src/direct.ts');
  assert.strictEqual(directPort.pattern, 'export-const', 'PORT in src/direct.ts should be export-const');
  console.log('✓ Part B: Direct usage detection passed');

  // 4. Part C: Transitive usage tracing
  const transitiveUsages = envUsage.usages.filter(u => u.kind === 'transitive');
  console.log('Transitive usages:', transitiveUsages);

  // db.ts consumes dbUrl from config.ts
  const dbTransitive = transitiveUsages.find(u => u.key === 'DATABASE_URL' && u.file === 'src/db.ts');
  assert.ok(dbTransitive, 'Should detect transitive usage of DATABASE_URL in src/db.ts');
  assert.strictEqual(dbTransitive.via, 'src/config.ts', 'src/db.ts should consume DATABASE_URL via src/config.ts');

  // service.ts consumes config.dbUrl from config.ts
  const serviceTransitive = transitiveUsages.find(u => u.key === 'DATABASE_URL' && u.file === 'src/service.ts');
  assert.ok(serviceTransitive, 'Should detect transitive usage of DATABASE_URL in src/service.ts');
  assert.strictEqual(serviceTransitive.via, 'src/config.ts', 'src/service.ts should consume DATABASE_URL via src/config.ts');
  console.log('✓ Part C: Transitive usage tracing passed');

  // 5. Dynamic accesses
  console.log('Dynamic accesses:', envUsage.dynamicAccesses);
  assert.strictEqual(envUsage.dynamicAccesses.length, 1, 'Should detect exactly 1 dynamic access');
  const dynAccess = envUsage.dynamicAccesses[0];
  assert.strictEqual(dynAccess.file, 'src/legacy.ts', 'Dynamic access must be in src/legacy.ts');
  assert.ok(
    dynAccess.note.includes('process.env[varName]') && dynAccess.note.includes('not statically resolvable'),
    'Note should identify process.env[varName] as not statically resolvable'
  );
  console.log('✓ Dynamic access detection passed');

  console.log('All env usage tests passed successfully! ✓\n');
}

runEnvUsageTests();
