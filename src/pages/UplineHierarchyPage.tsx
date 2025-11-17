import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  Users,
  Building2,
  Sparkles,
  Eye,
  EyeOff,
  ListTree,
} from 'lucide-react';
import type { GHLHierarchyNode, GHLSnapshot } from '../lib/types';
import '../App.css';
import './UplineHierarchyPage.css';
import ContactDetailsModal from '../components/ContactDetailsModal';
import UplineHierarchyCard from '../components/UplineHierarchyCard';

type VendorSource = 'equita' | 'quility' | 'combined';

const vendorLabels: Record<VendorSource, string> = {
  equita: 'Equita',
  quility: 'Quility',
  combined: 'Combined',
};

const vendorFilterOptions: VendorSource[] = ['equita', 'quility', 'combined'];

const hasIssues = (node: GHLHierarchyNode): boolean =>
  node.issues.missingNpn ||
  node.issues.duplicateNpn ||
  node.issues.uplineNotFound ||
  node.issues.cycleBreak;

const cloneWithChildren = (
  node: GHLHierarchyNode,
  children: GHLHierarchyNode[]
): GHLHierarchyNode => ({
  ...node,
  children,
});

const filterNodeByVendor = (
  node: GHLHierarchyNode,
  filter: VendorSource
): GHLHierarchyNode | null => {
  if (filter === 'combined') {
    const children = node.children
      .map((child) => filterNodeByVendor(child, filter))
      .filter((child): child is GHLHierarchyNode => Boolean(child));

    if (children.length === node.children.length) {
      return node;
    }
    return cloneWithChildren(node, children);
  }

  const matchesSelf =
    filter === 'equita' ? node.vendorFlags.equita : node.vendorFlags.quility;

  const filteredChildren = node.children
    .map((child) => filterNodeByVendor(child, filter))
    .filter((child): child is GHLHierarchyNode => Boolean(child));

  if (matchesSelf || filteredChildren.length > 0) {
    if (matchesSelf && filteredChildren.length === node.children.length) {
      return node;
    }
    return cloneWithChildren(node, filteredChildren);
  }

  return null;
};

const filterNodeByIssues = (
  node: GHLHierarchyNode
): GHLHierarchyNode | null => {
  const filteredChildren = node.children
    .map(filterNodeByIssues)
    .filter((child): child is GHLHierarchyNode => Boolean(child));

  if (hasIssues(node) || filteredChildren.length > 0) {
    if (hasIssues(node) && filteredChildren.length === node.children.length) {
      return node;
    }
    return cloneWithChildren(node, filteredChildren);
  }

  return null;
};

const collectAllIds = (nodes: GHLHierarchyNode[], acc: Set<string>) => {
  nodes.forEach((node) => {
    acc.add(node.id);
    if (node.children?.length) {
      collectAllIds(node.children, acc);
    }
  });
};

const findPathToId = (
  nodes: GHLHierarchyNode[],
  id: string,
  acc: GHLHierarchyNode[] = []
): GHLHierarchyNode[] | null => {
  for (const node of nodes) {
    const path = [...acc, node];
    if (node.id === id) {
      return path;
    }
    const childPath = findPathToId(node.children || [], id, path);
    if (childPath) {
      return childPath;
    }
  }
  return null;
};

