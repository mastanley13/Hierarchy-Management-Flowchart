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
  Loader2,
  Save,
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
import { normalizeUplineProducerIdInput, updateCarrierFields, updateUplineProducerId } from '../lib/ghlApi';
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
const UPLINE_PRODUCER_FIELD_LABEL = 'Upline NPN ID';
const CARRIER_COMPANY_NAME_FIELD_LABEL = 'Carrier Company Name';
const CARRIER_AGENT_NUMBER_FIELD_LABEL = 'Carrier Agent Number';

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
  const [childPageOverrides, setChildPageOverrides] = useState<Map<string, number>>(new Map());
  const [showAllChildren, setShowAllChildren] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const skipNextFitViewRef = useRef(false);
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
      const data = await fetchSnapshotData({ includeOpportunities: true });
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

  const [uplineProducerIdDraft, setUplineProducerIdDraft] = useState('');
  const [uplineProducerIdSaving, setUplineProducerIdSaving] = useState(false);
  const [uplineProducerIdError, setUplineProducerIdError] = useState<string | null>(null);
  const [uplineProducerIdSaved, setUplineProducerIdSaved] = useState(false);

  const canEditSelectedNodeUplineProducerId = Boolean(selectedNode?.id) && !String(selectedNode?.id).startsWith('upline:');

  const [carrierCompanyNameDraft, setCarrierCompanyNameDraft] = useState('');
  const [carrierCompanyNameSaving, setCarrierCompanyNameSaving] = useState(false);
  const [carrierCompanyNameError, setCarrierCompanyNameError] = useState<string | null>(null);
  const [carrierCompanyNameSaved, setCarrierCompanyNameSaved] = useState(false);

  const [carrierAgentNumberDraft, setCarrierAgentNumberDraft] = useState('');
  const [carrierAgentNumberSaving, setCarrierAgentNumberSaving] = useState(false);
  const [carrierAgentNumberError, setCarrierAgentNumberError] = useState<string | null>(null);
  const [carrierAgentNumberSaved, setCarrierAgentNumberSaved] = useState(false);

  useEffect(() => {
    if (!selectedNode) {
      setUplineProducerIdDraft('');
      setUplineProducerIdError(null);
      setUplineProducerIdSaved(false);
      return;
    }

    const current =
      selectedNode.sourceNode.customFields?.['contact.upline_producer_id'] ??
      selectedNode.sourceNode.customFields?.['contact.onboarding__upline_npn'] ??
      selectedNode.sourceNode.raw?.uplineProducerId ??
      '';

    setUplineProducerIdDraft(normalizeUplineProducerIdInput(String(current)));
    setUplineProducerIdError(null);
    setUplineProducerIdSaved(false);
  }, [selectedNodeId, selectedNode]);

  useEffect(() => {
    if (!selectedNode) {
      setCarrierCompanyNameDraft('');
      setCarrierCompanyNameError(null);
      setCarrierCompanyNameSaved(false);

      setCarrierAgentNumberDraft('');
      setCarrierAgentNumberError(null);
      setCarrierAgentNumberSaved(false);
      return;
    }

    const currentCarrierCompanyName =
      selectedNode.sourceNode.customFields?.['contact.carrier_company_name'] ?? '';
    const currentCarrierAgentNumber =
      selectedNode.sourceNode.customFields?.['contact.carrier_agent_number'] ?? '';

    setCarrierCompanyNameDraft(String(currentCarrierCompanyName ?? ''));
    setCarrierCompanyNameError(null);
    setCarrierCompanyNameSaved(false);

    setCarrierAgentNumberDraft(String(currentCarrierAgentNumber ?? ''));
    setCarrierAgentNumberError(null);
    setCarrierAgentNumberSaved(false);
  }, [selectedNodeId, selectedNode]);

  const saveSelectedNodeUplineProducerId = useCallback(async () => {
    if (!selectedNode) return;
    if (!canEditSelectedNodeUplineProducerId) return;
    if (uplineProducerIdSaving) return;

    setUplineProducerIdSaving(true);
    setUplineProducerIdError(null);
    setUplineProducerIdSaved(false);

    try {
      const cleaned = normalizeUplineProducerIdInput(uplineProducerIdDraft);
      await updateUplineProducerId(selectedNode.id, cleaned.length > 0 ? cleaned : null);
      setUplineProducerIdSaved(true);
      await fetchSnapshot();
    } catch (err) {
      setUplineProducerIdError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setUplineProducerIdSaving(false);
    }
  }, [
    canEditSelectedNodeUplineProducerId,
    fetchSnapshot,
    selectedNode,
    uplineProducerIdDraft,
    uplineProducerIdSaving,
  ]);

  const saveSelectedNodeCarrierCompanyName = useCallback(async () => {
    if (!selectedNode) return;
    if (!canEditSelectedNodeUplineProducerId) return;
    if (carrierCompanyNameSaving) return;

    setCarrierCompanyNameSaving(true);
    setCarrierCompanyNameError(null);
    setCarrierCompanyNameSaved(false);

    try {
      const cleaned = carrierCompanyNameDraft.trim();
      await updateCarrierFields(selectedNode.id, {
        carrierCompanyName: cleaned.length > 0 ? cleaned : null,
      });
      setCarrierCompanyNameSaved(true);
      await fetchSnapshot();
    } catch (err) {
      setCarrierCompanyNameError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setCarrierCompanyNameSaving(false);
    }
  }, [
    canEditSelectedNodeUplineProducerId,
    carrierCompanyNameDraft,
    carrierCompanyNameSaving,
    fetchSnapshot,
    selectedNode,
  ]);

  const saveSelectedNodeCarrierAgentNumber = useCallback(async () => {
    if (!selectedNode) return;
    if (!canEditSelectedNodeUplineProducerId) return;
    if (carrierAgentNumberSaving) return;

    setCarrierAgentNumberSaving(true);
    setCarrierAgentNumberError(null);
    setCarrierAgentNumberSaved(false);

    try {
      const cleaned = carrierAgentNumberDraft.trim();
      await updateCarrierFields(selectedNode.id, {
        carrierAgentNumber: cleaned.length > 0 ? cleaned : null,
      });
      setCarrierAgentNumberSaved(true);
      await fetchSnapshot();
    } catch (err) {
      setCarrierAgentNumberError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setCarrierAgentNumberSaving(false);
    }
  }, [
    canEditSelectedNodeUplineProducerId,
    carrierAgentNumberDraft,
    carrierAgentNumberSaving,
    fetchSnapshot,
    selectedNode,
  ]);

  const selectedNodeInfo = useMemo(() => {
    if (!selectedNode) return null;
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
    const rawSource = selectedNode.uplineSource ?? 'unknown';
    const sourceLabel =
      rawSource === 'fallback' ? 'DEFAULT' : rawSource.toUpperCase();
    const highestStage = selectedNode.sourceNode.raw?.uplineHighestStage ?? '-';
    const uplineProducerIdRaw =
      readCustomField(selectedNode, 'contact.upline_producer_id') ??
      readCustomField(selectedNode, 'contact.onboarding__upline_npn') ??
      selectedNode.sourceNode.raw?.uplineProducerId;
    const uplineProducerIdValue = formatFieldValue(uplineProducerIdRaw);

    const stats: Array<{ label: string; value: string; tone?: 'accent' }> = [
      {
        label: 'Highest stage',
        value: highestStage,
        tone: highestStage !== '-' ? ('accent' as const) : undefined,
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
      {
        label: CARRIER_COMPANY_NAME_FIELD_LABEL,
        value: formatFieldValue(readCustomField(selectedNode, 'contact.carrier_company_name')),
      },
      {
        label: CARRIER_AGENT_NUMBER_FIELD_LABEL,
        value: formatFieldValue(readCustomField(selectedNode, 'contact.carrier_agent_number')),
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
      {
        label: UPLINE_PRODUCER_FIELD_LABEL,
        value: uplineProducerIdValue,
        rawValue: uplineProducerIdRaw,
      },
      {
        label: 'Upline Name',
        value: selectedNode.sourceNode.raw?.uplineName ?? '-'
      },
      { label: 'Upline Source', value: sourceLabel },
      {
        label: 'Upline Highest Stage',
        value: selectedNode.sourceNode.raw?.uplineHighestStage ?? '-'
      },
    ];

    // Category 4: Branch Metrics
    const branchMetrics: FieldRow[] = [
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
      uplineProducerIdCard: {
        label: UPLINE_PRODUCER_FIELD_LABEL,
        value: uplineProducerIdValue,
        tone: uplineProducerIdValue !== '-' ? ('accent' as const) : undefined,
      },
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

      const path = buildAncestorPath(nodeId, parentMap);
      if (scopeRootId && !path.includes(scopeRootId)) {
        clearScopeRootId();
      }

      const scopedIndex = scopeRootId ? path.indexOf(scopeRootId) : -1;
      const requiredTraversalDepth = scopedIndex >= 0 ? path.length - 1 - scopedIndex : path.length - 1;
      if (depthLimit !== null && requiredTraversalDepth > depthLimit) {
        depthLimitAutoRef.current = true;
        setDepthLimit(requiredTraversalDepth);
      }

      setSelectedNodeId(nodeId);
      const next = new Set(expandedIds);
      path.forEach((pathId) => {
        next.add(pathId);
      });
      setExpandedIds(next);
      setHighlightedPath(path);

      if (showAllChildren) {
        setChildPageOverrides(new Map());
      } else {
        const nextOverrides = new Map<string, number>();
        for (let i = 0; i < path.length - 1; i += 1) {
          const parentId = path[i];
          const childId = path[i + 1];
          const parentNode = graph.nodesById.get(parentId);
          if (!parentNode) continue;
          if (parentNode.childrenIds.length <= CHILDREN_PAGE_SIZE) continue;
          const idx = parentNode.childrenIds.indexOf(childId);
          if (idx < 0) continue;
          nextOverrides.set(parentId, Math.floor(idx / CHILDREN_PAGE_SIZE));
        }
        setChildPageOverrides(nextOverrides);

        for (let i = path.length - 2; i >= 0; i -= 1) {
          const parentId = path[i];
          const parentNode = graph.nodesById.get(parentId);
          if (!parentNode) continue;
          if (parentNode.childrenIds.length <= CHILDREN_PAGE_SIZE) continue;
          const desiredPageIndex = nextOverrides.get(parentId);
          if (typeof desiredPageIndex !== 'number') continue;
          if (desiredPageIndex !== childPageIndex) {
            skipNextFitViewRef.current = true;
            setChildPageIndex(desiredPageIndex);
          }
          break;
        }
      }

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      if (!focusLens) {
        highlightTimeoutRef.current = window.setTimeout(() => {
          setHighlightedPath([]);
        }, 4000);
      }

      setFocusNonce((prev) => prev + 1);
    },
    [
      graph,
      parentMap,
      expandedIds,
      setExpandedIds,
      setSelectedNodeId,
      setHighlightedPath,
      focusLens,
      scopeRootId,
      clearScopeRootId,
      depthLimit,
      showAllChildren,
      childPageIndex,
    ],
  );

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        setSelectedNodeId(null);
        setHighlightedPath([]);
        setChildPageOverrides(new Map());
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

    const url = new URL('/api/surelc/producer', window.location.origin);
    if (npn) url.searchParams.set('npn', npn);
    if (producerId) url.searchParams.set('producerId', producerId);
    url.searchParams.set('which', 'AUTO');
    url.searchParams.set('mode', 'both');
    url.searchParams.set('include', 'endpoints');

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

        const key = `mode=both|include=endpoints|npn=${npn}|producerId=${producerId}`;
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
	        try {
	          const exportSnapshot = await fetchSnapshotData({ includeOpportunities: true });
	          const built = buildHierarchyGraph(exportSnapshot.hierarchy);
	          exportGraph = built.graph;
	          exportParentMap = built.parentMap;
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
	          const csv = generateHierarchyCsv(rows, exportGraph, surelcByNodeId);
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
	        try {
	          const exportSnapshot = await fetchSnapshotData({ includeOpportunities: true });
	          const built = buildHierarchyGraph(exportSnapshot.hierarchy);
	          exportGraph = built.graph;
	        } catch (error) {
	          console.warn('CSV export: unable to fetch opportunity data, exporting with available snapshot fields.', error);
	        }

        const rows = collectAllCsvRows(exportGraph);
        setExportBusy(true);
        try {
	          const surelcByNodeId = await fetchSurelcForRows(mode, rows);
	          setExportProgress({ mode, phase: 'Generating CSV', completed: 0, total: 1 });
	          const csv = generateHierarchyCsv(rows, exportGraph, surelcByNodeId);
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
    if (skipNextFitViewRef.current) {
      skipNextFitViewRef.current = false;
      return undefined;
    }
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
              childPageOverrides={childPageOverrides}
              focusNonce={focusNonce}
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
                {selectedNodeInfo?.uplineProducerIdCard ? (
                  <div className="visual-hierarchy-inspector__details">
                    <div className="visual-hierarchy-inspector__detail-row visual-hierarchy-inspector__detail-row--wide">
                      <span className="visual-hierarchy-inspector__detail-label">{selectedNodeInfo.uplineProducerIdCard.label}</span>
                      <span className="visual-hierarchy-inspector__detail-value">
                        Current: {selectedNodeInfo.uplineProducerIdCard.value}
                      </span>
                      <div className="visual-hierarchy-inspector__detail-edit">
                        <input
                          className="visual-hierarchy-inspector__input"
                          value={uplineProducerIdDraft}
                          onChange={(event) => {
                            setUplineProducerIdSaved(false);
                            setUplineProducerIdDraft(event.target.value);
                          }}
                          onBlur={() => setUplineProducerIdDraft((prev) => normalizeUplineProducerIdInput(prev))}
                          inputMode="numeric"
                          placeholder={String(selectedNodeInfo.uplineProducerIdCard.value) !== '-' ? String(selectedNodeInfo.uplineProducerIdCard.value) : 'Enter upline NPN'}
                          disabled={!canEditSelectedNodeUplineProducerId || uplineProducerIdSaving}
                          aria-label="Upline Producer ID"
                        />
                        <button
                          type="button"
                          className="visual-hierarchy-inspector__btn visual-hierarchy-inspector__btn--icon"
                          onClick={saveSelectedNodeUplineProducerId}
                          disabled={!canEditSelectedNodeUplineProducerId || uplineProducerIdSaving}
                          aria-label={`Save ${UPLINE_PRODUCER_FIELD_LABEL}`}
                          title={`Save ${UPLINE_PRODUCER_FIELD_LABEL}`}
                        >
                          {uplineProducerIdSaving ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Save size={16} />
                          )}
                        </button>
                      </div>
                      {uplineProducerIdError ? (
                        <span className="visual-hierarchy-inspector__detail-value is-warning">{uplineProducerIdError}</span>
                      ) : uplineProducerIdSaved ? (
                        <span className="visual-hierarchy-inspector__detail-value is-accent">Saved</span>
                      ) : !canEditSelectedNodeUplineProducerId ? (
                        <span className="visual-hierarchy-inspector__detail-value is-muted">Synthetic node</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="visual-hierarchy-inspector__comprehensive">
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

                  <CollapsibleSection title="Contact Information" defaultOpen={true} badge={selectedNodeInfo?.contactInfo.length}>
                    <div className="visual-hierarchy-inspector__details">
                      {selectedNodeInfo?.contactInfo.map((field) => (
                        field.label === CARRIER_COMPANY_NAME_FIELD_LABEL ? (
                          <div key={field.label} className="visual-hierarchy-inspector__detail-row visual-hierarchy-inspector__detail-row--wide">
                            <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                            <span className="visual-hierarchy-inspector__detail-value">
                              Current: {field.value}
                            </span>
                            <div className="visual-hierarchy-inspector__detail-edit">
                              <input
                                className="visual-hierarchy-inspector__input"
                                value={carrierCompanyNameDraft}
                                onChange={(event) => {
                                  setCarrierCompanyNameSaved(false);
                                  setCarrierCompanyNameDraft(event.target.value);
                                }}
                                placeholder={String(field.value) !== '-' ? String(field.value) : 'Enter carrier company name'}
                                disabled={!canEditSelectedNodeUplineProducerId || carrierCompanyNameSaving}
                                aria-label="Carrier Company Name"
                              />
                              <button
                                type="button"
                                className="visual-hierarchy-inspector__btn visual-hierarchy-inspector__btn--icon"
                                onClick={saveSelectedNodeCarrierCompanyName}
                                disabled={!canEditSelectedNodeUplineProducerId || carrierCompanyNameSaving}
                                aria-label={`Save ${CARRIER_COMPANY_NAME_FIELD_LABEL}`}
                                title={`Save ${CARRIER_COMPANY_NAME_FIELD_LABEL}`}
                              >
                                {carrierCompanyNameSaving ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Save size={16} />
                                )}
                              </button>
                            </div>
                            {carrierCompanyNameError ? (
                              <span className="visual-hierarchy-inspector__detail-value is-warning">{carrierCompanyNameError}</span>
                            ) : carrierCompanyNameSaved ? (
                              <span className="visual-hierarchy-inspector__detail-value is-accent">Saved</span>
                            ) : !canEditSelectedNodeUplineProducerId ? (
                              <span className="visual-hierarchy-inspector__detail-value is-muted">Synthetic node</span>
                            ) : null}
                          </div>
                        ) : field.label === CARRIER_AGENT_NUMBER_FIELD_LABEL ? (
                          <div key={field.label} className="visual-hierarchy-inspector__detail-row visual-hierarchy-inspector__detail-row--wide">
                            <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                            <span className="visual-hierarchy-inspector__detail-value">
                              Current: {field.value}
                            </span>
                            <div className="visual-hierarchy-inspector__detail-edit">
                              <input
                                className="visual-hierarchy-inspector__input"
                                value={carrierAgentNumberDraft}
                                onChange={(event) => {
                                  setCarrierAgentNumberSaved(false);
                                  setCarrierAgentNumberDraft(event.target.value);
                                }}
                                placeholder={String(field.value) !== '-' ? String(field.value) : 'Enter carrier agent number'}
                                disabled={!canEditSelectedNodeUplineProducerId || carrierAgentNumberSaving}
                                aria-label="Carrier Agent Number"
                              />
                              <button
                                type="button"
                                className="visual-hierarchy-inspector__btn visual-hierarchy-inspector__btn--icon"
                                onClick={saveSelectedNodeCarrierAgentNumber}
                                disabled={!canEditSelectedNodeUplineProducerId || carrierAgentNumberSaving}
                                aria-label={`Save ${CARRIER_AGENT_NUMBER_FIELD_LABEL}`}
                                title={`Save ${CARRIER_AGENT_NUMBER_FIELD_LABEL}`}
                              >
                                {carrierAgentNumberSaving ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Save size={16} />
                                )}
                              </button>
                            </div>
                            {carrierAgentNumberError ? (
                              <span className="visual-hierarchy-inspector__detail-value is-warning">{carrierAgentNumberError}</span>
                            ) : carrierAgentNumberSaved ? (
                              <span className="visual-hierarchy-inspector__detail-value is-accent">Saved</span>
                            ) : !canEditSelectedNodeUplineProducerId ? (
                              <span className="visual-hierarchy-inspector__detail-value is-muted">Synthetic node</span>
                            ) : null}
                          </div>
                        ) : (
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
                        )
                      ))}
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
                        field.label === UPLINE_PRODUCER_FIELD_LABEL ? (
                          <div key={field.label} className="visual-hierarchy-inspector__detail-row visual-hierarchy-inspector__detail-row--wide">
                            <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                            <span className="visual-hierarchy-inspector__detail-value">
                              Current: {field.value}
                            </span>
                            <div className="visual-hierarchy-inspector__detail-edit">
                              <input
                                className="visual-hierarchy-inspector__input"
                                value={uplineProducerIdDraft}
                                onChange={(event) => {
                                  setUplineProducerIdSaved(false);
                                  setUplineProducerIdDraft(event.target.value);
                                }}
                                onBlur={() => setUplineProducerIdDraft((prev) => normalizeUplineProducerIdInput(prev))}
                                inputMode="numeric"
                                placeholder={String(field.value) !== '-' ? String(field.value) : 'Enter upline NPN'}
                                disabled={!canEditSelectedNodeUplineProducerId || uplineProducerIdSaving}
                                aria-label="Upline Producer ID"
                              />
                              <button
                                type="button"
                                className="visual-hierarchy-inspector__btn visual-hierarchy-inspector__btn--icon"
                                onClick={saveSelectedNodeUplineProducerId}
                                disabled={!canEditSelectedNodeUplineProducerId || uplineProducerIdSaving}
                                aria-label={`Save ${UPLINE_PRODUCER_FIELD_LABEL}`}
                                title={`Save ${UPLINE_PRODUCER_FIELD_LABEL}`}
                              >
                                {uplineProducerIdSaving ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Save size={16} />
                                )}
                              </button>
                            </div>
                            {uplineProducerIdError ? (
                              <span className="visual-hierarchy-inspector__detail-value is-warning">{uplineProducerIdError}</span>
                            ) : uplineProducerIdSaved ? (
                              <span className="visual-hierarchy-inspector__detail-value is-accent">Saved</span>
                            ) : !canEditSelectedNodeUplineProducerId ? (
                              <span className="visual-hierarchy-inspector__detail-value is-muted">Synthetic node</span>
                            ) : null}
                          </div>
                        ) : (
                          <div key={field.label} className="visual-hierarchy-inspector__detail-row">
                            <span className="visual-hierarchy-inspector__detail-label">{field.label}</span>
                            <span className={`visual-hierarchy-inspector__detail-value ${field.tone ? `is-${field.tone}` : ''}`}>
                              {field.value}
                            </span>
                          </div>
                        )
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

type SurelcProducerView = {
  ok?: boolean;
  which?: string;
  available?: boolean;
  identifiers?: { npn: string | null; producerId: string | null };
  fetchedAt?: string;
  errorCode?: string;
  error?: string;
  details?: string;
  hint?: string;
  summary?: SurelcProducerPayload['summary'];
  endpoints?: Record<string, SurelcEndpointResult | undefined>;
};

const getSurelcView = (
  payload: SurelcProducerPayload | null,
  which: 'EQUITA' | 'QUILITY',
): SurelcProducerView | null => {
  if (!payload) return null;
  if (payload.mode === 'both' && payload.views) {
    return (payload.views as any)?.[which] ?? null;
  }
  return payload as any;
};

const SURELC_VIEW_EXPORT_COLUMNS: Array<{
  header: string;
  value: (view: SurelcProducerView | null) => unknown;
}> = (() => {
  const cols: Array<{
    header: string;
    value: (view: SurelcProducerView | null) => unknown;
  }> = [];

  const summary = (view: SurelcProducerView | null) => view?.summary;
  const compliance = (view: SurelcProducerView | null) => summary(view)?.compliance;
  const producer = (view: SurelcProducerView | null) => summary(view)?.producer;
  const relationship = (view: SurelcProducerView | null) => summary(view)?.relationship;
  const statuses = (view: SurelcProducerView | null) => summary(view)?.statuses;
  const licenses = (view: SurelcProducerView | null) => summary(view)?.licenses;
  const appointments = (view: SurelcProducerView | null) => summary(view)?.appointments;
  const contracts = (view: SurelcProducerView | null) => summary(view)?.contracts;

  cols.push(
    { header: 'Ok', value: (v) => v?.ok ?? '' },
    { header: 'Available', value: (v) => v?.available ?? '' },
    { header: 'Fetched At', value: (v) => v?.fetchedAt ?? '' },
    { header: 'Error Code', value: (v) => v?.errorCode ?? '' },
    { header: 'Error', value: (v) => v?.error ?? '' },
    { header: 'Details', value: (v) => v?.details ?? '' },
    { header: 'Hint', value: (v) => v?.hint ?? '' },
    { header: 'NPN', value: (v) => v?.identifiers?.npn ?? '' },
    { header: 'Producer ID', value: (v) => v?.identifiers?.producerId ?? '' },
  );

  cols.push(
    { header: 'Producer Status', value: (v) => statuses(v)?.producer ?? '' },
    { header: 'BGA Status', value: (v) => statuses(v)?.bga ?? '' },
    { header: 'Carrier Status', value: (v) => statuses(v)?.carrier ?? '' },
  );

  cols.push(
    { header: 'Relationship GA ID', value: (v) => relationship(v)?.gaId ?? '' },
    { header: 'Relationship Branch Code', value: (v) => relationship(v)?.branchCode ?? '' },
    { header: 'Relationship Upline', value: (v) => relationship(v)?.upline ?? '' },
    { header: 'Relationship Status', value: (v) => relationship(v)?.status ?? '' },
    { header: 'Relationship Subscribed', value: (v) => relationship(v)?.subscribed ?? '' },
    { header: 'Relationship Unsubscription Date', value: (v) => relationship(v)?.unsubscriptionDate ?? '' },
    { header: 'Relationship Added On', value: (v) => relationship(v)?.addedOn ?? '' },
    { header: 'Relationship Errors', value: (v) => relationship(v)?.errors ?? '' },
    { header: 'Relationship Warnings', value: (v) => relationship(v)?.warnings ?? '' },
  );

  cols.push(
    { header: 'AML Date', value: (v) => compliance(v)?.aml?.date ?? '' },
    { header: 'AML Provider', value: (v) => compliance(v)?.aml?.provider ?? '' },
    { header: 'E&O Carrier', value: (v) => compliance(v)?.eno?.carrierName ?? '' },
    { header: 'E&O Started On', value: (v) => compliance(v)?.eno?.startedOn ?? '' },
    { header: 'E&O Expires On', value: (v) => compliance(v)?.eno?.expiresOn ?? '' },
    { header: 'E&O Case Limit', value: (v) => compliance(v)?.eno?.caseLimit ?? '' },
    { header: 'E&O Total Limit', value: (v) => compliance(v)?.eno?.totalLimit ?? '' },
    { header: 'E&O Policy (Masked)', value: (v) => compliance(v)?.eno?.policyNoMasked ?? '' },
    { header: 'E&O Certificate (Masked)', value: (v) => compliance(v)?.eno?.certificateNoMasked ?? '' },
  );

  cols.push(
    { header: 'FINRA Licensed', value: (v) => compliance(v)?.securities?.finraLicense ?? '' },
    { header: 'CRD #', value: (v) => compliance(v)?.securities?.crdNo ?? '' },
    { header: 'Broker Dealer', value: (v) => compliance(v)?.securities?.brokerDealer ?? '' },
    { header: 'Investment Adviser', value: (v) => compliance(v)?.securities?.investmentAdviser ?? '' },
  );

  cols.push(
    { header: 'Record Type', value: (v) => producer(v)?.recordType ?? '' },
    { header: 'Title', value: (v) => producer(v)?.title ?? '' },
    { header: 'Company Type', value: (v) => producer(v)?.companyType ?? '' },
    { header: 'Entity Type', value: (v) => producer(v)?.entityType ?? '' },
    { header: 'Created Date', value: (v) => producer(v)?.createdDate ?? '' },
    { header: 'Data As Of', value: (v) => compliance(v)?.dataAsOf ?? '' },
  );

  for (let i = 1; i <= SURELC_EXPORT_DESIGNATION_SLOTS; i += 1) {
    cols.push({
      header: `Designation ${i}`,
      value: (v) => compliance(v)?.designations?.[i - 1] ?? '',
    });
  }

  cols.push(
    { header: 'Licenses Total', value: (v) => licenses(v)?.total ?? '' },
    { header: 'Licenses Soonest Expiration', value: (v) => licenses(v)?.soonestExpiration ?? '' },
  );
  for (let i = 1; i <= SURELC_EXPORT_RESIDENT_STATE_SLOTS; i += 1) {
    cols.push({
      header: `License Resident State ${i}`,
      value: (v) => licenses(v)?.residentStates?.[i - 1] ?? '',
    });
  }
  for (let i = 1; i <= SURELC_EXPORT_STATUS_SLOTS; i += 1) {
    cols.push(
      {
        header: `License Status ${i}`,
        value: (v) => licenses(v)?.byStatus?.[i - 1]?.status ?? '',
      },
      {
        header: `License Status Count ${i}`,
        value: (v) => licenses(v)?.byStatus?.[i - 1]?.count ?? '',
      },
    );
  }

  cols.push(
    { header: 'Appointments Total', value: (v) => appointments(v)?.total ?? '' },
    { header: 'Appointments Appointed Carriers', value: (v) => appointments(v)?.appointedCarriers ?? '' },
    { header: 'Appointments Terminated Carriers', value: (v) => appointments(v)?.terminatedCarriers ?? '' },
  );
  for (let i = 1; i <= SURELC_EXPORT_STATUS_SLOTS; i += 1) {
    cols.push(
      {
        header: `Appointment Status ${i}`,
        value: (v) => appointments(v)?.byStatus?.[i - 1]?.status ?? '',
      },
      {
        header: `Appointment Status Count ${i}`,
        value: (v) => appointments(v)?.byStatus?.[i - 1]?.count ?? '',
      },
    );
  }
  for (let i = 1; i <= SURELC_EXPORT_TOP_CARRIER_SLOTS; i += 1) {
    cols.push(
      {
        header: `Appointment Top Carrier ${i} ID`,
        value: (v) => appointments(v)?.byCarrierTop?.[i - 1]?.carrierId ?? '',
      },
      {
        header: `Appointment Top Carrier ${i} Total`,
        value: (v) => appointments(v)?.byCarrierTop?.[i - 1]?.total ?? '',
      },
    );
  }

  cols.push(
    { header: 'Contracts Total', value: (v) => contracts(v)?.total ?? '' },
    { header: 'Contracts Active Carriers', value: (v) => contracts(v)?.activeCarriers ?? '' },
  );
  for (let i = 1; i <= SURELC_EXPORT_STATUS_SLOTS; i += 1) {
    cols.push(
      {
        header: `Contract Status ${i}`,
        value: (v) => contracts(v)?.byStatus?.[i - 1]?.status ?? '',
      },
      {
        header: `Contract Status Count ${i}`,
        value: (v) => contracts(v)?.byStatus?.[i - 1]?.count ?? '',
      },
    );
  }
  for (let i = 1; i <= SURELC_EXPORT_TOP_CARRIER_SLOTS; i += 1) {
    cols.push(
      {
        header: `Contract Top Carrier ${i} ID`,
        value: (v) => contracts(v)?.byCarrierTop?.[i - 1]?.carrierId ?? '',
      },
      {
        header: `Contract Top Carrier ${i} Total`,
        value: (v) => contracts(v)?.byCarrierTop?.[i - 1]?.total ?? '',
      },
    );
  }

  cols.push(
    { header: 'Endpoint Producer By NPN', value: (v) => v?.endpoints?.producerByNpn?.body ?? '' },
    { header: 'Endpoint Producer By ID', value: (v) => v?.endpoints?.producerById?.body ?? '' },
    { header: 'Endpoint Relationship', value: (v) => v?.endpoints?.relationship?.body ?? '' },
    { header: 'Endpoint Licenses', value: (v) => v?.endpoints?.licenses?.body ?? '' },
    { header: 'Endpoint Appointments', value: (v) => v?.endpoints?.appointments?.body ?? '' },
    { header: 'Endpoint Contracts', value: (v) => v?.endpoints?.contracts?.body ?? '' },
    { header: 'Endpoint Addresses', value: (v) => v?.endpoints?.addresses?.body ?? '' },
  );

  return cols;
})();

		const SURELC_EXPORT_COLUMNS: Array<{
		  header: string;
		  value: (payload: SurelcProducerPayload | null) => unknown;
		}> = (() => {
		  const cols: Array<{
		    header: string;
		    value: (payload: SurelcProducerPayload | null) => unknown;
		  }> = [];

		  const statusHeaders = new Set<string>(['Producer Status', 'BGA Status', 'Carrier Status']);

		  const viewColumns = (label: 'Equita' | 'Quility', key: 'EQUITA' | 'QUILITY') =>
		    SURELC_VIEW_EXPORT_COLUMNS.filter((col) => statusHeaders.has(col.header)).map((col) => ({
		      header: `${label} SureLC ${col.header}`,
		      value: (payload: SurelcProducerPayload | null) => col.value(getSurelcView(payload, key)),
		    }));

  cols.push(...viewColumns('Equita', 'EQUITA'));
  cols.push(...viewColumns('Quility', 'QUILITY'));

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
		  surelcByNodeId?: Map<string, SurelcProducerPayload | null>,
	) => {
	  const readCustom = (node: PersonNode, key: string) => node.sourceNode.customFields?.[key];
	  const uplineHighestStageKey = 'contact.upline_highest_stage';
	  const headers = [
	    'Name',
	    'NPN',
	    'Upline Highest Stage',
	    'Email',
	    'Phone',
	    'Company',
	    'Comp Level',
	    'Upline ID',
	    'Upline Name',
	    'Licensing State',
	    ...SURELC_EXPORT_COLUMNS.map((col) => col.header),
	  ];

		  const lines: string[] = [headers.map(escapeCsvField).join(',')];
		  rows.forEach(({ node }) => {
		    const upline = node.parentId ? graph.nodesById.get(node.parentId) : null;
		    const surelcPayload = surelcByNodeId?.get(node.id) ?? null;

	    lines.push(
	      [
	        node.name,
	        node.npn ?? '',
	        readCustom(node, uplineHighestStageKey) ?? node.sourceNode.raw?.uplineHighestStage ?? '',
	        node.email ?? '',
	        node.sourceNode.phone ?? '',
	        node.sourceNode.companyName ?? '',
	        node.sourceNode.compLevel ?? '',
	        node.parentId ?? '',
	        upline?.name ?? '',
	        node.sourceNode.licensingState ?? '',
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
