import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { Core, EventObject } from 'cytoscape';
import type {
  GraphData,
  SelectedNodeInfo,
  SelectedEdgeInfo,
  SymbolUsageItem,
} from '../types';

interface GraphCanvasProps {
  graphData: GraphData;
  cycleNodesSet: Set<string>;
  cycleEdgesSet: Set<string>;
  orphanSet: Set<string>;
  entryPointMap: Map<string, string>;
  incomingMap: Map<string, string[]>;
  outgoingMap: Map<string, string[]>;
  symbolUsageByEdgeMap: Map<string, SymbolUsageItem[]>;
  onSelectNode: (info: SelectedNodeInfo) => void;
  onSelectEdge: (info: SelectedEdgeInfo) => void;
  onDeselect: () => void;
  // expose cy ref so parent can call focusNodeInGraph / selectEdgeByKey
  cyRef: React.MutableRefObject<Core | null>;
}

/**
 * Post-layout pass that checks bounding-box intersection using each node's
 * current dynamic width/height and repeatedly nudges overlapping pairs apart
 * until zero overlap remains.
 */
function enforceZeroOverlap(cyInstance: Core) {
  const nodes = cyInstance.nodes().filter((n: any) => !n.hasClass('hidden')).toArray();
  if (nodes.length <= 1) return;

  const PADDING = 18; // visual buffer between node bounding boxes
  const MAX_ITERATIONS = 120;

  // Pre-calculate effective dynamic dimensions and current positions
  const nodeData = nodes.map((n: any) => {
    const isEntryPoint = n.hasClass('entry-point-node') || Boolean(n.data('isEntryPoint'));
    const label = n.data('label') || '';

    let dynW: number;
    let dynH: number;

    if (isEntryPoint) {
      dynW = Math.max(100, Math.min(260, label.length * 8.5 + 40));
      dynH = Math.max(90, Math.round(dynW * 0.95));
    } else {
      dynW = Math.max(70, Math.min(220, label.length * 7.5 + 24));
      const lines = Math.ceil(label.length / 16);
      dynH = Math.max(38, Math.min(76, 28 + lines * 14));
    }

    const w = Math.max(n.outerWidth() || 0, dynW) + PADDING;
    const h = Math.max(n.outerHeight() || 0, dynH) + PADDING;
    const pos = { ...n.position() };

    return {
      node: n,
      w,
      h,
      pos,
    };
  });

  let iteration = 0;
  let hadOverlap = true;

  while (hadOverlap && iteration < MAX_ITERATIONS) {
    hadOverlap = false;
    iteration++;

    for (let i = 0; i < nodeData.length; i++) {
      const a = nodeData[i];
      for (let j = i + 1; j < nodeData.length; j++) {
        const b = nodeData[j];

        const dx = a.pos.x - b.pos.x;
        const dy = a.pos.y - b.pos.y;
        const overlapX = (a.w + b.w) / 2 - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          hadOverlap = true;

          // Nudge apart along minimum penetration axis
          if (overlapX < overlapY) {
            const shift = (overlapX / 2) + 2;
            const sign = dx >= 0 ? 1 : -1;
            a.pos.x += shift * sign;
            b.pos.x -= shift * sign;
          } else {
            const shift = (overlapY / 2) + 2;
            const sign = dy >= 0 ? 1 : -1;
            a.pos.y += shift * sign;
            b.pos.y -= shift * sign;
          }
        }
      }
    }
  }

  // Batch update all node positions in Cytoscape
  cyInstance.batch(() => {
    for (const item of nodeData) {
      item.node.position(item.pos);
    }
  });
}

