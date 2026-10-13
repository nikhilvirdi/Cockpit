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
        <div style={{ display: 'flex', background: 'var(--bg-input)', padding: '2px', border: '1px solid var(--border-default)', marginBottom: '6px' }}>
          <button
            type="button"
            id="mode-github-tab"
            onClick={() => onSetInputMode('github')}
            style={{
              flex: 1,
              background: inputMode === 'github' ? '#1c1c1c' : 'transparent',
              color: inputMode === 'github' ? '#e5e5e5' : '#888888',
              border: inputMode === 'github' ? '1px solid #444444' : '1px solid transparent',
              padding: '4px 10px',
              borderRadius: '0',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'none',
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
              background: inputMode === 'folder' ? '#1c1c1c' : 'transparent',
              color: inputMode === 'folder' ? '#e5e5e5' : '#888888',
              border: inputMode === 'folder' ? '1px solid #444444' : '1px solid transparent',
              padding: '4px 10px',
              borderRadius: '0',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'none',
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
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: '0',
                padding: '5px 10px',
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
                background: loading ? '#0e0e0e' : '#1c1c1c',
                color: loading ? '#666666' : '#e5e5e5',
                border: '1px solid #444444',
                borderRadius: '0',
                padding: '5px 14px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: loading || !repoUrl.trim() ? 'not-allowed' : 'pointer',
                boxShadow: 'none',
                width: '100%',
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
              background: loading ? '#0e0e0e' : '#1c1c1c',
              color: loading ? '#666666' : '#e5e5e5',
              border: '1px solid #444444',
              borderRadius: '0',
              padding: '5px 14px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: 'none',
              width: '100%',
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
          style={{ width: '100%' }}
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
            style={{ width: '100%' }}
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
                  <span className="legend-dot" style={{ background: '#1e3a5f', border: '2px solid #4a9eff' }} />
                  <span>Standard</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: '#7f1d1d', border: '2px solid #ef4444' }} />
                  <span>Cycle</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: '#92400e', border: '2px solid #f59e0b', transform: 'rotate(45deg)' }} />
                  <span>Entry</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: '#1a1a1a', border: '1px dashed #888' }} />
                  <span>Orphan</span>
                </div>
              </div>
            </div>

            {/* Edges Group */}
            <div className="sidebar-legend-group">
              <div className="sidebar-legend-title">Edges</div>
              <div className="sidebar-legend-grid">
                <div className="legend-item">
                  <span className="legend-line" style={{ background: '#60a5fa' }} />
                  <span>Traced</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ borderTop: '2px dotted #a78bfa' }} />
                  <span>Type-Only</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ borderTop: '2px dashed #999' }} />
                  <span>Untraced</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ background: '#ef4444', height: '3px' }} />
                  <span>Cycle</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
