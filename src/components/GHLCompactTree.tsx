import React, { useMemo, useEffect, useRef, useState } from 'react';
import type { GHLHierarchyNode } from '../lib/types';
import * as d3 from 'd3';

type Props = {
  roots: GHLHierarchyNode[];
  width?: number;
  nodeX?: number; // horizontal spacing between sibling columns
  nodeY?: number; // vertical spacing between levels
  topPadding?: number;
  onSelect?: (node: GHLHierarchyNode) => void;
  selectedId?: string | null;
};

const defaultWidth = 1100;
const margin = { top: 20, right: 20, bottom: 20, left: 20 };

function toD3Tree(roots: GHLHierarchyNode[]) {
  // Build a super root so d3 can handle a forest
  const superRoot = { id: '__root__', label: 'ROOT', children: roots } as any;
  return d3.hierarchy(superRoot, (d: any) => d.children || []);
}

const GHLCompactTree: React.FC<Props> = ({
  roots,
  width = defaultWidth,
  nodeX = 140,
  nodeY = 110,
  topPadding = 20,
  onSelect,
  selectedId,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomLayerRef = useRef<SVGGElement | null>(null);
  // noop state previously used for ready flag; not needed
  const [transform, setTransform] = useState(d3.zoomIdentity);

  const { nodes, links, height } = useMemo(() => {
    const h = toD3Tree(roots);
    const clusterLayout = d3.cluster<any>().nodeSize([nodeX, nodeY]);
    const laidOut = clusterLayout(h);

    // Compute extents to size the SVG
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const descendants = laidOut.descendants();
    for (const n of descendants) {
      if (n.depth === 0) continue; // skip super root
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }

    // Normalize X to positive space
    const xOffset = isFinite(minX) ? -minX + 30 : 0;

    const mappedNodes = descendants
      .filter((n) => n.depth > 0)
      .map((n) => ({
        x: n.x + xOffset,
        y: n.y + topPadding,
        data: n.data as GHLHierarchyNode,
        depth: n.depth - 1,
        isLeaf: !n.children || n.children.length === 0,
        parentId: (n.parent && (n.parent.data as any)?.id) || null,
      }));

    const mappedLinks = laidOut
      .links()
      .filter((l) => l.source.depth > 0 && l.target.depth > 0)
      .map((l) => ({
        x1: l.source.x + xOffset,
        y1: l.source.y + topPadding,
        x2: l.target.x + xOffset,
        y2: l.target.y + topPadding,
        sourceId: (l.source.data as any)?.id,
        targetId: (l.target.data as any)?.id,
      }));

    const height = maxY + topPadding + 80;

    return { nodes: mappedNodes, links: mappedLinks, height };
  }, [roots, nodeX, nodeY, topPadding]);

  // Zoom + pan
  useEffect(() => {
    if (!svgRef.current) return;
    const svgSel = d3.select(svgRef.current);
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (ev) => {
        setTransform(ev.transform);
      });
    svgSel.call(zoomBehavior as any);
    // Zoom to fit on first render
    const contentWidth = d3.extent(nodes.map((n) => n.x)) as [number, number];
    if (contentWidth) {
      const cw = (contentWidth[1] - contentWidth[0]) + margin.left + margin.right + 60;
      const scale = Math.min(1, (width - 40) / Math.max(cw, 1));
      const tx = (width - cw * scale) / 2;
      const ty = 20;
      const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
      svgSel.transition().duration(300).call(zoomBehavior.transform as any, t);
    }
    return () => {
      svgSel.on('.zoom', null);
    };
  }, [width, nodes]);

  const activePath = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    // Walk from selected up using parentId from nodes map
    const byId = new Map(nodes.map((n) => [n.data.id, n]));
    let current: string | null = selectedId;
    let guard = 0;
    while (current && guard < 2000) {
      set.add(current);
      const n = byId.get(current);
      current = (n?.parentId as string | null) || null;
      guard++;
    }
    return set;
  }, [nodes, selectedId]);

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <svg ref={svgRef} width={width} height={Math.max(height + margin.top + margin.bottom, 160)}>
        <defs>
          <marker id="ghl-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#91a1d0" />
          </marker>
        </defs>
        <g ref={zoomLayerRef} transform={transform.toString()}>
          {/* Level bands */}
          <g>
            {Array.from(new Set(nodes.map((n) => n.y))).map((y, idx) => (
              <rect key={`band-${idx}`} x={0} y={(y as number) - nodeY / 2 + 6} width={width} height={nodeY - 12} fill={idx % 2 === 0 ? 'rgba(12,63,244,0.03)' : 'rgba(15,23,42,0.02)'} />
            ))}
          </g>
          {/* connectors */}
          <g stroke="#91a1d0" strokeWidth={1.5} fill="none">
            {links.map((l, i) => {
              const onPath = activePath.has(l.sourceId as string) && activePath.has(l.targetId as string);
              const midY = (l.y1 + l.y2) / 2;
              const d = `M${l.x1},${l.y1} L${l.x1},${midY} L${l.x2},${l.y2}`;
              return (
                <path
                  key={`l-${i}`}
                  d={d}
                  opacity={onPath ? 1 : 0.45}
                  stroke={onPath ? '#5b6fe7' : '#91a1d0'}
                  markerEnd="url(#ghl-arrow)"
                />
              );
            })}
          </g>

          {/* nodes */}
          <g>
            {nodes.map((n, i) => {
              const vendor = n.data.vendorFlags;
              const color = vendor.equita && vendor.quility
                ? '#6a7bff'
                : vendor.equita
                ? '#3e86ff'
                : vendor.quility
                ? '#6c2fff'
                : '#7784a0';
              const radius = 18;
              const label = n.data.label || 'N/A';
              const npn = n.data.npn || 'N/A';
              const showSquare = n.isLeaf;
              const onPath = activePath.has(n.data.id);

              return (
                <g
                  key={`n-${i}`}
                transform={`translate(${n.x}, ${n.y})`}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                  onClick={() => onSelect?.(n.data)}
                >
                  {showSquare ? (
                  <rect x={-radius} y={-radius} width={radius * 2} height={radius * 2} rx={6} fill={onPath ? '#e0e6ff' : '#e8edff'} stroke={onPath ? '#4d62e3' : color} />
                  ) : (
                  <circle r={radius} fill={onPath ? '#e0e6ff' : '#e8edff'} stroke={onPath ? '#4d62e3' : color} />
                  )}
                  <text
                    x={0}
                    y={-radius - 8}
                    textAnchor="middle"
                    fontSize={12}
                  fill="#2a3553"
                    style={{ fontWeight: 600 }}
                  >
                    {label.length > 14 ? label.slice(0, 13) + '…' : label}
                  </text>
                  <text x={0} y={radius + 14} textAnchor="middle" fontSize={11} fill="#526185">
                    {npn ? `NPN ${npn}` : ''}
                  </text>
                </g>
              );
          })}
          </g>
        </g>
      </svg>
    </div>
  );
};

export default GHLCompactTree;

