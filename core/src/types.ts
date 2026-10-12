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

export interface DeclaredEnvKey {
  key: string;
  declaredIn: string[];
}

export type DirectUsagePattern =
  | 'export-const'
  | 'export-object'
  | 'destructure'
  | 'function-return'
  | 'member-access';

export interface DirectEnvUsage {
  key: string;
  file: string;
  kind: 'direct';
  pattern: DirectUsagePattern;
}

export interface TransitiveEnvUsage {
  key: string;
  file: string;
  kind: 'transitive';
  via: string;
}

export type EnvUsageItem = DirectEnvUsage | TransitiveEnvUsage;

export interface DynamicAccess {
  file: string;
  note: string;
}

export interface EnvUsageResult {
  declaredKeys: DeclaredEnvKey[];
  usages: EnvUsageItem[];
  dynamicAccesses: DynamicAccess[];
}

export interface SymbolUsageItem {
  importedSymbol: string;
  fromFile: string;
  usedInFile: string;
  usedInScope: string;
  line: number;
  typeOnly: boolean;
  note?: string;
}

export interface AnalyzedGraph extends DependencyGraph {
  analysis: AnalysisResult;
  envUsage: EnvUsageResult;
  symbolUsage: SymbolUsageItem[];
}

export interface AnalysisOptions {
  rootDir?: string;
  maxCycles?: number;
}

