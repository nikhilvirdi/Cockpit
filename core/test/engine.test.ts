import * as path from 'path';
import * as assert from 'assert';
import { buildDependencyGraph } from '../src';

function runTests() {
  const fixturePath = path.resolve(__dirname, 'fixtures/sample-project');
  console.log(`Running engine tests against fixture: ${fixturePath}`);

  const graph = buildDependencyGraph(fixturePath);

  console.log('Discovered nodes:');
  graph.nodes.forEach(n => console.log(`  - ${n.id} (${n.path})`));

  console.log('\nDiscovered edges:');
  graph.edges.forEach(e => console.log(`  - ${e.from} -> ${e.to}`));

  // 1. Verify JSON shape
  assert.ok(Array.isArray(graph.nodes), 'graph.nodes must be an array');
  assert.ok(Array.isArray(graph.edges), 'graph.edges must be an array');

  // 2. Verify node structure and path normalization (forward slashes)
  for (const node of graph.nodes) {
    assert.ok(node.id, 'Node id must exist');
    assert.ok(node.path, 'Node path must exist');
    assert.ok(!node.id.includes('\\'), `Node id "${node.id}" must use forward slashes`);
    assert.ok(!node.path.includes('\\'), `Node path "${node.path}" must use forward slashes`);
    assert.ok(!node.id.startsWith('/'), `Node id "${node.id}" must be relative`);
  }

  // 3. Verify external packages (react) are not present in nodes or edges
  const hasReactNode = graph.nodes.some(n => n.id.includes('react'));
  const hasReactEdge = graph.edges.some(e => e.to.includes('react') || e.from.includes('react'));
  assert.strictEqual(hasReactNode, false, 'External package (react) should not be in nodes');
  assert.strictEqual(hasReactEdge, false, 'External package (react) should not be in edges');

  // 4. Verify path aliases resolution
  // '@/utils/a' -> 'src/utils/a.ts'
  const aliasEdge1 = graph.edges.find(e => e.from === 'src/index.ts' && e.to === 'src/utils/a.ts');
  assert.ok(aliasEdge1, 'Should resolve alias @/utils/a to src/utils/a.ts');

  // '@components/Button' -> 'src/components/Button.tsx'
  const aliasEdge2 = graph.edges.find(e => e.from === 'src/index.ts' && e.to === 'src/components/Button.tsx');
  assert.ok(aliasEdge2, 'Should resolve alias @components/Button to src/components/Button.tsx');

  // 5. Verify barrel file resolution
  // 'import { b } from "./barrel"' -> must resolve to 'src/barrel/index.ts', NOT chased deeper to deep.ts
  const barrelEdge = graph.edges.find(e => e.from === 'src/index.ts' && e.to === 'src/barrel/index.ts');
  assert.ok(barrelEdge, 'Barrel import from src/index.ts must resolve to src/barrel/index.ts');

  const chasedEdge = graph.edges.find(e => e.from === 'src/index.ts' && e.to === 'src/barrel/deep.ts');
  assert.strictEqual(chasedEdge, undefined, 'Must not chase through barrel to deep.ts from src/index.ts');

  // Barrel file's own re-export
  const barrelReExport = graph.edges.find(e => e.from === 'src/barrel/index.ts' && e.to === 'src/barrel/deep.ts');
  assert.ok(barrelReExport, 'Barrel file itself should have edge to src/barrel/deep.ts');

  // 6. Verify CommonJS require
  const cjsEdge = graph.edges.find(e => e.from === 'src/index.ts' && e.to === 'src/cjsModule.js');
  assert.ok(cjsEdge, 'Should resolve CommonJS require("./cjsModule") to src/cjsModule.js');

  const cjsSubEdge = graph.edges.find(e => e.from === 'src/cjsModule.js' && e.to === 'src/helpers/helper.ts');
  assert.ok(cjsSubEdge, 'Should resolve CommonJS require("./helpers/helper") in cjsModule to src/helpers/helper.ts');

  // 7. Verify relative import
  const relativeEdge = graph.edges.find(e => e.from === 'src/utils/a.ts' && e.to === 'src/helpers/helper.ts');
  assert.ok(relativeEdge, 'Should resolve relative import ../helpers/helper in src/utils/a.ts');

  // 8. Verify dynamic import was skipped without error
  const dynEdge = graph.edges.find(e => e.from === 'src/index.ts' && e.to === 'src/dynamicTarget.ts');
  assert.strictEqual(dynEdge, undefined, 'Dynamic import should be skipped for v1');

  console.log('\nAll assertions passed successfully! ✓');
}

runTests();
