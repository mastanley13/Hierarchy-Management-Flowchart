import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  ReactFlowInstance,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import NodeCard from './NodeCard';
import HierarchyEdge from './HierarchyEdge';
import { useElkLayout } from './useElkLayout';
import type { Density, HierarchyGraph } from './types';
import './tokens.css';
import './hierarchyCanvas.css';

export const CANVAS_MIN_ZOOM = 0.08;
export const CANVAS_FIT_VIEW_PADDING = 0.25;
const CANVAS_MAX_ZOOM = 1.8;
const LAYOUT_DEBOUNCE_MS = 60;

type HierarchyCanvasProps = {
  graph: HierarchyGraph;
  expandedIds: Set<string>;
  density: Density;
  focusLens: boolean;
  highlightedPath: string[];
  selectedNodeId: string | null;
  onToggleNode: (id: string) => void;
  onSelectNode: (id: string | null) => void;
  depthLimit?: number | null;
  scopeRootId?: string | null;
  hoveredNodeId?: string | null;
  onHoverNode?: (id: string | null) => void;
  theme?: 'dark' | 'light';
  onInit?: (instance: ReactFlowInstance) => void;
  childPageIndex: number;
  childrenPageSize: number;
  showAllChildren: boolean;
  childPageOverrides?: ReadonlyMap<string, number> | null;
  focusNonce?: number;
  minZoom?: number;
};

const nodeTypes = {
  person: NodeCard,
};

const edgeTypes = {
  hierarchy: HierarchyEdge,
};

/* ------------------------------------------------------------------ */
/*  FocusOnSelection – extracted outside render to avoid remount      */
/* ------------------------------------------------------------------ */
type FocusOnSelectionProps = {
  activeNodeId: string | null;
  focusNonce: number;
  flowNodes: Node[];
};

const FocusOnSelection = ({ activeNodeId, focusNonce, flowNodes }: FocusOnSelectionProps) => {
  const { setCenter, getViewport } = useReactFlow();
  const lastCenteredNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeNodeId) return;
    if (lastCenteredNonceRef.current === focusNonce) return;

    const targetNode = flowNodes.find((node) => node.id === activeNodeId);
    if (!targetNode) return;

    const viewport = getViewport();
    setCenter(
      targetNode.position.x + (targetNode.width ?? 0) / 2,
      targetNode.position.y + (targetNode.height ?? 0) / 2,
      { duration: 500, zoom: viewport.zoom },
    );
    lastCenteredNonceRef.current = focusNonce;
  }, [activeNodeId, focusNonce, flowNodes, getViewport, setCenter]);

  return null;
};

/* ------------------------------------------------------------------ */
/*  HierarchyCanvas                                                    */
/* ------------------------------------------------------------------ */

