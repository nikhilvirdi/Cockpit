import { useMemo } from 'react';
import {
  GraphCanvas,
  Sphere,
  darkTheme,
  type GraphNode as ReagraphNode,
  type GraphEdge as ReagraphEdge,
  type Theme,
  type NodeRendererProps,
} from 'reagraph';
import type {
  GraphData,
  SelectedNodeInfo,
  SelectedEdgeInfo,
  SymbolUsageItem,
} from '../types';

interface GraphCanvasReagraphProps {
  graphData: GraphData;
  cycleNodesSet: Set<string>;
  cycleEdgesSet: Set<string>;
  envUsageEdgesSet: Set<string>;
  orphanSet: Set<string>;
  entryPointMap: Map<string, string>;
  incomingMap: Map<string, string[]>;
  outgoingMap: Map<string, string[]>;
  symbolUsageByEdgeMap: Map<string, SymbolUsageItem[]>;
  selectedNodeId?: string;
  onSelectNode: (info: SelectedNodeInfo) => void;
  onSelectEdge: (info: SelectedEdgeInfo) => void;
  onDeselect: () => void;
}

// Cockpit monochrome dark theme for Reagraph (Pipeline Anatomy palette)
const cockpitReagraphTheme: Theme = {
  ...darkTheme,
  canvas: {
    background: '#000000', // var(--bg-canvas)
  },
  node: {
    ...darkTheme.node,
    fill: '#161616', // var(--node-bg)
    activeFill: '#a0a0a0', // var(--connector-active)
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.3, // opacity 0.3 requested
    label: {
      stroke: '#000000',
      color: '#f0f0f0', // var(--text-primary)
      activeColor: '#a0a0a0',
    },
  },
  edge: {
    ...darkTheme.edge,
    fill: '#ffffff', // var(--connector-line)
    activeFill: '#a0a0a0',
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.3, // opacity 0.3 requested
  },
  arrow: {
    ...darkTheme.arrow,
    fill: '#ffffff',
    activeFill: '#a0a0a0',
  },
};

