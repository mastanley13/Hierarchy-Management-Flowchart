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
  Scan,
  Search,
  Sparkles,
  Target,
  UnfoldVertical,
  Users,
} from 'lucide-react';
import { toPng, toSvg } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type ReactFlowInstance } from 'reactflow';
import type { GHLHierarchyNode, GHLSnapshot } from '../lib/types';
import HierarchyCanvas, { CANVAS_FIT_VIEW_PADDING, CANVAS_MIN_ZOOM } from '../components/hierarchy/HierarchyCanvas';
import { CollapsibleSection } from '../components/hierarchy/CollapsibleSection';
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
const CHILDREN_PAGE_SIZE = 8;
const SURELC_DEMO_LINK_ENABLED = false;

type SurelcEndpointResult = {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  body: unknown;
};

type SurelcProducerPayload = {
  ok: boolean;
  cached: boolean;
  whichUsed?: string;
  identifiers: { npn: string | null; producerId: string | null };
  fetchedAt: string;
  mode?: 'single' | 'both';
  errorCode?: 'NOT_FOUND' | 'ACCESS_DENIED' | 'FAILED';
  error?: string;
  details?: string;
  hint?: string;
  attemptedCredentials?: string[];
  attempts?: Array<{
    which: string;
    producerByNpn: { status: number; ok: boolean } | null;
    producerById: { status: number; ok: boolean } | null;
    relationship: { status: number; ok: boolean } | null;
  }>;
  summary?: {
    compliance?: {
      aml?: { date: string | null; provider: string | null };
      eno?: {
        carrierName: string | null;
        policyNoMasked: string | null;
        certificateNoMasked: string | null;
        startedOn: string | null;
        expiresOn: string | null;
        caseLimit: number | null;
        totalLimit: number | null;
      };
      securities?: {
        finraLicense: boolean | null;
        crdNo: string | null;
        brokerDealer: string | null;
        investmentAdviser: string | null;
      };
      designations?: string[];
      dataAsOf?: string | null;
    };
    producer?: {
      recordType: string | null;
      title: string | null;
      companyType: string | null;
      entityType: string | null;
      createdDate: string | null;
    };
    relationship?: {
      gaId: string | number | null;
      branchCode: string | null;
      upline: string | null;
      status: string | null;
      subscribed: string | boolean | null;
      unsubscriptionDate: string | null;
      addedOn: string | null;
      errors: string | null;
      warnings: string | null;
    };
    statuses?: {
      producer: string | null;
      bga: string | null;
      carrier: string | null;
    };
    licenses?: {
      total: number;
      byStatus: Array<{ status: string; count: number }>;
      soonestExpiration: string | null;
      residentStates: string[];
    };
    appointments?: {
      total: number;
      byStatus: Array<{ status: string; count: number }>;
      appointedCarriers: number;
      terminatedCarriers: number;
      byCarrierTop: Array<{
        carrierId: string;
        total: number;
        byStatus: Array<{ status: string; count: number }>;
        statesTop: Array<{ state: string; count: number }>;
      }>;
    };
    contracts?: {
      total: number;
      byStatus: Array<{ status: string; count: number }>;
      activeCarriers: number;
      byCarrierTop: Array<{
        carrierId: string;
        total: number;
        byStatus: Array<{ status: string; count: number }>;
      }>;
    };
  };
  endpointsMeta?: Record<
    string,
    | {
        ok: boolean;
        status: number;
        statusText: string;
        url: string;
        shape: { type: string; count?: number; keys?: number };
      }
    | null
  >;
  endpoints?: Record<string, SurelcEndpointResult | undefined>;
  views?: Partial<Record<'QUILITY' | 'EQUITA', any>>;
};

type SurelcFetchState = {
  loading: boolean;
  error: string | null;
  data: SurelcProducerPayload | null;
};

type ExportMode =
  | 'viewport-svg'
  | 'viewport-png'
  | 'full-svg'
  | 'selected-branch-csv'
  | 'all-csv';

type ExportProgress = {
  mode: ExportMode;
  phase: string;
  completed: number;
  total: number;
};

type FieldRow = {
  label: string;
  value: string | number;
  rawValue?: unknown;
  link?: string;
  tone?: 'accent' | 'warning' | 'muted';
  dataType?: 'text' | 'date' | 'boolean' | 'number';
};

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

