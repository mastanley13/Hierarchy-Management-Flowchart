import { forwardRef, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  ReactFlowInstance,
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
};

const nodeTypes = {
  person: NodeCard,
};

const edgeTypes = {
  hierarchy: HierarchyEdge,
};

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
}, ref) => {
  const layout = useElkLayout({ density });
  const highlightSet = useMemo(() => new Set(highlightedPath), [highlightedPath]);

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

  const visibleTraversal = useMemo(() => {
    const items: { id: string; depth: number }[] = [];
    const startRootIds = scopeRootId && graph.nodesById.has(scopeRootId) ? [scopeRootId] : graph.rootIds;
    const visit = (ids: string[], depth: number) => {
      ids.forEach((id) => {
        const node = graph.nodesById.get(id);
        if (!node) return;
        items.push({ id, depth });
        const canGoDeeper = depthLimit === null || depth < depthLimit;
        if (node.childrenIds.length > 0 && expandedIds.has(id) && canGoDeeper) {
          const shouldPaginate = !showAllChildren && node.childrenIds.length > childrenPageSize;
          const totalPages = shouldPaginate ? Math.ceil(node.childrenIds.length / childrenPageSize) : 1;
          const windowIndex = shouldPaginate ? Math.min(childPageIndex, Math.max(totalPages - 1, 0)) : 0;
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
  }, [graph.rootIds, graph.nodesById, expandedIds, depthLimit, scopeRootId, childPageIndex, childrenPageSize, showAllChildren]);

  const baseNodes = useMemo<Node[]>(
    () =>
      visibleTraversal.map(({ id, depth }) => {
        const person = graph.nodesById.get(id);
        if (!person) {
          throw new Error(`Missing person node for id ${id}`);
        }
        const dimByFocus = focusLens && !effectiveHighlightSet.has(id);
        const dimByHover = Boolean(hoveredNodeId) && !hoverSet.has(id);
        const dimmed = dimByFocus || dimByHover;
        return {
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
        };
      }),
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

  useEffect(() => {
    let cancelled = false;
    const runLayout = async () => {
      const result = await layout({ nodes: baseNodes, edges: baseEdges });
      if (!cancelled) {
        setFlowNodes(result.nodes);
        setFlowEdges(result.edges);
      }
    };
    runLayout();
    return () => {
      cancelled = true;
    };
  }, [layout, baseNodes, baseEdges]);

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
        fitView
        fitViewOptions={{ padding: CANVAS_FIT_VIEW_PADDING, includeHiddenNodes: true, minZoom: CANVAS_MIN_ZOOM }}
        zoomOnScroll
        nodesFocusable
        deleteKeyCode={[]}
        onInit={onInit}
        onPaneClick={() => onSelectNode(null)}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
      >
        <Background gap={24} color={theme === 'light' ? '#e5e7eb' : '#1f2532'} />
        <Controls />
        <MiniMap pannable zoomable maskColor={theme === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(14, 17, 23, 0.7)'} nodeColor={() => '#60f5a1'} />
      </ReactFlow>
    </div>
  );
});

HierarchyCanvas.displayName = 'HierarchyCanvas';

export default HierarchyCanvas;
