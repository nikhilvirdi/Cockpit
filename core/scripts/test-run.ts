import * as path from 'path';
import * as fs from 'fs';
import { buildDependencyGraph } from '../src';

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
    const graph = buildDependencyGraph(targetPath);
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

    if (graph.nodes.length > 0) {
      const nodeSampleSize = Math.min(5, graph.nodes.length);
      console.log(`\nSample of ${nodeSampleSize} nodes:`);
      for (let i = 0; i < nodeSampleSize; i++) {
        const node = graph.nodes[i];
        console.log(`  [${i + 1}] id: "${node.id}" (path: ${node.path})`);
      }
    }

    console.log('\nGraph engine execution completed successfully.');
  } catch (err) {
    console.error('Failed to build dependency graph:', err);
    process.exit(1);
  }
}

main();