export default function GraphCanvasReagraph({
  graphData,
  cycleNodesSet,
  cycleEdgesSet,
  envUsageEdgesSet,
  orphanSet,
  entryPointMap,
  incomingMap,
  outgoingMap,
  symbolUsageByEdgeMap,
  selectedNodeId,
  onSelectNode,
  onSelectEdge,
  onDeselect,
}: GraphCanvasReagraphProps) {
  // Map Cockpit graph data to Reagraph nodes
  const reagraphNodes = useMemo<ReagraphNode[]>(() => {
    return (graphData.nodes || []).map((node) => {
      const isCycle = cycleNodesSet.has(node.id);
      const isOrphan = orphanSet.has(node.id);
      const isEntryPoint = entryPointMap.has(node.id);
      const label = node.id.split('/').pop() || node.id;

      let fill = '#161616';
      let size = 12;

      if (isCycle) {
        fill = '#f85149'; // var(--accent-error)
        size = 13;
      } else if (isEntryPoint) {
        fill = '#ffffff'; // var(--node-border)
        size = 18;
      } else if (isOrphan) {
        fill = '#8a8a8a'; // var(--text-muted)
        size = 9;
      }

      return {
        id: node.id,
        label,
        fill,
        size,
        data: {
          fullPath: node.path,
          isCycle,
          isOrphan,
          isEntryPoint,
          entryPointReason: entryPointMap.get(node.id) || '',
        },
      };
    });
  }, [graphData.nodes, cycleNodesSet, orphanSet, entryPointMap]);

  // Map Cockpit edges to Reagraph edges (5 edge types)
  const reagraphEdges = useMemo<ReagraphEdge[]>(() => {
    return (graphData.edges || []).map((edge) => {
      const edgeKey = `${edge.from}->${edge.to}`;
      const isCycle = cycleEdgesSet.has(edgeKey);
      const isEnvUsage = envUsageEdgesSet.has(edgeKey);
      const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
      const hasSymbols = symbols.length > 0;
      const isTypeOnly = hasSymbols && symbols.every((s) => s.typeOnly);
      const hasRuntimeSymbols = hasSymbols && symbols.some((s) => !s.typeOnly);

      let fill = '#ffffff'; // var(--connector-line)
      let size = 1.5;
      let dashed = false;

      if (isCycle) {
        // Cycle edges: dashed '6 4', 1.5px, var(--accent-error)
        fill = '#f85149';
        size = 1.5;
        dashed = true;
      } else if (isEnvUsage) {
        // Env-usage edges: dashed '6 4', 1.5px, var(--accent-warning)
        fill = '#d29922';
        size = 1.5;
        dashed = true;
      } else if (hasRuntimeSymbols) {
        // Symbol-usage edges: solid, 1.5px, var(--accent-info)
        fill = '#58a6ff';
        size = 1.5;
        dashed = false;
      } else if (isTypeOnly || !hasSymbols) {
        // Type-only/untraced edges: dashed '6 4', 1.5px, var(--text-muted)
        fill = '#8a8a8a';
        size = 1.5;
        dashed = true;
      } else {
        // Import (traced default flow): solid, 1.5px, var(--connector-line)
        fill = '#ffffff';
        size = 1.5;
        dashed = false;
      }

      return {
        id: edgeKey,
        source: edge.from,
        target: edge.to,
        fill,
        size,
        dashed,
        data: {
          isCycle,
          isEnvUsage,
          hasSymbols,
          symbols,
        },
      };
    });
  }, [graphData.edges, cycleEdgesSet, envUsageEdgesSet, symbolUsageByEdgeMap]);

  // Calculate active highlighted set for selected node (blast radius)
  const activeIds = useMemo(() => {
    if (!selectedNodeId) return undefined;
    const incoming = incomingMap.get(selectedNodeId) || [];
    const outgoing = outgoingMap.get(selectedNodeId) || [];
    const connectedEdges: string[] = [];

    for (const inc of incoming) {
      connectedEdges.push(`${inc}->${selectedNodeId}`);
    }
    for (const out of outgoing) {
      connectedEdges.push(`${selectedNodeId}->${out}`);
    }

    return [selectedNodeId, ...incoming, ...outgoing, ...connectedEdges];
  }, [selectedNodeId, incomingMap, outgoingMap]);

  const selectedIds = useMemo(() => {
    return selectedNodeId ? [selectedNodeId] : [];
  }, [selectedNodeId]);

  // Custom node renderer: Render diamond for entry points, standard sphere for others
  const renderCustomNode = (props: NodeRendererProps) => {
    if (props.node.data?.isEntryPoint) {
      const color = props.selected ? '#a0a0a0' : (props.node.fill || '#ffffff');
      return (
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[props.size * 1.4, props.size * 1.4, props.size * 0.4]} />
          <meshStandardMaterial
            color={color}
            opacity={props.opacity}
            transparent
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>
      );
    }
    return <Sphere {...props} />;
  };

  return (
    <div className="graph-canvas-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GraphCanvas
        nodes={reagraphNodes}
        edges={reagraphEdges}
        layoutType="nooverlap"
        theme={cockpitReagraphTheme}
        cameraMode="pan"
        edgeArrowPosition="end"
        edgeInterpolation="curved"
        labelType="all"
        actives={activeIds}
        selections={selectedIds}
        draggable={false}
        animated={false}
        renderNode={renderCustomNode}
        onNodeClick={(node) => {
          const nData = node.data || {};
          const fullPath = nData.fullPath || node.id;
          const label = node.label || node.id.split('/').pop() || node.id;
          const fanIn = incomingMap.get(node.id)?.length || 0;
          const fanOut = outgoingMap.get(node.id)?.length || 0;

          onSelectNode({
            id: node.id,
            label,
            fullPath,
            fanIn,
            fanOut,
            isCycle: Boolean(nData.isCycle),
            isOrphan: Boolean(nData.isOrphan),
            isEntryPoint: Boolean(nData.isEntryPoint),
            entryPointReason: nData.entryPointReason || '',
            incoming: incomingMap.get(node.id) || [],
            outgoing: outgoingMap.get(node.id) || [],
          });
        }}
        onEdgeClick={(edge) => {
          const edgeKey = edge.id || `${edge.source}->${edge.target}`;
          const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];

          onSelectEdge({
            id: edgeKey,
            source: edge.source,
            target: edge.target,
            isCycle: cycleEdgesSet.has(edgeKey),
            hasTracedSymbols: symbols.length > 0,
            symbolUsages: symbols,
          });
        }}
        onCanvasClick={() => {
          onDeselect();
        }}
      />
    </div>
  );
}
