import * as fs from 'fs';
import * as path from 'path';
import { Project } from 'ts-morph';
import {
  DependencyGraph,
  AnalyzedGraph,
  AnalysisResult,
  EntryPoint,
  NodeCentralityFanIn,
  NodeCentralityFanOut,
  CentralityAnalysis,
  AnalysisOptions,
  EnvUsageResult,
  SymbolUsageItem
} from './types';
import { traceEnvUsage } from './envUsage';
import { traceSymbolUsages } from './symbolUsage';

/**
 * Detects all elementary cycles in the graph using Johnson's algorithm with Tarjan's SCC.
 */
export function detectCycles(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
  maxCycles: number = 500
): string[][] {
  const nodeIds = nodes.map(n => n.id).sort();
  const nodeIndex = new Map<string, number>();
  nodeIds.forEach((id, idx) => nodeIndex.set(id, idx));

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    adj.set(id, []);
  }
  for (const edge of edges) {
    if (adj.has(edge.from) && adj.has(edge.to)) {
      adj.get(edge.from)!.push(edge.to);
    }
  }

  // Tarjan's Strongly Connected Components on a subset of nodes
  function getSCCs(subgraphSet: Set<string>): string[][] {
    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    function strongConnect(v: string) {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      const neighbors = adj.get(v) || [];
      for (const w of neighbors) {
        if (!subgraphSet.has(w)) continue;
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const scc: string[] = [];
        while (true) {
          const w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
          if (w === v) break;
        }
        sccs.push(scc);
      }
    }

    for (const v of subgraphSet) {
      if (!indices.has(v)) {
        strongConnect(v);
      }
    }

    return sccs;
  }

  const cycles: string[][] = [];
  let sIdx = 0;

  while (sIdx < nodeIds.length && cycles.length < maxCycles) {
    const subNodes = new Set<string>();
    for (let i = sIdx; i < nodeIds.length; i++) {
      subNodes.add(nodeIds[i]);
    }

    const sccs = getSCCs(subNodes);

    let minScc: string[] | null = null;
    let minStartIdx = Infinity;
    let minStartNode: string | null = null;

    for (const scc of sccs) {
      const isNonTrivial =
        scc.length > 1 || (scc.length === 1 && (adj.get(scc[0]) || []).includes(scc[0]));
      if (isNonTrivial) {
        for (const node of scc) {
          const idx = nodeIndex.get(node)!;
          if (idx < minStartIdx) {
            minStartIdx = idx;
            minStartNode = node;
            minScc = scc;
          }
        }
      }
    }

    if (!minScc || minStartNode === null) {
      break;
    }

    const s = minStartNode;
    sIdx = minStartIdx;

    const sccSet = new Set(minScc);
    const blocked = new Set<string>();
    const B = new Map<string, Set<string>>();
    const stack: string[] = [];

    function unblock(u: string) {
      blocked.delete(u);
      const bSet = B.get(u);
      if (bSet) {
        for (const w of bSet) {
          if (blocked.has(w)) {
            unblock(w);
          }
        }
        bSet.clear();
      }
    }

    function circuit(v: string): boolean {
      if (cycles.length >= maxCycles) return false;
      let f = false;
      stack.push(v);
      blocked.add(v);

      const neighbors = adj.get(v) || [];
      for (const w of neighbors) {
        if (!sccSet.has(w)) continue;
        if (w === s) {
          cycles.push([...stack]);
          f = true;
          if (cycles.length >= maxCycles) break;
        } else if (!blocked.has(w)) {
          if (circuit(w)) {
            f = true;
          }
        }
      }

      if (f) {
        unblock(v);
      } else {
        for (const w of neighbors) {
          if (!sccSet.has(w)) continue;
          let bSet = B.get(w);
          if (!bSet) {
            bSet = new Set();
            B.set(w, bSet);
          }
          bSet.add(v);
        }
      }

      stack.pop();
      return f;
    }

    circuit(s);
    sIdx++;
  }

  // Sort cycles by length, then alphabetically for deterministic output
  cycles.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.join('>').localeCompare(b.join('>'));
  });

  return cycles;
}

/**
 * Computes fan-in and fan-out centrality metrics for every node.
 */
