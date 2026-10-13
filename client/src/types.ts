// Shared types for Cockpit graph data and UI state

export interface GraphNode {
  id: string;
  path: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface EntryPoint {
  id: string;
  reason: string;
}

export interface CentralityItem {
  id: string;
  fanIn?: number;
  fanOut?: number;
}

export interface AnalysisResult {
  cycles: string[][];
  orphans: string[];
  entryPoints: EntryPoint[];
  centrality: {
    topFanIn: CentralityItem[];
    topFanOut: CentralityItem[];
  };
}

export interface DeclaredEnvKey {
  key: string;
  declaredIn: string[];
}

export interface DirectEnvUsage {
  key: string;
  file: string;
  kind: 'direct';
  pattern: string;
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

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  analysis: AnalysisResult;
  envUsage?: EnvUsageResult;
  symbolUsage?: SymbolUsageItem[];
}

export interface SelectedNodeInfo {
  id: string;
  label: string;
  fullPath: string;
  fanIn: number;
  fanOut: number;
  isCycle: boolean;
  isOrphan: boolean;
  isEntryPoint: boolean;
  entryPointReason: string;
  incoming: string[];
  outgoing: string[];
}

export interface SelectedEdgeInfo {
  id: string;
  source: string;
  target: string;
  isCycle: boolean;
  hasTracedSymbols: boolean;
  symbolUsages: SymbolUsageItem[];
}

export type InputMode = 'github' | 'folder';
