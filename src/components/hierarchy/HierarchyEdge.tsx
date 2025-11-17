import { memo, useMemo } from 'react';
import { BaseEdge, type EdgeProps, getSmoothStepPath } from 'reactflow';

const HierarchyEdge = memo<EdgeProps>(({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) => {
  const highlighted = Boolean(data?.highlighted);

  const [path] = useMemo(
    () =>
      getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 32,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );

  const railColor = highlighted ? 'var(--edge-rail-highlight)' : 'var(--edge-rail)';
  const strokeColor = highlighted ? 'var(--edge-highlight)' : 'var(--edge)';

  return (
    <>
      <BaseEdge
        id={`${id}-rail`}
        path={path}
        style={{
          stroke: railColor,
          strokeWidth: highlighted ? 6 : 4,
          strokeLinecap: 'round',
          vectorEffect: 'non-scaling-stroke',
          opacity: highlighted ? 0.8 : 0.6,
        }}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: strokeColor,
          strokeWidth: highlighted ? 3 : 2.2,
          strokeLinecap: 'round',
          vectorEffect: 'non-scaling-stroke',
        }}
      />
      {highlighted ? (
        <BaseEdge
          id={`${id}-glow`}
          path={path}
          style={{
            stroke: 'var(--edge-highlight-glow)',
            strokeWidth: 4.4,
            strokeLinecap: 'round',
            opacity: 0.65,
            filter: 'drop-shadow(0 0 12px rgba(124, 246, 196, 0.45))',
            vectorEffect: 'non-scaling-stroke',
          }}
        />
      ) : null}
    </>
  );
});

HierarchyEdge.displayName = 'HierarchyEdge';

export default HierarchyEdge;
