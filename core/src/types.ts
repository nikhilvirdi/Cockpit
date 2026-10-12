export interface GraphNode {
  id: string;
  path: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphEngineOptions {
  tsConfigPath?: string;
}

export interface EntryPoint {
  id: string;
  reason: string;
}

export interface NodeCentralityFanIn {
  id: string;
  fanIn: number;
}

export interface NodeCentralityFanOut {
  id: string;
  fanOut: number;
}

export interface CentralityAnalysis {
  topFanIn: NodeCentralityFanIn[];
  topFanOut: NodeCentralityFanOut[];
}

export interface AnalysisResult {
  cycles: string[][];
  orphans: string[];
  entryPoints: EntryPoint[];
  centrality: CentralityAnalysis;
}

export interface AnalyzedGraph extends DependencyGraph {
  analysis: AnalysisResult;
}

export interface AnalysisOptions {
  rootDir?: string;
  maxCycles?: number;
}