const HierarchyCanvas = forwardRef<HTMLDivElement, HierarchyCanvasProps>(({
  graph,
  expandedIds,
  density,
  focusLens,
  highlightedPath,
  selectedNodeId,
  onToggleNode,
  onSelectNode,
  depthLimit = null,
  scopeRootId = null,
  hoveredNodeId = null,
  onHoverNode,
  theme = 'dark',
  onInit,
  childPageIndex,
  childrenPageSize,
  showAllChildren,
  childPageOverrides = null,
  focusNonce = 0,
  minZoom,
}, ref) => {
  const layout = useElkLayout({ density });
  const effectiveMinZoom = minZoom ?? CANVAS_MIN_ZOOM;
  const highlightSet = useMemo(() => new Set(highlightedPath), [highlightedPath]);
  const initialFitDoneRef = useRef(false);

  const hoverSet = useMemo(() => {
    const set = new Set<string>();
    if (!hoveredNodeId) return set;
    const node = graph.nodesById.get(hoveredNodeId);
    if (!node) return set;
    set.add(node.id);
    if (node.parentId) set.add(node.parentId);
    node.childrenIds.forEach((cid) => set.add(cid));
    return set;
  }, [hoveredNodeId, graph.nodesById]);

  const effectiveHighlightSet = useMemo(() => {
    const set = new Set<string>(highlightSet);
    hoverSet.forEach((id) => set.add(id));
    return set;
  }, [highlightSet, hoverSet]);

  // Fix #6: Defensive scopeRootId — validate before traversal
  const safeScopeRootId = scopeRootId && graph.nodesById.has(scopeRootId) ? scopeRootId : null;

  const visibleTraversal = useMemo(() => {
    const items: { id: string; depth: number }[] = [];
    const startRootIds = safeScopeRootId ? [safeScopeRootId] : graph.rootIds;
    const visit = (ids: string[], depth: number) => {
      ids.forEach((id) => {
        const node = graph.nodesById.get(id);
        if (!node) return;
        items.push({ id, depth });
        const canGoDeeper = depthLimit === null || depth < depthLimit;
        if (node.childrenIds.length > 0 && expandedIds.has(id) && canGoDeeper) {
          const shouldPaginate = !showAllChildren && node.childrenIds.length > childrenPageSize;
          const totalPages = shouldPaginate ? Math.ceil(node.childrenIds.length / childrenPageSize) : 1;
          const overrideIndex = shouldPaginate ? childPageOverrides?.get(id) : undefined;
          const windowIndex = shouldPaginate
            ? Math.min(overrideIndex ?? childPageIndex, Math.max(totalPages - 1, 0))
            : 0;
          const startIndex = shouldPaginate ? windowIndex * childrenPageSize : 0;
          const visibleChildren = shouldPaginate
            ? node.childrenIds.slice(startIndex, startIndex + childrenPageSize)
            : node.childrenIds;
          visit(visibleChildren, depth + 1);
        }
      });
    };
    visit(startRootIds, 0);
    return items;
  }, [
    graph.rootIds,
    graph.nodesById,
    expandedIds,
    depthLimit,
    safeScopeRootId,
    childPageIndex,
    childrenPageSize,
    showAllChildren,
    childPageOverrides,
  ]);

  // Fix #1: Replace throw with defensive filter + warning
  const baseNodes = useMemo<Node[]>(
    () => {
      const nodes: Node[] = [];
      for (const { id, depth } of visibleTraversal) {
        const person = graph.nodesById.get(id);
        if (!person) {
          console.warn(`[HierarchyCanvas] Skipping missing node "${id}" — graph may be stale`);
          continue;
        }
        const dimByFocus = focusLens && !effectiveHighlightSet.has(id);
        const dimByHover = Boolean(hoveredNodeId) && !hoverSet.has(id);
        const dimmed = dimByFocus || dimByHover;
        nodes.push({
          id,
          type: 'person',
          position: { x: 0, y: 0 },
          data: {
            person,
            density,
            expanded: expandedIds.has(id),
            isSelected: selectedNodeId === id,
            isDimmed: dimmed,
            onToggle: onToggleNode,
            onSelect: (nodeId: string) => onSelectNode(nodeId),
            onHover: onHoverNode,
            depth,
          },
          draggable: false,
        });
      }
      return nodes;
    },
    [
      visibleTraversal,
      graph.nodesById,
      focusLens,
      effectiveHighlightSet,
      density,
      expandedIds,
      selectedNodeId,
      onToggleNode,
      onSelectNode,
      onHoverNode,
      hoveredNodeId,
      hoverSet,
      childrenPageSize,
    ],
  );

  const baseEdges = useMemo<Edge[]>(
    () => {
      const edges: Edge[] = [];
      const visibleIds = new Set(visibleTraversal.map((item) => item.id));
      visibleTraversal.forEach(({ id }) => {
        const node = graph.nodesById.get(id);
        if (!node) return;
        if (!expandedIds.has(id)) return;
        node.childrenIds.forEach((childId) => {
          if (!visibleIds.has(childId)) return;
          const highlighted = effectiveHighlightSet.has(id) && effectiveHighlightSet.has(childId);
          edges.push({
            id: `${id}-${childId}`,
            source: id,
            target: childId,
            type: 'hierarchy',
            data: {
              highlighted,
            },
            animated: false,
          });
        });
      });
      return edges;
    },
    [visibleTraversal, graph.nodesById, effectiveHighlightSet, expandedIds],
  );

  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);

  // Fix #1: Debounced layout effect — prevents race condition on rapid clicks.
  // Keeps previous flowNodes visible until the new layout finishes (no blank canvas).
  useEffect(() => {
    let cancelled = false;
    const debounceTimer = window.setTimeout(async () => {
      try {
        const result = await layout({ nodes: baseNodes, edges: baseEdges });
        if (!cancelled) {
          setFlowNodes(result.nodes);
          setFlowEdges(result.edges);
        }
      } catch (err) {
        console.warn('[HierarchyCanvas] ELK layout failed, keeping previous layout', err);
        // On error, keep previous flowNodes/flowEdges — don't blank the canvas
      }
    }, LAYOUT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
    };
  }, [layout, baseNodes, baseEdges]);

  // Fix #1: Fit view only on initial load, not on every layout change
  const handleInit = useCallback(
    (instance: ReactFlowInstance) => {
      onInit?.(instance);
      // Initial fitView handled by ReactFlow's fitView on init
    },
    [onInit],
  );

  return (
    <div className="hierarchy-canvas" ref={ref}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        style={{ width: '100%', height: '100%' }}
        nodesDraggable={false}
        panOnScroll
        panOnDrag
        selectionOnDrag={false}
        fitView={!initialFitDoneRef.current}
        fitViewOptions={{ padding: CANVAS_FIT_VIEW_PADDING, includeHiddenNodes: true, minZoom: effectiveMinZoom }}
        zoomOnScroll
        nodesFocusable
        deleteKeyCode={[]}
        onInit={(instance) => {
          handleInit(instance);
          initialFitDoneRef.current = true;
        }}
        onPaneClick={() => onSelectNode(null)}
        minZoom={effectiveMinZoom}
        maxZoom={CANVAS_MAX_ZOOM}
      >
        <FocusOnSelection activeNodeId={selectedNodeId} focusNonce={focusNonce} flowNodes={flowNodes} />
        <Background gap={24} color={theme === 'light' ? '#e5e7eb' : '#1f2532'} />
        <Controls />
        <MiniMap pannable zoomable maskColor={theme === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(14, 17, 23, 0.7)'} nodeColor={() => '#60f5a1'} />
      </ReactFlow>
    </div>
  );
});

HierarchyCanvas.displayName = 'HierarchyCanvas';

export default HierarchyCanvas;
