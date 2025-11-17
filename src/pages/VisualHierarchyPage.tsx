import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  Download,
  Focus,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { toPng, toSvg } from 'html-to-image';
import type { ReactFlowInstance } from 'reactflow';
import type { GHLHierarchyNode, GHLSnapshot } from '../lib/types';
import HierarchyCanvas from '../components/hierarchy/HierarchyCanvas';
import {
  useHierarchyStore,
  useDensity,
  useExpandedIds,
  useFocusLens,
  useHighlightedPath,
  useTheme,
  useSelectedNodeId,
} from '../components/hierarchy/useHierarchyStore';
import type {
  Density,
  HierarchyGraph,
  PersonNode,
  PersonStatus,
} from '../components/hierarchy/types';
import '../App.css';
import './VisualHierarchyPage.css';

const EXPANSION_STORAGE_KEY = 'visual-hierarchy-expanded-ids';
const AUTO_EXPAND_CHILDREN_THRESHOLD = 6;
const AUTO_EXPAND_MAX_DEPTH = 2;

const statusMap: Record<GHLHierarchyNode['status'], PersonStatus> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
};

const getInitials = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const fetchSnapshotData = async (): Promise<GHLSnapshot> => {
  const response = await fetch('/api/ghl/snapshot', {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Failed to fetch snapshot (${response.status})`);
  }

  return (await response.json()) as GHLSnapshot;
};

const VisualHierarchyPage: React.FC = () => {
  const density = useDensity();
  const setDensity = useHierarchyStore((state) => state.setDensity);
  const expandedIds = useExpandedIds();
  const setExpandedIds = useHierarchyStore((state) => state.setExpandedIds);
  const toggleExpandedId = useHierarchyStore((state) => state.toggleExpandedId);
  const selectedNodeId = useSelectedNodeId();
  const setSelectedNodeId = useHierarchyStore((state) => state.setSelectedNodeId);
  const focusLens = useFocusLens();
  const toggleFocusLens = useHierarchyStore((state) => state.toggleFocusLens);
  const highlightedPath = useHighlightedPath();
  const setHighlightedPath = useHierarchyStore((state) => state.setHighlightedPath);
  const theme = useTheme();
  const setTheme = useHierarchyStore((state) => state.setTheme);
  const toggleTheme = useHierarchyStore((state) => state.toggleTheme);

  const [snapshot, setSnapshot] = useState<GHLSnapshot | null>(null);
  const [graph, setGraph] = useState<HierarchyGraph | null>(null);
  const [parentMap, setParentMap] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const hydratedExpansionRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [depthLimit, setDepthLimit] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('vh-theme');
      if (stored === 'light' || stored === 'dark') {
        setTheme?.(stored as 'light' | 'dark');
      }
    } catch {}
  }, [setTheme]);

  useEffect(() => {
    try {
      if (theme) window.localStorage.setItem('vh-theme', theme as string);
    } catch {}
  }, [theme]);

  const fetchSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSnapshotData();
      setSnapshot(data);
    } catch (err) {
      console.error('Failed to fetch snapshot', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!snapshot) {
      setGraph(null);
      setParentMap(new Map());
      return;
    }
    const { graph: builtGraph, parentMap: builtParentMap } = buildHierarchyGraph(snapshot.hierarchy);
    setGraph(builtGraph);
    setParentMap(builtParentMap);
    hydratedExpansionRef.current = false;
  }, [snapshot]);

  const defaultExpandedIds = useMemo(
    () => (graph ? computeDefaultExpandedIds(graph) : []),
    [graph],
  );

  useEffect(() => {
    if (!graph || hydratedExpansionRef.current) {
      return;
    }
    hydratedExpansionRef.current = true;
    const stored = window.localStorage.getItem(EXPANSION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        const knownIds = parsed.filter((id) => graph.nodesById.has(id));
        if (knownIds.length > 0) {
          setExpandedIds(knownIds);
          return;
        }
      } catch {
        // ignore parse errors
      }
    }
    setExpandedIds(defaultExpandedIds.length ? defaultExpandedIds : graph.rootIds);
  }, [graph, setExpandedIds, defaultExpandedIds]);

  useEffect(() => {
    if (expandedIds.size === 0) {
      return;
    }
    window.localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(Array.from(expandedIds)));
  }, [expandedIds]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space' && (event.target instanceof HTMLElement ? event.target.tagName === 'BODY' : true)) {
        event.preventDefault();
        toggleFocusLens();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [toggleFocusLens]);

  useEffect(() => {
    if (!selectedNodeId) {
      setHighlightedPath([]);
      return;
    }
    const path = buildAncestorPath(selectedNodeId, parentMap);
    setHighlightedPath(path);
  }, [selectedNodeId, parentMap, setHighlightedPath]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const stats = useMemo(() => {
    if (!graph) {
      return {
        total: 0,
        active: 0,
        pending: 0,
        inactive: 0,
        withUpline: 0,
      };
    }
    let active = 0;
    let pending = 0;
    let inactive = 0;
    let withUpline = 0;

    graph.nodesById.forEach((node) => {
      if (node.status === 'active') active += 1;
      if (node.status === 'pending') pending += 1;
      if (node.status === 'inactive') inactive += 1;
      if (node.sourceNode.uplineSource !== 'unknown') withUpline += 1;
    });

    return {
      total: graph.nodesById.size,
      active,
      pending,
      inactive,
      withUpline,
    };
  }, [graph]);

  const searchResults = useMemo(() => {
    if (!graph) return [];
    const term = searchValue.trim().toLowerCase();
    if (term.length === 0) return [];
    const values = Array.from(graph.nodesById.values());
    return values
      .filter((node) => {
        const npnMatch = node.npn ? node.npn.toLowerCase().includes(term) : false;
        return node.name.toLowerCase().includes(term) || npnMatch;
      })
      .slice(0, 8);
  }, [graph, searchValue]);

  const selectedNode: PersonNode | null = useMemo(() => {
    if (!graph || !selectedNodeId) return null;
    return graph.nodesById.get(selectedNodeId) ?? null;
  }, [graph, selectedNodeId]);

  const selectedNodeInfo = useMemo(() => {
    if (!selectedNode) return null;
    const totalDirectReports =
      selectedNode.branchSummary.active +
      selectedNode.branchSummary.pending +
      selectedNode.branchSummary.inactive;
    const branchChips: Array<{ label: string; tone: 'active' | 'pending' | 'inactive' }> = [];
    if (selectedNode.branchSummary.active > 0) {
      branchChips.push({
        label: `${selectedNode.branchSummary.active} active`,
        tone: 'active',
      });
    }
    if (selectedNode.branchSummary.pending > 0) {
      branchChips.push({
        label: `${selectedNode.branchSummary.pending} pending`,
        tone: 'pending',
      });
    }
    if (selectedNode.branchSummary.inactive > 0) {
      branchChips.push({
        label: `${selectedNode.branchSummary.inactive} inactive`,
        tone: 'inactive',
      });
    }

    const vendorTags = (() => {
      const tags: string[] = [];
      if (selectedNode.vendorGroup === 'combined') {
        return ['Equita', 'Quility'];
      }
      if (selectedNode.vendorGroup === 'equita') {
        tags.push('Equita');
      } else if (selectedNode.vendorGroup === 'quility') {
        tags.push('Quility');
      } else {
        if (selectedNode.sourceNode.vendorFlags?.equita) {
          tags.push('Equita');
        }
        if (selectedNode.sourceNode.vendorFlags?.quility) {
          tags.push('Quility');
        }
      }
      return tags;
    })();
    const vendorLabel = vendorTags.length ? vendorTags.join(' / ') : undefined;
    const lastSeen = formatDate(selectedNode.metrics.lastSeen);
    const descendantCount = selectedNode.metrics.descendantCount ?? 0;
    const sourceLabel = (selectedNode.uplineSource ?? 'unknown').toUpperCase();

    const stats: Array<{ label: string; value: string; tone?: 'accent' }> = [
      {
        label: 'Direct reports',
        value: totalDirectReports.toLocaleString(),
      },
      {
        label: 'Total downline',
        value: descendantCount.toLocaleString(),
      },
      {
        label: 'Source',
        value: sourceLabel,
        tone: sourceLabel !== 'UNKNOWN' ? ('accent' as const) : undefined,
      },
    ];

    const detailCards: Array<{
      label: string;
      value: string;
      tone?: 'accent';
      link?: string;
    }> = [
      { label: 'Company', value: selectedNode.sourceNode.companyName ?? '-' },
      { label: 'Role / Level', value: selectedNode.title ?? '-' },
      {
        label: 'Email',
        value: selectedNode.email ?? '-',
        link: selectedNode.email ? `mailto:${selectedNode.email}` : undefined,
      },
      { label: 'Vendor', value: vendorLabel ?? '-' },
      { label: 'Last touch', value: lastSeen ?? '-' },
      { label: 'NPN', value: selectedNode.npn ?? '-' },
    ];

    return {
      initials: getInitials(selectedNode.name),
      branchChips,
      vendorTags,
      vendorLabel,
      lastSeen,
      stats,
      detailCards,
    };
  }, [selectedNode]);

  const handleToggleNode = useCallback(
    (id: string) => {
      toggleExpandedId(id);
    },
    [toggleExpandedId],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      if (!graph) {
        return;
      }
      setSelectedNodeId(nodeId);
      const path = buildAncestorPath(nodeId, parentMap);
      const next = new Set(expandedIds);
      path.forEach((pathId) => {
        next.add(pathId);
      });
      setExpandedIds(next);
      setHighlightedPath(path);

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      if (!focusLens) {
        highlightTimeoutRef.current = window.setTimeout(() => {
          setHighlightedPath([]);
        }, 4000);
      }

      // Keep selection and highlight without forcing a viewport zoom
      window.requestAnimationFrame(() => {
        const instance = reactFlowInstance;
        if (!instance) return;
        const viewport = instance.getViewport();
        const targetNode = instance.getNodes().find((node) => node.id === nodeId);
        if (!targetNode) return;
        instance.setCenter(
          targetNode.position.x + (targetNode.width ?? 0) / 2,
          targetNode.position.y + (targetNode.height ?? 0) / 2,
          {
            duration: 500,
            zoom: Math.max(viewport.zoom, 0.95),
          },
        );
      });
    },
    [graph, parentMap, expandedIds, setExpandedIds, setSelectedNodeId, setHighlightedPath, focusLens, reactFlowInstance],
  );

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        setSelectedNodeId(null);
        setHighlightedPath([]);
        return;
      }
      focusNode(nodeId);
    },
    [focusNode, setSelectedNodeId, setHighlightedPath],
  );

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (searchResults.length === 0) return;
      focusNode(searchResults[0].id);
      setSearchValue('');
    },
    [searchResults, focusNode],
  );

  const handleSearchPick = useCallback(
    (id: string) => {
      focusNode(id);
      setSearchValue('');
    },
    [focusNode],
  );

  const handleExport = useCallback(
    async (mode: 'viewport-svg' | 'viewport-png' | 'full-svg') => {
      if (!canvasRef.current) return;
      const element = canvasRef.current.querySelector('.react-flow__viewport') as HTMLElement | null;
      if (!element) return;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rootName = graph?.rootIds.map((id) => graph.nodesById.get(id)?.name ?? 'root').join('-') ?? 'hierarchy';
      const baseName = `upline-${rootName}-${density}-${timestamp}`;

      if (mode === 'viewport-png') {
        const dataUrl = await toPng(element, { pixelRatio: window.devicePixelRatio * 2 });
        downloadDataUrl(dataUrl, `${baseName}.png`);
        return;
      }

      if (mode === 'viewport-svg') {
        const dataUrl = await toSvg(element);
        downloadText(dataUrl, `${baseName}.svg`);
        return;
      }

      if (mode === 'full-svg') {
        const prevExpanded = new Set(expandedIds);
        const allIds = graph ? Array.from(graph.nodesById.keys()) : [];
        setExpandedIds(allIds);
        await new Promise((resolve) => setTimeout(resolve, 120));
        const fullElement = canvasRef.current.querySelector('.react-flow__viewport') as HTMLElement | null;
        if (fullElement) {
          const dataUrl = await toSvg(fullElement);
          downloadText(dataUrl, `${baseName}-full.svg`);
        }
        setExpandedIds(prevExpanded);
      }
    },
    [canvasRef, graph, density, expandedIds, setExpandedIds],
  );

  const handleRefresh = useCallback(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const handleFocusRoot = useCallback(() => {
    if (!graph || !reactFlowInstance) return;
    reactFlowInstance.fitView({ padding: 0.4, duration: 500 });
  }, [graph, reactFlowInstance]);

  const toggleDensity = useCallback(() => {
    const order: Density[] = ['comfortable', 'cozy', 'compact'];
    const currentIdx = order.indexOf(density);
    const next = order[(currentIdx + 1) % order.length];
    setDensity(next);
  }, [density, setDensity]);

  if (loading && !snapshot) {
    return (
      <div className="visual-hierarchy-page">
        <div className="visual-hierarchy-loading">Loading hierarchy…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="visual-hierarchy-page">
        <div className="visual-hierarchy-error">
          <h2>Unable to load hierarchy</h2>
          <p>{error}</p>
          <button type="button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="visual-hierarchy-page">
        <div className="visual-hierarchy-empty">No hierarchy data available</div>
      </div>
    );
  }

  return (
    <div className="visual-hierarchy-page" data-theme={theme}>
      <header className="visual-hierarchy-header">
        <div className="visual-hierarchy-header__content">
          <div>
            <button
              type="button"
              className="visual-hierarchy-back"
              aria-label="Back to hierarchy hub"
              onClick={() => window.location.assign('/')}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <h1>Visual Upline Hierarchy</h1>
          </div>
          <div className="visual-hierarchy-header__actions">
            <button
              type="button"
              className="visual-hierarchy-btn visual-hierarchy-btn--primary"
              onClick={() => handleExport('viewport-svg')}
            >
              <Download size={16} />
              Export SVG
            </button>
            <button
              type="button"
              className="visual-hierarchy-btn"
              onClick={() => handleExport('viewport-png')}
            >
              <Download size={16} />
              Export PNG
            </button>
            <button
              type="button"
              className="visual-hierarchy-btn visual-hierarchy-btn--ghost"
              onClick={() => handleExport('full-svg')}
            >
              <Download size={16} />
              Export Full Tree
            </button>
          </div>
        </div>
        <div className="visual-hierarchy-stats">
          <div className="visual-hierarchy-stat-card">
            <Users size={18} />
            <div>
              <span className="visual-hierarchy-stat-label">Total Contacts</span>
              <span className="visual-hierarchy-stat-value">{stats.total}</span>
            </div>
          </div>
          <div className="visual-hierarchy-stat-card">
            <Sparkles size={18} />
            <div>
              <span className="visual-hierarchy-stat-label">Active</span>
              <span className="visual-hierarchy-stat-value">{stats.active}</span>
            </div>
          </div>
          <div className="visual-hierarchy-stat-card">
            <Focus size={18} />
            <div>
              <span className="visual-hierarchy-stat-label">With Upline</span>
              <span className="visual-hierarchy-stat-value">{stats.withUpline}</span>
            </div>
          </div>
          <div className="visual-hierarchy-stat-card">
            <Target size={18} />
            <div>
              <span className="visual-hierarchy-stat-label">Pending</span>
              <span className="visual-hierarchy-stat-value">{stats.pending}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="visual-hierarchy-main">
        <section className="visual-hierarchy-toolbar">
          <form className="visual-hierarchy-search" onSubmit={handleSearchSubmit}>
            <Search size={16} />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by name or NPN"
              aria-label="Search contacts"
            />
            <button type="submit">Focus</button>
            {searchResults.length > 0 && (
              <div className="visual-hierarchy-search__results">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="visual-hierarchy-search__result"
                    onClick={() => handleSearchPick(result.id)}
                  >
                    <span>{result.name}</span>
                    <span className="visual-hierarchy-search__meta">
                      {result.npn ? `NPN ${result.npn}` : 'No NPN'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="visual-hierarchy-toolbar__actions">
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={toggleDensity}
            >
              Density · {density}
            </button>
            <button
              type="button"
              className={`visual-hierarchy-chip ${focusLens ? 'is-active' : ''}`}
              onClick={toggleFocusLens}
              title="Dim unrelated branches (Space)"
            >
              <Focus size={14} />
              Focus
            </button>
            <button type="button" className="visual-hierarchy-chip" onClick={handleFocusRoot}>
              <Maximize2 size={14} />
              Fit view
            </button>
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={() => (graph ? setExpandedIds(graph.rootIds) : undefined)}
              title="Collapse to roots"
            >
              <Minimize2 size={14} />
              Collapse all
            </button>
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={() => (graph ? setExpandedIds(Array.from(graph.nodesById.keys())) : undefined)}
              title="Expand all nodes"
            >
              <Maximize2 size={14} />
              Expand all
            </button>
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh snapshot"
            >
              <RefreshCw size={14} className={loading ? 'spinning' : ''} />
              Refresh
            </button>
            {graph ? (
              <div className="visual-hierarchy-depth">
                <label htmlFor="depthRange">Depth</label>
                <input
                  id="depthRange"
                  type="range"
                  min={1}
                  max={Math.max(2, ...Array.from(graph.nodesById.values()).map((n) => n.depth + 1))}
                  value={depthLimit ?? Math.max(2, ...Array.from(graph.nodesById.values()).map((n) => n.depth + 1))}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const max = Math.max(2, ...Array.from(graph.nodesById.values()).map((n) => n.depth + 1));
                    setDepthLimit(v >= max ? null : v);
                  }}
                  title="Limit visible levels"
                />
                <span className="visual-hierarchy-depth__value">{depthLimit ?? 'All'}</span>
              </div>
            ) : null}
          </div>
        </section>

        {selectedNodeId && highlightedPath.length ? (
          <nav className="visual-hierarchy-breadcrumbs" aria-label="Path">
            {highlightedPath.map((id, idx) => {
              const person = graph?.nodesById.get(id);
              if (!person) return null;
              const isLast = idx === highlightedPath.length - 1;
              return (
                <button
                  key={id}
                  type="button"
                  className={`visual-hierarchy-breadcrumbs__item ${isLast ? 'is-current' : ''}`}
                  onClick={() => focusNode(id)}
                  title={person.name}
                >
                  {person.name}
                  {!isLast ? <span className="visual-hierarchy-breadcrumbs__sep">›</span> : null}
                </button>
              );
            })}
          </nav>
        ) : null}

        <section className="visual-hierarchy-workspace">
          <div className="visual-hierarchy-canvas" ref={canvasRef}>
            <HierarchyCanvas
              graph={graph}
              expandedIds={expandedIds}
              density={density}
              focusLens={focusLens}
              highlightedPath={highlightedPath}
              selectedNodeId={selectedNodeId}
              onToggleNode={handleToggleNode}
              onSelectNode={handleSelectNode}
              onHoverNode={setHoveredNodeId}
              hoveredNodeId={hoveredNodeId}
              depthLimit={depthLimit}
              theme={theme as 'dark' | 'light'}
              onInit={setReactFlowInstance}
            />
          </div>
          <aside className={`visual-hierarchy-inspector ${selectedNode ? 'is-open' : ''}`}>
            {selectedNode ? (
              <>
                <header className="visual-hierarchy-inspector__header">
                  <div className="visual-hierarchy-inspector__avatar">
                    {selectedNodeInfo?.initials}
                  </div>
                  <div className="visual-hierarchy-inspector__headline">
                    <h2>{selectedNode.name}</h2>
                    <p>{selectedNode.npn ? `NPN ${selectedNode.npn}` : 'No NPN on file'}</p>
                    <div className="visual-hierarchy-inspector__tags">
                      <span
                        className={`visual-hierarchy-inspector__status visual-hierarchy-inspector__status--${selectedNode.status}`}
                      >
                        {selectedNode.status.toUpperCase()}
                      </span>
                      {selectedNodeInfo?.vendorTags?.map((tag) => (
                        <span key={tag} className="visual-hierarchy-inspector__chip">
                          {tag}
                        </span>
                      ))}
                      {selectedNodeInfo?.lastSeen ? (
                        <span className="visual-hierarchy-inspector__chip visual-hierarchy-inspector__chip--muted">
                          Last touch {selectedNodeInfo.lastSeen}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </header>
                {selectedNodeInfo?.branchChips.length ? (
                  <div className="visual-hierarchy-inspector__branch">
                    {selectedNodeInfo.branchChips.map((chip) => (
                      <span
                        key={chip.label}
                        className={`visual-hierarchy-inspector__chip visual-hierarchy-inspector__chip--${chip.tone}`}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {selectedNodeInfo?.stats?.length ? (
                  <div className="visual-hierarchy-inspector__card-grid">
                    {selectedNodeInfo.stats.map((stat) => (
                      <div
                        key={stat.label}
                        className={`visual-hierarchy-inspector__card${stat.tone ? ` is-${stat.tone}` : ''}`}
                      >
                        <span className="visual-hierarchy-inspector__card-label">{stat.label}</span>
                        <span className="visual-hierarchy-inspector__card-value">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {selectedNodeInfo?.detailCards?.length ? (
                  <div className="visual-hierarchy-inspector__details">
                    {selectedNodeInfo.detailCards.map((card) => (
                      <div key={card.label} className="visual-hierarchy-inspector__detail-row">
                        <span className="visual-hierarchy-inspector__detail-label">{card.label}</span>
                        {card.link && card.value !== '-' ? (
                          <a
                            href={card.link}
                            className="visual-hierarchy-inspector__detail-value visual-hierarchy-inspector__detail-value--link"
                          >
                            {card.value}
                          </a>
                        ) : (
                          <span className="visual-hierarchy-inspector__detail-value">{card.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="visual-hierarchy-inspector__empty">
                <Focus size={18} />
                <p>Select a node to see details</p>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
};

export default VisualHierarchyPage;

const buildAncestorPath = (nodeId: string, parentMap: Map<string, string | null>) => {
  const path: string[] = [];
  let current: string | null | undefined = nodeId;
  while (current) {
    path.unshift(current);
    current = parentMap.get(current) ?? null;
  }
  return path;
};

const buildHierarchyGraph = (
  roots: GHLHierarchyNode[],
): { graph: HierarchyGraph; parentMap: Map<string, string | null> } => {
  const nodesById = new Map<string, PersonNode>();
  const parentMap = new Map<string, string | null>();
  const rootIds: string[] = [];

  const visit = (node: GHLHierarchyNode, depth: number, parentId: string | null) => {
    const status = statusMap[node.status] ?? 'inactive';
    const person: PersonNode = {
      id: node.id,
      name: node.label,
      npn: node.npn,
      title: node.companyName ?? node.compLevel,
      avatarUrl: null,
      email: node.email,
      status,
      parentId,
      childrenIds: [],
      depth,
      branchSummary: {
        active: 0,
        pending: 0,
        inactive: 0,
      },
      metrics: {
        descendantCount: node.metrics.descendantCount,
        directReports: node.metrics.directReports,
        lastSeen: node.xcel?.lastTouch ?? null,
      },
      vendorGroup: node.vendorGroup,
      uplineSource: node.uplineSource,
      sourceNode: node,
    };

    nodesById.set(node.id, person);
    parentMap.set(node.id, parentId);
    if (!parentId) {
      rootIds.push(node.id);
    }

    node.children.forEach((child) => {
      visit(child, depth + 1, node.id);
      person.childrenIds.push(child.id);
      const childPerson = nodesById.get(child.id);
      if (childPerson) {
        person.branchSummary[childPerson.status] += 1;
      }
    });
  };

  roots.forEach((root) => visit(root, 0, null));

  return {
    graph: {
      nodesById,
      rootIds,
    },
    parentMap,
  };
};

const computeDefaultExpandedIds = (graph: HierarchyGraph) => {
  const expanded = new Set(graph.rootIds);
  graph.nodesById.forEach((node) => {
    if (
      node.childrenIds.length >= AUTO_EXPAND_CHILDREN_THRESHOLD &&
      node.depth > 0 &&
      node.depth <= AUTO_EXPAND_MAX_DEPTH
    ) {
      expanded.add(node.id);
    }
  });
  return Array.from(expanded);
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

const downloadText = (svgData: string, filename: string) => {
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};