export function computeCentrality(
  nodes: { id: string }[],
  edges: { from: string; to: string }[]
): {
  fanInMap: Map<string, number>;
  fanOutMap: Map<string, number>;
  centrality: CentralityAnalysis;
} {
  const fanInMap = new Map<string, number>();
  const fanOutMap = new Map<string, number>();

  for (const node of nodes) {
    fanInMap.set(node.id, 0);
    fanOutMap.set(node.id, 0);
  }

  for (const edge of edges) {
    if (fanOutMap.has(edge.from)) {
      fanOutMap.set(edge.from, fanOutMap.get(edge.from)! + 1);
    }
    if (fanInMap.has(edge.to)) {
      fanInMap.set(edge.to, fanInMap.get(edge.to)! + 1);
    }
  }

  const topFanIn: NodeCentralityFanIn[] = nodes
    .map(n => ({ id: n.id, fanIn: fanInMap.get(n.id) || 0 }))
    .sort((a, b) => b.fanIn - a.fanIn || a.id.localeCompare(b.id))
    .slice(0, 10);

  const topFanOut: NodeCentralityFanOut[] = nodes
    .map(n => ({ id: n.id, fanOut: fanOutMap.get(n.id) || 0 }))
    .sort((a, b) => b.fanOut - a.fanOut || a.id.localeCompare(b.id))
    .slice(0, 10);

  return {
    fanInMap,
    fanOutMap,
    centrality: {
      topFanIn,
      topFanOut
    }
  };
}

/**
 * Heuristically identifies likely entry points in the project.
 */
