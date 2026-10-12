import { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
import type { Core, EventObject } from 'cytoscape';
import sampleGraphData from './sample-graph.json';
import {
  walkDirectoryHandle,
  filterFileList,
  createZipBundle,
  type ScannedFile
} from './folderScanner';
import './App.css';

interface GraphNode {
  id: string;
  path: string;
}

interface GraphEdge {
  from: string;
  to: string;
}

interface EntryPoint {
  id: string;
  reason: string;
}

interface CentralityItem {
  id: string;
  fanIn?: number;
  fanOut?: number;
}

interface AnalysisResult {
  cycles: string[][];
  orphans: string[];
  entryPoints: EntryPoint[];
  centrality: {
    topFanIn: CentralityItem[];
    topFanOut: CentralityItem[];
  };
}

interface DeclaredEnvKey {
  key: string;
  declaredIn: string[];
}

interface DirectEnvUsage {
  key: string;
  file: string;
  kind: 'direct';
  pattern: string;
}

interface TransitiveEnvUsage {
  key: string;
  file: string;
  kind: 'transitive';
  via: string;
}

type EnvUsageItem = DirectEnvUsage | TransitiveEnvUsage;

interface DynamicAccess {
  file: string;
  note: string;
}

interface EnvUsageResult {
  declaredKeys: DeclaredEnvKey[];
  usages: EnvUsageItem[];
  dynamicAccesses: DynamicAccess[];
}

interface SymbolUsageItem {
  importedSymbol: string;
  fromFile: string;
  usedInFile: string;
  usedInScope: string;
  line: number;
  typeOnly: boolean;
  note?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  analysis: AnalysisResult;
  envUsage?: EnvUsageResult;
  symbolUsage?: SymbolUsageItem[];
}

interface SelectedNodeInfo {
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

interface SelectedEdgeInfo {
  id: string;
  source: string;
  target: string;
  isCycle: boolean;
  hasTracedSymbols: boolean;
  symbolUsages: SymbolUsageItem[];
}

type InputMode = 'github' | 'folder';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<InputMode>('github');
  const [graphData, setGraphData] = useState<GraphData>(sampleGraphData as GraphData);
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Cloning & Analyzing...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentSource, setCurrentSource] = useState<string>('sample-graph.json');

  // Inspection Selection State
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(null);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEnvFilter, setSelectedEnvFilter] = useState<string>('none');
  const [selectedCycleFilter, setSelectedCycleFilter] = useState<string>('all');
  const [hideOrphans, setHideOrphans] = useState<boolean>(false);
  const [entryPathFocus, setEntryPathFocus] = useState<boolean>(false);

  // Modals & Legend
  const [showDynamicModal, setShowDynamicModal] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  // Precompute lookup maps and relationships
  const {
    cycleNodesSet,
    cycleEdgesSet,
    orphanSet,
    entryPointMap,
    incomingMap,
    outgoingMap,
    symbolUsageByEdgeMap,
    nodeEnvUsageMap,
    unusedDeclaredKeys,
    allEnvKeys
  } = useMemo(() => {
    const cycleNodes = new Set<string>(graphData.analysis?.cycles?.flat() || []);
    const cycleEdges = new Set<string>();

    for (const cycle of graphData.analysis?.cycles || []) {
      for (let i = 0; i < cycle.length; i++) {
        const from = cycle[i];
        const to = cycle[(i + 1) % cycle.length];
        cycleEdges.add(`${from}->${to}`);
      }
    }

    const orphans = new Set<string>(graphData.analysis?.orphans || []);
    const entryPoints = new Map<string, string>();
    for (const ep of graphData.analysis?.entryPoints || []) {
      entryPoints.set(ep.id, ep.reason);
    }

    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    for (const edge of graphData.edges || []) {
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      incoming.get(edge.to)!.push(edge.from);

      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from)!.push(edge.to);
    }

    // Map symbol usages by edge key: `${consumerFile}->${supplierFile}`
    const symbolMap = new Map<string, SymbolUsageItem[]>();
    for (const item of graphData.symbolUsage || []) {
      const edgeKey = `${item.usedInFile}->${item.fromFile}`;
      if (!symbolMap.has(edgeKey)) symbolMap.set(edgeKey, []);
      symbolMap.get(edgeKey)!.push(item);
    }

    // Map env usages by file
    const nodeEnvMap = new Map<string, EnvUsageItem[]>();
    const usedEnvKeysSet = new Set<string>();
    for (const item of graphData.envUsage?.usages || []) {
      usedEnvKeysSet.add(item.key);
      if (!nodeEnvMap.has(item.file)) nodeEnvMap.set(item.file, []);
      nodeEnvMap.get(item.file)!.push(item);
    }

    // Unused declared keys
    const unusedKeys: DeclaredEnvKey[] = [];
    const allKeysSet = new Set<string>();
    for (const decl of graphData.envUsage?.declaredKeys || []) {
      allKeysSet.add(decl.key);
      if (!usedEnvKeysSet.has(decl.key)) {
        unusedKeys.push(decl);
      }
    }
    for (const k of usedEnvKeysSet) {
      allKeysSet.add(k);
    }

    return {
      cycleNodesSet: cycleNodes,
      cycleEdgesSet: cycleEdges,
      orphanSet: orphans,
      entryPointMap: entryPoints,
      incomingMap: incoming,
      outgoingMap: outgoing,
      symbolUsageByEdgeMap: symbolMap,
      nodeEnvUsageMap: nodeEnvMap,
      unusedDeclaredKeys: unusedKeys,
      allEnvKeys: Array.from(allKeysSet).sort()
    };
  }, [graphData]);

  // Mode 1: GitHub URL Analysis
  const handleAnalyzeGithub = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = repoUrl.trim();
    if (!url) return;

    setLoading(true);
    setLoadingStatus('Cloning & Analyzing GitHub repo...');
    setErrorMessage(null);
    setSelectedNode(null);
    setSelectedEdge(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setGraphData(data as GraphData);
      const parts = url.replace(/\.git$/, '').split('/');
      const shortName = parts.slice(-2).join('/');
      setCurrentSource(shortName || url);
    } catch (err: any) {
      console.error('Analyze failed:', err);
      setErrorMessage(err.message || 'Failed to analyze repository');
    } finally {
      setLoading(false);
    }
  };

  // Mode 2: Local Folder Processing
  const processAndUploadFiles = async (files: ScannedFile[], folderName: string) => {
    if (files.length === 0) {
      setErrorMessage('No supported source files (.ts, .tsx, .js, .jsx) found in the selected folder.');
      return;
    }

    const totalBytes = files.reduce((acc, curr) => acc + curr.file.size, 0);
    const maxBytes = 50 * 1024 * 1024;
    if (totalBytes > maxBytes) {
      const sizeMb = (totalBytes / (1024 * 1024)).toFixed(1);
      setErrorMessage(`Selected source files exceed the 50MB limit (${sizeMb}MB). Please select a smaller folder.`);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSelectedNode(null);
    setSelectedEdge(null);

    try {
      setLoadingStatus(`Packaging ${files.length} files (${(totalBytes / 1024).toFixed(0)} KB)...`);
      const zipBlob = await createZipBundle(files);

      setLoadingStatus(`Uploading & Analyzing ${folderName}...`);
      const formData = new FormData();
      formData.append('bundle', zipBlob, `${folderName}.zip`);

      const res = await fetch('/api/analyze-upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Upload analysis failed (${res.status})`);
      }

      setGraphData(data as GraphData);
      setCurrentSource(folderName);
    } catch (err: any) {
      console.error('Local folder analysis error:', err);
      setErrorMessage(err.message || 'Failed to analyze local folder');
    } finally {
      setLoading(false);
    }
  };

  const handlePickLocalFolder = async () => {
    setErrorMessage(null);
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        const folderName = dirHandle.name || 'local-folder';
        setLoading(true);
        setLoadingStatus(`Scanning folder ${folderName}...`);
        const files = await walkDirectoryHandle(dirHandle);
        await processAndUploadFiles(files, folderName);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('showDirectoryPicker failed, falling back to input:', err);
        fileInputRef.current?.click();
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFallbackInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const firstPath = fileList[0].webkitRelativePath || fileList[0].name;
    const folderName = firstPath.split('/')[0] || 'local-folder';
    const files = filterFileList(fileList);
    e.target.value = '';
    await processAndUploadFiles(files, folderName);
  };

  // Cytoscape Canvas Initialization Effect
  useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    // Construct Nodes
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
          outgoing: outgoingMap.get(node.id) || []
        },
        classes: classes.join(' ')
      });
    }

    // Construct Edges with precise symbol classification
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
          symbolCount: symbols.length
        },
        classes: classes.join(' ')
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
            'background-color': '#3b82f6',
            color: '#f8fafc',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-family': 'ui-sans-serif, system-ui, sans-serif',
            width: 'label',
            height: 28,
            padding: '7px',
            shape: 'round-rectangle',
            'border-width': 1.5,
            'border-color': '#2563eb',
            'text-max-width': '120px',
            'text-wrap': 'ellipsis'
          }
        },
        // Entry Points: Amber Diamond
        {
          selector: 'node.entry-point-node',
          style: {
            shape: 'diamond',
            width: 44,
            height: 44,
            'border-width': 3,
            'border-color': '#f59e0b',
            'background-color': '#d97706',
            'font-weight': 600
          }
        },
        // Cycles: Distinct Red
        {
          selector: 'node.cycle-node',
          style: {
            'background-color': '#ef4444',
            'border-color': '#b91c1c',
            'border-width': 3,
            'font-weight': 600
          }
        },
        // Orphans: Muted Slate with Dashed Border
        {
          selector: 'node.orphan-node',
          style: {
            'background-color': '#475569',
            'border-color': '#334155',
            'border-style': 'dashed',
            opacity: 0.5
          }
        },
        // Selected Node Highlight
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#38bdf8',
            'underlay-color': '#38bdf8',
            'underlay-padding': 5,
            'underlay-opacity': 0.35,
            'z-index': 99
          }
        },
        // Active Env Highlight
        {
          selector: 'node.env-active',
          style: {
            'border-width': 3.5,
            'border-color': '#f59e0b',
            'underlay-color': '#f59e0b',
            'underlay-padding': 6,
            'underlay-opacity': 0.45,
            'z-index': 80
          }
        },
        // Search Match Highlight
        {
          selector: 'node.search-match',
          style: {
            'border-width': 3.5,
            'border-color': '#10b981',
            'underlay-color': '#10b981',
            'underlay-padding': 6,
            'underlay-opacity': 0.4,
            'z-index': 85
          }
        },
        // Dimmed / Hidden States
        {
          selector: 'node.dimmed',
          style: {
            opacity: 0.12
          }
        },
        {
          selector: 'node.hidden',
          style: {
            display: 'none'
          }
        },
        // Base Edges
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.1,
            opacity: 0.65,
            'underlay-color': '#38bdf8',
            'underlay-padding': 6,
            'underlay-opacity': 0
          }
        },
        // Traced Runtime Symbol Edges: Vibrant Solid Sky
        {
          selector: 'edge.traced-edge',
          style: {
            width: 2.2,
            'line-color': '#38bdf8',
            'target-arrow-color': '#38bdf8',
            'line-style': 'solid',
            opacity: 0.9,
            'z-index': 5
          }
        },
        // Type-Only Import Edges: Dotted Violet
        {
          selector: 'edge.type-only-edge',
          style: {
            width: 1.8,
            'line-color': '#a78bfa',
            'target-arrow-color': '#a78bfa',
            'line-style': 'dotted',
            opacity: 0.75,
            'z-index': 4
          }
        },
        // Untraced Import Edges: Dashed Slate
        {
          selector: 'edge.untraced-edge',
          style: {
            width: 1.4,
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            'line-style': 'dashed',
            opacity: 0.45,
            'z-index': 2
          }
        },
        // Cycle Edges: Vibrant Solid Red
        {
          selector: 'edge.cycle-edge',
          style: {
            width: 3.2,
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            'line-style': 'solid',
            'arrow-scale': 1.4,
            opacity: 1,
            'z-index': 10
          }
        },
        // Selected Edge: Glowing Gold
        {
          selector: 'edge:selected',
          style: {
            width: 3.8,
            'line-color': '#facc15',
            'target-arrow-color': '#facc15',
            'arrow-scale': 1.5,
            opacity: 1,
            'z-index': 99
          }
        },
        {
          selector: 'edge.dimmed',
          style: {
            opacity: 0.08
          }
        },
        {
          selector: 'edge.hidden',
          style: {
            display: 'none'
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: false,
        componentSpacing: 100,
        nodeOverlap: 20,
        nodeRepulsion: () => 600000,
        idealEdgeLength: () => 120,
        edgeElasticity: () => 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000
      },
      minZoom: 0.2,
      maxZoom: 3
    });

    cyRef.current = cy;

    // Node Interaction
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target as cytoscape.NodeSingular;
      const data = node.data() as SelectedNodeInfo;
      setSelectedEdge(null);
      setSelectedNode(data);
    });

    // Edge Interaction (Symbol precision inspector)
    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      const data = edge.data();
      const edgeKey = `${data.source}->${data.target}`;
      const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];

      setSelectedNode(null);
      setSelectedEdge({
        id: edgeKey,
        source: data.source,
        target: data.target,
        isCycle: Boolean(data.isCycle),
        hasTracedSymbols: symbols.length > 0,
        symbolUsages: symbols
      });
    });

    // Background Canvas Tap (Deselect)
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData, cycleNodesSet, cycleEdgesSet, orphanSet, entryPointMap, incomingMap, outgoingMap, symbolUsageByEdgeMap]);

  // Non-Janky Filter & Search Updates (Instant class toggle without re-layout)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      // 1. Reset dynamic filter classes
      cy.elements().removeClass('dimmed search-match env-active hidden');

      // 2. Hide Orphans Filter
      if (hideOrphans) {
        cy.elements('node.orphan-node').addClass('hidden');
      }

      // 3. Entry Path Focus Filter
      if (entryPathFocus) {
        const entryNodes = cy.elements('node.entry-point-node');
        const outgoingEdges = entryNodes.outgoers('edge');
        const directDeps = outgoingEdges.targets();
        const activeEles = entryNodes.union(outgoingEdges).union(directDeps);
        cy.elements().not(activeEles).addClass('dimmed');
      }

      // 4. Cycle Filter
      if (selectedCycleFilter !== 'all') {
        const idx = parseInt(selectedCycleFilter, 10);
        const cycle = graphData.analysis?.cycles?.[idx] || [];
        const cycleSet = new Set(cycle);
        const cycleNodes = cy.nodes().filter(n => cycleSet.has(n.id()));
        const cycleEdges = cy.edges().filter(e => {
          const s = e.data('source');
          const t = e.data('target');
          for (let i = 0; i < cycle.length; i++) {
            if (cycle[i] === s && cycle[(i + 1) % cycle.length] === t) return true;
          }
          return false;
        });
        const activeCycleEles = cycleNodes.union(cycleEdges);
        cy.elements().not(activeCycleEles).addClass('dimmed');
      }

      // 5. Env Key Filter
      if (selectedEnvFilter !== 'none') {
        const activeFiles = new Set(
          (graphData.envUsage?.usages || [])
            .filter(u => u.key === selectedEnvFilter)
            .map(u => u.file)
        );
        const activeNodes = cy.nodes().filter(n => activeFiles.has(n.id()));
        activeNodes.addClass('env-active');
        cy.nodes().not(activeNodes).addClass('dimmed');
        cy.edges().addClass('dimmed');
      }

      // 6. Text Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchNodes = cy.nodes().filter(n => {
          const id = n.id().toLowerCase();
          const label = (n.data('label') || '').toLowerCase();
          return id.includes(q) || label.includes(q);
        });
        matchNodes.addClass('search-match');
        cy.nodes().not(matchNodes).addClass('dimmed');
        cy.edges().addClass('dimmed');
      }
    });
  }, [searchQuery, selectedEnvFilter, selectedCycleFilter, hideOrphans, entryPathFocus, graphData]);

  // Jump to specific node in Cytoscape
  const focusNodeInGraph = (nodeId: string) => {
    if (!cyRef.current) return;
    const node = cyRef.current.getElementById(nodeId);
    if (node && node.length > 0) {
      cyRef.current.nodes().unselect();
      cyRef.current.edges().unselect();
      node.select();
      cyRef.current.animate({
        center: { eles: node },
        zoom: 1.25,
        duration: 250
      });
      const data = node.data() as SelectedNodeInfo;
      setSelectedEdge(null);
      setSelectedNode(data);
    }
  };

  // Jump to specific edge in Cytoscape (for symbol inspection)
  const selectEdgeByKey = (edgeKey: string) => {
    if (!cyRef.current) return;
    const edge = cyRef.current.getElementById(edgeKey);
    const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
    const [source, target] = edgeKey.split('->');
    if (!source || !target) return;
    const isCycle = cycleEdgesSet.has(edgeKey);

    cyRef.current.nodes().unselect();
    cyRef.current.edges().unselect();
    if (edge && edge.length > 0) {
      edge.select();
      cyRef.current.animate({
        center: { eles: edge },
        duration: 250
      });
    }
    setSelectedNode(null);
    setSelectedEdge({
      id: edgeKey,
      source,
      target,
      isCycle,
      hasTracedSymbols: symbols.length > 0,
      symbolUsages: symbols
    });
  };

  const handleFit = () => cyRef.current?.fit(undefined, 40);
  const handleZoomIn = () => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 0.8);

  const selectedNodeEnvUsages = selectedNode ? (nodeEnvUsageMap.get(selectedNode.id) || []) : [];
  const dynamicAccesses = graphData.envUsage?.dynamicAccesses || [];
  const totalSymbolsTraced = graphData.symbolUsage?.length || 0;

  return (
    <div className="app-container">
      {/* Hidden file input for webkitdirectory fallback */}
      <input
        ref={fileInputRef}
        type="file"
        id="hidden-folder-input"
        {...({ webkitdirectory: '', directory: '' } as any)}
        multiple
        onChange={handleFallbackInputChange}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <header className="app-header">
        {/* Top Row: Brand, Source, Input Mode, Metrics */}
        <div className="header-top-row">
          <div className="brand-section">
            <span className="brand-logo">
              <span>Cockpit</span>
            </span>
            <span className="source-badge" title={currentSource}>
              {currentSource}
            </span>
          </div>

          {/* Quick Metrics */}
          <div className="metrics-group">
            <span className="metric-pill">
              <strong>{graphData.nodes?.length || 0}</strong> Nodes
            </span>
            <span className="metric-pill">
              <strong>{graphData.edges?.length || 0}</strong> Edges
            </span>
            <span className={`metric-pill ${(graphData.analysis?.cycles?.length || 0) > 0 ? 'danger' : ''}`}>
              <strong>{graphData.analysis?.cycles?.length || 0}</strong> Cycles
            </span>
            <span className="metric-pill">
              <strong>{graphData.analysis?.orphans?.length || 0}</strong> Orphans
            </span>
            <span className="metric-pill warning">
              <strong>{graphData.analysis?.entryPoints?.length || 0}</strong> Entry Points
            </span>
            <span className="metric-pill info">
              <strong>{totalSymbolsTraced}</strong> Symbols Traced
            </span>

            {/* Dynamic Access Warnings Badge */}
            {dynamicAccesses.length > 0 && (
              <span
                id="dynamic-access-badge"
                className="metric-pill warning clickable"
                onClick={() => setShowDynamicModal(true)}
                title="Click to inspect unresolvable dynamic process.env accesses"
              >
                ⚠ <strong>{dynamicAccesses.length}</strong> Dynamic Accesses
              </span>
            )}

            {/* Unused Declared Keys Badge */}
            {unusedDeclaredKeys.length > 0 && (
              <span
                className="metric-pill warning clickable"
                onClick={() => {
                  if (unusedDeclaredKeys[0]) {
                    setSelectedEnvFilter(unusedDeclaredKeys[0].key);
                  }
                }}
                title={`${unusedDeclaredKeys.length} config keys declared in .env but never referenced in code`}
              >
                <strong>{unusedDeclaredKeys.length}</strong> Unused Env Keys
              </span>
            )}
          </div>

          {/* Input Mode Tabs & Form */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '320px' }}>
            <div style={{ display: 'flex', background: '#0b1120', padding: '2px', borderRadius: '6px', border: '1px solid #334155' }}>
              <button
                type="button"
                id="mode-github-tab"
                onClick={() => setInputMode('github')}
                style={{
                  background: inputMode === 'github' ? '#2563eb' : 'transparent',
                  color: inputMode === 'github' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                GitHub URL
              </button>
              <button
                type="button"
                id="mode-folder-tab"
                onClick={() => setInputMode('folder')}
                style={{
                  background: inputMode === 'folder' ? '#2563eb' : 'transparent',
                  color: inputMode === 'folder' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Local Folder
              </button>
            </div>

            {inputMode === 'github' ? (
              <form onSubmit={handleAnalyzeGithub} style={{ display: 'flex', gap: '6px', flex: 1 }}>
                <input
                  id="github-url-input"
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  disabled={loading}
                  style={{
                    flex: 1,
                    background: '#0b1120',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button
                  id="analyze-repo-button"
                  type="submit"
                  disabled={loading || !repoUrl.trim()}
                  style={{
                    background: loading ? '#475569' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: loading || !repoUrl.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>
              </form>
            ) : (
              <button
                type="button"
                id="pick-folder-button"
                onClick={handlePickLocalFolder}
                disabled={loading}
                style={{
                  flex: 1,
                  background: loading ? '#475569' : '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Processing...' : '📁 Select Local Folder'}
              </button>
            )}
          </div>
        </div>

        {/* Second Row: Search & Filters Toolbar */}
        <div className="header-toolbar-row">
          <div className="toolbar-left">
            {/* 1. Text Search Input */}
            <div className="search-box">
              <span>🔍</span>
              <input
                id="node-search-input"
                type="text"
                placeholder="Search file path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 2. Env Key Filter Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Env Var:</span>
              <select
                id="env-key-filter"
                className="select-filter"
                value={selectedEnvFilter}
                onChange={(e) => setSelectedEnvFilter(e.target.value)}
              >
                <option value="none">-- All (No Env Filter) --</option>
                {allEnvKeys.map(k => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Cycle Filter Dropdown */}
            {(graphData.analysis?.cycles?.length || 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cycle:</span>
                <select
                  id="cycle-select-filter"
                  className="select-filter"
                  value={selectedCycleFilter}
                  onChange={(e) => setSelectedCycleFilter(e.target.value)}
                >
                  <option value="all">-- All Cycles ({graphData.analysis?.cycles?.length}) --</option>
                  {graphData.analysis.cycles.map((cycle, idx) => (
                    <option key={idx} value={String(idx)}>
                      Cycle {idx + 1} ({cycle.length} files)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 4. Filter Toggles */}
            <button
              type="button"
              id="toggle-hide-orphans"
              className={`filter-toggle ${hideOrphans ? 'active' : ''}`}
              onClick={() => setHideOrphans(prev => !prev)}
            >
              {hideOrphans ? '👁 Showing Orphans Hidden' : '🚫 Hide Orphans'}
            </button>

            <button
              type="button"
              id="toggle-entry-path-focus"
              className={`filter-toggle ${entryPathFocus ? 'active' : ''}`}
              onClick={() => setEntryPathFocus(prev => !prev)}
              title="Filter to only entry point files and their direct outgoing imports"
            >
              {entryPathFocus ? '★ Entry Path Active' : '☆ Focus Entry Points'}
            </button>
          </div>

          <div className="toolbar-right">
            <button
              type="button"
              className={`filter-toggle ${showLegend ? 'active' : ''}`}
              onClick={() => setShowLegend(prev => !prev)}
              style={{ fontSize: '11px' }}
            >
              ℹ Legend
            </button>
          </div>
        </div>

        {/* Global Loading / Error Notification Bar */}
        {loading && (
          <div style={{ background: '#1d4ed8', color: '#eff6ff', padding: '5px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⏳</span>
            <span>{loadingStatus}</span>
          </div>
        )}
        {errorMessage && (
          <div style={{ background: '#991b1b', color: '#fee2e2', padding: '6px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚠ {errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              style={{ background: 'transparent', border: 'none', color: '#fee2e2', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* Workspace Area: Graph Canvas + Side Inspector Panel */}
      <div className="workspace-container">
        {/* Cytoscape Canvas */}
        <div className="graph-canvas-container">
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

          {/* Floating Zoom / Fit Controls */}
          <div className="canvas-controls">
            <button type="button" className="canvas-btn" onClick={handleFit} title="Fit Entire Graph">
              Fit
            </button>
            <button type="button" className="canvas-btn" onClick={handleZoomIn} title="Zoom In">
              +
            </button>
            <button type="button" className="canvas-btn" onClick={handleZoomOut} title="Zoom Out">
              −
            </button>
          </div>

          {/* Collapsible Legend Bar */}
          {showLegend && (
            <div className="legend-bar">
              <div className="legend-group">
                <span className="legend-group-title">Nodes</span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#3b82f6' }} /> Standard
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#ef4444' }} /> Cycle
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#d97706', transform: 'rotate(45deg)' }} /> Entry Point
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#475569', border: '1px dashed #94a3b8' }} /> Orphan
                </span>
              </div>

              <div style={{ width: '1px', height: '14px', background: 'var(--border-default)' }} />

              <div className="legend-group">
                <span className="legend-group-title">Edges</span>
                <span className="legend-item">
                  <span className="legend-line" style={{ background: '#38bdf8' }} /> Traced Runtime
                </span>
                <span className="legend-item">
                  <span className="legend-line" style={{ borderTop: '2px dotted #a78bfa' }} /> Type-Only
                </span>
                <span className="legend-item">
                  <span className="legend-line" style={{ borderTop: '2px dashed #64748b' }} /> Untraced Import
                </span>
                <span className="legend-item">
                  <span className="legend-line" style={{ background: '#ef4444', height: '3px' }} /> Cycle
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Inspector Side Panel */}
        <aside className="side-panel">
          {selectedNode ? (
            /* Node Inspector View */
            <>
              <div className="panel-header">
                <div className="panel-title">
                  <span>📄 File Inspector</span>
                </div>
                <button type="button" className="panel-close-btn" onClick={() => setSelectedNode(null)}>
                  ✕
                </button>
              </div>

              <div className="panel-body">
                {/* Node Identity Card */}
                <div className="inspector-card">
                  <div className="card-title">File Node</div>
                  <div className="card-value" style={{ fontWeight: 600, color: '#e0f2fe' }}>
                    {selectedNode.id}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {selectedNode.fullPath}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {selectedNode.isEntryPoint && (
                      <span className="metric-pill warning">★ Entry Point ({selectedNode.entryPointReason})</span>
                    )}
                    {selectedNode.isCycle && <span className="metric-pill danger">↻ Cycle Member</span>}
                    {selectedNode.isOrphan && <span className="metric-pill">∅ Orphan</span>}
                    <span className="metric-pill">Fan-In: {selectedNode.fanIn}</span>
                    <span className="metric-pill">Fan-Out: {selectedNode.fanOut}</span>
                  </div>
                </div>

                {/* Environment Variables Usage Card (Part A.1) */}
                <div className="inspector-card" id="node-env-usage-card">
                  <div className="card-title">
                    <span>Environment Variables ({selectedNodeEnvUsages.length})</span>
                    {selectedNodeEnvUsages.length > 0 && <span className="badge-env-direct">Active</span>}
                  </div>

                  {selectedNodeEnvUsages.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedNodeEnvUsages.map((env, i) => (
                        <div key={i} className="env-usage-row">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span className="env-key-name">{env.key}</span>
                            <span className={env.kind === 'direct' ? 'badge-env-direct' : 'badge-env-transitive'}>
                              {env.kind.toUpperCase()}
                            </span>
                          </div>
                          {env.kind === 'direct' ? (
                            <div className="env-chain">
                              Pattern: <strong style={{ color: '#f8fafc' }}>{env.pattern}</strong>
                            </div>
                          ) : (
                            <div className="env-chain">
                              Transitive via:{' '}
                              <span
                                className="via-link"
                                onClick={() => focusNodeInGraph(env.via)}
                                title="Click to inspect supplier in graph"
                              >
                                {env.via}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      No environment variables referenced directly or transitively in this file.
                    </div>
                  )}
                </div>

                {/* Outgoing Imports Card */}
                <div className="inspector-card">
                  <div className="card-title">
                    <span>Direct Imports ({selectedNode.outgoing.length})</span>
                  </div>
                  {selectedNode.outgoing.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {selectedNode.outgoing.map((outId, i) => {
                        const edgeKey = `${selectedNode.id}->${outId}`;
                        const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
                        return (
                          <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => focusNodeInGraph(outId)}
                              style={{
                                flex: 1,
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                textAlign: 'left',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-mono)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={`Inspect file ${outId}`}
                            >
                              → {outId}
                            </button>
                            <button
                              type="button"
                              onClick={() => selectEdgeByKey(edgeKey)}
                              title={symbols.length > 0 ? `Inspect ${symbols.length} traced symbols on this import edge` : 'Inspect import edge'}
                              style={{
                                background: symbols.length > 0 ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-input)',
                                border: `1px solid ${symbols.length > 0 ? 'rgba(56, 189, 248, 0.4)' : 'var(--border-subtle)'}`,
                                color: symbols.length > 0 ? 'var(--accent-sky)' : 'var(--text-muted)',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {symbols.length > 0 ? `Symbols (${symbols.length})` : 'Edge'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No internal imports.</div>
                  )}
                </div>

                {/* Incoming Consumers Card */}
                <div className="inspector-card">
                  <div className="card-title">
                    <span>Depended Upon By ({selectedNode.incoming.length})</span>
                  </div>
                  {selectedNode.incoming.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {selectedNode.incoming.map((inId, i) => {
                        const edgeKey = `${inId}->${selectedNode.id}`;
                        const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
                        return (
                          <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => focusNodeInGraph(inId)}
                              style={{
                                flex: 1,
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                textAlign: 'left',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-mono)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={`Inspect file ${inId}`}
                            >
                              ← {inId}
                            </button>
                            <button
                              type="button"
                              onClick={() => selectEdgeByKey(edgeKey)}
                              title={symbols.length > 0 ? `Inspect ${symbols.length} traced symbols on this import edge` : 'Inspect import edge'}
                              style={{
                                background: symbols.length > 0 ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-input)',
                                border: `1px solid ${symbols.length > 0 ? 'rgba(56, 189, 248, 0.4)' : 'var(--border-subtle)'}`,
                                color: symbols.length > 0 ? 'var(--accent-sky)' : 'var(--text-muted)',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {symbols.length > 0 ? `Symbols (${symbols.length})` : 'Edge'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No incoming dependencies.</div>
                  )}
                </div>
              </div>
            </>
          ) : selectedEdge ? (
            /* Edge Inspector View (Part A.2 Symbol Usage Panel) */
            <>
              <div className="panel-header">
                <div className="panel-title">
                  <span>🔗 Import Edge Inspector</span>
                </div>
                <button type="button" className="panel-close-btn" onClick={() => setSelectedEdge(null)}>
                  ✕
                </button>
              </div>

              <div className="panel-body">
                {/* Edge Identity Card */}
                <div className="inspector-card">
                  <div className="card-title">Dependency Edge</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Consumer File (Importing):
                      <div
                        className="via-link"
                        style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '12px' }}
                        onClick={() => focusNodeInGraph(selectedEdge.source)}
                      >
                        {selectedEdge.source}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Supplier File (Exporting):
                      <div
                        className="via-link"
                        style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '12px' }}
                        onClick={() => focusNodeInGraph(selectedEdge.target)}
                      >
                        {selectedEdge.target}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {selectedEdge.isCycle && <span className="metric-pill danger">↻ Circular Edge</span>}
                    {selectedEdge.hasTracedSymbols ? (
                      <span className="badge-runtime">Traced Symbols: {selectedEdge.symbolUsages.length}</span>
                    ) : (
                      <span className="metric-pill">Untraced Import</span>
                    )}
                  </div>
                </div>

                {/* Symbol Usages Breakdown Card (Part A.2) */}
                <div className="inspector-card" id="edge-symbols-card">
                  <div className="card-title">
                    <span>Traced Symbols ({selectedEdge.symbolUsages.length})</span>
                  </div>

                  {selectedEdge.symbolUsages.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedEdge.symbolUsages.map((sym, i) => (
                        <div key={i} className="symbol-usage-row">
                          <div className="symbol-name-bar">
                            <span className="symbol-name">{sym.importedSymbol}</span>
                            <span className={sym.typeOnly ? 'badge-typeonly' : 'badge-runtime'}>
                              {sym.typeOnly ? 'TYPE-ONLY' : 'RUNTIME'}
                            </span>
                          </div>
                          <div className="symbol-meta">
                            <span>
                              Scope: <strong style={{ color: '#f8fafc' }}>{sym.usedInScope}</strong>
                            </span>
                            <span>•</span>
                            <span>Line: {sym.line}</span>
                          </div>
                          {sym.note && (
                            <div style={{ fontSize: '10px', color: 'var(--accent-amber)', fontStyle: 'italic' }}>
                              Note: {sym.note}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      No specific symbol references were traced across this import edge (barrel re-export, side-effect import, or dynamic access).
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Empty State / Repository Overview */
            <>
              <div className="panel-header">
                <div className="panel-title">
                  <span>📊 Repository Overview</span>
                </div>
              </div>

              <div className="panel-body">
                <div className="inspector-card">
                  <div style={{ textAlign: 'center', padding: '16px 8px' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      Select a File Node or Import Edge
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                      Click any node to trace environment variables & dependencies, or click an edge to inspect symbol-level scopes.
                    </div>
                  </div>
                </div>

                {/* Declared Config Keys Card */}
                {(graphData.envUsage?.declaredKeys?.length || 0) > 0 && (
                  <div className="inspector-card">
                    <div className="card-title">
                      <span>Declared Config ({graphData.envUsage?.declaredKeys.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {graphData.envUsage?.declaredKeys.map((dk, i) => {
                        const isUsed = (graphData.envUsage?.usages || []).some(u => u.key === dk.key);
                        return (
                          <div
                            key={i}
                            className="env-usage-row clickable"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedEnvFilter(dk.key)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span className="env-key-name">{dk.key}</span>
                              <span className={isUsed ? 'badge-env-direct' : 'badge-env-transitive'} style={{ color: isUsed ? '#fcd34d' : '#f87171' }}>
                                {isUsed ? 'REFERENCED' : 'UNUSED'}
                              </span>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              Declared in: {dk.declaredIn.join(', ')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Dynamic Access Warnings Modal (Part A.3) */}
      {showDynamicModal && (
        <div className="modal-overlay" onClick={() => setShowDynamicModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
                <span>⚠ Dynamic Access Warnings ({dynamicAccesses.length})</span>
              </span>
              <button
                type="button"
                className="panel-close-btn"
                onClick={() => setShowDynamicModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                These files use dynamic bracket syntax (e.g. <code>process.env[varName]</code>) that cannot be resolved statically. They represent analysis blind spots:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dynamicAccesses.map((item, idx) => (
                  <div
                    key={idx}
                    className="inspector-card clickable"
                    onClick={() => {
                      setShowDynamicModal(false);
                      focusNodeInGraph(item.file);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        {item.file}
                      </span>
                      <span className="metric-pill warning">Focus Node →</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {item.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
