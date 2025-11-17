import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { GHLHierarchyNode } from '../lib/types';

type Density = 'comfortable' | 'compact';

type UplineHierarchyCardProps = {
  node: GHLHierarchyNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  density: Density;
  onToggle: (nodeId: string) => void;
  onSelect: (node: GHLHierarchyNode) => void;
};

const vendorBadgesFor = (node: GHLHierarchyNode): string[] => {
  const badges: string[] = [];
  if (node.vendorFlags.equita) badges.push('Equita');
  if (node.vendorFlags.quility) badges.push('Quility');
  if (badges.length === 0) badges.push('Independent');
  return badges;
};

const UplineHierarchyCard: React.FC<UplineHierarchyCardProps> = ({
  node,
  depth,
  isExpanded,
  isSelected,
  density,
  onToggle,
  onSelect,
}) => {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const vendorBadges = vendorBadgesFor(node);
  const tags = (node.tags || []).filter((tag) => {
    const normalized = tag.trim().toLowerCase();
    return normalized !== 'equita' && normalized !== 'quility';
  });

  return (
    <div
      className={`hier-tree__row hier-tree__row--${density} ${isSelected ? 'is-selected' : ''}`}
      style={{ '--hier-depth': depth } as React.CSSProperties}
      data-depth={depth}
    >
      <div className="hier-tree__card">
        <div className="hier-tree__card-main">
          <div className="hier-tree__actions">
            {hasChildren ? (
              <button
                type="button"
                className={`hier-tree__toggle ${isExpanded ? 'is-expanded' : ''}`}
                aria-label={isExpanded ? 'Collapse branch' : 'Expand branch'}
                onClick={() => onToggle(node.id)}
              >
                <ChevronRight size={16} />
              </button>
            ) : (
              <span className="hier-tree__toggle--placeholder" />
            )}
          </div>
          <button
            type="button"
            className="hier-tree__content"
            onClick={() => onSelect(node)}
          >
            <div className="hier-tree__title-line">
              <h3>{node.label}</h3>
              <span className={`hier-tree__status hier-tree__status--${node.status.toLowerCase()}`}>
                {node.status}
              </span>
            </div>
            <div className="hier-tree__meta-line">
              <span className="hier-tree__meta">NPN {node.npn || 'N/A'}</span>
              <span className="hier-tree__meta">
                {(node.metrics.descendantCount ?? 0) + 1} agents
              </span>
              {node.licensingState && (
                <span className="hier-tree__meta">State {node.licensingState}</span>
              )}
              {node.compLevel && (
                <span className="hier-tree__meta">Comp {node.compLevel}</span>
              )}
            </div>
            <div className="hier-tree__tag-line">
              {vendorBadges.map((badge) => (
                <span
                  key={badge}
                  className={`hier-tree__badge hier-tree__badge--${badge.toLowerCase()}`}
                >
                  {badge}
                </span>
              ))}
              {tags.map((tag) => (
                <span key={tag} className="hier-tree__tag">
                  {tag}
                </span>
              ))}
              {node.issues?.missingNpn && (
                <span className="hier-tree__tag hier-tree__tag--warning">Missing NPN</span>
              )}
              {node.issues?.duplicateNpn && (
                <span className="hier-tree__tag hier-tree__tag--warning">Duplicate NPN</span>
              )}
              {node.issues?.uplineNotFound && (
                <span className="hier-tree__tag hier-tree__tag--warning">Upline Missing</span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UplineHierarchyCard;
