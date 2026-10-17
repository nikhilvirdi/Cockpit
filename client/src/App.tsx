import { useEffect, useRef, useState, useMemo } from 'react';
import type { Core } from 'cytoscape';
import sampleGraphData from './sample-graph.json';
import {
  walkDirectoryHandle,
  filterFileList,
  createZipBundle,
  type ScannedFile,
} from './folderScanner';
import type {
  GraphData,
  SelectedNodeInfo,
  SelectedEdgeInfo,
  InputMode,
  EnvUsageItem,
  SymbolUsageItem,
  DeclaredEnvKey,
} from './types';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import GraphCanvas from './components/GraphCanvas';
import GraphCanvasReagraph from './components/GraphCanvasReagraph';
import FileInspector from './components/FileInspector';

import './App.css';

export default function App() {
  const cyRef = useRef<Core | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<InputMode>('github');
  const [graphData, setGraphData] = useState<GraphData>(sampleGraphData as GraphData);
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Cloning & Analyzing...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selection state
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEnvFilter, setSelectedEnvFilter] = useState<string>('none');
  const [selectedCycleFilter, setSelectedCycleFilter] = useState<string>('all');
  const [hideOrphans, setHideOrphans] = useState<boolean>(false);
  const [entryPathFocus, setEntryPathFocus] = useState<boolean>(false);

  // UI toggles
  const [showDynamicModal, setShowDynamicModal] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(false);

  // Engine toggle: 'cytoscape' | 'reagraph'
  const [engine, setEngine] = useState<'cytoscape' | 'reagraph'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('engine') === 'reagraph' ? 'reagraph' : 'cytoscape';
  });

  // ─── Derived maps ────────────────────────────────────────────────────────
  const {
    cycleNodesSet,
    cycleEdgesSet,
    envUsageEdgesSet,
    orphanSet,
    entryPointMap,
    incomingMap,
    outgoingMap,
    symbolUsageByEdgeMap,
    nodeEnvUsageMap,
    unusedDeclaredKeys,
    allEnvKeys,
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

    const envUsageEdges = new Set<string>();
    for (const item of graphData.envUsage?.usages || []) {
      if (item.kind === 'transitive' && item.via) {
        envUsageEdges.add(`${item.file}->${item.via}`);
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

    const symbolMap = new Map<string, SymbolUsageItem[]>();
    for (const item of graphData.symbolUsage || []) {
      const edgeKey = `${item.usedInFile}->${item.fromFile}`;
      if (!symbolMap.has(edgeKey)) symbolMap.set(edgeKey, []);
      symbolMap.get(edgeKey)!.push(item);
    }

    const nodeEnvMap = new Map<string, EnvUsageItem[]>();
    const usedEnvKeysSet = new Set<string>();
    for (const item of graphData.envUsage?.usages || []) {
      usedEnvKeysSet.add(item.key);
      if (!nodeEnvMap.has(item.file)) nodeEnvMap.set(item.file, []);
      nodeEnvMap.get(item.file)!.push(item);
    }

    const unusedKeys: DeclaredEnvKey[] = [];
    const allKeysSet = new Set<string>();
    for (const decl of graphData.envUsage?.declaredKeys || []) {
      allKeysSet.add(decl.key);
      if (!usedEnvKeysSet.has(decl.key)) unusedKeys.push(decl);
    }
    for (const k of usedEnvKeysSet) allKeysSet.add(k);

    return {
      cycleNodesSet: cycleNodes,
      cycleEdgesSet: cycleEdges,
      envUsageEdgesSet: envUsageEdges,
      orphanSet: orphans,
      entryPointMap: entryPoints,
      incomingMap: incoming,
      outgoingMap: outgoing,
      symbolUsageByEdgeMap: symbolMap,
      nodeEnvUsageMap: nodeEnvMap,
      unusedDeclaredKeys: unusedKeys,
      allEnvKeys: Array.from(allKeysSet).sort(),
    };
  }, [graphData]);

  // ─── GitHub Analysis ─────────────────────────────────────────────────────
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
        body: JSON.stringify({ repoUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      setGraphData(data as GraphData);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to analyze repository');
    } finally {
      setLoading(false);
    }
  };

  // ─── Local Folder Upload ──────────────────────────────────────────────────
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
      const res = await fetch('/api/analyze-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Upload analysis failed (${res.status})`);
      setGraphData(data as GraphData);
    } catch (err: any) {
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

  // ─── Graph Navigation (called by inspector panels) ────────────────────────
  const focusNodeInGraph = (nodeId: string) => {
    const nodeObj = graphData.nodes?.find((n) => n.id === nodeId);
    if (nodeObj) {
      const fanIn = incomingMap.get(nodeId)?.length || 0;
      const fanOut = outgoingMap.get(nodeId)?.length || 0;
      const isCycle = cycleNodesSet.has(nodeId);
      const isOrphan = orphanSet.has(nodeId);
      const isEntryPoint = entryPointMap.has(nodeId);
      setSelectedEdge(null);
      setSelectedNode({
        id: nodeId,
        label: nodeId.split('/').pop() || nodeId,
        fullPath: nodeObj.path || nodeId,
        fanIn,
        fanOut,
        isCycle,
        isOrphan,
        isEntryPoint,
        entryPointReason: entryPointMap.get(nodeId) || '',
        incoming: incomingMap.get(nodeId) || [],
        outgoing: outgoingMap.get(nodeId) || [],
      });
    }

    if (cyRef.current) {
      const node = cyRef.current.getElementById(nodeId);
      if (node && node.length > 0) {
        cyRef.current.nodes().unselect();
        cyRef.current.edges().unselect();
        node.select();
        cyRef.current.animate({ center: { eles: node }, zoom: 1.25, duration: 250 });
        const data = node.data() as SelectedNodeInfo;
        setSelectedEdge(null);
        setSelectedNode(data);
        cyRef.current.batch(() => {
          cyRef.current!.elements().removeClass('dimmed highlighted-connection highlighted-edge focused neighbor');
          const outgoingEdges = node.outgoers('edge');
          const incomingEdges = node.incomers('edge');
          const directEdges = outgoingEdges.union(incomingEdges);
          const neighbors = directEdges.connectedNodes().not(node);

          // Full dependency chain (blast-radius) - downstream dependencies
          const successors = node.successors();
          const activeChain = node.union(successors);
          const activeEdges = activeChain.connectedEdges().filter((e: any) => {
            return activeChain.contains(e.source()) && activeChain.contains(e.target());
          });
          const allActiveEles = activeChain.union(activeEdges).union(neighbors).union(directEdges);

          cyRef.current!.elements().not(allActiveEles).addClass('dimmed');
          node.addClass('focused');
          neighbors.addClass('neighbor');
          activeEdges.union(directEdges).addClass('highlighted-edge');
        });
      }
    }
  };

  const selectEdgeByKey = (edgeKey: string) => {
    const symbols = symbolUsageByEdgeMap.get(edgeKey) || [];
    const [source, target] = edgeKey.split('->');
    if (!source || !target) return;
    const isCycle = cycleEdgesSet.has(edgeKey);

    setSelectedNode(null);
    setSelectedEdge({
      id: edgeKey,
      source,
      target,
      isCycle,
      hasTracedSymbols: symbols.length > 0,
      symbolUsages: symbols,
    });

    if (cyRef.current) {
      const edge = cyRef.current.getElementById(edgeKey);
      cyRef.current.nodes().unselect();
      cyRef.current.edges().unselect();
      cyRef.current.elements().removeClass('dimmed highlighted-connection highlighted-edge focused neighbor');

      if (edge && edge.length > 0) {
        edge.select();
        cyRef.current.animate({ center: { eles: edge }, duration: 250 });
      }
    }
  };

  // Expose test helper for programmatic evaluation & headless automation
  useEffect(() => {
    (window as any).__cockpit = {
      selectNode: (id: string) => focusNodeInGraph(id),
      selectEdge: (key: string) => selectEdgeByKey(key),
      setEngine: (eng: 'cytoscape' | 'reagraph') => setEngine(eng),
      getEngine: () => engine,
      getNodeCount: () => graphData.nodes?.length || 0,
      getCy: () => cyRef.current,
    };
  }, [graphData, incomingMap, outgoingMap, cycleNodesSet, orphanSet, entryPointMap, engine]);

  // ─── Filter / Search Effect ───────────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.elements().removeClass('highlighted-connection highlighted-edge focused neighbor');
      cy.elements().removeClass('dimmed search-match env-active hidden');

      if (hideOrphans) cy.elements('node.orphan-node').addClass('hidden');

      if (entryPathFocus) {
        const entryNodes = cy.elements('node.entry-point-node');
        const outgoingEdges = entryNodes.outgoers('edge');
        const directDeps = outgoingEdges.targets();
        const activeEles = entryNodes.union(outgoingEdges).union(directDeps);
        cy.elements().not(activeEles).addClass('dimmed');
      }

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
        cy.elements().not(cycleNodes.union(cycleEdges)).addClass('dimmed');
      }

      if (selectedEnvFilter !== 'none') {
        const activeFiles = new Set(
          (graphData.envUsage?.usages || []).filter(u => u.key === selectedEnvFilter).map(u => u.file)
        );
        const activeNodes = cy.nodes().filter(n => activeFiles.has(n.id()));
        activeNodes.addClass('env-active');
        cy.nodes().not(activeNodes).addClass('dimmed');
        cy.edges().addClass('dimmed');
      }

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

  // ─── Zoom / Fit Controls ─────────────────────────────────────────────────
  const handleFit = () => cyRef.current?.fit(undefined, 40);
  const handleZoomIn = () => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 0.8);

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

      <Header
        graphData={graphData}
        totalSymbolsTraced={totalSymbolsTraced}
        unusedDeclaredKeys={unusedDeclaredKeys}
        dynamicAccesses={dynamicAccesses}
        onShowDynamicModal={() => setShowDynamicModal(true)}
        onSetEnvFilter={setSelectedEnvFilter}
        engine={engine}
        onSetEngine={(newEngine) => {
          setEngine(newEngine);
          setSelectedNode(null);
          setSelectedEdge(null);
        }}
      />

      {/* Global Loading / Error Bar */}
      {loading && (
        <div style={{ background: '#1C2128', color: '#8B96A5', borderBottom: '1px solid var(--border-default)', padding: '6px 16px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{loadingStatus}</span>
        </div>
      )}
      {errorMessage && (
        <div style={{ background: '#1C2128', color: '#E8A33D', borderBottom: '1px solid #E8A33D', padding: '6px 16px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} style={{ background: 'transparent', border: 'none', color: '#E8A33D', cursor: 'pointer', fontSize: '13px', padding: '0 4px' }}>
            ✕
          </button>
        </div>
      )}

      <div className="workspace-container">
        <Sidebar
          inputMode={inputMode}
          repoUrl={repoUrl}
          loading={loading}
          onSetInputMode={setInputMode}
          onSetRepoUrl={setRepoUrl}
          onAnalyzeGithub={handleAnalyzeGithub}
          onPickLocalFolder={handlePickLocalFolder}
          searchQuery={searchQuery}
          onSetSearchQuery={setSearchQuery}
          selectedEnvFilter={selectedEnvFilter}
          onSetEnvFilter={setSelectedEnvFilter}
          selectedCycleFilter={selectedCycleFilter}
          onSetCycleFilter={setSelectedCycleFilter}
          hideOrphans={hideOrphans}
          onToggleHideOrphans={() => setHideOrphans(p => !p)}
          entryPathFocus={entryPathFocus}
          onToggleEntryPathFocus={() => setEntryPathFocus(p => !p)}
          showLegend={showLegend}
          onToggleLegend={() => setShowLegend(p => !p)}
          allEnvKeys={allEnvKeys}
          graphData={graphData}
          onFit={handleFit}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

        <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
          {engine === 'reagraph' ? (
            <GraphCanvasReagraph
              graphData={graphData}
              cycleNodesSet={cycleNodesSet}
              cycleEdgesSet={cycleEdgesSet}
              envUsageEdgesSet={envUsageEdgesSet}
              orphanSet={orphanSet}
              entryPointMap={entryPointMap}
              incomingMap={incomingMap}
              outgoingMap={outgoingMap}
              symbolUsageByEdgeMap={symbolUsageByEdgeMap}
              selectedNodeId={selectedNode?.id}
              onSelectNode={(info) => { setSelectedEdge(null); setSelectedNode(info); }}
              onSelectEdge={(info) => { setSelectedNode(null); setSelectedEdge(info); }}
              onDeselect={() => { setSelectedNode(null); setSelectedEdge(null); }}
            />
          ) : (
            <GraphCanvas
              graphData={graphData}
              cycleNodesSet={cycleNodesSet}
              cycleEdgesSet={cycleEdgesSet}
              envUsageEdgesSet={envUsageEdgesSet}
              orphanSet={orphanSet}
              entryPointMap={entryPointMap}
              incomingMap={incomingMap}
              outgoingMap={outgoingMap}
              symbolUsageByEdgeMap={symbolUsageByEdgeMap}
              onSelectNode={(info) => { setSelectedEdge(null); setSelectedNode(info); }}
              onSelectEdge={(info) => { setSelectedNode(null); setSelectedEdge(info); }}
              onDeselect={() => { setSelectedNode(null); setSelectedEdge(null); }}
              cyRef={cyRef}
            />
          )}
        </div>

        <FileInspector
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          graphData={graphData}
          nodeEnvUsageMap={nodeEnvUsageMap}
          symbolUsageByEdgeMap={symbolUsageByEdgeMap}
          onCloseNode={() => setSelectedNode(null)}
          onCloseEdge={() => setSelectedEdge(null)}
          onFocusNode={focusNodeInGraph}
          onSelectEdge={selectEdgeByKey}
          onSetEnvFilter={setSelectedEnvFilter}
        />
      </div>

      {/* Dynamic Access Warnings Modal */}
      {showDynamicModal && (
        <div className="modal-overlay" onClick={() => setShowDynamicModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#E8A33D' }}>
                <span>Dynamic Access Warnings ({dynamicAccesses.length})</span>
              </span>
              <button type="button" className="panel-close-btn" onClick={() => setShowDynamicModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '11px', color: '#8B96A5', lineHeight: '1.5' }}>
                These files use dynamic bracket syntax (e.g. <code>process.env[varName]</code>) that cannot be resolved statically:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {dynamicAccesses.map((item, idx) => (
                  <div
                    key={idx}
                    className="inspector-card clickable"
                    onClick={() => { setShowDynamicModal(false); focusNodeInGraph(item.file); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#4A9EFF' }}>
                        {item.file}
                      </span>
                      <span className="metric-pill warning">Focus Node</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#57606A', fontFamily: 'var(--font-mono)' }}>
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
