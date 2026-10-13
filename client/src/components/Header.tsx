import type { GraphData, DeclaredEnvKey, DynamicAccess } from '../types';

interface HeaderProps {
  graphData: GraphData;
  totalSymbolsTraced: number;
  unusedDeclaredKeys: DeclaredEnvKey[];
  dynamicAccesses: DynamicAccess[];
  onShowDynamicModal: () => void;
  onSetEnvFilter: (key: string) => void;
  engine: 'cytoscape' | 'reagraph';
  onSetEngine: (engine: 'cytoscape' | 'reagraph') => void;
}

export default function Header({
  graphData,
  totalSymbolsTraced,
  unusedDeclaredKeys,
  dynamicAccesses,
  onShowDynamicModal,
  onSetEnvFilter,
  engine,
  onSetEngine,
}: HeaderProps) {
  return (
    <header className="app-header">
      {/* Stats Badges */}
      <div className="header-stats-bar">
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
            <strong>{totalSymbolsTraced}</strong> Symbols
          </span>

          {/* Dynamic Access Warnings Badge */}
          {dynamicAccesses.length > 0 && (
            <span
              id="dynamic-access-badge"
              className="metric-pill warning clickable"
              onClick={onShowDynamicModal}
              title="Click to inspect unresolvable dynamic process.env accesses"
            >
              <strong>{dynamicAccesses.length}</strong> Dynamic
            </span>
          )}

          {/* Unused Declared Keys Badge */}
          {unusedDeclaredKeys.length > 0 && (
            <span
              className="metric-pill warning clickable"
              onClick={() => {
                if (unusedDeclaredKeys[0]) {
                  onSetEnvFilter(unusedDeclaredKeys[0].key);
                }
              }}
              title={`${unusedDeclaredKeys.length} config keys declared in .env but never referenced in code`}
            >
              <strong>{unusedDeclaredKeys.length}</strong> Unused Keys
            </span>
          )}
        </div>
      </div>

      {/* Engine Switch Toggle */}
      <div
        id="engine-switch-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          padding: '2px',
          gap: '4px',
          fontFamily: 'var(--font-data)',
          fontSize: '11px',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: '10px', paddingLeft: '4px', paddingRight: '2px' }}>
          Engine:
        </span>
        <button
          id="engine-btn-cytoscape"
          type="button"
          onClick={() => onSetEngine('cytoscape')}
          style={{
            background: engine === 'cytoscape' ? '#1c1c1c' : 'transparent',
            color: engine === 'cytoscape' ? '#ffffff' : '#888888',
            border: engine === 'cytoscape' ? '1px solid #444444' : '1px solid transparent',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: engine === 'cytoscape' ? 600 : 400,
            cursor: 'pointer',
            fontFamily: 'var(--font-data)',
          }}
        >
          Cytoscape
        </button>
        <button
          id="engine-btn-reagraph"
          type="button"
          onClick={() => onSetEngine('reagraph')}
          style={{
            background: engine === 'reagraph' ? '#1c1c1c' : 'transparent',
            color: engine === 'reagraph' ? '#ffffff' : '#888888',
            border: engine === 'reagraph' ? '1px solid #444444' : '1px solid transparent',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: engine === 'reagraph' ? 600 : 400,
            cursor: 'pointer',
            fontFamily: 'var(--font-data)',
          }}
        >
          Reagraph (No Overlap 2D)
        </button>
      </div>
    </header>
  );
}
