import type { SelectedNodeInfo, SelectedEdgeInfo, SymbolUsageItem, GraphData, EnvUsageItem } from '../types';

interface FileInspectorProps {
  selectedNode: SelectedNodeInfo | null;
  selectedEdge: SelectedEdgeInfo | null;
  graphData: GraphData;
  nodeEnvUsageMap: Map<string, EnvUsageItem[]>;
  symbolUsageByEdgeMap: Map<string, SymbolUsageItem[]>;
  onCloseNode: () => void;
  onCloseEdge: () => void;
  onFocusNode: (nodeId: string) => void;
  onSelectEdge: (edgeKey: string) => void;
  onSetEnvFilter: (key: string) => void;
}

export default function FileInspector({
  selectedNode,
  selectedEdge,
  graphData,
  nodeEnvUsageMap,
  symbolUsageByEdgeMap,
  onCloseNode,
  onCloseEdge,
  onFocusNode,
  onSelectEdge,
  onSetEnvFilter,
}: FileInspectorProps) {
  const selectedNodeEnvUsages = selectedNode ? (nodeEnvUsageMap.get(selectedNode.id) || []) : [];

  if (selectedNode) {
    return (
      <aside className="side-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>File Inspector</span>
          </div>
          <button type="button" className="panel-close-btn" onClick={onCloseNode}>✕</button>
        </div>

        <div className="panel-body">
          {/* Node Identity Card */}
          <div className="inspector-card">
            <div className="card-title">File Node</div>
            <div className="card-value" style={{ fontWeight: 600, color: 'var(--accent-info)', fontFamily: 'var(--font-mono)' }}>
              {selectedNode.id}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {selectedNode.fullPath}
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
              {selectedNode.isEntryPoint && (
                <span className="metric-pill warning">Entry Point ({selectedNode.entryPointReason})</span>
              )}
              {selectedNode.isCycle && <span className="metric-pill danger">Cycle Member</span>}
              {selectedNode.isOrphan && <span className="metric-pill">Orphan</span>}
              <span className="metric-pill">Fan-In: {selectedNode.fanIn}</span>
              <span className="metric-pill">Fan-Out: {selectedNode.fanOut}</span>
            </div>
          </div>

          {/* Environment Variables Usage Card */}
          <div className="inspector-card" id="node-env-usage-card">
            <div className="card-title">
              <span>Environment Variables ({selectedNodeEnvUsages.length})</span>
              {selectedNodeEnvUsages.length > 0 && <span className="badge-env-direct">Active</span>}
            </div>
            {selectedNodeEnvUsages.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedNodeEnvUsages.map((env, i) => (
                  <div key={i} className="env-usage-row">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="env-key-name">{env.key}</span>
                      <span className={env.kind === 'direct' ? 'badge-env-direct' : 'badge-env-transitive'}>
                        {env.kind === 'direct' ? 'Direct' : 'Transitive'}
                      </span>
                    </div>
                    {env.kind === 'direct' ? (
                      <div className="env-chain">
                        Pattern: <strong style={{ color: 'var(--text-primary)' }}>{env.pattern}</strong>
                      </div>
                    ) : (
                      <div className="env-chain">
                        Transitive via:{' '}
                        <span
                          className="via-link"
                          onClick={() => onFocusNode(env.via)}
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
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
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
                        onClick={() => onFocusNode(outId)}
                        style={{
                          flex: 1,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-default)',
                          color: 'var(--text-secondary)',
                          padding: '5px 8px',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'left',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`Inspect file ${outId}`}
                      >
                        → {outId}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectEdge(edgeKey)}
                        title={symbols.length > 0 ? `Inspect ${symbols.length} traced symbols on this import edge` : 'Inspect import edge'}
                        style={{
                          background: symbols.length > 0 ? 'var(--node-bg)' : 'transparent',
                          border: `1px solid ${symbols.length > 0 ? 'var(--accent-info)' : 'var(--border-default)'}`,
                          color: symbols.length > 0 ? 'var(--accent-info)' : 'var(--text-muted)',
                          padding: '5px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '10px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {symbols.length > 0 ? `Symbols (${symbols.length})` : 'Edge'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No internal imports.</div>
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
                        onClick={() => onFocusNode(inId)}
                        style={{
                          flex: 1,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-default)',
                          color: 'var(--text-secondary)',
                          padding: '5px 8px',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'left',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`Inspect file ${inId}`}
                      >
                        ← {inId}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectEdge(edgeKey)}
                        title={symbols.length > 0 ? `Inspect ${symbols.length} traced symbols on this import edge` : 'Inspect import edge'}
                        style={{
                          background: symbols.length > 0 ? 'var(--node-bg)' : 'transparent',
                          border: `1px solid ${symbols.length > 0 ? 'var(--accent-info)' : 'var(--border-default)'}`,
                          color: symbols.length > 0 ? 'var(--accent-info)' : 'var(--text-muted)',
                          padding: '5px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '10px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {symbols.length > 0 ? `Symbols (${symbols.length})` : 'Edge'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No incoming dependencies.</div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  if (selectedEdge) {
    return (
      <aside className="side-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>Import Edge Inspector</span>
          </div>
          <button type="button" className="panel-close-btn" onClick={onCloseEdge}>✕</button>
        </div>

        <div className="panel-body">
          {/* Edge Identity Card */}
          <div className="inspector-card">
            <div className="card-title">Dependency Edge</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Consumer File (Importing):
                <div
                  className="via-link"
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '11px', color: 'var(--accent-info)' }}
                  onClick={() => onFocusNode(selectedEdge.source)}
                >
                  {selectedEdge.source}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Supplier File (Exporting):
                <div
                  className="via-link"
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '11px', color: 'var(--accent-info)' }}
                  onClick={() => onFocusNode(selectedEdge.target)}
                >
                  {selectedEdge.target}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
              {selectedEdge.isCycle && <span className="metric-pill danger">Circular Edge</span>}
              {selectedEdge.hasTracedSymbols ? (
                <span className="badge-runtime">Traced Symbols: {selectedEdge.symbolUsages.length}</span>
              ) : (
                <span className="metric-pill">Untraced Import</span>
              )}
            </div>
          </div>

          {/* Symbol Usages Breakdown Card */}
          <div className="inspector-card" id="edge-symbols-card">
            <div className="card-title">
              <span>Traced Symbols ({selectedEdge.symbolUsages.length})</span>
            </div>
            {selectedEdge.symbolUsages.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedEdge.symbolUsages.map((sym, i) => (
                  <div key={i} className="symbol-usage-row">
                    <div className="symbol-name-bar">
                      <span className="symbol-name">{sym.importedSymbol}</span>
                      <span className={sym.typeOnly ? 'badge-typeonly' : 'badge-runtime'}>
                        {sym.typeOnly ? 'Type-only' : 'Runtime'}
                      </span>
                    </div>
                    <div className="symbol-meta">
                      <span>Scope: <strong style={{ color: 'var(--text-primary)' }}>{sym.usedInScope}</strong></span>
                      <span>•</span>
                      <span>Line: {sym.line}</span>
                    </div>
                    {sym.note && (
                      <div style={{ fontSize: '10px', color: 'var(--accent-warning)', fontStyle: 'italic' }}>
                        Note: {sym.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                No specific symbol references were traced across this import edge (barrel re-export, side-effect import, or dynamic access).
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // Empty state — Repository Overview
  return (
    <aside className="side-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>Repository Overview</span>
        </div>
      </div>

      <div className="panel-body">
        <div className="inspector-card">
          <div style={{ textAlign: 'center', padding: '12px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Select a file node or import edge to inspect details.
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
                    onClick={() => onSetEnvFilter(dk.key)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="env-key-name">{dk.key}</span>
                      <span
                        className={isUsed ? 'badge-runtime' : 'badge-env-direct'}
                        style={{ color: isUsed ? 'var(--text-muted)' : 'var(--accent-warning)', borderColor: isUsed ? 'var(--border-default)' : 'var(--accent-warning)' }}
                      >
                        {isUsed ? 'Referenced' : 'Unused'}
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
    </aside>
  );
}
