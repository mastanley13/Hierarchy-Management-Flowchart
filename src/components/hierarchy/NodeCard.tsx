import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { Density, PersonNode } from './types';
import './nodeCard.css';

type NodeCardData = {
  person: PersonNode;
  density: Density;
  expanded: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
};

const NodeCard = memo<NodeProps<NodeCardData>>(({ data }) => {
  const { person, density, expanded, isSelected, isDimmed, onToggle, onSelect, onHover } = data;

  const uplineProducerId = person.sourceNode?.raw?.uplineProducerId || null;
  const showNpnBadge = Boolean(person.npn);
  const showUplineBadge = Boolean(uplineProducerId);
  const showSyntheticBadge = person.sourceNode?.uplineSource === 'synthetic';
  const duplicateGroupSize = person.duplicateGroupSize ?? 0;
  const showDuplicateNpnBadge = duplicateGroupSize > 1 || Boolean(person.sourceNode?.issues?.duplicateNpn);

  const initials = useMemo(() => {
    const parts = person.name.split(' ').filter(Boolean);
    if (parts.length === 0) {
      return '??';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [person.name]);

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggle(person.id);
  };

  const handleActionsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSelect(person.id);
    // Actions menu handled by parent; we emit selection for now.
  };

  const handleSelect = () => {
    onSelect(person.id);
  };

  const handleMouseEnter = () => {
    if (onHover) onHover(person.id);
  };

  const handleMouseLeave = () => {
    if (onHover) onHover(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(person.id);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!expanded) {
        onToggle(person.id);
      }
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (expanded) {
        onToggle(person.id);
      }
    }
  };

  const branchSummaryLine = useMemo(() => {
    const total =
      person.branchSummary.active +
      person.branchSummary.inactive +
      person.branchSummary.pending;
    const parts: string[] = [];
    if (person.branchSummary.inactive > 0) {
      parts.push(`${person.branchSummary.inactive} inactive`);
    }
    if (person.branchSummary.pending > 0) {
      parts.push(`${person.branchSummary.pending} pending`);
    }
    if (person.branchSummary.active > 0) {
      parts.push(`${person.branchSummary.active} active`);
    }
    const downline = person.metrics.descendantCount ?? 0;
    const joiner = ' / ';
    const prefix = total > 0 ? parts.join(joiner) : '';
    if (downline > 0) {
      return prefix ? `${prefix}${joiner}${downline} downline` : `${downline} downline`;
    }
    return prefix || 'No downline';
  }, [person.branchSummary, person.metrics.descendantCount]);

  const borderGradient = useMemo(() => {
    const { active, pending, inactive } = person.branchSummary;
    const total = active + pending + inactive;
    if (total === 0) {
      return 'linear-gradient(180deg, rgba(125, 211, 252, 0.6) 0%, rgba(96, 245, 161, 0.45) 100%)';
    }
    const activeRatio = active / total;
    const pendingRatio = pending / Math.max(total, 1);
    const startColor = activeRatio >= 0.7 ? '#60f5a1' : activeRatio >= 0.4 ? '#7cf6c4' : '#fcd34d';
    const endColor =
      pendingRatio > 0.2
        ? 'rgba(252, 211, 77, 0.35)'
        : inactive > pending
        ? 'rgba(148, 163, 184, 0.4)'
        : 'rgba(124, 246, 196, 0.25)';
    return `linear-gradient(180deg, ${startColor} 0%, ${endColor} 100%)`;
  }, [person.branchSummary]);

  const nodeStyle = useMemo(
    () =>
      borderGradient
        ? {
            borderImage: `${borderGradient} 1`,
          }
        : undefined,
    [borderGradient],
  );

  return (
    <article
      className={[
        'node-card nodrag',
        isSelected ? 'is-selected' : '',
        isDimmed ? 'is-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-density={density}
      role="treeitem"
      aria-expanded={expanded}
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={(event) => event.stopPropagation()}
      style={nodeStyle}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="node-card__handle node-card__handle--top"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="node-card__handle node-card__handle--bottom"
        isConnectable={false}
      />
      <button
        type="button"
        className="node-card__toggle nodrag"
        aria-label={expanded ? 'Collapse branch' : 'Expand branch'}
        onClick={handleToggle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <div className="node-card__avatar" aria-hidden>
        {initials}
      </div>
      <div className="node-card__body">
        <div className="node-card__title-row node-card__title-row--stacked">
          <span className="node-card__name">{person.name}</span>
          {(showNpnBadge || showUplineBadge || showSyntheticBadge || showDuplicateNpnBadge) && (
            <div className="node-card__badges">
              {showNpnBadge && <span className="node-card__tag">NPN {person.npn}</span>}
              {showUplineBadge && (
                <span className="node-card__tag node-card__tag--upline">Upline {uplineProducerId}</span>
              )}
              {showDuplicateNpnBadge && (
                <span className="node-card__tag node-card__tag--duplicate">
                  {duplicateGroupSize > 1 ? `Duplicate NPN (${duplicateGroupSize})` : 'Duplicate NPN'}
                </span>
              )}
              {showSyntheticBadge && <span className="node-card__tag node-card__tag--synthetic">Synthetic Upline</span>}
            </div>
          )}
        </div>
        <div className="node-card__summary">{branchSummaryLine}</div>
        <div className="node-card__meta">
          {person.metrics.lastSeen ? `Last touch ${person.metrics.lastSeen}` : ''}
        </div>
      </div>
      <button
        type="button"
        className="node-card__actions nodrag"
        aria-label="Open actions menu"
        onClick={handleActionsClick}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={16} />
      </button>
    </article>
  );
});

NodeCard.displayName = 'NodeCard';

export default NodeCard;