export default function GraphCanvas({
  graphData,
  cycleNodesSet,
  cycleEdgesSet,
  orphanSet,
  entryPointMap,
  incomingMap,
  outgoingMap,
  symbolUsageByEdgeMap,
  onSelectNode,
  onSelectEdge,
  onDeselect,
  cyRef,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    // Build Nodes
    for (const node of graphData.nodes || []) {
      const isCycle = cycleNodesSet.has(node.id);
      const isOrphan = orphanSet.has(node.id);
      const isEntryPoint = entryPointMap.has(node.id);
      const label = node.id.split('/').pop() || node.id;
      const fanIn = incomingMap.get(node.id)?.length || 0;
      const fanOut = outgoingMap.get(node.id)?.length || 0;

      const classes: string[] = [];
      if (isCycle) classes.push('cycle-node');
      if (isOrphan) classes.push('orphan-node');
      if (isEntryPoint) classes.push('entry-point-node');

      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label,
          fullPath: node.path,
          fanIn,
          fanOut,
          isCycle,
          isOrphan,
          isEntryPoint,
          entryPointReason: entryPointMap.get(node.id) || '',
          incoming: incomingMap.get(node.id) || [],
          outgoing: outgoingMap.get(node.id) || [],
        },
        classes: classes.join(' '),
      });
    }

    // Build Edges
    for (const edge of graphData.edges || []) {
      const edgeKey = `${edge.from}->${edge.to}`;
      const isCycle = cycleEdgesSet.has(edgeKey);
      const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
      const hasSymbols = symbols.length > 0;
      const isTypeOnly = hasSymbols && symbols.every(s => s.typeOnly);

      const classes: string[] = [];
      if (isCycle) {
        classes.push('cycle-edge');
      } else if (hasSymbols) {
        classes.push(isTypeOnly ? 'type-only-edge' : 'traced-edge');
      } else {
        classes.push('untraced-edge');
      }

      elements.push({
        group: 'edges',
        data: {
          id: edgeKey,
          source: edge.from,
          target: edge.to,
          isCycle,
          hasSymbols,
          isTypeOnly,
          symbolCount: symbols.length,
        },
        classes: classes.join(' '),
      });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // Standard Nodes
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': '#1e3a5f',
            color: '#e5e5e5',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-family': 'Rubik, sans-serif',
            width: (node: any): any => {
              const label = node.data('label') || '';
              return Math.max(70, Math.min(220, label.length * 7.5 + 24));
            },
            height: (node: any): any => {
              const label = node.data('label') || '';
              const lines = Math.ceil(label.length / 16);
              return Math.max(38, Math.min(76, 28 + lines * 14));
            },
            padding: '10px',
            shape: 'rectangle',
            'border-width': 2,
            'border-color': '#4a9eff',
            'text-wrap': 'wrap',
            'text-max-width': (node: any): any => {
              const label = node.data('label') || '';
              return Math.max(70, Math.min(220, label.length * 7.5 + 24)) - 20;
            },
          },
        },
        // Entry Point Nodes: Amber Diamond
        {
          selector: 'node.entry-point-node',
          style: {
            shape: 'diamond',
            width: (node: any): any => {
              const label = node.data('label') || '';
              return Math.max(100, Math.min(260, label.length * 8.5 + 40));
            },
            height: (node: any): any => {
              const label = node.data('label') || '';
              const baseWidth = Math.max(100, Math.min(260, label.length * 8.5 + 40));
              return Math.max(90, Math.round(baseWidth * 0.95));
            },
            'border-width': 3,
            'border-color': '#f59e0b',
            'background-color': '#92400e',
            color: '#e5e5e5',
            'font-weight': 600,
            'font-family': 'Rubik, sans-serif',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': (node: any): any => {
              const label = node.data('label') || '';
              const baseWidth = Math.max(100, Math.min(260, label.length * 8.5 + 40));
              return Math.round(baseWidth * 0.58);
            },
          },
        },
        // Cycle Nodes: Red
        {
          selector: 'node.cycle-node',
          style: {
            'background-color': '#7f1d1d',
            'border-color': '#ef4444',
            'border-width': 3,
            color: '#e5e5e5',
            'font-weight': 600,
            'font-family': 'Rubik, sans-serif',
          },
        },
        // Orphan Nodes: Dimmed Gray
        {
          selector: 'node.orphan-node',
          style: {
            'background-color': '#1a1a1a',
            'border-color': '#4a4a4a',
            'border-style': 'dashed',
            color: '#888888',
            opacity: 0.65,
            'font-family': 'Rubik, sans-serif',
          },
        },
        // Selected Node
        {
          selector: 'node:selected',
          style: {
            'border-width': 3.5,
            'border-color': '#e5e5e5',
            'underlay-color': '#e5e5e5',
            'underlay-padding': 5,
            'underlay-opacity': 0.15,
            'z-index': 99,
          },
        },
        // Env Active Highlight
        {
          selector: 'node.env-active',
          style: {
            'border-width': 3.5,
            'border-color': '#f59e0b',
            'underlay-color': '#f59e0b',
            'underlay-padding': 6,
            'underlay-opacity': 0.25,
            'z-index': 80,
          },
        },
        // Search Match
        {
          selector: 'node.search-match',
          style: {
            'border-width': 3.5,
            'border-color': '#10b981',
            'underlay-color': '#10b981',
            'underlay-padding': 6,
            'underlay-opacity': 0.25,
            'z-index': 85,
          },
        },
        // Dimmed
        { selector: 'node.dimmed', style: { opacity: 0.15 } },
        { selector: 'node.hidden', style: { display: 'none' } },
        // Highlighted Connection
        {
          selector: 'node.highlighted-connection',
          style: {
            'border-width': 3,
            'border-color': '#ffffff',
            'underlay-color': '#ffffff',
            'underlay-padding': 8,
            'underlay-opacity': 0.3,
            'z-index': 95,
          },
        },
        // Base Edges
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#cccccc',
            'target-arrow-color': '#cccccc',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.2,
            opacity: 0.7,
            'underlay-color': '#e5e5e5',
            'underlay-padding': 6,
            'underlay-opacity': 0,
          },
        },
        // Traced Runtime Symbol Edges
        {
          selector: 'edge.traced-edge',
          style: {
            width: 2.5,
            'line-color': '#60a5fa',
            'target-arrow-color': '#60a5fa',
            'line-style': 'solid',
            opacity: 0.9,
            'z-index': 5,
          },
        },
        // Type-Only Import Edges
        {
          selector: 'edge.type-only-edge',
          style: {
            width: 2.2,
            'line-color': '#a78bfa',
            'target-arrow-color': '#a78bfa',
            'line-style': 'dotted',
            opacity: 0.8,
            'z-index': 4,
          },
        },
        // Untraced Import Edges
        {
          selector: 'edge.untraced-edge',
          style: {
            width: 1.8,
            'line-color': '#999999',
            'target-arrow-color': '#999999',
            'line-style': 'dashed',
            opacity: 0.5,
            'z-index': 2,
          },
        },
        // Cycle Edges
        {
          selector: 'edge.cycle-edge',
          style: {
            width: 3.5,
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            'line-style': 'solid',
            'arrow-scale': 1.5,
            opacity: 1,
            'z-index': 10,
          },
        },
        // Selected Edge
        {
          selector: 'edge:selected',
          style: {
            width: 3.5,
            'line-color': '#e5e5e5',
            'target-arrow-color': '#e5e5e5',
            'arrow-scale': 1.4,
            opacity: 1,
            'z-index': 99,
          },
        },
        { selector: 'edge.dimmed', style: { opacity: 0.08 } },
        { selector: 'edge.hidden', style: { display: 'none' } },
        // Highlighted Edge
        {
          selector: 'edge.highlighted-edge',
          style: {
            width: 4,
            'line-color': '#ffffff',
            'target-arrow-color': '#ffffff',
            'arrow-scale': 1.6,
            opacity: 1,
            'z-index': 95,
          },
        },
      ],
      layout: { name: 'null' },
      minZoom: 0.2,
      maxZoom: 3,
    });

    cyRef.current = cy;
    (window as any).__cy = cy;

    // Run layout with avoidOverlap: true explicitly confirmed, followed by zero-overlap post-pass
    const layout = cy.layout({
      name: 'cose',
      animate: false,
      componentSpacing: 140,
      nodeOverlap: 40,
      nodeRepulsion: () => 900000,
      idealEdgeLength: () => 150,
      edgeElasticity: () => 100,
      nestingFactor: 5,
      gravity: 60,
      numIter: 1200,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0,
      avoidOverlap: true,
    });

    let hasEnforced = false;
    const runPostLayoutPass = () => {
      if (hasEnforced) return;
      hasEnforced = true;
      enforceZeroOverlap(cy);
      cy.fit(undefined, 40);
    };

    layout.one('layoutstop', runPostLayoutPass);
    layout.run();
    runPostLayoutPass();

    // Node tap
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target as cytoscape.NodeSingular;
      const data = node.data() as SelectedNodeInfo;
      onSelectNode(data);

      cy.batch(() => {
        cy.elements().removeClass('dimmed highlighted-connection highlighted-edge');
        const outgoingEdges = node.outgoers('edge');
        const targetNodes = outgoingEdges.targets();
        cy.elements().not(node).not(outgoingEdges).not(targetNodes).addClass('dimmed');
        outgoingEdges.addClass('highlighted-edge');
        targetNodes.addClass('highlighted-connection');
      });
    });

    // Edge tap
    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      const data = edge.data();
      const edgeKey = `${data.source}->${data.target}`;
      const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];

      onSelectEdge({
        id: edgeKey,
        source: data.source,
        target: data.target,
        isCycle: Boolean(data.isCycle),
        hasTracedSymbols: symbols.length > 0,
        symbolUsages: symbols,
      });
      cy.elements().removeClass('dimmed highlighted-connection highlighted-edge');
    });

    // Background tap (deselect)
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        onDeselect();
        cy.elements().removeClass('dimmed highlighted-connection highlighted-edge');
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData, cycleNodesSet, cycleEdgesSet, orphanSet, entryPointMap, incomingMap, outgoingMap, symbolUsageByEdgeMap]);

  return (
    <div className="graph-canvas-container">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