const UplineHierarchyPage = () => {
  const [vendorFilter, setVendorFilter] = useState<VendorSource>('combined');
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [useMock, setUseMock] = useState(true);
  const [snapshot, setSnapshot] = useState<GHLSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [activeContact, setActiveContact] = useState<GHLHierarchyNode | null>(null);
  const [activePath, setActivePath] = useState<GHLHierarchyNode[]>([]);

  const fetchSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/ghl/snapshot${useMock ? '?mock=1' : ''}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to fetch snapshot (${response.status})`);
      }

      const data = (await response.json()) as GHLSnapshot;
      setSnapshot(data);
    } catch (err) {
      console.error('Failed to fetch snapshot', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [useMock]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!snapshot) return;

    setExpandedIds(() => {
      const next = new Set<string>();
      snapshot.hierarchy.forEach((root) => {
        next.add(root.id);
        if (Array.isArray(root.children)) {
          root.children.slice(0, 3).forEach((child) => next.add(child.id));
        }
      });
      return next;
    });

    setActiveContact(null);
    setActivePath([]);
  }, [snapshot]);

  const filteredTree = useMemo(() => {
    if (!snapshot) return [];

    const vendorFiltered = snapshot.hierarchy
      .map((node) => filterNodeByVendor(node, vendorFilter))
      .filter((node): node is GHLHierarchyNode => Boolean(node));

    if (!showIssuesOnly) {
      return vendorFiltered;
    }

    return vendorFiltered
      .map((node) => filterNodeByIssues(node))
      .filter((node): node is GHLHierarchyNode => Boolean(node));
  }, [snapshot, vendorFilter, showIssuesOnly]);

  const expandPath = useCallback((path: GHLHierarchyNode[]) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      path.forEach((node) => next.add(node.id));
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (node: GHLHierarchyNode) => {
      if (!snapshot) return;
      const path = findPathToId(snapshot.hierarchy, node.id) ?? [node];
      expandPath(path);
      setActiveContact(node);
      setActivePath(path);
    },
    [snapshot, expandPath]
  );

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!snapshot) return;
    const next = new Set<string>();
    collectAllIds(snapshot.hierarchy, next);
    setExpandedIds(next);
  }, [snapshot]);

  const collapseAll = useCallback(() => {
    if (!snapshot) return;
    const next = new Set<string>();
    snapshot.hierarchy.forEach((root) => next.add(root.id));
    setExpandedIds(next);
  }, [snapshot]);

  const toggleDensity = useCallback(() => {
    setDensity((prev) => (prev === 'comfortable' ? 'compact' : 'comfortable'));
  }, []);

  const doSearch = useCallback(() => {
    if (!snapshot) return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;

    const stack = [...snapshot.hierarchy];
    while (stack.length) {
      const node = stack.pop()!;
      const name = (node.label || '').toLowerCase();
      const npn = (node.npn || '').toLowerCase();
      if (name.includes(q) || npn === q) {
        const path = findPathToId(snapshot.hierarchy, node.id) ?? [node];
        expandPath(path);
        setActiveContact(node);
        setActivePath(path);
        return;
      }
      if (node.children?.length) {
        stack.push(...node.children);
      }
    }
  }, [snapshot, searchQuery, expandPath]);

  const statsCards = useMemo(
    () => [
      {
        label: 'Branches',
        value: snapshot ? snapshot.stats.branches.toLocaleString() : 'N/A',
        icon: Building2,
      },
      {
        label: 'Producers',
        value: snapshot ? snapshot.stats.producers.toLocaleString() : 'N/A',
        icon: Users,
      },
      {
        label: 'Enhanced',
        value: snapshot ? snapshot.stats.enhanced.toLocaleString() : 'N/A',
        icon: Sparkles,
      },
    ],
    [snapshot]
  );

  function renderTree(nodes: GHLHierarchyNode[], depth = 0): ReactNode {
    return nodes.map((node) => {
      const isExpanded = expandedIds.has(node.id);
      const hasChildren = node.children.length > 0;

      return (
        <div
          key={node.id}
          className="hier-tree__node"
          data-depth={depth}
          style={{ '--hier-depth': depth } as React.CSSProperties}
        >
          <UplineHierarchyCard
            node={node}
            depth={depth}
            isExpanded={isExpanded}
            isSelected={activeContact?.id === node.id}
            density={density}
            onToggle={toggleExpanded}
            onSelect={handleSelect}
          />
          {hasChildren && isExpanded && (
            <div className="hier-tree__children">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="upline-page">
      <header className="upline-header">
        <div className="upline-header__branding">
          <div>
            <h1>Hierarchy Management System</h1>
            <span className="upline-header__badge">
              Major Revolution Financial Group
            </span>
          </div>
          <div className="upline-header__actions">
            <button
              className="upline-btn upline-btn--ghost"
              onClick={() => window.location.assign('/')}
            >
              Back to Classic View
            </button>
            <button className="upline-btn upline-btn--primary">
              Open Control Center
            </button>
          </div>
        </div>

        <div className="upline-toolbar">
          <div className="upline-search">
            <Search size={18} />
            <input
              placeholder="Search by NPN or Contact"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e as any).key === 'Enter') doSearch();
              }}
            />
            <button type="button" onClick={doSearch}>
              Search
            </button>
          </div>

          <div className="upline-toolbar__group">
            <button
              className="upline-btn"
              onClick={fetchSnapshot}
              disabled={loading}
            >
              <RefreshCw size={16} />
              {loading ? 'Refreshing…' : 'Refresh Snapshot'}
            </button>
            <button
              className="upline-btn"
              onClick={() => {
                if (!snapshot) return;
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `ghl-hierarchy-${snapshot.generatedAt}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              disabled={!snapshot}
            >
              <Download size={16} />
              Export
            </button>
            <label className="upline-switch" style={{ marginLeft: 8 }}>
              <input
                type="checkbox"
                checked={useMock}
                onChange={(e) => {
                  setUseMock(e.target.checked);
                  setTimeout(() => fetchSnapshot(), 0);
                }}
              />
              <span>Mock Data</span>
            </label>
          </div>
        </div>
      </header>

      <main className="upline-main">
        <section className="upline-stats">
          {statsCards.map((card) => (
            <div key={card.label} className="upline-stat-card">
              <card.icon size={20} />
              <div>
                <span className="upline-stat-card__label">{card.label}</span>
                <span className="upline-stat-card__value">{card.value}</span>
              </div>
            </div>
          ))}

          <div className="upline-toggle-group">
            {vendorFilterOptions.map((option) => (
              <button
                key={option}
                className={`upline-toggle ${vendorFilter === option ? 'is-active' : ''}`}
                onClick={() => setVendorFilter(option)}
              >
                {vendorLabels[option]}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`upline-visibility ${showIssuesOnly ? 'is-active' : ''}`}
            onClick={() => setShowIssuesOnly((prev) => !prev)}
          >
            {showIssuesOnly ? <Eye size={16} /> : <EyeOff size={16} />}
            {showIssuesOnly ? 'Showing Issues' : 'Show Issues Only'}
          </button>
        </section>

        <section className="hier-tree-panel">
          <div className="hier-tree-panel__header">
            <div>
              <h2>Upline Explorer</h2>
              <p>
                Contacts linked using the HighLevel snapshot for location{' '}
                <code>nEEiHT9n7OPxFnBZIycg</code>.
              </p>
            </div>
            <div className="hier-tree-panel__actions">
              <button type="button" className="upline-btn" onClick={expandAll}>
                Expand All
              </button>
              <button type="button" className="upline-btn" onClick={collapseAll}>
                Collapse All
              </button>
              <button
                type="button"
                className="upline-btn"
                onClick={toggleDensity}
              >
                <ListTree size={16} />
                {density === 'comfortable' ? 'Compact View' : 'Comfortable View'}
              </button>
              <button
                type="button"
                className="upline-btn upline-btn--ghost"
                onClick={() => {
                  if (!activeContact && filteredTree.length > 0) {
                    handleSelect(filteredTree[0]);
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {activeContact ? <Eye size={16} /> : <EyeOff size={16} />}
                Focus Selection
              </button>
            </div>
          </div>

          {loading && (
            <div className="hier-tree__empty" role="status">
              Loading HighLevel snapshot…
            </div>
          )}

          {!loading && error && (
            <div className="hier-tree__empty" role="alert">
              {error}
            </div>
          )}

          {!loading && !error && filteredTree.length === 0 && (
            <div className="hier-tree__empty">
              No contacts match the current filters.
            </div>
          )}

          {!loading && !error && filteredTree.length > 0 && (
            <div className={`hier-tree ${density === 'compact' ? 'hier-tree--compact' : ''}`}>
              {renderTree(filteredTree)}
            </div>
          )}
        </section>
      </main>

      <ContactDetailsModal
        node={activeContact}
        definitions={snapshot?.customFieldDefs ?? []}
        path={activePath}
        onClose={() => setActiveContact(null)}
      />
    </div>
  );
};

export default UplineHierarchyPage;
