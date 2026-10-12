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