const fetchSnapshotData = async (options?: { includeOpportunities?: boolean }): Promise<GHLSnapshot> => {
  const url = options?.includeOpportunities ? '/api/ghl/snapshot?includeOpportunities=1' : '/api/ghl/snapshot';
  const response = await fetch(url, {
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
  const scopeRootId = useScopeRootId();
  const setScopeRootId = useHierarchyStore((state) => state.setScopeRootId);
  const [surelcState, setSurelcState] = useState<SurelcFetchState>({
    loading: false,
    error: null,
    data: null,
  });
  const [surelcRefreshNonce, setSurelcRefreshNonce] = useState(0);
  const lastSurelcRefreshNonceRef = useRef(0);
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
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

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
    setExpandedIds(Array.from(graph.nodesById.keys()));
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

  // Helper functions for field value formatting
  const formatFieldValue = (value: unknown, dataType?: 'text' | 'date' | 'boolean' | 'number'): string => {
    if (value === null || value === undefined || value === '') return '-';

    if (dataType === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (dataType === 'date') {
      return formatDate(String(value)) ?? String(value);
    }

    if (typeof value === 'number') {
      return value.toLocaleString();
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.join('; ') : '-';
    }

    return String(value);
  };

  const readCustomField = (node: PersonNode, key: string): unknown => {
    return node.sourceNode.customFields?.[key];
  };

  const readOpportunityCustomField = (node: PersonNode, key: string): unknown => {
    return node.sourceNode.opportunity?.customFields?.[key];
  };

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

    // Category 1: Contact Information
    const contactInfo: FieldRow[] = [
      { label: 'Contact ID', value: selectedNode.id },
      { label: 'Name', value: selectedNode.name },
      { label: 'NPN', value: selectedNode.npn ?? '-' },
      {
        label: 'Email',
        value: selectedNode.email ?? '-',
        link: selectedNode.email ? `mailto:${selectedNode.email}` : undefined
      },
      {
        label: 'Phone',
        value: selectedNode.sourceNode.phone ?? '-',
        link: selectedNode.sourceNode.phone ? `tel:${selectedNode.sourceNode.phone}` : undefined
      },
      { label: 'Source', value: selectedNode.sourceNode.source ?? '-' },
      { label: 'Status', value: selectedNode.status.toUpperCase() },
      {
        label: 'Profile',
        value: (() => {
          const flags = selectedNode.sourceNode.flags;
          if (flags?.equitaProfile && flags?.quilityProfile) return 'Combined';
          if (flags?.equitaProfile) return 'Equita';
          if (flags?.quilityProfile) return 'Quility';
          return '-';
        })()
      },
    ];

    // Category 2: Organization & Role
    const organizationInfo: FieldRow[] = [
      { label: 'Company', value: selectedNode.sourceNode.companyName ?? '-' },
      { label: 'Comp Level', value: selectedNode.sourceNode.compLevel ?? '-' },
      {
        label: 'Comp Level Link',
        value: formatFieldValue(readCustomField(selectedNode, 'contact.comp_level_link'))
      },
      {
        label: 'Comp Level Notes',
        value: formatFieldValue(
          readCustomField(selectedNode, 'contact.custom_comp_level_notes') ??
          selectedNode.sourceNode.compLevelNotes
        )
      },
    ];

    // Category 3: Hierarchy Relationship
    const hierarchyInfo: FieldRow[] = [
      { label: 'Upline ID', value: selectedNode.parentId ?? '-' },
      {
        label: 'Upline Name',
        value: selectedNode.sourceNode.raw?.uplineName ?? '-'
      },
      { label: 'Upline Source', value: sourceLabel },
      {
        label: 'Upline Confidence',
        value: selectedNode.sourceNode.uplineConfidence !== undefined
          ? `${(selectedNode.sourceNode.uplineConfidence * 100).toFixed(0)}%`
          : '-'
      },
      {
        label: 'Upline Highest Stage',
        value: selectedNode.sourceNode.raw?.uplineHighestStage ?? '-'
      },
      { label: 'Depth', value: selectedNode.depth },
      { label: 'Distance From Selected', value: '-' }, // Will be populated when viewing from selection context
    ];

    // Category 4: Branch Metrics
    const branchMetrics: FieldRow[] = [
      { label: 'Direct Reports', value: totalDirectReports },
      { label: 'Total Downline', value: descendantCount },
      { label: 'Segment', value: '-' }, // Will be populated during CSV export
    ];

    // Category 5: Licensing & Location
    const licensingInfo: FieldRow[] = [
      { label: 'Licensing State', value: selectedNode.sourceNode.licensingState ?? '-' },
      {
        label: 'NPN (Onboarding)',
        value: formatFieldValue(readCustomField(selectedNode, 'contact.onboarding__npn'))
      },
    ];

    // Category 6: Vendor Configuration
    const vendorConfig: FieldRow[] = [
      { label: 'Vendor Group', value: selectedNode.vendorGroup ?? '-' },
      {
        label: 'Upline Code (Equita)',
        value: formatFieldValue(readCustomField(selectedNode, 'contact.upline_code_equita'))
      },
      {
        label: 'Upline Code (Quility)',
        value: formatFieldValue(readCustomField(selectedNode, 'contact.upline_code_quility'))
      },
      {
        label: 'Equita Profile Created',
        value: formatFieldValue(selectedNode.sourceNode.flags?.equitaProfile, 'boolean')
      },
      {
        label: 'Quility Profile Created',
        value: formatFieldValue(selectedNode.sourceNode.flags?.quilityProfile, 'boolean')
      },
    ];

    // Category 7: Onboarding Status
    const onboardingStatus: FieldRow[] = [
      {
        label: 'Licensed',
        value: formatFieldValue(selectedNode.sourceNode.flags?.licensed, 'boolean')
      },
      {
        label: 'Producer Number',
        value: formatFieldValue(readCustomField(selectedNode, 'contact.onboarding__producer_number'))
      },
      {
        label: 'Cluster Applies',
        value: formatFieldValue(readCustomField(selectedNode, 'contact.onboarding__cluster_applies'), 'boolean')
      },
      {
        label: 'Upline Email',
        value: selectedNode.sourceNode.raw?.uplineEmail ?? '-',
        link: selectedNode.sourceNode.raw?.uplineEmail ? `mailto:${selectedNode.sourceNode.raw.uplineEmail}` : undefined
      },
      { label: 'Last Touch', value: lastSeen ?? '-' },
    ];

    // Category 8: XCEL Training
    const xcelTraining: FieldRow[] = [
      {
        label: 'XCEL Account Created',
        value: formatFieldValue(selectedNode.sourceNode.flags?.xcelAccountCreated, 'boolean')
      },
      {
        label: 'Username/Email',
        value: selectedNode.sourceNode.xcel?.username ?? '-'
      },
      {
        label: 'Temp Password',
        value: selectedNode.sourceNode.xcel?.tempPassword ?? '-'
      },
      {
        label: 'Enrollment Date',
        value: formatFieldValue(selectedNode.sourceNode.xcel?.enrollmentDate, 'date')
      },
      {
        label: 'Due Date',
        value: formatFieldValue(selectedNode.sourceNode.xcel?.dueDate, 'date')
      },
      {
        label: 'Last Touch',
        value: formatFieldValue(selectedNode.sourceNode.xcel?.lastTouch, 'date')
      },
      {
        label: 'Started',
        value: formatFieldValue(selectedNode.sourceNode.flags?.xcelStarted, 'boolean')
      },
      {
        label: 'Paid',
        value: formatFieldValue(selectedNode.sourceNode.flags?.xcelPaid, 'boolean')
      },
    ];

    // Category 9: Pipeline & Opportunity
    const pipelineInfo: FieldRow[] = [
      {
        label: 'Pipeline ID',
        value: selectedNode.sourceNode.opportunity?.pipelineId ?? '-'
      },
      {
        label: 'Pipeline Stage ID',
        value: selectedNode.sourceNode.opportunity?.pipelineStageId ?? '-'
      },
      {
        label: 'Monetary Value',
        value: selectedNode.sourceNode.opportunity?.monetaryValue
          ? `$${selectedNode.sourceNode.opportunity.monetaryValue.toLocaleString()}`
          : '-'
      },
      {
        label: 'Assigned To',
        value: formatFieldValue(readOpportunityCustomField(selectedNode, 'opportunity.assigned_to'))
      },
    ];

    // Category 10: Carrier Application
    const carrierApp: FieldRow[] = [
      {
        label: 'Carrier Name',
        value: formatFieldValue(readOpportunityCustomField(selectedNode, 'opportunity.carrier_app__carrier_name'))
      },
      {
        label: 'Cluster',
        value: formatFieldValue(readOpportunityCustomField(selectedNode, 'opportunity.carrier_app__cluster'))
      },
      {
        label: 'Eligible',
        value: formatFieldValue(readOpportunityCustomField(selectedNode, 'opportunity.carrier_app__eligible'), 'boolean')
      },
      {
        label: 'Upline Code Received',
        value: formatFieldValue(readOpportunityCustomField(selectedNode, 'opportunity.carrier_app__upline_code_received'), 'boolean')
      },
      {
        label: 'Current Disposition',
        value: formatFieldValue(readOpportunityCustomField(selectedNode, 'opportunity.carrier_app__current_disposition'))
      },
    ];

    return {
      initials: getInitials(selectedNode.name),
      branchChips,
      vendorTags,
      vendorLabel,
      lastSeen,
      stats,
      detailCards,
      contactInfo,
      organizationInfo,
      hierarchyInfo,
      branchMetrics,
      licensingInfo,
      vendorConfig,
      onboardingStatus,
      xcelTraining,
      pipelineInfo,
      carrierApp,
    };
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode) {
      setSurelcState({ loading: false, error: null, data: null });
      return;
    }

    const npn = selectedNode.npn ?? '';
    const rawSurelcId = selectedNode.sourceNode?.raw?.surelcId ?? '';
    const producerId = String(rawSurelcId || '').replace(/\D+/g, '');

    if (!npn && !producerId) {
      setSurelcState({ loading: false, error: null, data: null });
      return;
    }

    const controller = new AbortController();
    setSurelcState((prev) => ({ ...prev, loading: true, error: null }));

    const url = new URL('/api/surelc/producer', window.location.origin);
    if (npn) url.searchParams.set('npn', npn);
    if (producerId) url.searchParams.set('producerId', producerId);
    url.searchParams.set('which', 'AUTO');
    url.searchParams.set('mode', 'both');

    const forceRefresh = surelcRefreshNonce !== lastSurelcRefreshNonceRef.current;
    if (forceRefresh) {
      lastSurelcRefreshNonceRef.current = surelcRefreshNonce;
      url.searchParams.set('nocache', '1');
      url.searchParams.set('_', String(surelcRefreshNonce));
    }

    fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = { error: text || `SureLC request failed (${res.status})` };
        }
        if (!res.ok) {
          const message = json?.error && json?.details ? `${json.error}: ${json.details}` : (json?.error || json?.details);
          throw new Error(message || `SureLC request failed (${res.status})`);
        }
        setSurelcState({ loading: false, error: null, data: json as SurelcProducerPayload });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSurelcState({ loading: false, error: String(err?.message || err), data: null });
      });

    return () => controller.abort();
  }, [selectedNode?.id, selectedNode?.npn, selectedNode?.sourceNode?.raw?.surelcId, surelcRefreshNonce]);

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

  const surelcBadge = useMemo(() => {
    if (surelcState.loading) return '...';
    if (surelcState.error) return '!';
    if (surelcState.data && surelcState.data.ok === false) return '!';

    if (surelcState.data?.mode === 'both' && surelcState.data?.views) {
      const okCount = Object.values(surelcState.data.views).filter((v) => v?.ok).length;
      return okCount || undefined;
    }

    const meta = surelcState.data?.endpointsMeta || {};
    const okCount = Object.values(meta).filter((r) => r?.ok).length;
    return okCount || undefined;
  }, [surelcState.data, surelcState.error, surelcState.loading]);

  const buildSurelcRows = useCallback((params: {
    identifiers: { npn: string | null; producerId: string | null } | undefined;
    summary: SurelcProducerPayload['summary'] | undefined;
  }): {
    overview: FieldRow[];
    appointments: FieldRow[];
    licenses: FieldRow[];
    contracts: FieldRow[];
  } => {
    const data = params.summary;
    const relationship = data?.relationship;
    const producer = data?.producer;
    const compliance = data?.compliance;
    const statuses = data?.statuses;
    const licenses = data?.licenses;
    const appointments = data?.appointments;
    const contracts = data?.contracts;
    const ids = params.identifiers;

    const overview: FieldRow[] = [
      { label: 'SureLC Producer ID', value: ids?.producerId ?? '-' },
      { label: 'SureLC NPN', value: ids?.npn ?? selectedNode?.npn ?? '-' },
      { label: 'Upline (SureLC)', value: relationship?.upline ?? '-' },
      { label: 'Comp Level / Branch Code', value: relationship?.branchCode ?? producer?.title ?? '-' },
      { label: 'Producer Status', value: statuses?.producer ?? relationship?.status ?? '-' },
      { label: 'BGA Status', value: statuses?.bga ?? '-' },
      { label: 'Carrier Status', value: statuses?.carrier ?? '-' },
      { label: 'GA ID', value: relationship?.gaId ?? '-' },
      { label: 'Relationship Added', value: relationship?.addedOn ?? '-' },
      { label: 'Unsubscribed On', value: relationship?.unsubscriptionDate ?? '-' },
      { label: 'Errors', value: relationship?.errors ?? '-' },
      { label: 'Warnings', value: relationship?.warnings ?? '-' },
      { label: 'AML Date', value: compliance?.aml?.date ?? '-' },
      { label: 'AML Provider', value: compliance?.aml?.provider ?? '-' },
      {
        label: 'E&O',
        value: compliance?.eno?.carrierName
          ? `${compliance.eno.carrierName}${compliance.eno.expiresOn ? ` (exp ${compliance.eno.expiresOn})` : ''}`
          : '-',
      },
      { label: 'E&O Policy', value: compliance?.eno?.policyNoMasked ?? '-' },
      { label: 'E&O Certificate', value: compliance?.eno?.certificateNoMasked ?? '-' },
      { label: 'FINRA Licensed', value: typeof compliance?.securities?.finraLicense === 'boolean' ? (compliance.securities.finraLicense ? 'Yes' : 'No') : '-' },
      { label: 'CRD #', value: compliance?.securities?.crdNo ?? '-' },
      { label: 'Broker Dealer', value: compliance?.securities?.brokerDealer ?? '-' },
      { label: 'Investment Adviser', value: compliance?.securities?.investmentAdviser ?? '-' },
      { label: 'Designations', value: compliance?.designations?.length ? compliance.designations.join(', ') : '-' },
      { label: 'Data As Of', value: compliance?.dataAsOf ?? '-' },
      { label: 'Record Type', value: producer?.recordType ?? '-' },
      { label: 'Company Type', value: producer?.companyType ?? '-' },
      { label: 'Entity Type', value: producer?.entityType ?? '-' },
      { label: 'Created', value: producer?.createdDate ?? '-' },
    ];

    const licenseRows: FieldRow[] = [
      { label: 'Total Licenses', value: licenses?.total ?? 0 },
      { label: 'Soonest Expiration', value: licenses?.soonestExpiration ?? '-' },
      { label: 'Resident States', value: licenses?.residentStates?.length ? licenses.residentStates.join(', ') : '-' },
      { label: 'By Status', value: licenses?.byStatus?.length ? licenses.byStatus.map((s) => `${s.status}: ${s.count}`).join(' • ') : '-' },
    ];

    const apptRows: FieldRow[] = [
      { label: 'Total Appointments', value: appointments?.total ?? 0 },
      { label: 'Appointed Carriers', value: appointments?.appointedCarriers ?? 0 },
      { label: 'Terminated Carriers', value: appointments?.terminatedCarriers ?? 0 },
      { label: 'By Status', value: appointments?.byStatus?.length ? appointments.byStatus.map((s) => `${s.status}: ${s.count}`).join(' • ') : '-' },
      { label: 'Top Carriers', value: appointments?.byCarrierTop?.length ? appointments.byCarrierTop.slice(0, 5).map((c) => `#${c.carrierId} (${c.total})`).join(' • ') : '-' },
    ];

    const contractRows: FieldRow[] = [
      { label: 'Total Contracts', value: contracts?.total ?? 0 },
      { label: 'Active Carriers', value: contracts?.activeCarriers ?? 0 },
      { label: 'By Status', value: contracts?.byStatus?.length ? contracts.byStatus.map((s) => `${s.status}: ${s.count}`).join(' • ') : '-' },
      { label: 'Top Carriers', value: contracts?.byCarrierTop?.length ? contracts.byCarrierTop.slice(0, 5).map((c) => `#${c.carrierId} (${c.total})`).join(' • ') : '-' },
    ];

    return { overview, appointments: apptRows, licenses: licenseRows, contracts: contractRows };
  }, [selectedNode?.npn]);

  const surelcViews = useMemo(() => {
    const data = surelcState.data;
    if (!data || data.ok === false) return null;
    if (data.mode !== 'both' || !data.views) return null;
    return data.views;
  }, [surelcState.data]);

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

  const fetchSurelcPayload = useCallback(async (node: PersonNode): Promise<SurelcProducerPayload | null> => {
    const npn = normalizeDigits(node.npn ?? '');
    const rawSurelcId = normalizeDigits(node.sourceNode?.raw?.surelcId ?? '');
    const producerId = rawSurelcId;

    if (!npn && !producerId) {
      return null;
    }

    const which = node.vendorGroup === 'equita' ? 'EQUITA' : node.vendorGroup === 'quility' ? 'QUILITY' : 'AUTO';

    const url = new URL('/api/surelc/producer', window.location.origin);
    if (npn) url.searchParams.set('npn', npn);
    if (producerId) url.searchParams.set('producerId', producerId);
    url.searchParams.set('which', which);

    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { ok: false, error: text || `SureLC request failed (${res.status})` };
    }

    if (!res.ok) {
      const message = json?.error && json?.details ? `${json.error}: ${json.details}` : json?.error || json?.details;
      throw new Error(message || `SureLC request failed (${res.status})`);
    }

    return (json || null) as SurelcProducerPayload | null;
  }, []);

  const fetchSurelcForRows = useCallback(
    async (mode: ExportMode, rows: ExportCsvRow[]) => {
      const lookups: Array<{
        key: string;
        node: PersonNode;
      }> = [];
      const lookupByNodeId = new Map<string, string | null>();
      const seen = new Set<string>();

      rows.forEach(({ node }) => {
        const npn = normalizeDigits(node.npn ?? '');
        const producerId = normalizeDigits(node.sourceNode?.raw?.surelcId ?? '');
        if (!npn && !producerId) {
          lookupByNodeId.set(node.id, null);
          return;
        }

        const which = node.vendorGroup === 'equita' ? 'EQUITA' : node.vendorGroup === 'quility' ? 'QUILITY' : 'AUTO';
        const key = `which=${which}|npn=${npn}|producerId=${producerId}`;
        lookupByNodeId.set(node.id, key);
        if (seen.has(key)) return;
        seen.add(key);
        lookups.push({ key, node });
      });

      setExportProgress({ mode, phase: 'Fetching SureLC', completed: 0, total: lookups.length });

      const surelcByKey = new Map<string, SurelcProducerPayload | null>();
      const concurrency = 6;
      let completed = 0;
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const idx = nextIndex;
          nextIndex += 1;
          if (idx >= lookups.length) return;
          const { key, node } = lookups[idx];
          try {
            const payload = await fetchSurelcPayload(node);
            surelcByKey.set(key, payload);
          } catch (error) {
            console.warn('SureLC export fetch failed', { nodeId: node.id, error });
            surelcByKey.set(key, null);
          } finally {
            completed += 1;
            if (completed === lookups.length || completed % 5 === 0) {
              setExportProgress({ mode, phase: 'Fetching SureLC', completed, total: lookups.length });
            }
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, lookups.length)) }, () => worker()));

      const surelcByNodeId = new Map<string, SurelcProducerPayload | null>();
      rows.forEach(({ node }) => {
        const key = lookupByNodeId.get(node.id) ?? null;
        surelcByNodeId.set(node.id, key ? (surelcByKey.get(key) ?? null) : null);
      });

      return surelcByNodeId;
    },
    [fetchSurelcPayload],
  );

  const handleExport = useCallback(
    async (mode: ExportMode) => {
      if (!graph) return;
      if (exportBusy) return;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (mode === 'selected-branch-csv') {
        const exportRootId = selectedNodeId ?? scopeRootId;
        if (!exportRootId || !graph.nodesById.has(exportRootId)) {
          window.alert('Select a node (or focus a branch) to export a CSV.');
          return;
        }

        const exportRootNode = graph.nodesById.get(exportRootId);
        if (!exportRootNode) {
          window.alert('Unable to export CSV: selected node not found.');
          return;
        }

        const scopeLabel = sanitizeFilenamePart(exportRootNode.name);
        const filename = `hierarchy-${scopeLabel}-branch-${timestamp}.csv`;

        let exportGraph = graph;
        let exportParentMap = parentMap;
        let exportFieldLabels = buildExportFieldLabelMap();
        try {
          const exportSnapshot = await fetchSnapshotData({ includeOpportunities: true });
          const built = buildHierarchyGraph(exportSnapshot.hierarchy);
          exportGraph = built.graph;
          exportParentMap = built.parentMap;
          exportFieldLabels = buildExportFieldLabelMap(exportSnapshot);
        } catch (error) {
          console.warn('CSV export: unable to fetch opportunity data, exporting with available snapshot fields.', error);
        }

        const exportRootNodeForData = exportGraph.nodesById.get(exportRootId);
        if (!exportRootNodeForData) {
          window.alert('Unable to export CSV: selected node not found in export snapshot.');
          return;
        }

        const uplineRows = buildUplineCsvRows(exportRootId, exportGraph, exportParentMap)
          .filter((row) => row.distanceFromSelected < 0)
          .map((row) => ({ ...row, segment: 'upline' as const }));

        const selectedRow: ExportCsvRow = {
          node: exportRootNodeForData,
          distanceFromSelected: 0,
          segment: 'selected',
        };

        const downlineRows = collectDownlineCsvRows(exportRootId, exportGraph)
          .filter((row) => row.distanceFromSelected > 0)
          .map((row) => ({ ...row, segment: 'downline' as const }));

        const rows = [...uplineRows, selectedRow, ...downlineRows];

        setExportBusy(true);
        try {
          const surelcByNodeId = await fetchSurelcForRows(mode, rows);
          setExportProgress({ mode, phase: 'Generating CSV', completed: 0, total: 1 });
          const csv = generateHierarchyCsv(rows, exportGraph, exportFieldLabels, surelcByNodeId);
          downloadCsv(csv, filename);
          setExportProgress({ mode, phase: 'Done', completed: 1, total: 1 });
        } finally {
          window.setTimeout(() => setExportProgress(null), 600);
          setExportBusy(false);
        }
        return;
      }

      if (mode === 'all-csv') {
        const filename = `hierarchy-all-${timestamp}.csv`;

        let exportGraph = graph;
        let exportFieldLabels = buildExportFieldLabelMap();
        try {
          const exportSnapshot = await fetchSnapshotData({ includeOpportunities: true });
          const built = buildHierarchyGraph(exportSnapshot.hierarchy);
          exportGraph = built.graph;
          exportFieldLabels = buildExportFieldLabelMap(exportSnapshot);
        } catch (error) {
          console.warn('CSV export: unable to fetch opportunity data, exporting with available snapshot fields.', error);
        }

        const rows = collectAllCsvRows(exportGraph);
        setExportBusy(true);
        try {
          const surelcByNodeId = await fetchSurelcForRows(mode, rows);
          setExportProgress({ mode, phase: 'Generating CSV', completed: 0, total: 1 });
          const csv = generateHierarchyCsv(rows, exportGraph, exportFieldLabels, surelcByNodeId);
          downloadCsv(csv, filename);
          setExportProgress({ mode, phase: 'Done', completed: 1, total: 1 });
        } finally {
          window.setTimeout(() => setExportProgress(null), 600);
          setExportBusy(false);
        }
        return;
      }

      if (!canvasRef.current) return;
      const element = canvasRef.current.querySelector('.react-flow__viewport') as HTMLElement | null;
      if (!element) return;
      const rootName = graph.rootIds.map((id) => graph.nodesById.get(id)?.name ?? 'root').join('-') || 'hierarchy';
      const baseName = `upline-${rootName}-${density}-${timestamp}`;

      if (mode === 'viewport-png') {
        const backgroundColor = theme === 'light' ? '#f7fafc' : '#0e1117';
        const instance = reactFlowInstance;
        const nodes = instance?.getNodes?.() ?? [];

        if (instance && nodes.length > 0) {
          const bounds = getNodesBounds(nodes);
          if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width < 20 || bounds.height < 20) {
            const dataUrl = await toPng(element, { backgroundColor, pixelRatio: window.devicePixelRatio * 2 });
            downloadDataUrl(dataUrl, `${baseName}.png`);
            return;
          }
          const padding = 180;
          const targetWidth = clampNumber(Math.ceil((bounds.width + padding * 2) * 1.25), 1200, 5600);
          const targetHeight = clampNumber(Math.ceil((bounds.height + padding * 2) * 1.25), 800, 5600);
          const viewport = getViewportForBounds(bounds, targetWidth, targetHeight, CANVAS_MIN_ZOOM, 2, 0.18);
          const pixelRatio = getExportPngPixelRatio(targetWidth, targetHeight);

          const dataUrl = await toPng(element, {
            backgroundColor,
            width: targetWidth,
            height: targetHeight,
            pixelRatio,
            style: {
              width: `${targetWidth}px`,
              height: `${targetHeight}px`,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              transformOrigin: '0 0',
            },
          });
          downloadDataUrl(dataUrl, `${baseName}.png`);
          return;
        }

        const dataUrl = await toPng(element, { backgroundColor, pixelRatio: window.devicePixelRatio * 2 });
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
        const allIds = Array.from(graph.nodesById.keys());
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
    [
      canvasRef,
      graph,
      density,
      expandedIds,
      exportBusy,
      fetchSurelcForRows,
      parentMap,
      reactFlowInstance,
      scopeRootId,
      selectedNodeId,
      setExpandedIds,
      theme,
    ],
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
             <h1>Hierarchy System</h1>
             <div className="visual-hierarchy-export-dropdown" ref={exportDropdownRef}>
               <button
                 type="button"
                 className="visual-hierarchy-btn visual-hierarchy-btn--export"
                 disabled={exportBusy}
                 title={exportBusy ? 'Export in progress…' : undefined}
                 onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
               >
                 <Download size={16} />
                 {exportBusy ? 'Exporting…' : 'Export'}
                 <ChevronDown size={14} />
               </button>
               {exportDropdownOpen && (
                 <div className="visual-hierarchy-export-dropdown__menu">
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
                     disabled={exportBusy}
                     title={exportBusy ? 'Export in progress…' : undefined}
                     onClick={() => {
                       handleExport('all-csv');
                       setExportDropdownOpen(false);
                     }}
                   >
                     <Download size={16} />
                     Export All CSV
                   </button>
                   <div className="visual-hierarchy-export-dropdown__divider" />
                   <button
                     type="button"
                     className="visual-hierarchy-export-dropdown__item"
                     disabled={exportBusy || (!selectedNodeId && !scopeRootId)}
                     title={
                       exportBusy
                         ? 'Export in progress…'
                         : !selectedNodeId && !scopeRootId
                           ? 'Select a node (or focus a branch) to export.'
                           : undefined
                     }
                     onClick={() => {
                       handleExport('selected-branch-csv');
                       setExportDropdownOpen(false);
                     }}
                   >
                     <Download size={16} />
                     Export Branch CSV
                   </button>
                 </div>
               )}
               {exportProgress && (
                 <div className="visual-hierarchy-export-progress" role="status" aria-live="polite">
                   {exportProgress.phase}
                   {exportProgress.total > 0 ? ` (${exportProgress.completed}/${exportProgress.total})` : ''}
                 </div>
               )}
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
            <div className="visual-hierarchy-toolbar__chips" aria-label="View controls">
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
            </div>

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
                <div className="visual-hierarchy-inspector__comprehensive">
                  <CollapsibleSection title="Contact Information" defaultOpen={true} badge={selectedNodeInfo?.contactInfo.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.contactInfo.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          {field.link ? (
                            <a
                              href={field.link}
                              className="visual-hierarchy-inspector__detail-value visual-hierarchy-inspector__detail-value--link"
                            >
                              {field.value}
                            </a>
                          ) : (
                            <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                              {field.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="SureLC" badge={surelcBadge}>
                    <div className="surelc-section">
                      {!selectedNode?.npn && !selectedNode?.sourceNode?.raw?.surelcId ? (
                        <div className="surelc-section__empty">No NPN / SureLC ID on file for this contact.</div>
                      ) : surelcState.loading ? (
                        <div className="surelc-section__loading">Loading SureLC data...</div>
                      ) : surelcState.error ? (
                        <div className="surelc-section__error">{surelcState.error}</div>
                      ) : surelcState.data && surelcState.data.ok === false ? (
                        <div className="surelc-section__failure">
                          <div className="surelc-section__error">{surelcState.data.error || 'SureLC unavailable'}</div>
                          {surelcState.data.hint ? (
                            <div className="surelc-section__hint">{surelcState.data.hint}</div>
                          ) : null}
                          <button
                            type="button"
                            className="surelc-section__refresh"
                            onClick={() => setSurelcRefreshNonce(Date.now())}
                            disabled={surelcState.loading}
                          >
                            Refresh
                          </button>
                          {surelcState.data.attempts?.length ? (
                            <div className="surelc-section__attempts">
                              {surelcState.data.attempts.map((attempt) => {
                                const status =
                                  attempt.producerByNpn?.status ?? attempt.producerById?.status ?? attempt.relationship?.status ?? null;
                                const blocked = status === 401 || status === 403;
                                const label =
                                  status === 404 ? 'not found'
                                  : blocked ? 'blocked'
                                  : status ? `failed (${status})`
                                  : 'failed';
                                return (
                                  <div key={attempt.which} className="surelc-section__attempt">
                                    <span className="surelc-section__attempt-which">{attempt.which}</span>
                                    <span className="surelc-section__attempt-status">{label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : surelcViews ? (
                        <>
                          <div className="surelc-section__meta">
                            <span className={surelcState.data?.cached ? 'is-muted' : undefined}>
                              {surelcState.data?.cached ? 'Cached' : 'Live'} - {formatDate(surelcState.data?.fetchedAt) ?? surelcState.data?.fetchedAt}
                            </span>
                            <button
                              type="button"
                              className="surelc-section__refresh"
                              onClick={() => setSurelcRefreshNonce(Date.now())}
                              disabled={surelcState.loading}
                            >
                              Refresh
                            </button>
                          </div>

                          {(['QUILITY', 'EQUITA'] as const).map((key) => {
                            const view = surelcViews[key];
                            if (!view) return null;
                            return (
                              <div key={key} className="surelc-section__view">
                                <div className="surelc-section__view-header">
                                  <span className="surelc-section__view-title">{key}</span>
                                  <span className={`surelc-section__view-chip ${view.ok ? 'is-ok' : 'is-bad'}`}>
                                    {view.ok ? 'connected' : view.available ? 'blocked' : 'not configured'}
                                  </span>
                                  {view.identifiers?.producerId ? (
                                    <span className="surelc-section__view-subtitle">Producer ID: {view.identifiers.producerId}</span>
                                  ) : null}
                                </div>

                                {!view.ok ? (
                                  <div className="surelc-section__failure">
                                    <div className="surelc-section__error">{view.error || 'SureLC unavailable'}</div>
                                    {view.hint ? <div className="surelc-section__hint">{view.hint}</div> : null}
                                  </div>
                                ) : (
                                  (() => {
                                    const rows = buildSurelcRows({ identifiers: view.identifiers, summary: view.summary });
                                    return (
                                      <>
                                        <div className="surelc-section__group">
                                          <div className="surelc-section__group-header">
                                            <span className="surelc-section__group-title">Overview</span>
                                            <span className="surelc-section__group-badge">{rows.overview.length}</span>
                                          </div>
                                          <div className="visual-hierarchy-inspector__details">
                                            {rows.overview.map((field) => (
                                              <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                                <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                                <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                                  {field.value}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        <div className="surelc-section__group">
                                          <div className="surelc-section__group-header">
                                            <span className="surelc-section__group-title">Licenses</span>
                                          </div>
                                          <div className="visual-hierarchy-inspector__details">
                                            {rows.licenses.map((field) => (
                                              <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                                <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                                <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                                  {field.value}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        <div className="surelc-section__group">
                                          <div className="surelc-section__group-header">
                                            <span className="surelc-section__group-title">Appointments</span>
                                          </div>
                                          <div className="visual-hierarchy-inspector__details">
                                            {rows.appointments.map((field) => (
                                              <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                                <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                                <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                                  {field.value}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        <div className="surelc-section__group">
                                          <div className="surelc-section__group-header">
                                            <span className="surelc-section__group-title">Contracts</span>
                                          </div>
                                          <div className="visual-hierarchy-inspector__details">
                                            {rows.contracts.map((field) => (
                                              <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                                <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                                <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                                  {field.value}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </>
                                    );
                                  })()
                                )}
                              </div>
                            );
                          })}
                        </>
                      ) : surelcState.data ? (
                        <>
                          <div className="surelc-section__meta">
                            <span>Auth: {surelcState.data.whichUsed}</span>
                            <span>Producer ID: {surelcState.data.identifiers.producerId ?? '-'}</span>
                            <span className={surelcState.data.cached ? 'is-muted' : undefined}>
                              {surelcState.data.cached ? 'Cached' : 'Live'} - {formatDate(surelcState.data.fetchedAt) ?? surelcState.data.fetchedAt}
                            </span>
                            <button
                              type="button"
                              className="surelc-section__refresh"
                              onClick={() => setSurelcRefreshNonce(Date.now())}
                              disabled={surelcState.loading}
                            >
                              Refresh
                            </button>
                          </div>
                          <div className="surelc-section__group">
                            <div className="surelc-section__group-header">
                              <span className="surelc-section__group-title">Overview</span>
                              <span className="surelc-section__group-badge">{buildSurelcRows({ identifiers: surelcState.data.identifiers, summary: surelcState.data.summary }).overview.length}</span>
                            </div>
                            <div className="visual-hierarchy-inspector__details">
                              {buildSurelcRows({ identifiers: surelcState.data.identifiers, summary: surelcState.data.summary }).overview.map((field) => (
                                <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                  <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                  <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="surelc-section__group">
                            <div className="surelc-section__group-header">
                              <span className="surelc-section__group-title">Licenses</span>
                            </div>
                            <div className="visual-hierarchy-inspector__details">
                              {buildSurelcRows({ identifiers: surelcState.data.identifiers, summary: surelcState.data.summary }).licenses.map((field) => (
                                <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                  <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                  <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="surelc-section__group">
                            <div className="surelc-section__group-header">
                              <span className="surelc-section__group-title">Appointments</span>
                            </div>
                            <div className="visual-hierarchy-inspector__details">
                              {buildSurelcRows({ identifiers: surelcState.data.identifiers, summary: surelcState.data.summary }).appointments.map((field) => (
                                <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                  <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                  <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="surelc-section__group">
                            <div className="surelc-section__group-header">
                              <span className="surelc-section__group-title">Contracts</span>
                            </div>
                            <div className="visual-hierarchy-inspector__details">
                              {buildSurelcRows({ identifiers: surelcState.data.identifiers, summary: surelcState.data.summary }).contracts.map((field) => (
                                <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                                  <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                                  <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="surelc-section__empty">No SureLC data loaded.</div>
                      )}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Organization & Role" badge={selectedNodeInfo?.organizationInfo.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.organizationInfo.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Hierarchy Relationship" badge={selectedNodeInfo?.hierarchyInfo.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.hierarchyInfo.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Branch Metrics" defaultOpen={true} badge={selectedNodeInfo?.branchMetrics.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.branchMetrics.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Licensing & Location" badge={selectedNodeInfo?.licensingInfo.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.licensingInfo.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Vendor Configuration" badge={selectedNodeInfo?.vendorConfig.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.vendorConfig.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Onboarding Status" badge={selectedNodeInfo?.onboardingStatus.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.onboardingStatus.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          {field.link ? (
                            <a
                              href={field.link}
                              className="visual-hierarchy-inspector__detail-value visual-hierarchy-inspector__detail-value--link"
                            >
                              {field.value}
                            </a>
                          ) : (
                            <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                              {field.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="XCEL Training" badge={selectedNodeInfo?.xcelTraining.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.xcelTraining.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Pipeline & Opportunity" badge={selectedNodeInfo?.pipelineInfo.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.pipelineInfo.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Carrier Application" badge={selectedNodeInfo?.carrierApp.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.carrierApp.map((field) => (
                        <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                          <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                          <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                </div>
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

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getExportPngPixelRatio = (width: number, height: number) => {
  const maxOutputPixels = 24_000_000;
  const basePixels = Math.max(1, width * height);
  const maxRatio = Math.floor(Math.sqrt(maxOutputPixels / basePixels));
  return clampNumber(Number.isFinite(maxRatio) ? maxRatio : 1, 1, 3);
};

type ExportCsvRow = {
  node: PersonNode;
  distanceFromSelected: number;
  segment?: 'upline' | 'downline' | 'selected' | 'all';
};

const normalizeDigits = (value: unknown): string => {
  if (typeof value === 'string') return value.replace(/\D+/g, '');
  if (typeof value === 'number') return String(value).replace(/\D+/g, '');
  return '';
};

const SURELC_EXPORT_DESIGNATION_SLOTS = 8;
const SURELC_EXPORT_STATUS_SLOTS = 10;
const SURELC_EXPORT_RESIDENT_STATE_SLOTS = 10;
const SURELC_EXPORT_TOP_CARRIER_SLOTS = 5;

const SURELC_EXPORT_COLUMNS: Array<{
  header: string;
  value: (payload: SurelcProducerPayload | null) => unknown;
}> = (() => {
  const cols: Array<{
    header: string;
    value: (payload: SurelcProducerPayload | null) => unknown;
  }> = [];

  const summary = (payload: SurelcProducerPayload | null) => payload?.summary;
  const compliance = (payload: SurelcProducerPayload | null) => summary(payload)?.compliance;
  const producer = (payload: SurelcProducerPayload | null) => summary(payload)?.producer;
  const relationship = (payload: SurelcProducerPayload | null) => summary(payload)?.relationship;
  const statuses = (payload: SurelcProducerPayload | null) => summary(payload)?.statuses;
  const licenses = (payload: SurelcProducerPayload | null) => summary(payload)?.licenses;
  const appointments = (payload: SurelcProducerPayload | null) => summary(payload)?.appointments;
  const contracts = (payload: SurelcProducerPayload | null) => summary(payload)?.contracts;

  cols.push(
    { header: 'SureLC Ok', value: (p) => p?.ok ?? '' },
    { header: 'SureLC Cached', value: (p) => p?.cached ?? '' },
    { header: 'SureLC Which Used', value: (p) => p?.whichUsed ?? '' },
    { header: 'SureLC Fetched At', value: (p) => p?.fetchedAt ?? '' },
    { header: 'SureLC Error Code', value: (p) => p?.errorCode ?? '' },
    { header: 'SureLC Error', value: (p) => p?.error ?? '' },
    { header: 'SureLC Details', value: (p) => p?.details ?? '' },
    { header: 'SureLC NPN', value: (p) => p?.identifiers?.npn ?? '' },
    { header: 'SureLC Producer ID', value: (p) => p?.identifiers?.producerId ?? '' },
  );

  cols.push(
    { header: 'SureLC Producer Status', value: (p) => statuses(p)?.producer ?? '' },
    { header: 'SureLC BGA Status', value: (p) => statuses(p)?.bga ?? '' },
    { header: 'SureLC Carrier Status', value: (p) => statuses(p)?.carrier ?? '' },
  );

  cols.push(
    { header: 'SureLC Relationship GA ID', value: (p) => relationship(p)?.gaId ?? '' },
    { header: 'SureLC Relationship Branch Code', value: (p) => relationship(p)?.branchCode ?? '' },
    { header: 'SureLC Relationship Upline', value: (p) => relationship(p)?.upline ?? '' },
    { header: 'SureLC Relationship Status', value: (p) => relationship(p)?.status ?? '' },
    { header: 'SureLC Relationship Subscribed', value: (p) => relationship(p)?.subscribed ?? '' },
    { header: 'SureLC Relationship Unsubscription Date', value: (p) => relationship(p)?.unsubscriptionDate ?? '' },
    { header: 'SureLC Relationship Added On', value: (p) => relationship(p)?.addedOn ?? '' },
    { header: 'SureLC Relationship Errors', value: (p) => relationship(p)?.errors ?? '' },
    { header: 'SureLC Relationship Warnings', value: (p) => relationship(p)?.warnings ?? '' },
  );

  cols.push(
    { header: 'SureLC AML Date', value: (p) => compliance(p)?.aml?.date ?? '' },
    { header: 'SureLC AML Provider', value: (p) => compliance(p)?.aml?.provider ?? '' },
    { header: 'SureLC E&O Carrier', value: (p) => compliance(p)?.eno?.carrierName ?? '' },
    { header: 'SureLC E&O Started On', value: (p) => compliance(p)?.eno?.startedOn ?? '' },
    { header: 'SureLC E&O Expires On', value: (p) => compliance(p)?.eno?.expiresOn ?? '' },
    { header: 'SureLC E&O Case Limit', value: (p) => compliance(p)?.eno?.caseLimit ?? '' },
    { header: 'SureLC E&O Total Limit', value: (p) => compliance(p)?.eno?.totalLimit ?? '' },
    { header: 'SureLC E&O Policy (Masked)', value: (p) => compliance(p)?.eno?.policyNoMasked ?? '' },
    { header: 'SureLC E&O Certificate (Masked)', value: (p) => compliance(p)?.eno?.certificateNoMasked ?? '' },
  );

  cols.push(
    { header: 'SureLC FINRA Licensed', value: (p) => compliance(p)?.securities?.finraLicense ?? '' },
    { header: 'SureLC CRD #', value: (p) => compliance(p)?.securities?.crdNo ?? '' },
    { header: 'SureLC Broker Dealer', value: (p) => compliance(p)?.securities?.brokerDealer ?? '' },
    { header: 'SureLC Investment Adviser', value: (p) => compliance(p)?.securities?.investmentAdviser ?? '' },
  );

  cols.push(
    { header: 'SureLC Record Type', value: (p) => producer(p)?.recordType ?? '' },
    { header: 'SureLC Title', value: (p) => producer(p)?.title ?? '' },
    { header: 'SureLC Company Type', value: (p) => producer(p)?.companyType ?? '' },
    { header: 'SureLC Entity Type', value: (p) => producer(p)?.entityType ?? '' },
    { header: 'SureLC Created Date', value: (p) => producer(p)?.createdDate ?? '' },
    { header: 'SureLC Data As Of', value: (p) => compliance(p)?.dataAsOf ?? '' },
  );

  for (let i = 1; i <= SURELC_EXPORT_DESIGNATION_SLOTS; i += 1) {
    cols.push({
      header: `SureLC Designation ${i}`,
      value: (p) => compliance(p)?.designations?.[i - 1] ?? '',
    });
  }

  cols.push(
    { header: 'SureLC Licenses Total', value: (p) => licenses(p)?.total ?? '' },
    { header: 'SureLC Licenses Soonest Expiration', value: (p) => licenses(p)?.soonestExpiration ?? '' },
  );
  for (let i = 1; i <= SURELC_EXPORT_RESIDENT_STATE_SLOTS; i += 1) {
    cols.push({
      header: `SureLC License Resident State ${i}`,
      value: (p) => licenses(p)?.residentStates?.[i - 1] ?? '',
    });
  }
  for (let i = 1; i <= SURELC_EXPORT_STATUS_SLOTS; i += 1) {
    cols.push(
      {
        header: `SureLC License Status ${i}`,
        value: (p) => licenses(p)?.byStatus?.[i - 1]?.status ?? '',
      },
      {
        header: `SureLC License Status Count ${i}`,
        value: (p) => licenses(p)?.byStatus?.[i - 1]?.count ?? '',
      },
    );
  }

  cols.push(
    { header: 'SureLC Appointments Total', value: (p) => appointments(p)?.total ?? '' },
    { header: 'SureLC Appointments Appointed Carriers', value: (p) => appointments(p)?.appointedCarriers ?? '' },
    { header: 'SureLC Appointments Terminated Carriers', value: (p) => appointments(p)?.terminatedCarriers ?? '' },
  );
  for (let i = 1; i <= SURELC_EXPORT_STATUS_SLOTS; i += 1) {
    cols.push(
      {
        header: `SureLC Appointment Status ${i}`,
        value: (p) => appointments(p)?.byStatus?.[i - 1]?.status ?? '',
      },
      {
        header: `SureLC Appointment Status Count ${i}`,
        value: (p) => appointments(p)?.byStatus?.[i - 1]?.count ?? '',
      },
    );
  }
  for (let i = 1; i <= SURELC_EXPORT_TOP_CARRIER_SLOTS; i += 1) {
    cols.push(
      {
        header: `SureLC Appointment Top Carrier ${i} ID`,
        value: (p) => appointments(p)?.byCarrierTop?.[i - 1]?.carrierId ?? '',
      },
      {
        header: `SureLC Appointment Top Carrier ${i} Total`,
        value: (p) => appointments(p)?.byCarrierTop?.[i - 1]?.total ?? '',
      },
    );
  }

  cols.push(
    { header: 'SureLC Contracts Total', value: (p) => contracts(p)?.total ?? '' },
    { header: 'SureLC Contracts Active Carriers', value: (p) => contracts(p)?.activeCarriers ?? '' },
  );
  for (let i = 1; i <= SURELC_EXPORT_STATUS_SLOTS; i += 1) {
    cols.push(
      {
        header: `SureLC Contract Status ${i}`,
        value: (p) => contracts(p)?.byStatus?.[i - 1]?.status ?? '',
      },
      {
        header: `SureLC Contract Status Count ${i}`,
        value: (p) => contracts(p)?.byStatus?.[i - 1]?.count ?? '',
      },
    );
  }
  for (let i = 1; i <= SURELC_EXPORT_TOP_CARRIER_SLOTS; i += 1) {
    cols.push(
      {
        header: `SureLC Contract Top Carrier ${i} ID`,
        value: (p) => contracts(p)?.byCarrierTop?.[i - 1]?.carrierId ?? '',
      },
      {
        header: `SureLC Contract Top Carrier ${i} Total`,
        value: (p) => contracts(p)?.byCarrierTop?.[i - 1]?.total ?? '',
      },
    );
  }

  return cols;
})();

const toCsvScalar = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((entry) => toCsvScalar(entry)).filter(Boolean).join('; ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const escapeCsvField = (value: unknown) => {
  const str = toCsvScalar(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const sanitizeFilenamePart = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return 'selection';
  const cleaned = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 80) || 'selection';
};

const buildExportFieldLabelMap = (snapshot?: GHLSnapshot | null): Record<string, string> => {
  const labels: Record<string, string> = {
    'contact.source': 'Source',
    'contact.phone_number': 'Phone Number',
    'contact.phone_numer': 'Phone Numer',
    'opportunity.pipeline_id': 'Pipeline ID',
    'opportunity.pipeline_stage_id': 'Pipeline Stage ID',
    'opportunity.monetary_value': 'Monetary Value',
    'opportunity.assigned_to': 'Assigned To',
  };

  const defs = [...(snapshot?.customFieldDefs ?? []), ...(snapshot?.opportunityCustomFieldDefs ?? [])];

  defs.forEach((def) => {
    if (def?.fieldKey && def?.name) {
      labels[def.fieldKey] = def.name;
    }
  });

  return labels;
};

const labelForExportFieldKey = (key: string, labels?: Record<string, string>) => {
  const fromMap = labels?.[key];
  if (fromMap) return fromMap;

  const withoutPrefix = key.split('.').slice(1).join('.') || key;
  const words = withoutPrefix
    .replace(/__/g, '_')
    .replace(/[._]+/g, '_')
    .split('_')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'id') return 'ID';
      if (lower === 'npn') return 'NPN';
      if (lower === 'xcel') return 'XCEL';
      if (lower === 'mrfg') return 'MRFG';
      if (lower === 'bga') return 'BGA';
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    });
  return words.join(' ');
};

const buildUplineCsvRows = (nodeId: string, graph: HierarchyGraph, parentMap: Map<string, string | null>): ExportCsvRow[] => {
  const path = buildAncestorPath(nodeId, parentMap);
  const selectedIndex = path.length - 1;
  return path
    .map((id, idx) => {
      const node = graph.nodesById.get(id);
      if (!node) return null;
      return { node, distanceFromSelected: idx - selectedIndex };
    })
    .filter((row): row is ExportCsvRow => row !== null);
};

const collectDownlineCsvRows = (rootId: string, graph: HierarchyGraph): ExportCsvRow[] => {
  const rows: ExportCsvRow[] = [];
  const visited = new Set<string>();

  const visit = (id: string, distance: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = graph.nodesById.get(id);
    if (!node) return;
    rows.push({ node, distanceFromSelected: distance });
    node.childrenIds.forEach((childId) => visit(childId, distance + 1));
  };

  visit(rootId, 0);
  return rows;
};

const collectAllCsvRows = (graph: HierarchyGraph): ExportCsvRow[] => {
  const rows: ExportCsvRow[] = [];
  const visited = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = graph.nodesById.get(id);
    if (!node) return;
    rows.push({ node, distanceFromSelected: 0, segment: 'all' });
    node.childrenIds.forEach((childId) => visit(childId));
  };

  graph.rootIds.forEach((rootId) => visit(rootId));
  return rows;
};

const generateHierarchyCsv = (
  rows: ExportCsvRow[],
  graph: HierarchyGraph,
  fieldLabels?: Record<string, string>,
  surelcByNodeId?: Map<string, SurelcProducerPayload | null>,
) => {
  const readCustom = (node: PersonNode, key: string) => node.sourceNode.customFields?.[key];
  const readOpportunityCustom = (node: PersonNode, key: string) => node.sourceNode.opportunity?.customFields?.[key];
  const profile = (node: PersonNode) => {
    const flags = node.sourceNode.flags;
    if (flags.equitaProfile && flags.quilityProfile) return 'combined';
    if (flags.equitaProfile) return 'equita';
    if (flags.quilityProfile) return 'quility';
    return '';
  };

  const baseHeaders = [
    // contactInfo
    'Contact ID',
    'Name',
    'Email',
    'Phone',

    // organizationInfo
    'Company',
    'Comp Level',

    // hierarchyInfo
    'Upline ID',
    'Upline Name',
    'Upline Source',
    'Upline Confidence',

    // branchMetrics
    'Direct Reports',
    'Total Downline',
    'Depth',
    'Distance From Selected',
    'Segment',

    // licensingInfo
    'Licensing State',
    'NPN',

    // vendorConfig
    'Vendor Group',
    'Profile',

    // onboardingStatus
    'Status',

    // xcelTraining
    'Last Touch',
  ];

  const exportFieldKeys = [
    // contactInfo
    'contact.source',
    'contact.phone_number',

    // organizationInfo
    'contact.comp_level_link',
    'contact.custom_comp_level_notes',

    // hierarchyInfo
    'contact.upline_highest_stage',
    'contact.onboarding__upline_email',
    'contact.upline_code_equita',
    'contact.upline_code_quility',

    // licensingInfo
    'contact.onboarding__licensing_state',
    'contact.onboarding__licensed',
    'contact.onboarding__npn',
    'contact.onboarding__producer_number',

    // vendorConfig
    'contact.onboarding__equita_profile_created',
    'contact.onboarding__quility_profile_created',

    // onboardingStatus
    'contact.onboarding__cluster_applies',

    // xcelTraining
    'contact.onboarding__xcel_account_created',
    'contact.onboarding__xcel_username_email',
    'contact.onboarding__xcel_temp_password',
    'contact.xcel_enrollment_date',
    'contact.xcel_due_date',
    'contact.xcel_last_touch',
    'contact.onboarding__xcel_started',
    'contact.onboarding__xcel_paid',

    // pipelineInfo
    'opportunity.pipeline_id',
    'opportunity.pipeline_stage_id',
    'opportunity.monetary_value',
    'opportunity.assigned_to',

    // carrierApp
    'opportunity.carrier_app__carrier_name',
    'opportunity.carrier_app__cluster',
    'opportunity.carrier_app__eligible',
    'opportunity.carrier_app__upline_code_received',
    'opportunity.carrier_app__current_disposition',

    // Legacy / typo alias (kept for compatibility with your request)
    'contact.phone_numer',
  ] as const;

  const headers = [
    ...baseHeaders,
    ...exportFieldKeys.map((key) => labelForExportFieldKey(key, fieldLabels)),
    ...SURELC_EXPORT_COLUMNS.map((col) => col.header),
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(',')];
  rows.forEach(({ node, distanceFromSelected, segment }) => {
    const upline = node.parentId ? graph.nodesById.get(node.parentId) : null;
    const opp = node.sourceNode.opportunity;
    const surelcPayload = surelcByNodeId?.get(node.id) ?? null;

    const baseValues = [
      // contactInfo
      node.id,
      node.name,
      node.email ?? '',
      node.sourceNode.phone ?? '',

      // organizationInfo
      node.sourceNode.companyName ?? '',
      node.sourceNode.compLevel ?? '',

      // hierarchyInfo
      node.parentId ?? '',
      upline?.name ?? '',
      node.uplineSource ?? '',
      node.sourceNode.uplineConfidence ?? '',

      // branchMetrics
      node.metrics.directReports ?? '',
      node.metrics.descendantCount ?? '',
      node.depth,
      distanceFromSelected,
      segment ?? '',
      
      // licensingInfo
      node.sourceNode.licensingState ?? '',
      node.npn ?? '',

      // vendorConfig
      node.vendorGroup ?? '',
      profile(node),

      // onboardingStatus
      node.status.toUpperCase(),

      // xcelTraining
      node.metrics.lastSeen ?? '',
    ];

    const exportFieldValues = [
      // contactInfo
      node.sourceNode.source ?? '',
      node.sourceNode.phone ?? '',

      // organizationInfo
      readCustom(node, 'contact.comp_level_link') ?? '',
      readCustom(node, 'contact.custom_comp_level_notes') ?? node.sourceNode.compLevelNotes ?? '',

      // hierarchyInfo
      readCustom(node, 'contact.upline_highest_stage') ?? node.sourceNode.raw?.uplineHighestStage ?? '',
      readCustom(node, 'contact.onboarding__upline_email') ?? node.sourceNode.raw?.uplineEmail ?? '',
      readCustom(node, 'contact.upline_code_equita') ?? node.sourceNode.vendorFlags?.equita ?? '',
      readCustom(node, 'contact.upline_code_quility') ?? node.sourceNode.vendorFlags?.quility ?? '',

      // licensingInfo
      readCustom(node, 'contact.onboarding__licensing_state') ?? node.sourceNode.licensingState ?? '',
      readCustom(node, 'contact.onboarding__licensed') ?? node.sourceNode.flags.licensed ?? '',
      readCustom(node, 'contact.onboarding__npn') ?? node.npn ?? '',
      readCustom(node, 'contact.onboarding__producer_number') ?? node.sourceNode.raw?.surelcId ?? '',

      // vendorConfig
      readCustom(node, 'contact.onboarding__equita_profile_created') ?? node.sourceNode.flags.equitaProfile ?? '',
      readCustom(node, 'contact.onboarding__quility_profile_created') ?? node.sourceNode.flags.quilityProfile ?? '',

      // onboardingStatus
      readCustom(node, 'contact.onboarding__cluster_applies') ?? '',

      // xcelTraining
      readCustom(node, 'contact.onboarding__xcel_account_created') ?? node.sourceNode.flags.xcelAccountCreated ?? '',
      readCustom(node, 'contact.onboarding__xcel_username_email') ?? node.sourceNode.xcel?.username ?? '',
      readCustom(node, 'contact.onboarding__xcel_temp_password') ?? node.sourceNode.xcel?.tempPassword ?? '',
      readCustom(node, 'contact.xcel_enrollment_date') ?? node.sourceNode.xcel?.enrollmentDate ?? '',
      readCustom(node, 'contact.xcel_due_date') ?? node.sourceNode.xcel?.dueDate ?? '',
      readCustom(node, 'contact.xcel_last_touch') ?? node.sourceNode.xcel?.lastTouch ?? '',
      readCustom(node, 'contact.onboarding__xcel_started') ?? node.sourceNode.flags.xcelStarted ?? '',
      readCustom(node, 'contact.onboarding__xcel_paid') ?? node.sourceNode.flags.xcelPaid ?? '',

      // pipelineInfo
      opp?.pipelineId ?? '',
      opp?.pipelineStageId ?? '',
      opp?.monetaryValue ?? '',
      opp?.assignedTo ?? '',

      // carrierApp
      readOpportunityCustom(node, 'opportunity.carrier_app__carrier_name') ?? '',
      readOpportunityCustom(node, 'opportunity.carrier_app__cluster') ?? '',
      readOpportunityCustom(node, 'opportunity.carrier_app__eligible') ?? '',
      readOpportunityCustom(node, 'opportunity.carrier_app__upline_code_received') ?? '',
      readOpportunityCustom(node, 'opportunity.carrier_app__current_disposition') ?? '',

      // Legacy / typo alias (kept for compatibility with your request)
      node.sourceNode.phone ?? '',
    ];

    lines.push(
      [
        ...baseValues,
        ...exportFieldValues,
        ...SURELC_EXPORT_COLUMNS.map((col) => col.value(surelcPayload)),
      ].map(escapeCsvField).join(','),
    );
  });
  return lines.join('\n');
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

const downloadCsv = (csvData: string, filename: string) => {
  const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
