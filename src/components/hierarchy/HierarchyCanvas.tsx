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
  hoveredNodeId?: string | null;
  onHoverNode?: (id: string | null) => void;
  theme?: 'dark' | 'light';
  onInit?: (instance: ReactFlowInstance) => void;
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
  hoveredNodeId = null,
  onHoverNode,
  theme = 'dark',
  onInit,
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
    const visit = (ids: string[], depth: number) => {
      ids.forEach((id) => {
        const node = graph.nodesById.get(id);
        if (!node) return;
        items.push({ id, depth });
        const canGoDeeper = depthLimit === null || depth < depthLimit;
        if (node.childrenIds.length > 0 && expandedIds.has(id) && canGoDeeper) {
          visit(node.childrenIds, depth + 1);
        }
      });
    };
    visit(graph.rootIds, 0);
    return items;
  }, [graph.rootIds, graph.nodesById, expandedIds, depthLimit]);

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
    [visibleTraversal, graph.nodesById, focusLens, effectiveHighlightSet, density, expandedIds, selectedNodeId, onToggleNode, onSelectNode, onHoverNode, hoveredNodeId, hoverSet],
  );

  const baseEdges = useMemo<Edge[]>(
    () => {
      const edges: Edge[] = [];
      visibleTraversal.forEach(({ id }) => {
        const node = graph.nodesById.get(id);
        if (!node) return;
        if (!expandedIds.has(id)) return;
        node.childrenIds.forEach((childId) => {
          const childVisible = visibleTraversal.some((item) => item.id === childId);
          if (!childVisible) return;
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
        selectionOnDrag
        fitView
        fitViewOptions={{ padding: 0.2, includeHiddenNodes: true }}
        zoomOnScroll
        nodesFocusable
        deleteKeyCode={[]}
        onInit={onInit}
        onPaneClick={() => onSelectNode(null)}
        minZoom={0.4}
        maxZoom={1.8}
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
