import * as path from 'path';
import * as fs from 'fs';
import { buildDependencyGraph, analyzeDependencyGraph } from '../src';

function main() {
  const inputArg = process.argv[2];

  if (!inputArg) {
    console.log('No directory path supplied as argument.');
    console.log('Usage: npx tsx scripts/test-run.ts <path-to-repo>');
    console.log('Defaulting to core package directory for demonstration:\n');
  }

  const targetPath = path.resolve(inputArg || path.join(__dirname, '..'));

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Target path does not exist: ${targetPath}`);
    process.exit(1);
  }

  console.log(`Analyzing repository at: ${targetPath}`);
  const startTime = Date.now();

  try {
    const rawGraph = buildDependencyGraph(targetPath);
    const graph = analyzeDependencyGraph(rawGraph, { rootDir: targetPath });
    const duration = Date.now() - startTime;

    console.log('\n================ Dependency Graph Summary ================');
    console.log(`Total Nodes: ${graph.nodes.length}`);
    console.log(`Total Edges: ${graph.edges.length}`);
    console.log(`Time elapsed: ${duration}ms`);
    console.log('==========================================================\n');

    const sampleSize = Math.min(5, graph.edges.length);
    if (sampleSize > 0) {
      console.log(`Sample of ${sampleSize} edges:`);
      for (let i = 0; i < sampleSize; i++) {
        const edge = graph.edges[i];
        console.log(`  [${i + 1}] ${edge.from}  -->  ${edge.to}`);
      }
    } else {
      console.log('No internal edges found in the analyzed directory.');
    }

    console.log('\n================ Graph Analysis Summary ==================');
    const { analysis } = graph;

    // 1. Cycles
    console.log(`Cycles detected: ${analysis.cycles.length}`);
    if (analysis.cycles.length > 0) {
      const exampleCycle = analysis.cycles[0];
      const cycleString = [...exampleCycle, exampleCycle[0]].join('  -->  ');
      console.log(`  Example cycle: ${cycleString}`);
    }

    // 2. Orphans
    console.log(`\nOrphan files: ${analysis.orphans.length}`);
    if (analysis.orphans.length > 0) {
      analysis.orphans.forEach((orphan, i) => {
        console.log(`  [${i + 1}] ${orphan}`);
      });
    }

    // 3. Entry Points
    console.log(`\nEntry points detected: ${analysis.entryPoints.length}`);
    if (analysis.entryPoints.length > 0) {
      analysis.entryPoints.forEach((ep, i) => {
        console.log(`  [${i + 1}] ${ep.id} (${ep.reason})`);
      });
    }

    // 4. Centrality (Top 3 fan-in / fan-out)
    console.log('\nCentrality Metrics:');
    const topFanIn3 = analysis.centrality.topFanIn.slice(0, 3);
    console.log('  Top Fan-In (most depended upon):');
    if (topFanIn3.length > 0) {
      topFanIn3.forEach((item, i) => {
        console.log(`    [${i + 1}] ${item.id} (fan-in: ${item.fanIn})`);
      });
    } else {
      console.log('    None');
    }

    const topFanOut3 = analysis.centrality.topFanOut.slice(0, 3);
    console.log('  Top Fan-Out (most dependencies):');
    if (topFanOut3.length > 0) {
      topFanOut3.forEach((item, i) => {
        console.log(`    [${i + 1}] ${item.id} (fan-out: ${item.fanOut})`);
      });
    } else {
      console.log('    None');
    }

    console.log('==========================================================\n');
    console.log('Graph engine and analysis completed successfully.');
  } catch (err) {
    console.error('Failed to build or analyze dependency graph:', err);
    process.exit(1);
  }
}

main();
