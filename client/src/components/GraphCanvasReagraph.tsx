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

// Cockpit custom dark theme for Reagraph
const cockpitReagraphTheme: Theme = {
  ...darkTheme,
  canvas: {
    background: '#0a0a0a',
  },
  node: {
    ...darkTheme.node,
    fill: '#1e3a5f',
    activeFill: '#ffffff',
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.15,
    label: {
      stroke: '#0a0a0a',
      color: '#e5e5e5',
      activeColor: '#ffffff',
    },
  },
  edge: {
    ...darkTheme.edge,
    fill: '#666666',
    activeFill: '#ffffff',
    opacity: 0.75,
    selectedOpacity: 1,
    inactiveOpacity: 0.1,
  },
  arrow: {
    ...darkTheme.arrow,
    fill: '#666666',
    activeFill: '#ffffff',
  },
};

export default function GraphCanvasReagraph({
  graphData,
  cycleNodesSet,
  cycleEdgesSet,
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

      let fill = '#1e3a5f';
      let size = 11;

      if (isCycle) {
        fill = '#ef4444';
        size = 13;
      } else if (isEntryPoint) {
        fill = '#f59e0b';
        // Distinct size and diamond shape
        size = 18;
      } else if (isOrphan) {
        fill = '#383838';
        size = 8;
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

  // Map Cockpit edges to Reagraph edges
  const reagraphEdges = useMemo<ReagraphEdge[]>(() => {
    return (graphData.edges || []).map((edge) => {
      const edgeKey = `${edge.from}->${edge.to}`;
      const isCycle = cycleEdgesSet.has(edgeKey);
      const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
      const hasSymbols = symbols.length > 0;
      const isTypeOnly = hasSymbols && symbols.every((s) => s.typeOnly);

      let fill = '#666666';
      let size = 1;
      let dashed = false;

      if (isCycle) {
        fill = '#ef4444';
        size = 3;
      } else if (hasSymbols) {
        if (isTypeOnly) {
          fill = '#a78bfa';
          size = 1.8;
          dashed = true;
        } else {
          fill = '#60a5fa';
          size = 2.2;
        }
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
          hasSymbols,
          symbols,
        },
      };
    });
  }, [graphData.edges, cycleEdgesSet, symbolUsageByEdgeMap]);

  // Calculate active highlighted set for selected node
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
      const color = props.selected ? '#ffffff' : (props.node.fill || '#f59e0b');
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
