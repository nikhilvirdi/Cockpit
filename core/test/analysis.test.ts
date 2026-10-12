import * as path from 'path';
import * as assert from 'assert';
import { buildDependencyGraph, analyzeDependencyGraph } from '../src';

function runAnalysisTests() {
  const fixturePath = path.resolve(__dirname, 'fixtures/analysis-project');
  console.log(`Running graph analysis tests against: ${fixturePath}`);

  const rawGraph = buildDependencyGraph(fixturePath);
  const graph = analyzeDependencyGraph(rawGraph, { rootDir: fixturePath });

  const { analysis } = graph;

  // 1. Verify JSON structure
  assert.ok(graph.analysis, 'graph.analysis must exist');
  assert.ok(Array.isArray(analysis.cycles), 'analysis.cycles must be an array');
  assert.ok(Array.isArray(analysis.orphans), 'analysis.orphans must be an array');
  assert.ok(Array.isArray(analysis.entryPoints), 'analysis.entryPoints must be an array');
  assert.ok(analysis.centrality, 'analysis.centrality must exist');
  assert.ok(Array.isArray(analysis.centrality.topFanIn), 'centrality.topFanIn must be an array');
  assert.ok(Array.isArray(analysis.centrality.topFanOut), 'centrality.topFanOut must be an array');

  // 2. Cycle detection assertions
  console.log(`Detected cycles:`, analysis.cycles);
  assert.strictEqual(analysis.cycles.length, 2, 'Should detect exactly 2 cycles');

  // 2-node cycle: node1 <-> node2
  const cycle2 = analysis.cycles.find(
    c => c.length === 2 && c.includes('src/cycle/node1.ts') && c.includes('src/cycle/node2.ts')
  );
  assert.ok(cycle2, 'Should find 2-node cycle between node1.ts and node2.ts');

  // 3-node cycle: serviceA -> serviceB -> serviceC -> serviceA
  const cycle3 = analysis.cycles.find(
    c =>
      c.length === 3 &&
      c.includes('src/services/serviceA.ts') &&
      c.includes('src/services/serviceB.ts') &&
      c.includes('src/services/serviceC.ts')
  );
  assert.ok(cycle3, 'Should find 3-node cycle between serviceA, serviceB, and serviceC');

  // 3. Orphan detection assertions
  console.log('Detected orphans:', analysis.orphans);
  assert.ok(
    analysis.orphans.includes('src/legacy/deadCode.ts'),
    'Should identify src/legacy/deadCode.ts as orphan'
  );
  assert.ok(
    analysis.orphans.includes('src/utils/orphanUtil.ts'),
    'Should identify src/utils/orphanUtil.ts as orphan'
  );
  assert.strictEqual(
    analysis.orphans.includes('src/server.ts'),
    false,
    'Entry points should not be classified as orphans'
  );
  assert.strictEqual(
    analysis.orphans.includes('src/index.ts'),
    false,
    'Entry point index.ts should not be classified as orphan'
  );
  assert.strictEqual(
    analysis.orphans.includes('app/users/page.tsx'),
    false,
    'Next.js route should not be classified as orphan'
  );

  // 4. Entry point detection assertions
  console.log('Detected entry points:', analysis.entryPoints);
  const serverEntry = analysis.entryPoints.find(e => e.id === 'src/server.ts');
  assert.ok(serverEntry, 'Should detect src/server.ts as entry point');
  assert.ok(serverEntry.reason.includes('package.json main'), 'src/server.ts reason should mention package.json main');

  const cliEntry = analysis.entryPoints.find(e => e.id === 'src/cli.ts');
  assert.ok(cliEntry, 'Should detect src/cli.ts as entry point');
  assert.ok(cliEntry.reason.includes('package.json bin'), 'src/cli.ts reason should mention package.json bin');

  const indexEntry = analysis.entryPoints.find(e => e.id === 'src/index.ts');
  assert.ok(indexEntry, 'Should detect src/index.ts as entry point');
  assert.ok(indexEntry.reason.includes('index file'), 'src/index.ts reason should mention index file');

  const pagesEntry = analysis.entryPoints.find(e => e.id === 'pages/dashboard.tsx');
  assert.ok(pagesEntry, 'Should detect pages/dashboard.tsx as entry point');
  assert.ok(pagesEntry.reason.includes('Next.js route'), 'pages/dashboard.tsx reason should mention Next.js route');

  const appEntry = analysis.entryPoints.find(e => e.id === 'app/users/page.tsx');
  assert.ok(appEntry, 'Should detect app/users/page.tsx as entry point');
  assert.ok(appEntry.reason.includes('Next.js route'), 'app/users/page.tsx reason should mention Next.js route');

  // 5. Centrality assertions
  console.log('Centrality top fan-in:', analysis.centrality.topFanIn);
  console.log('Centrality top fan-out:', analysis.centrality.topFanOut);
  const routesFanIn = analysis.centrality.topFanIn.find(item => item.id === 'src/routes.ts');
  assert.ok(routesFanIn, 'src/routes.ts should be in fan-in list');
  assert.strictEqual(routesFanIn.fanIn, 2, 'src/routes.ts should have fanIn = 2 (imported by server.ts and index.ts)');

  const serviceAFanIn = analysis.centrality.topFanIn.find(item => item.id === 'src/services/serviceA.ts');
  assert.ok(serviceAFanIn, 'src/services/serviceA.ts should be in fan-in list');
  assert.strictEqual(serviceAFanIn.fanIn, 2, 'serviceA should have fanIn = 2 (imported by cli.ts and serviceC.ts)');

  // Fan-out assertions
  const cliFanOut = analysis.centrality.topFanOut.find(item => item.id === 'src/cli.ts');
  assert.ok(cliFanOut, 'src/cli.ts should be in fan-out list');
  assert.strictEqual(cliFanOut.fanOut, 1, 'src/cli.ts should have fanOut = 1');

  console.log('\nAll analysis assertions passed successfully! ✓');
}

runAnalysisTests();
