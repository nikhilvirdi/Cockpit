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
  envUsageEdgesSet: Set<string>;
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

  const PADDING = 20; // visual buffer between node bounding boxes
  const MAX_ITERATIONS = 120;

  // Pre-calculate effective dynamic dimensions and current positions
  const nodeData = nodes.map((n: any) => {
    const isEntryPoint = n.hasClass('entry-point-node') || Boolean(n.data('isEntryPoint'));
    const label = n.data('label') || '';

    let dynW: number;
    let dynH: number;

    if (isEntryPoint) {
      // Entry point node: diamond inside 160px x 160px box
      dynW = 160;
      dynH = 160;
    } else {
      // Standard file node: min-w 190px max-w 280px
      dynW = Math.max(190, Math.min(280, label.length * 10 + 40));
      const lines = Math.ceil((label.length * 9.5) / 240);
      dynH = Math.max(50, Math.min(84, 34 + lines * 18));
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
  envUsageEdgesSet,
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

    // Build Edges with 5 Edge Types
    for (const edge of graphData.edges || []) {
      const edgeKey = `${edge.from}->${edge.to}`;
      const isCycle = cycleEdgesSet.has(edgeKey);
      const isEnvUsage = envUsageEdgesSet.has(edgeKey);
      const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
      const hasSymbols = symbols.length > 0;
      const isTypeOnly = hasSymbols && symbols.every(s => s.typeOnly);
      const hasRuntimeSymbols = hasSymbols && symbols.some(s => !s.typeOnly);

      const classes: string[] = [];
      if (isCycle) {
        // 1. Cycle edges: dashed '6 4', 1.5px, var(--accent-error)
        classes.push('cycle-edge');
      } else if (isEnvUsage) {
        // 2. Env-usage edges: dashed '6 4', 1.5px, var(--accent-warning)
        classes.push('env-usage-edge');
      } else if (hasRuntimeSymbols) {
        // 3. Symbol-usage edges: solid, 1.5px, var(--accent-info)
        classes.push('symbol-usage-edge');
      } else if (isTypeOnly || !hasSymbols) {
        // 4. Type-only or untraced edges: dashed '6 4', 1.5px, var(--text-muted)
        classes.push(isTypeOnly ? 'type-only-edge' : 'untraced-edge');
      } else {
        // 5. Import (traced, default flow): solid, 1.5px, var(--connector-line)
        classes.push('import-edge');
      }

      elements.push({
        group: 'edges',
        data: {
          id: edgeKey,
          source: edge.from,
          target: edge.to,
          isCycle,
          isEnvUsage,
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
        // ── 3. Standard File Node: rounded rect, 6px radius, 1px solid var(--node-border), bg var(--node-bg), min-w 190px max-w 280px
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': '#161616', // var(--node-bg)
            color: '#f0f0f0', // var(--text-primary)
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '15px',
            'font-weight': 500,
            'font-family': 'Nunito, -apple-system, BlinkMacSystemFont, sans-serif',
            width: (node: any): any => {
              const label = node.data('label') || '';
              return Math.max(190, Math.min(280, label.length * 10 + 40));
            },
            height: (node: any): any => {
              const label = node.data('label') || '';
              const lines = Math.ceil((label.length * 9.5) / 240);
              return Math.max(50, Math.min(84, 34 + lines * 18));
            },
            padding: '16px',
            shape: 'round-rectangle',
            'corner-radius': '6px',
            'border-width': 1,
            'border-color': '#ffffff', // var(--node-border)
            'border-opacity': 1,
            'text-wrap': 'wrap',
            'text-max-width': (node: any): any => {
              const label = node.data('label') || '';
              return Math.max(190, Math.min(280, label.length * 10 + 40)) - 32;
            },
            'transition-property': 'opacity, border-color, width, height',
            'transition-duration': 0.3,
            'transition-timing-function': 'ease-out',
          },
        },
        // ── Entry Point Node: diamond 113x113 in 160x160 box, same border/bg tokens, bold text
        {
          selector: 'node.entry-point-node',
          style: {
            shape: 'diamond',
            width: 160,
            height: 160,
            'border-width': 1,
            'border-color': '#ffffff',
            'border-opacity': 1,
            'background-color': '#161616',
            color: '#f0f0f0',
            'font-weight': 700,
            'font-size': '15px',
            'font-family': 'Nunito, -apple-system, BlinkMacSystemFont, sans-serif',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '100px',
          },
        },
        // ── Cycle Node
        {
          selector: 'node.cycle-node',
          style: {
            shape: 'round-rectangle',
            'corner-radius': '6px',
            'background-color': '#161616',
            'border-color': '#f85149', // var(--accent-error)
            'border-width': 1,
            'border-opacity': 1,
            color: '#f85149',
            'font-weight': 600,
            'font-family': 'Nunito, -apple-system, BlinkMacSystemFont, sans-serif',
          },
        },
        // ── Orphan Node: dashed border var(--text-muted), fill opacity ~0.5
        {
          selector: 'node.orphan-node',
          style: {
            shape: 'round-rectangle',
            'corner-radius': '6px',
            'background-color': '#161616',
            'background-opacity': 0.5,
            'border-color': '#8a8a8a', // var(--text-muted)
            'border-style': 'dashed',
            'border-dash-pattern': [6, 4],
            'border-width': 1,
            'border-opacity': 0.8,
            color: '#8a8a8a',
            'font-size': '15px',
            'font-weight': 500,
            'font-family': 'Nunito, -apple-system, BlinkMacSystemFont, sans-serif',
          },
        },
        // ── 5. Hover/Focus Interaction States
        // Focused node gets border-color var(--connector-active) + box-shadow 0 0 0 1px var(--connector-active)
        {
          selector: 'node.focused, node:selected',
          style: {
            'border-width': 1,
            'border-color': '#a0a0a0', // var(--connector-active)
            'border-opacity': 1,
            'underlay-color': '#a0a0a0',
            'underlay-padding': 1,
            'underlay-opacity': 0.8,
            'underlay-shape': 'round-rectangle',
            'z-index': 99,
          },
        },
        // Direct neighbors of focused node get border-color var(--accent-primary) + matching box-shadow
        {
          selector: 'node.neighbor, node.highlighted-connection',
          style: {
            'border-width': 1,
            'border-color': '#a0a0a0', // var(--accent-primary)
            'border-opacity': 1,
            'underlay-color': '#a0a0a0',
            'underlay-padding': 1,
            'underlay-opacity': 0.5,
            'underlay-shape': 'round-rectangle',
            'z-index': 95,
          },
        },
        // Env active highlight
        {
          selector: 'node.env-active',
          style: {
            'border-width': 1,
            'border-color': '#d29922', // var(--accent-warning)
            'border-opacity': 1,
            'underlay-color': '#d29922',
            'underlay-padding': 1,
            'underlay-opacity': 0.6,
            'z-index': 80,
          },
        },
        // Search match
        {
          selector: 'node.search-match',
          style: {
            'border-width': 1,
            'border-color': '#58a6ff', // var(--accent-info)
            'border-opacity': 1,
            'underlay-color': '#58a6ff',
            'underlay-padding': 1,
            'underlay-opacity': 0.6,
            'z-index': 85,
          },
        },
        // Dimmed nodes (opacity 0.3)
        { selector: 'node.dimmed', style: { opacity: 0.3 } },
        { selector: 'node.hidden', style: { display: 'none' } },

        // ── 2. EDGE COLOR-TO-MEANING MAPPING (5 Edge Types)
        // Base edge settings (all arrowheads: solid triangle matching edge stroke color)
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#ffffff', // var(--connector-line)
            'target-arrow-color': '#ffffff',
            'target-arrow-shape': 'triangle',
            'target-arrow-fill': 'filled',
            'curve-style': 'bezier',
            'arrow-scale': 1.1,
            opacity: 1,
            'underlay-opacity': 0,
            'transition-property': 'opacity, line-color, target-arrow-color, width',
            'transition-duration': 0.3,
            'transition-timing-function': 'ease-out',
          },
        },
        // 1) Import (traced, default flow): solid, 1.5px, var(--connector-line) [#ffffff]
        {
          selector: 'edge.import-edge',
          style: {
            width: 1.5,
            'line-color': '#ffffff',
            'target-arrow-color': '#ffffff',
            'line-style': 'solid',
            opacity: 1,
            'z-index': 3,
          },
        },
        // 2) Symbol-usage edges: solid, 1.5px, var(--accent-info) [#58a6ff]
        {
          selector: 'edge.symbol-usage-edge, edge.traced-edge',
          style: {
            width: 1.5,
            'line-color': '#58a6ff',
            'target-arrow-color': '#58a6ff',
            'line-style': 'solid',
            opacity: 1,
            'z-index': 4,
          },
        },
        // 3) Env-usage edges: dashed '6 4', 1.5px, var(--accent-warning) [#d29922]
        {
          selector: 'edge.env-usage-edge',
          style: {
            width: 1.5,
            'line-color': '#d29922',
            'target-arrow-color': '#d29922',
            'line-style': 'dashed',
            'line-dash-pattern': [6, 4],
            opacity: 1,
            'z-index': 5,
          },
        },
        // 4) Cycle edges: dashed '6 4', 1.5px, var(--accent-error) [#f85149]
        {
          selector: 'edge.cycle-edge',
          style: {
            width: 1.5,
            'line-color': '#f85149',
            'target-arrow-color': '#f85149',
            'line-style': 'dashed',
            'line-dash-pattern': [6, 4],
            opacity: 1,
            'z-index': 10,
          },
        },
        // 5) Type-only / untraced edges: dashed '6 4', 1.5px, var(--text-muted) [#8a8a8a]
        {
          selector: 'edge.type-only-edge, edge.untraced-edge',
          style: {
            width: 1.5,
            'line-color': '#8a8a8a',
            'target-arrow-color': '#8a8a8a',
            'line-style': 'dashed',
            'line-dash-pattern': [6, 4],
            opacity: 1,
            'z-index': 2,
          },
        },
        // Selected / Highlighted Edges
        {
          selector: 'edge:selected, edge.highlighted-edge',
          style: {
            width: 2,
            opacity: 1,
            'z-index': 99,
          },
        },
        // Dimmed edges (opacity 0.3)
        { selector: 'edge.dimmed', style: { opacity: 0.3 } },
        { selector: 'edge.hidden', style: { display: 'none' } },
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

    // Node tap handler (powers focus + neighbor + blast-radius highlighting)
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target as cytoscape.NodeSingular;
      const data = node.data() as SelectedNodeInfo;
      onSelectNode(data);

      cy.batch(() => {
        cy.elements().removeClass('dimmed highlighted-connection highlighted-edge focused neighbor');
        const outgoingEdges = node.outgoers('edge');
        const incomingEdges = node.incomers('edge');
        const directEdges = outgoingEdges.union(incomingEdges);
        const neighbors = directEdges.connectedNodes().not(node);

        // Blast radius: full downstream dependency chain
        const successors = node.successors();
        const activeChain = node.union(successors);
        const activeEdges = activeChain.connectedEdges().filter((e: any) => {
          return activeChain.contains(e.source()) && activeChain.contains(e.target());
        });
        const allActiveEles = activeChain.union(activeEdges).union(neighbors).union(directEdges);

        // Dim unrelated nodes and edges to opacity 0.3
        cy.elements().not(allActiveEles).addClass('dimmed');
        node.addClass('focused');
        neighbors.addClass('neighbor');
        activeEdges.union(directEdges).addClass('highlighted-edge');
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
      cy.elements().removeClass('dimmed highlighted-connection highlighted-edge focused neighbor');
    });

    // Background tap (deselect)
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        onDeselect();
        cy.elements().removeClass('dimmed highlighted-connection highlighted-edge focused neighbor');
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData, cycleNodesSet, cycleEdgesSet, envUsageEdgesSet, orphanSet, entryPointMap, incomingMap, outgoingMap, symbolUsageByEdgeMap]);

  return (
    <div className="graph-canvas-container">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