export function detectEntryPoints(
  nodes: { id: string; path: string }[],
  fanInMap: Map<string, number>,
  rootDir?: string
): EntryPoint[] {
  const entryPointMap = new Map<string, string>();
  const nodeMap = new Map<string, { id: string; path: string }>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Determine root directory if not provided
  let detectedRoot = rootDir;
  if (!detectedRoot && nodes.length > 0) {
    const firstNode = nodes[0];
    const normPath = firstNode.path.replace(/\\/g, '/');
    const normId = firstNode.id.replace(/\\/g, '/');
    if (normPath.endsWith('/' + normId)) {
      detectedRoot = normPath.slice(0, -normId.length - 1);
    } else {
      detectedRoot = path.dirname(firstNode.path);
    }
  }

  // 1. package.json main / bin fields
  if (detectedRoot) {
    const pkgJsonPath = path.join(detectedRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgContent = fs.readFileSync(pkgJsonPath, 'utf8');
        const pkg = JSON.parse(pkgContent);

        // Helper to match a package.json path (e.g. dist/index.js, ./src/index.ts) to a graph node
        const findMatchingNode = (entryTarget: string): string | null => {
          if (!entryTarget || typeof entryTarget !== 'string') return null;
          const clean = entryTarget.replace(/^\.\//, '').replace(/\\/g, '/');

          // Direct match
          if (nodeMap.has(clean)) return clean;

          // If path points to dist/ or build/, check corresponding src/ or root
          const withoutDist = clean.replace(/^(dist|build)\//, '');
          const candidateBases = [clean, withoutDist, `src/${withoutDist}`];
          const extensionsToTry = ['.ts', '.tsx', '.js', '.jsx'];

          for (const base of candidateBases) {
            // Strip any existing extension then try source extensions
            const parsed = path.parse(base);
            const rawBase = path.join(parsed.dir, parsed.name).replace(/\\/g, '/');
            if (nodeMap.has(base)) return base;
            for (const ext of extensionsToTry) {
              const withExt = `${rawBase}${ext}`;
              if (nodeMap.has(withExt)) return withExt;
            }
          }

          return null;
        };

        if (pkg.main) {
          const matched = findMatchingNode(pkg.main);
          if (matched && !entryPointMap.has(matched)) {
            entryPointMap.set(matched, 'package.json main field');
          }
        }

        if (pkg.bin) {
          const binTargets: string[] = [];
          if (typeof pkg.bin === 'string') {
            binTargets.push(pkg.bin);
          } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
            binTargets.push(...Object.values(pkg.bin as Record<string, string>));
          }

          for (const binTarget of binTargets) {
            const matched = findMatchingNode(binTarget);
            if (matched && !entryPointMap.has(matched)) {
              entryPointMap.set(matched, 'package.json bin field');
            }
          }
        }
      } catch {
        // Ignore JSON parsing errors
      }
    }
  }

  // 2. Files literally named index.ts / index.js at the root of a directory with no incoming imports
  for (const node of nodes) {
    const fanIn = fanInMap.get(node.id) || 0;
    if (fanIn === 0) {
      const fileName = path.basename(node.id);
      if (/^index\.(ts|js|tsx|jsx)$/i.test(fileName)) {
        if (!entryPointMap.has(node.id)) {
          entryPointMap.set(node.id, 'Directory index file with no incoming imports');
        }
      }
    }
  }

  // 3. Next.js convention: files under pages/ or app/ matching route file patterns
  for (const node of nodes) {
    const normId = node.id.replace(/\\/g, '/');

    // Next.js Pages router: (src/)?pages/**/*.tsx|ts|jsx|js
    if (/^(src\/)?pages\/.+\.(tsx|ts|jsx|js)$/i.test(normId)) {
      if (!entryPointMap.has(node.id)) {
        entryPointMap.set(node.id, 'Next.js route convention');
      }
      continue;
    }

    // Next.js App router: (src/)?app/**/(page|layout|route|loading|error|not-found|template|default).(tsx|ts|jsx|js)
    if (
      /^(src\/)?app\/(.+\/)?(page|layout|route|loading|error|not-found|template|default)\.(tsx|ts|jsx|js)$/i.test(
        normId
      )
    ) {
      if (!entryPointMap.has(node.id)) {
        entryPointMap.set(node.id, 'Next.js route convention');
      }
    }
  }

  // 4. Express convention: files calling app.listen(...) or .(get|post|put|delete|patch)( directly
  for (const node of nodes) {
    if (entryPointMap.has(node.id)) continue;
    try {
      if (fs.existsSync(node.path)) {
        const content = fs.readFileSync(node.path, 'utf8');

        // Build pattern dynamically to prevent self-matching within analyzer source files
        const listenRegex = new RegExp('\\b(app|server)' + '\\.listen\\s*\\(');
        const routeRegex = new RegExp('\\b(app|router|server)' + '\\.(get|post|put|delete|patch)\\s*\\(');

        if (listenRegex.test(content)) {
          entryPointMap.set(node.id, 'Express server entry (app.listen)');
        } else if (routeRegex.test(content)) {
          entryPointMap.set(node.id, 'Express route definition');
        }
      }
    } catch {
      // Ignore file reading errors
    }
  }

  // 5. HTML script entry points (e.g. Vite index.html -> /src/main.tsx)
  if (detectedRoot) {
    const indexHtmlPath = path.join(detectedRoot, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      try {
        const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
        const scriptMatches = htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
        for (const match of scriptMatches) {
          const rawSrc = match[1].replace(/^\/+/, '').replace(/\\/g, '/');
          if (nodeMap.has(rawSrc) && !entryPointMap.has(rawSrc)) {
            entryPointMap.set(rawSrc, 'HTML script entry (index.html)');
          }
        }
      } catch {
        // Ignore file read error
      }
    }
  }

  const result: EntryPoint[] = Array.from(entryPointMap.entries()).map(([id, reason]) => ({
    id,
    reason
  }));

  // Sort deterministically by id
  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

/**
 * Detects orphan nodes: zero incoming edges and not an entry point.
 */
export function detectOrphans(
  nodes: { id: string }[],
  fanInMap: Map<string, number>,
  entryPoints: EntryPoint[]
): string[] {
  const entryPointSet = new Set(entryPoints.map(ep => ep.id));

  const orphans: string[] = nodes
    .filter(node => {
      const fanIn = fanInMap.get(node.id) || 0;
      return fanIn === 0 && !entryPointSet.has(node.id);
    })
    .map(node => node.id)
    .sort();

  return orphans;
}

/**
 * Performs complete graph analysis on an import dependency graph.
 *
 * @param graph Input dependency graph with { nodes, edges }
 * @param options Optional configuration including rootDir and maxCycles
 * @returns Enriched graph with analysis property
 */
export function analyzeDependencyGraph(
  graph: DependencyGraph,
  options?: AnalysisOptions
): AnalyzedGraph {
  const { nodes, edges } = graph;

  // 1. Centrality (fan-in / fan-out)
  const { fanInMap, centrality } = computeCentrality(nodes, edges);

  // 2. Entry point detection
  const entryPoints = detectEntryPoints(nodes, fanInMap, options?.rootDir);

  // 3. Orphan detection
  const orphans = detectOrphans(nodes, fanInMap, entryPoints);

  // 4. Cycle detection
  const cycles = detectCycles(nodes, edges, options?.maxCycles);

  const analysis: AnalysisResult = {
    cycles,
    orphans,
    entryPoints,
    centrality
  };

  // 5. Env/config usage tracing
  const rootDir = options?.rootDir ? path.resolve(options.rootDir) : process.cwd();
  let project: Project = (graph as any)._project;

  if (!project) {
    project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true }
    });
    for (const node of nodes) {
      if (fs.existsSync(node.path)) {
        project.addSourceFileAtPath(node.path);
      }
    }
  }

  const envUsage: EnvUsageResult = traceEnvUsage(project, nodes, edges, rootDir);

  // 6. Symbol-level usage tracing
  const symbolUsage: SymbolUsageItem[] = traceSymbolUsages(project, nodes, edges, rootDir);

  return {
    nodes,
    edges,
    analysis,
    envUsage,
    symbolUsage
  };
}
