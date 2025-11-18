import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Focus,
  FoldVertical,
  Moon,
  RefreshCw,
  Scan,
  Search,
  Sparkles,
  Sun,
  Target,
  UnfoldVertical,
  Users,
} from 'lucide-react';
import { toPng, toSvg } from 'html-to-image';
import type { ReactFlowInstance } from 'reactflow';
import type { GHLHierarchyNode, GHLSnapshot } from '../lib/types';
import HierarchyCanvas, { CANVAS_FIT_VIEW_PADDING, CANVAS_MIN_ZOOM } from '../components/hierarchy/HierarchyCanvas';
import {
  useHierarchyStore,
  useDensity,
  useExpandedIds,
  useFocusLens,
  useHighlightedPath,
  useTheme,
  useSelectedNodeId,
  useScopeRootId,
} from '../components/hierarchy/useHierarchyStore';
import type {
  HierarchyGraph,
  PersonNode,
  PersonStatus,
} from '../components/hierarchy/types';
import '../App.css';
import './VisualHierarchyPage.css';

const EXPANSION_STORAGE_KEY = 'visual-hierarchy-expanded-ids';
const SCOPE_STORAGE_KEY = 'visual-hierarchy-scope-root';
const DEFAULT_SCOPE_DEPTH_PAD = 5;
const CHILDREN_PAGE_SIZE = 8;
const SURELC_DEMO_LINK_ENABLED = false;

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
  const expandedIds = useExpandedIds();
  const setExpandedIds = useHierarchyStore((state) => state.setExpandedIds);
  const toggleExpandedId = useHierarchyStore((state) => state.toggleExpandedId);
  const selectedNodeId = useSelectedNodeId();
  const setSelectedNodeId = useHierarchyStore((state) => state.setSelectedNodeId);
  const focusLens = useFocusLens();
  const toggleFocusLens = useHierarchyStore((state) => state.toggleFocusLens);
  const setFocusLensValue = useHierarchyStore((state) => state.setFocusLens);
  const highlightedPath = useHighlightedPath();
  const setHighlightedPath = useHierarchyStore((state) => state.setHighlightedPath);
  const theme = useTheme();
  const setTheme = useHierarchyStore((state) => state.setTheme);
  const toggleTheme = useHierarchyStore((state) => state.toggleTheme);
  const scopeRootId = useScopeRootId();
  const setScopeRootId = useHierarchyStore((state) => state.setScopeRootId);
  const clearScopeRootId = useHierarchyStore((state) => state.clearScopeRootId);

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
  const scopeHydratedRef = useRef(false);
  const autoFocusLensRef = useRef(false);
  const depthLimitAutoRef = useRef(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [depthLimit, setDepthLimit] = useState<number | null>(null);
  const [childPageIndex, setChildPageIndex] = useState(0);
  const [showAllChildren, setShowAllChildren] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement | null>(null);

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
    scopeHydratedRef.current = false;
  }, [snapshot]);

  useEffect(() => {
    if (!graph || !scopeRootId) {
      return;
    }
    if (!graph.nodesById.has(scopeRootId)) {
      clearScopeRootId();
    }
  }, [graph, scopeRootId, clearScopeRootId]);

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
    setExpandedIds(graph.rootIds);
  }, [graph, setExpandedIds]);

  useEffect(() => {
    if (expandedIds.size === 0) {
      return;
    }
    window.localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(Array.from(expandedIds)));
  }, [expandedIds]);

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

  const computedMaxChildPages = useMemo(() => {
    if (!graph) return 1;
    let maxPages = 1;
    graph.nodesById.forEach((node) => {
      if (!expandedIds.has(node.id)) return;
      if (node.childrenIds.length > CHILDREN_PAGE_SIZE) {
        const pages = Math.ceil(node.childrenIds.length / CHILDREN_PAGE_SIZE);
        if (pages > maxPages) {
          maxPages = pages;
        }
      }
    });
    return maxPages;
  }, [graph, expandedIds]);
  const maxChildPages = showAllChildren ? 1 : computedMaxChildPages;

  useEffect(() => {
    if (showAllChildren) return;
    if (childPageIndex > maxChildPages - 1) {
      setChildPageIndex(Math.max(0, maxChildPages - 1));
    }
  }, [childPageIndex, maxChildPages, showAllChildren]);

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

  const scopedRootNode: PersonNode | null = useMemo(() => {
    if (!graph || !scopeRootId) return null;
    return graph.nodesById.get(scopeRootId) ?? null;
  }, [graph, scopeRootId]);

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
    const rawSource = selectedNode.uplineSource ?? 'unknown';
    const sourceLabel =
      rawSource === 'fallback' ? 'DEFAULT' : rawSource.toUpperCase();

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

  const selectedPagination = useMemo(() => {
    if (!selectedNode) return null;
    const childCount = selectedNode.childrenIds.length;
    if (childCount === 0) return null;
    if (showAllChildren) {
      return {
        nodeName: selectedNode.name,
        totalChildren: childCount,
        showAll: true,
      };
    }
    if (childCount <= CHILDREN_PAGE_SIZE) return null;
    const totalPages = Math.ceil(childCount / CHILDREN_PAGE_SIZE);
    const pageIndex = Math.min(childPageIndex, Math.max(totalPages - 1, 0));
    const start = pageIndex * CHILDREN_PAGE_SIZE + 1;
    const end = Math.min(childCount, (pageIndex + 1) * CHILDREN_PAGE_SIZE);
    return {
      nodeName: selectedNode.name,
      pageIndex,
      totalPages,
      start,
      end,
      totalChildren: childCount,
      showAll: false,
    };
  }, [selectedNode, childPageIndex, showAllChildren]);

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
            zoom: viewport.zoom,
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

  const handleFocusBranch = useCallback(
    (nodeId: string) => {
      if (!graph) return;
      const node = graph.nodesById.get(nodeId);
      if (!node) return;
      setScopeRootId(nodeId);
      focusNode(nodeId);
      if (!focusLens) {
        setFocusLensValue(true);
        autoFocusLensRef.current = true;
      } else {
        autoFocusLensRef.current = false;
      }
      if (depthLimit === null) {
        setDepthLimit(DEFAULT_SCOPE_DEPTH_PAD);
        depthLimitAutoRef.current = true;
      } else {
        depthLimitAutoRef.current = false;
      }
    },
    [graph, focusNode, setScopeRootId, focusLens, setFocusLensValue, depthLimit],
  );

  const handleClearScope = useCallback(() => {
    if (!scopeRootId) return;
    clearScopeRootId();
    if (autoFocusLensRef.current) {
      setFocusLensValue(false);
    }
    autoFocusLensRef.current = false;
    if (depthLimitAutoRef.current) {
      setDepthLimit(null);
    }
    depthLimitAutoRef.current = false;
  }, [scopeRootId, clearScopeRootId, setFocusLensValue, setDepthLimit]);

  const handleGlobalPagination = useCallback(
    (direction: 'next' | 'prev') => {
      if (showAllChildren) return;
      setChildPageIndex((prev) => {
        if (direction === 'next') {
          return Math.min(prev + 1, Math.max(0, maxChildPages - 1));
        }
        return Math.max(prev - 1, 0);
      });
    },
    [maxChildPages, showAllChildren],
  );

  const handleToggleShowAll = useCallback(() => {
    setShowAllChildren((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!graph || scopeHydratedRef.current) {
      return;
    }
    scopeHydratedRef.current = true;
    try {
      const storedScope = window.localStorage.getItem(SCOPE_STORAGE_KEY);
      if (storedScope && graph.nodesById.has(storedScope)) {
        setScopeRootId(storedScope);
        focusNode(storedScope);
      }
    } catch {
      // ignore hydration errors
    }
  }, [graph, focusNode, setScopeRootId]);

  useEffect(() => {
    if (!scopeHydratedRef.current) {
      return;
    }
    try {
      if (scopeRootId) {
        window.localStorage.setItem(SCOPE_STORAGE_KEY, scopeRootId);
      } else {
        window.localStorage.removeItem(SCOPE_STORAGE_KEY);
      }
    } catch {
      // ignore persistence errors
    }
  }, [scopeRootId]);

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
    reactFlowInstance.fitView({
      padding: CANVAS_FIT_VIEW_PADDING,
      duration: 500,
      minZoom: CANVAS_MIN_ZOOM,
      includeHiddenNodes: true,
    });
  }, [graph, reactFlowInstance]);

  const handleToggleFocusLens = useCallback(() => {
    autoFocusLensRef.current = false;
    toggleFocusLens();
  }, [toggleFocusLens]);

  useEffect(() => {
    if (!reactFlowInstance) return undefined;
    const fitTimeout = window.setTimeout(() => {
      handleFocusRoot();
    }, 150);
    return () => window.clearTimeout(fitTimeout);
  }, [childPageIndex, showAllChildren, handleFocusRoot, reactFlowInstance]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space' && (event.target instanceof HTMLElement ? event.target.tagName === 'BODY' : true)) {
        event.preventDefault();
        handleToggleFocusLens();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [handleToggleFocusLens]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [exportDropdownOpen]);

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
            {SURELC_DEMO_LINK_ENABLED && (
              <button
                type="button"
                className="visual-hierarchy-back"
                aria-label="Open SureLC Demo"
                onClick={() => window.location.assign('/surelc-demo')}
              >
                <ArrowLeft size={16} />
                SureLC Demo
              </button>
            )}
            <h1>Visual Upline Hierarchy</h1>
          </div>
          <div className="visual-hierarchy-export-dropdown" ref={exportDropdownRef}>
            <button
              type="button"
              className="visual-hierarchy-btn visual-hierarchy-btn--export"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
            >
              <Download size={16} />
              Export
              <ChevronDown size={14} />
            </button>
            {exportDropdownOpen && (
              <div className="visual-hierarchy-export-dropdown__menu">
                <button
                  type="button"
                  className="visual-hierarchy-export-dropdown__item"
                  onClick={() => {
                    handleExport('viewport-svg');
                    setExportDropdownOpen(false);
                  }}
                >
                  <Download size={16} />
                  Export SVG
                </button>
                <button
                  type="button"
                  className="visual-hierarchy-export-dropdown__item"
                  onClick={() => {
                    handleExport('viewport-png');
                    setExportDropdownOpen(false);
                  }}
                >
                  <Download size={16} />
                  Export PNG
                </button>
                <button
                  type="button"
                  className="visual-hierarchy-export-dropdown__item"
                  onClick={() => {
                    handleExport('full-svg');
                    setExportDropdownOpen(false);
                  }}
                >
                  <Download size={16} />
                  Export Full Tree
                </button>
              </div>
            )}
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
            {/* Display Controls */}
            <button
              type="button"
              className="visual-hierarchy-chip visual-hierarchy-chip--icon-only"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {/* View Controls */}
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={handleFocusRoot}
              title="Fit view to content"
            >
              <Scan size={14} />
              Fit
            </button>
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={() => (graph ? setExpandedIds(graph.rootIds) : undefined)}
              title="Collapse all nodes to roots"
            >
              <FoldVertical size={14} />
              Collapse
            </button>
            <button
              type="button"
              className="visual-hierarchy-chip"
              onClick={() => (graph ? setExpandedIds(Array.from(graph.nodesById.keys())) : undefined)}
              title="Expand all nodes"
            >
              <UnfoldVertical size={14} />
              Expand
            </button>

            {/* Focus Controls */}
            <button
              type="button"
              className={`visual-hierarchy-chip ${focusLens ? 'is-active' : ''}`}
              onClick={handleToggleFocusLens}
              title="Dim unrelated branches (Space)"
            >
              <Focus size={14} />
              Focus
            </button>
            {scopeRootId ? (
              <button
                type="button"
                className="visual-hierarchy-chip visual-hierarchy-chip--scope"
                onClick={handleClearScope}
                title="Return to full organization"
              >
                <ArrowLeft size={14} />
                Exit focus
              </button>
            ) : null}

            {/* Data Controls */}
            {graph ? (
              <div className="visual-hierarchy-depth">
                <label htmlFor="depthRange">{scopeRootId ? 'Depth (from focus)' : 'Depth'}</label>
                <input
                  id="depthRange"
                  type="range"
                  min={1}
                  max={Math.max(2, ...Array.from(graph.nodesById.values()).map((n) => n.depth + 1))}
                  value={depthLimit ?? Math.max(2, ...Array.from(graph.nodesById.values()).map((n) => n.depth + 1))}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const max = Math.max(2, ...Array.from(graph.nodesById.values()).map((n) => n.depth + 1));
                    depthLimitAutoRef.current = false;
                    setDepthLimit(v >= max ? null : v);
                  }}
                  title="Limit visible levels"
                />
                <span className="visual-hierarchy-depth__value">{depthLimit ?? 'All'}</span>
              </div>
            ) : null}
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
            <div className="visual-hierarchy-toolbar__pager">
              <div className="visual-hierarchy-toolbar__pager-meta">
                {selectedPagination ? (
                  selectedPagination.showAll ? (
                    <span className="visual-hierarchy-toolbar__pager-range">
                      Showing all {selectedPagination.totalChildren} children
                    </span>
                  ) : (
                    <span className="visual-hierarchy-toolbar__pager-range">
                      {selectedPagination.start}-{selectedPagination.end} of {selectedPagination.totalChildren}
                    </span>
                  )
                ) : (
                  <span className="visual-hierarchy-toolbar__pager-range">
                    {showAllChildren
                      ? 'Showing all nodes'
                      : `Page ${Math.min(childPageIndex + 1, maxChildPages)} / ${maxChildPages}`}
                  </span>
                )}
              </div>
              <div className="visual-hierarchy-toolbar__pager-controls">
                <button
                  type="button"
                  onClick={() => handleGlobalPagination('prev')}
                  disabled={showAllChildren || childPageIndex === 0}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className={showAllChildren ? 'is-active' : undefined}
                  onClick={handleToggleShowAll}
                  aria-pressed={showAllChildren}
                >
                  {showAllChildren ? 'Paged view' : 'Show all'}
                </button>
                <button
                  type="button"
                  onClick={() => handleGlobalPagination('next')}
                  disabled={showAllChildren || childPageIndex >= maxChildPages - 1}
                >
                  Next
                </button>
              </div>
            </div>
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
        {scopedRootNode ? (
          <div className="visual-hierarchy-scope-callout">
            <Target size={14} />
            <div>
              <span className="visual-hierarchy-scope-callout__label">Focused branch</span>
              <p>{scopedRootNode.name}</p>
            </div>
          </div>
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
              scopeRootId={scopeRootId}
              theme={theme as 'dark' | 'light'}
              onInit={setReactFlowInstance}
              childPageIndex={childPageIndex}
              childrenPageSize={CHILDREN_PAGE_SIZE}
              showAllChildren={showAllChildren}
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
                <div className="visual-hierarchy-inspector__actions">
                  {scopeRootId === selectedNode.id ? (
                    <button type="button" onClick={handleClearScope}>
                      <ArrowLeft size={14} />
                      Exit focus
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleFocusBranch(selectedNode.id)}>
                      <Target size={14} />
                      Focus this branch
                    </button>
                  )}
                </div>
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
