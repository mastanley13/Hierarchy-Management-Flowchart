import { useCallback } from 'react';
import type { Edge, Node } from 'reactflow';
import ELK, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Density } from './types';

const elk = new ELK();

const WIDTH_BY_DENSITY: Record<Density, number> = {
  comfortable: 360,
  cozy: 340,
  compact: 320,
};

const HEIGHT_BY_DENSITY: Record<Density, number> = {
  comfortable: 112,
  cozy: 102,
  compact: 90,
};

const LANE_GAP_BY_DENSITY: Record<Density, number> = {
  comfortable: 140,
  cozy: 112,
  compact: 88,
};

type LayoutOptions = {
  density: Density;
};

type LayoutGraph = {
  nodes: Node[];
  edges: Edge[];
};

export const useElkLayout = ({ density }: LayoutOptions) => {
  return useCallback(
    async ({ nodes, edges }: LayoutGraph): Promise<LayoutGraph> => {
      if (nodes.length === 0) {
        return { nodes, edges };
      }

      const elkGraph: ElkNode = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'DOWN',
          'elk.layered.spacing.nodeNodeBetweenLayers': `${LANE_GAP_BY_DENSITY[density]}`,
          'elk.layered.spacing.edgeNodeBetweenLayers': `${LANE_GAP_BY_DENSITY[density] - 24}`,
          'elk.layered.spacing.edgeEdgeBetweenLayers': `${LANE_GAP_BY_DENSITY[density] - 36}`,
          'elk.spacing.nodeNode': '80',
          'elk.padding': '[top=36,left=36,bottom=36,right=36]',
          'elk.layered.nodePlacement.favorStraightEdges': 'true',
          'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
          'elk.layered.compaction.postCompaction.strategy': 'LEFT',
          'elk.layered.considerModelOrder': 'true',
          'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
        },
        children: nodes.map<ElkNode>((node) => ({
          id: node.id,
          width: WIDTH_BY_DENSITY[density],
          height: HEIGHT_BY_DENSITY[density],
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        })) as ElkExtendedEdge[],
      };

      const layout = await elk.layout(elkGraph);

      const positions: Record<
        string,
        { x: number; y: number }
      > = Object.fromEntries(
        (layout.children ?? []).map((child) => [
          child.id,
          {
            x: child.x ?? 0,
            y: child.y ?? 0,
          },
        ]),
      );

      const laidOutNodes: Node[] = nodes.map((node) => ({
        ...node,
        position: positions[node.id] ?? node.position,
      }));

      const laidOutEdges: Edge[] = edges.map((edge) => {
        const layoutEdge = (layout.edges ?? []).find((e) => e.id === edge.id) as ElkExtendedEdge | undefined;
        return {
          ...edge,
          data: {
            ...(edge.data ?? {}),
            bendPoints: layoutEdge?.sections?.[0]?.bendPoints ?? [],
          },
        };
      });

      return { nodes: laidOutNodes, edges: laidOutEdges };
    },
    [density],
  );
};
