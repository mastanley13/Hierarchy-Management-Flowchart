import React from 'react';
import { ChevronRight, ChevronDown, Check } from 'lucide-react';
import type { GHLHierarchyNode } from '../lib/types';
import './HierarchyCard.css';

interface HierarchyCardProps {
  node: GHLHierarchyNode;
  level: number;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
  onClick: (node: GHLHierarchyNode) => void;
  compact?: boolean;
  onFocus?: (nodeId: string) => void;
  onKeyDown?: (nodeId: string, event: React.KeyboardEvent<HTMLDivElement>) => void;
  onRef?: (nodeId: string, element: HTMLDivElement | null) => void;
}

const getStatusTone = (status: string): string => {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'INACTIVE':
      return 'danger';
    default:
      return 'neutral';
  }
};

const getInitials = (label: string): string => {
  const tokens = label.trim().split(/\s+/);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
};

const HierarchyCard: React.FC<HierarchyCardProps> = ({
  node,
  level,
  isExpanded,
  onToggle,
  onClick,
  compact = false,
  onFocus,
  onKeyDown,
  onRef,
}) => {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const indentation = Math.max(level, 0) * 28;
  const statusTone = getStatusTone(node.status);
  const initials = getInitials(node.label);

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(node.id, event);
  };

  return (
    <div
      className={`hierarchy-card ${compact ? 'hierarchy-card--compact' : ''}`}
      style={{ paddingLeft: `${indentation}px` }}
      data-level={level}
    >
      <div
        className="hierarchy-card__content"
        tabIndex={0}
        onClick={() => onClick(node)}
        onFocus={() => onFocus?.(node.id)}
        onKeyDown={handleCardKeyDown}
        aria-label={`${node.label} details`}
        aria-level={level + 1}
        aria-expanded={hasChildren ? isExpanded : undefined}
        role="treeitem"
        data-node-id={node.id}
        ref={(element) => onRef?.(node.id, element)}
      >
        {level > 0 && <div className="hierarchy-card__line-indicator" />}

        <div className="hierarchy-card__chevron-container">
          {hasChildren ? (
            <button
              type="button"
              className={`hierarchy-card__chevron ${isExpanded ? 'expanded' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(node.id);
              }}
              aria-label={isExpanded ? 'Collapse branch' : 'Expand branch'}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <div className="hierarchy-card__chevron-spacer" />
          )}
        </div>

        <div className="hierarchy-card__body">
          <div className="hierarchy-card__avatar" aria-hidden="true">
            <span>{initials}</span>
          </div>

          <div className="hierarchy-card__main">
            <div className="hierarchy-card__title-row">
              <span className="hierarchy-card__name" title={node.label}>
                {node.label}
              </span>
              <span className={`hierarchy-card__status-badge status-${statusTone}`}>
                {node.status}
              </span>
            </div>
            <div className="hierarchy-card__meta-row">
              {node.npn && <span className="hierarchy-card__meta">NPN {node.npn}</span>}
              {node.metrics.descendantCount > 0 && (
                <span className="hierarchy-card__meta">
                  {node.metrics.descendantCount} downline
                </span>
              )}
              {node.licensingState && (
                <span className="hierarchy-card__meta">State {node.licensingState}</span>
              )}
            </div>
          </div>

          <div className="hierarchy-card__badges">
            {node.vendorFlags.equita && node.vendorFlags.quility ? (
              <span className="hierarchy-card__vendor-badge vendor-badge--both">Both</span>
            ) : node.vendorFlags.equita ? (
              <span className="hierarchy-card__vendor-badge vendor-badge--equita">Equita</span>
            ) : node.vendorFlags.quility ? (
              <span className="hierarchy-card__vendor-badge vendor-badge--quility">Quility</span>
            ) : null}

            {node.flags.licensed && (
              <span className="hierarchy-card__badge-icon" title="Licensed">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HierarchyCard;
