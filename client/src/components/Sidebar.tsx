import type { InputMode, GraphData } from '../types';

interface SidebarProps {
  // Input / analyze
  inputMode: InputMode;
  repoUrl: string;
  loading: boolean;
  onSetInputMode: (mode: InputMode) => void;
  onSetRepoUrl: (url: string) => void;
  onAnalyzeGithub: (e?: React.FormEvent) => void;
  onPickLocalFolder: () => void;

  // Search + filters
  searchQuery: string;
  onSetSearchQuery: (q: string) => void;
  selectedEnvFilter: string;
  onSetEnvFilter: (k: string) => void;
  selectedCycleFilter: string;
  onSetCycleFilter: (v: string) => void;
  hideOrphans: boolean;
  onToggleHideOrphans: () => void;
  entryPathFocus: boolean;
  onToggleEntryPathFocus: () => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  allEnvKeys: string[];
  graphData: GraphData;

  // Zoom controls
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export default function Sidebar({
  inputMode,
  repoUrl,
  loading,
  onSetInputMode,
  onSetRepoUrl,
  onAnalyzeGithub,
  onPickLocalFolder,
  searchQuery,
  onSetSearchQuery,
  selectedEnvFilter,
  onSetEnvFilter,
  selectedCycleFilter,
  onSetCycleFilter,
  hideOrphans,
  onToggleHideOrphans,
  entryPathFocus,
  onToggleEntryPathFocus,
  showLegend,
  onToggleLegend,
  allEnvKeys,
  graphData,
  onFit,
  onZoomIn,
  onZoomOut,
}: SidebarProps) {
  return (
    <aside className="left-sidebar">
      {/* Brand Logo Header */}
      <div className="sidebar-brand-container">
        <img src="/cockpit.svg" alt="Cockpit" className="sidebar-brand-logo" />
      </div>

      {/* Input Mode: GitHub / Local */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Analyze</div>
        <div style={{ display: 'flex', background: '#12161C', padding: '2px', border: '1px solid var(--border-default)', borderRadius: '3px', marginBottom: '6px' }}>
          <button
            type="button"
            id="mode-github-tab"
            onClick={() => onSetInputMode('github')}
            style={{
              flex: 1,
              background: inputMode === 'github' ? '#1C2128' : 'transparent',
              color: inputMode === 'github' ? '#E8A33D' : '#8B96A5',
              border: inputMode === 'github' ? '1px solid #E8A33D' : '1px solid transparent',
              padding: '4px 10px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: inputMode === 'github' ? 500 : 400,
              cursor: 'pointer',
              boxShadow: 'none',
              fontFamily: 'var(--font-data)',
            }}
          >
            GitHub
          </button>
          <button
            type="button"
            id="mode-folder-tab"
            onClick={() => onSetInputMode('folder')}
            style={{
              flex: 1,
              background: inputMode === 'folder' ? '#1C2128' : 'transparent',
              color: inputMode === 'folder' ? '#E8A33D' : '#8B96A5',
              border: inputMode === 'folder' ? '1px solid #E8A33D' : '1px solid transparent',
              padding: '4px 10px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: inputMode === 'folder' ? 500 : 400,
              cursor: 'pointer',
              boxShadow: 'none',
              fontFamily: 'var(--font-data)',
            }}
          >
            Local
          </button>
        </div>

        {inputMode === 'github' ? (
          <form onSubmit={onAnalyzeGithub} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              id="github-url-input"
              type="text"
              value={repoUrl}
              onChange={(e) => onSetRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={loading}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: '#12161C',
                color: '#8B96A5',
                border: '1px solid var(--border-default)',
                borderRadius: '3px',
                padding: '5px 8px',
                fontSize: '11px',
                outline: 'none',
                fontFamily: 'var(--font-data)',
                boxShadow: 'none',
              }}
            />
            <button
              id="analyze-repo-button"
              type="submit"
              disabled={loading || !repoUrl.trim()}
              style={{
                background: loading ? 'var(--bg-input)' : 'var(--node-bg)',
                color: loading ? 'var(--text-muted)' : 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 12px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: loading || !repoUrl.trim() ? 'not-allowed' : 'pointer',
                boxShadow: 'none',
                width: '100%',
                fontFamily: 'var(--font-data)',
              }}
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            id="pick-folder-button"
            onClick={onPickLocalFolder}
            disabled={loading}
            style={{
              background: loading ? 'var(--bg-input)' : 'var(--node-bg)',
              color: loading ? 'var(--text-muted)' : 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: 'none',
              width: '100%',
              fontFamily: 'var(--font-data)',
            }}
          >
            {loading ? 'Processing...' : 'Select Folder'}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Search</div>
        <div className="search-box">
          <input
            id="node-search-input"
            type="text"
            placeholder="Filter by file path..."
            value={searchQuery}
            onChange={(e) => onSetSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => onSetSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Env Variable Filter */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Environment Variable</div>
        <select
          id="env-key-filter"
          className="select-filter"
          value={selectedEnvFilter}
          onChange={(e) => onSetEnvFilter(e.target.value)}
          style={{
            width: '100%',
            borderColor: selectedEnvFilter !== 'none' ? 'var(--accent-warning)' : undefined,
            color: selectedEnvFilter !== 'none' ? 'var(--accent-warning)' : undefined,
          }}
        >
          <option value="none">All (No Filter)</option>
          {allEnvKeys.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {/* Cycle Filter */}
      {(graphData.analysis?.cycles?.length || 0) > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">Cycle Filter</div>
          <select
            id="cycle-select-filter"
            className="select-filter"
            value={selectedCycleFilter}
            onChange={(e) => onSetCycleFilter(e.target.value)}
            style={{
              width: '100%',
              borderColor: selectedCycleFilter !== 'all' ? 'var(--accent-warning)' : undefined,
              color: selectedCycleFilter !== 'all' ? 'var(--accent-warning)' : undefined,
            }}
          >
            <option value="all">All Cycles ({graphData.analysis?.cycles?.length})</option>
            {graphData.analysis.cycles.map((cycle, idx) => (
              <option key={idx} value={String(idx)}>
                Cycle {idx + 1} ({cycle.length} files)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Display Options */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Display Options</div>
        <button
          type="button"
          id="toggle-hide-orphans"
          className={`filter-toggle ${hideOrphans ? 'active' : ''}`}
          onClick={onToggleHideOrphans}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {hideOrphans ? 'Orphans Hidden' : 'Hide Orphans'}
        </button>
        <button
          type="button"
          id="toggle-entry-path-focus"
          className={`filter-toggle ${entryPathFocus ? 'active' : ''}`}
          onClick={onToggleEntryPathFocus}
          title="Filter to only entry point files and their direct outgoing imports"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {entryPathFocus ? 'Entry Focused' : 'Focus Entry Points'}
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Zoom & View</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button type="button" className="canvas-btn" onClick={onFit} title="Fit Entire Graph" style={{ flex: 1 }}>
            Fit
          </button>
          <button type="button" className="canvas-btn" onClick={onZoomIn} title="Zoom In" style={{ flex: 1 }}>
            +
          </button>
          <button type="button" className="canvas-btn" onClick={onZoomOut} title="Zoom Out" style={{ flex: 1 }}>
            −
          </button>
        </div>
      </div>

      {/* Legend Toggle & Collapsible Legend */}
      <div className="sidebar-section">
        <button
          type="button"
          id="toggle-legend-btn"
          className={`filter-toggle ${showLegend ? 'active' : ''}`}
          onClick={onToggleLegend}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {showLegend ? 'Hide Legend' : 'Show Legend'}
        </button>

        {showLegend && (
          <div className="sidebar-legend-card" id="sidebar-legend-panel">
            {/* Nodes Group */}
            <div className="sidebar-legend-group">
              <div className="sidebar-legend-title">Nodes</div>
              <div className="sidebar-legend-grid">
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--node-bg)', border: '1px solid var(--node-border)', borderRadius: '2px' }} />
                  <span>Standard</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--node-bg)', border: '1px solid var(--node-border)', transform: 'rotate(45deg)', borderRadius: '1px' }} />
                  <span>Entry Point</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'rgba(22, 22, 22, 0.5)', border: '1px dashed var(--text-muted)', borderRadius: '2px' }} />
                  <span>Orphan</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--node-bg)', border: '1px solid var(--accent-error)', borderRadius: '2px' }} />
                  <span>Cycle</span>
                </div>
              </div>
            </div>

            {/* Edges Group (5 edge types) */}
            <div className="sidebar-legend-group">
              <div className="sidebar-legend-title">Edges</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div className="legend-item">
                  <span className="legend-line" style={{ background: 'var(--connector-line)', height: '1.5px' }} />
                  <span>Import (default)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ background: 'var(--accent-info)', height: '1.5px' }} />
                  <span>Symbol Usage</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ borderTop: '1.5px dashed var(--accent-warning)' }} />
                  <span>Env Usage</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ borderTop: '1.5px dashed var(--accent-error)' }} />
                  <span>Cycle</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ borderTop: '1.5px dashed var(--text-muted)' }} />
                  <span>Type-Only / Untraced</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
