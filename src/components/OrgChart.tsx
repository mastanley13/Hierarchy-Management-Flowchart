import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, AlertCircle, AlertTriangle, User, Building2, Users, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import './OrgChart.css';
import type { ChartTree, GARelation, ProducerLabel, OrgChartProps } from '../lib/types';
import { fetchFirmRelationsAfter, fetchProducerByNPN, createAuthToken } from '../lib/api';
import { relationsToChart, searchTreeByNPN, countNodes } from '../lib/transform';
import { loadProducerNamesProgressively } from '../lib/progressive-loader';
// Temporarily disable virtualization to fix import issues
// We'll implement custom virtualization if needed

interface OrgChartState {
  tree: ChartTree | null;
  loading: boolean;
  error: string | null;
  lastRefresh: string;
  searchQuery: string;
  selectedProducerId: number | null;
  collapsedNodes: Set<string>;
  loadingProgress: {
    total: number;
    loaded: number;
    isLoading: boolean;
  };
  filterStatus: string;
  showErrorsOnly: boolean;
  expandedFromSearch: Set<string>;
}

const OrgChart: React.FC<OrgChartProps> = ({
  firmId,
  initialDate = '2000-01-01T00:00:00Z',
  pageLimit = 10000, // Increased limit to fetch more producers
  onSelectProducer
}) => {
  const [state, setState] = useState<OrgChartState>({
    tree: null,
    loading: false,
    error: null,
    lastRefresh: initialDate,
    searchQuery: '',
    selectedProducerId: null,
    collapsedNodes: new Set(),
    loadingProgress: {
      total: 0,
      loaded: 0,
      isLoading: false
    },
    filterStatus: 'all',
    showErrorsOnly: false,
    expandedFromSearch: new Set()
  });

  const labelCacheRef = useRef(new Map<number, ProducerLabel>());
  const relationsRef = useRef<GARelation[]>([]);
  const isLoadingRef = useRef(false);

  // Removed virtualization constants as we're not using react-window anymore

  // We no longer need this since we're using on-demand loading
  // const lastNameUpdateRef = useRef(0);

  const loadHierarchyData = useCallback(async (fromDate?: string) => {
    const dateToUse = fromDate || initialDate;
    
    // Prevent duplicate API calls
    if (isLoadingRef.current) {
      console.log('Already loading, skipping duplicate call');
      return;
    }
    
    isLoadingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const token = createAuthToken();
      console.log(`Loading hierarchy data from ${dateToUse}`);
      
      const relations = await fetchFirmRelationsAfter(dateToUse, token, pageLimit);
      console.log(`Fetched ${relations.length} relations`);
      
      // Log the unique gaId values to see what firms are actually in the data
      const uniqueGaIds = [...new Set(relations.map(r => r.gaId))];
      console.log('Available firm IDs (gaIds) in the data:', uniqueGaIds);
      console.log('Looking for firm ID:', firmId);
      
      if (relations.length === 0) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: `No hierarchy data found for firm ${firmId}. This firm may not exist or have no relationships.`
        }));
        return;
      }

      // Filter relations for our specific firm
      let firmRelations = relations.filter(r => r.gaId === firmId);
      let actualFirmId = firmId;
      
      // If no relations found for the specified firm ID, use the first available firm
      if (firmRelations.length === 0 && uniqueGaIds.length > 0) {
        console.log(`No relations found for firm ${firmId}, using first available firm: ${uniqueGaIds[0]}`);
        actualFirmId = uniqueGaIds[0];
        firmRelations = relations.filter(r => r.gaId === actualFirmId);
      }
      
      console.log(`Filtered ${firmRelations.length} relations for firm ${actualFirmId}`);
      console.log('Sample relations:', firmRelations.slice(0, 3));
      relationsRef.current = firmRelations;

      const tree = relationsToChart(
        actualFirmId,
        firmRelations,
        labelCacheRef.current
      );
      
      console.log('Generated tree:', tree);

      const maxTs = relations.reduce((max, r) => 
        r.ts && r.ts > max ? r.ts : max, 
        dateToUse
      );

      // Initialize with all branches collapsed for better progressive disclosure
      const initialCollapsedNodes = new Set<string>();
      if (tree && tree.children) {
        tree.children.forEach(branch => {
          if (branch.type === 'branch') {
            initialCollapsedNodes.add(branch.id);
          }
        });
      }

      setState(prev => ({
        ...prev,
        tree,
        loading: false,
        lastRefresh: maxTs,
        error: null,
        collapsedNodes: initialCollapsedNodes
      }));
      
      // Only load names for the root agency node initially
      if (tree && tree.type === 'agency') {
        console.log('Loading names for root agency node only');
        
        // Count producers at the root level that need names
        let rootLevelProducers = 0;
        if (tree.children) {
          tree.children.forEach(branch => {
            if (branch.type === 'producer' && branch.meta?.needsNameFetch) {
              rootLevelProducers++;
            }
          });
        }
        
        if (rootLevelProducers > 0) {
          setState(prev => ({ 
            ...prev, 
            loadingProgress: { 
              total: rootLevelProducers, 
              loaded: 0, 
              isLoading: true 
            } 
          }));
          
          // Only load names for the root level producers
          loadProducerNamesProgressively(
            tree,
            labelCacheRef.current,
            token,
            (updatedTree) => {
              setState(prev => ({ 
                ...prev, 
                tree: updatedTree,
                loadingProgress: {
                  ...prev.loadingProgress,
                  loaded: Math.min(prev.loadingProgress.loaded + 5, rootLevelProducers),
                  isLoading: prev.loadingProgress.loaded < rootLevelProducers
                }
              }));
            },
            4, // modest concurrency
            tree.id // Only load for the root node
          ).then(() => {
            setState(prev => ({ 
              ...prev, 
              loadingProgress: {
                ...prev.loadingProgress,
                loaded: rootLevelProducers,
                isLoading: false
              }
            }));
          }).catch(error => {
            console.warn('Progressive loading failed:', error);
            setState(prev => ({ 
              ...prev, 
              loadingProgress: {
                ...prev.loadingProgress,
                isLoading: false
              }
            }));
          });
        }
      }

    } catch (error) {
      console.error('Error loading hierarchy data:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load hierarchy data'
      }));
    } finally {
      isLoadingRef.current = false;
    }
  }, [firmId, pageLimit]); // Removed initialDate to prevent infinite re-renders

  // We're now counting producers on-demand when branches are expanded
  // so we don't need this function anymore

  const toggleNodeCollapse = useCallback((nodeId: string, node: ChartTree) => {
    try {
      const isCollapsed = state.collapsedNodes.has(nodeId);
      
      // First toggle collapsed state to ensure UI responsiveness
      setState(prev => {
        const newCollapsed = new Set(prev.collapsedNodes);
        if (newCollapsed.has(nodeId)) {
          newCollapsed.delete(nodeId);
        } else {
          newCollapsed.add(nodeId);
        }
        return { ...prev, collapsedNodes: newCollapsed };
      });
      
      // If we're expanding a node, check if we need to load producer names
      if (isCollapsed && node && node.children && node.children.length > 0) {
        // Validate node structure before proceeding
        if (!node.id || !node.type) {
          console.error('Invalid node structure:', node);
          return;
        }
        
        // Check if this branch has producers that need name loading
        const hasProducersNeedingNames = node.children.some(child => 
          child.type === 'producer' && child.meta?.needsNameFetch
        );
        
        if (hasProducersNeedingNames) {
          console.log(`Loading names for expanded node ${nodeId}`);
          
          try {
            // Start loading names for this branch
            const token = createAuthToken();
            
            // Count producers needing names in this subtree
            let subtreeProducersCount = 0;
            const countProducersInSubtree = (n: ChartTree) => {
              if (n.type === 'producer' && n.meta?.needsNameFetch) {
                subtreeProducersCount++;
              }
              if (n.children) {
                n.children.forEach(countProducersInSubtree);
              }
            };
            
            try {
              countProducersInSubtree(node);
            } catch (countError) {
              console.error('Error counting producers:', countError);
              return;
            }
            
            // Only update state if we found producers to load
            if (subtreeProducersCount > 0) {
              setState(prev => ({ 
                ...prev, 
                loadingProgress: { 
                  total: subtreeProducersCount,
                  loaded: 0,
                  isLoading: true 
                } 
              }));
              
              // Load names for this specific subtree
              loadProducerNamesProgressively(
                state.tree!,
                labelCacheRef.current,
                token,
                (updatedTree) => {
                  setState(prev => ({ 
                    ...prev, 
                    tree: updatedTree,
                    loadingProgress: {
                      ...prev.loadingProgress,
                      loaded: Math.min(prev.loadingProgress.loaded + 5, subtreeProducersCount)
                    }
                  }));
                },
                4, // concurrency
                nodeId // Only load names for this subtree
              ).then(() => {
                setState(prev => ({ 
                  ...prev, 
                  loadingProgress: {
                    ...prev.loadingProgress,
                    loaded: subtreeProducersCount,
                    isLoading: false
                  }
                }));
              }).catch(error => {
                console.error('Error loading producer names:', error);
                setState(prev => ({ 
                  ...prev, 
                  loadingProgress: {
                    ...prev.loadingProgress,
                    isLoading: false
                  }
                }));
              });
            }
          } catch (loadError) {
            console.error('Error setting up name loading:', loadError);
          }
        }
      }
    } catch (error) {
      console.error('Error in toggleNodeCollapse:', error);
      // Ensure UI remains responsive even if there's an error
      setState(prev => {
        const newCollapsed = new Set(prev.collapsedNodes);
        if (newCollapsed.has(nodeId)) {
          newCollapsed.delete(nodeId);
        } else {
          newCollapsed.add(nodeId);
        }
        return { ...prev, collapsedNodes: newCollapsed };
      });
    }
  }, [state.tree, state.collapsedNodes]);

  const handleRefresh = useCallback(async () => {
    await loadHierarchyData(state.lastRefresh);
  }, [state.lastRefresh]); // Removed loadHierarchyData dependency

  const handleSearch = useCallback(async () => {
    if (!state.searchQuery.trim()) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const token = createAuthToken();
      const producer = await fetchProducerByNPN(state.searchQuery.trim(), token);
      
      if (!producer) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: `No producer found with NPN: ${state.searchQuery}` 
        }));
        return;
      }

      // Check if producer is in our current tree
      if (state.tree) {
        const foundNode = searchTreeByNPN(state.tree, producer.npn || '', labelCacheRef.current);
        if (foundNode) {
          // Expand the tree to show the found producer
          const expandedNodes = new Set(state.collapsedNodes);
          // Find and expand parent branch
          if (state.tree) {
            const expandParents = (node: ChartTree, targetId: string): boolean => {
              if (node.id === targetId) return true;
              if (node.children) {
                for (const child of node.children) {
                  if (expandParents(child, targetId)) {
                    expandedNodes.delete(node.id);
                    return true;
                  }
                }
              }
              return false;
            };
            if (state.tree) {
              expandParents(state.tree, foundNode.id);
            }
          }
          
          setState(prev => ({ 
            ...prev, 
            selectedProducerId: producer.id,
            loading: false,
            collapsedNodes: expandedNodes
          }));
          
          // Scroll to the producer node (implement scrolling logic here)
          console.log('Found producer in tree:', foundNode);
        } else {
          setState(prev => ({ 
            ...prev, 
            loading: false,
            error: `Producer ${producer.firstName} ${producer.lastName} (NPN: ${producer.npn}) is not in the current hierarchy`
          }));
        }
      }

    } catch (error) {
      console.error('Search error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Search failed'
      }));
    }
  }, [state.searchQuery, state.tree]);

  // Removed unused functions: clearSearch, toggleFilter

  // Filter function for nodes
  const shouldShowNode = useCallback((node: ChartTree): boolean => {
    // Safety check for valid node
    if (!node || !node.type) {
      return false;
    }
    
    // Always show agency and branch nodes
    if (node.type === 'agency' || node.type === 'branch') return true;
    
    // Apply filters to producer nodes
    if (node.type === 'producer') {
      // Status filter
      if (state.filterStatus !== 'all') {
        const nodeStatus = node.badges?.status?.toLowerCase();
        if (state.filterStatus === 'active' && nodeStatus !== 'active') return false;
        if (state.filterStatus === 'archived' && nodeStatus !== 'archived') return false;
      }
      
      // Errors filter
      if (state.showErrorsOnly) {
        if (!node.badges?.hasErrors && !node.badges?.hasWarnings) return false;
      }
    }
    
    return true;
  }, [state.filterStatus, state.showErrorsOnly]);

  // Removed unused function: countFilteredNodes

  // Load data once on mount
  useEffect(() => {
    loadHierarchyData();
  }, []); // Empty dependency array - only run once on mount

  const renderFlowchartNode = (node: ChartTree, level: number = 0): React.ReactElement => {
    // Safety check for malformed nodes
    if (!node || !node.type || !node.id) {
      console.error('Invalid node encountered:', node);
      return <div key={`error-${Math.random()}`} className="tree-node tree-node--error">Invalid Node</div>;
    }
    
    if (!shouldShowNode(node) && node.type === 'producer') {
      return <div key={node.id} className="tree-node tree-node--hidden" style={{ display: 'none' }}>Hidden</div>;
    }
    
    // Ensure node has required properties
    const nodeId = node.id;
    const nodeType = node.type;
    const nodeLabel = node.label || 'Unnamed Node';
    
    const isSelected = node.meta?.producerId === state.selectedProducerId;
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = state.collapsedNodes.has(nodeId);
    const shouldShowChildren = hasChildren && !isCollapsed;
    const isLoadingName = nodeType === 'producer' && node.meta?.needsNameFetch;
    
    // Filter children and ensure they are valid nodes
    const visibleChildren = node.children?.filter(child => {
      // First check if child exists and has required properties
      if (!child || !child.id || !child.type || !child.label) {
        console.warn('Filtering out invalid child node:', child);
        return false;
      }
      
      // Then check if it should be shown
      return shouldShowNode(child) || child.type !== 'producer';
    }) || [];
    
    // For agency (root) node
    if (nodeType === 'agency') {
      return (
        <div key={nodeId} id={nodeId} className={`tree-node tree-node--${nodeType} tree-node--level-${level} ${hasChildren ? 'has-children' : ''}`}>
          <div 
            className={`tree-node__content ${
              isSelected ? 'tree-node__content--selected' : ''
            } ${
              isLoadingName ? 'tree-node__content--loading' : ''
            }`}
          >
            {/* Expand/Collapse Button */}
            {hasChildren && (
              <button
                className="tree-node__toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNodeCollapse(node.id, node);
                }}
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? (
                  <ChevronRight size={16} className="tree-node__toggle-icon" />
                ) : (
                  <ChevronDown size={16} className="tree-node__toggle-icon" />
                )}
              </button>
            )}
            
            {/* Node Main Content */}
            <div 
              className="tree-node__main"
              onClick={() => {
                if (hasChildren) {
                  toggleNodeCollapse(node.id, node);
                }
              }}
            >
              <div className="tree-node__icon">
                <Building2 size={24} />
              </div>
              
              <div className="tree-node__label">
                <span className="tree-node__title">{nodeLabel}</span>
                {hasChildren && (
                  <span className="tree-node__count">
                    {visibleChildren.length} branch{visibleChildren.length !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Children - Branches in horizontal layout */}
          {shouldShowChildren && visibleChildren.length > 0 && (
            <div className="tree-node__children">
              <div className="branches-container">
{visibleChildren.map(child => {
                  // Safety check for valid child node
                  if (!child || !child.id || !child.type) {
                    console.error('Invalid child node:', child);
                    return <div key={`invalid-${Math.random()}`}>Invalid node</div>;
                  }
                  return renderFlowchartNode(child, level + 1);
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
    
    // For branch node
    if (nodeType === 'branch') {
      return (
        <div key={nodeId} id={nodeId} className={`tree-node tree-node--${nodeType} tree-node--level-${level} ${hasChildren ? 'has-children' : ''}`}>
          <div 
            className={`tree-node__content ${
              isSelected ? 'tree-node__content--selected' : ''
            } ${
              isLoadingName ? 'tree-node__content--loading' : ''
            }`}
          >
            {/* Expand/Collapse Button */}
            {hasChildren && (
              <button
                className="tree-node__toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNodeCollapse(node.id, node);
                }}
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? (
                  <ChevronRight size={16} className="tree-node__toggle-icon" />
                ) : (
                  <ChevronDown size={16} className="tree-node__toggle-icon" />
                )}
              </button>
            )}
            
            {/* Node Main Content */}
            <div 
              className="tree-node__main"
              onClick={() => {
                if (hasChildren) {
                  toggleNodeCollapse(node.id, node);
                }
              }}
            >
              <div className="tree-node__icon">
                <Users size={20} />
              </div>
              
              <div className="tree-node__label">
                <span className="tree-node__title">{nodeLabel}</span>
                {hasChildren && (
                  <span className="tree-node__count">
                    {visibleChildren.length} agent{visibleChildren.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Children - Hierarchical layout */}
          {shouldShowChildren && visibleChildren.length > 0 && (
            <div className="tree-node__children">
              {level === 1 ? (
                // For branch level, use grid layout for direct children
                <div className="producers-container">
                  {visibleChildren.map(child => {
                    // Safety check for valid child node
                    if (!child || !child.id || !child.type) {
                      console.error('Invalid child node in map:', child);
                      return <div key={`invalid-${Math.random()}`}>Invalid node</div>;
                    }
                    return renderFlowchartNode(child, level + 1);
                  })}
                </div>
              ) : (
                // For deeper levels, use vertical hierarchy
                <div className="hierarchy-children">
                  {visibleChildren.map(child => {
                    // Safety check for valid child node
                    if (!child || !child.id || !child.type) {
                      console.error('Invalid child node in map:', child);
                      return <div key={`invalid-${Math.random()}`}>Invalid node</div>;
                    }
                    return renderFlowchartNode(child, level + 1);
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    
    // For producer node
    return (
      <div key={nodeId} id={nodeId} className={`tree-node tree-node--${nodeType} tree-node--level-${level} ${hasChildren ? 'has-children' : ''}`}>
        <div 
          className={`tree-node__content ${
            isSelected ? 'tree-node__content--selected' : ''
          } ${
            isLoadingName ? 'tree-node__content--loading' : ''
          }`}
        >
          {/* Expand/Collapse Button for producers with downline */}
          {hasChildren && (
            <button
              className="tree-node__toggle"
              onClick={(e) => {
                e.stopPropagation();
                toggleNodeCollapse(node.id, node);
              }}
              aria-label={isCollapsed ? 'Expand downline' : 'Collapse downline'}
            >
              {isCollapsed ? (
                <ChevronRight size={16} className="tree-node__toggle-icon" />
              ) : (
                <ChevronDown size={16} className="tree-node__toggle-icon" />
              )}
            </button>
          )}
          
          {/* Node Main Content */}
          <div 
            className="tree-node__main"
            onClick={() => {
              if (node.meta?.producerId) {
                setState(prev => ({ ...prev, selectedProducerId: node.meta!.producerId! }));
                onSelectProducer?.(node.meta.producerId);
              } else if (hasChildren) {
                toggleNodeCollapse(node.id, node);
              }
            }}
          >
            <div className="tree-node__icon">
              <User size={16} />
            </div>
            
            <div className="tree-node__label">
              <span className="tree-node__title">{node.label}</span>
              {hasChildren && (
                <span className="tree-node__count">
                  {visibleChildren.length} downline
                </span>
              )}
              {/* Show upline info with improved visibility */}
              {node.meta?.upline && (
                <span className="tree-node__upline">
                  ↑ Reports to: {node.meta.upline}
                </span>
              )}
            </div>
            
            {/* Loading indicator for names */}
            {isLoadingName && (
              <div className="tree-node__loader">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}
            
            {/* Status badges */}
            {node.badges && (
              <div className="tree-node__badges">
                {node.badges.status && (
                  <span className={`status-badge status-badge--${node.badges.status.toLowerCase()}`}>
                    {node.badges.status}
                  </span>
                )}
                {node.badges.hasErrors && (
                  <div className="status-indicator status-indicator--error" title={node.meta?.errors || 'Has errors'}>
                    <AlertCircle size={14} />
                  </div>
                )}
                {node.badges.hasWarnings && (
                  <div className="status-indicator status-indicator--warning" title={node.meta?.warnings || 'Has warnings'}>
                    <AlertTriangle size={14} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Children - Downline agents */}
        {shouldShowChildren && visibleChildren.length > 0 && (
          <div className="tree-node__children">
            <div className="hierarchy-children">
              {visibleChildren.map(child => {
                // Safety check for valid child node
                if (!child || !child.id || !child.type) {
                  console.error('Invalid child node in downline:', child);
                  return <div key={`invalid-${Math.random()}`}>Invalid node</div>;
                }
                return renderFlowchartNode(child, level + 1);
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const stats = state.tree ? countNodes(state.tree) : { agencies: 0, branches: 0, producers: 0 };

  return (
    <div className="org-chart-container">
      <header className="org-chart-header">
        <h1>Hierarchy Management System</h1>
        
        <div className="toolbar">
          <div className="toolbar__section">
            <div className="search-bar">
              <div className="search-bar__input-wrapper">
                <Search size={16} className="search-bar__icon" />
                <input
                  type="text"
                  placeholder="Search by NPN..."
                  value={state.searchQuery}
                  onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="search-bar__input"
                />
              </div>
              <button 
                onClick={handleSearch}
                disabled={state.loading || !state.searchQuery.trim()}
                className="search-bar__button"
              >
                Search
              </button>
            </div>
          </div>

          <div className="toolbar__section">
            <button 
              onClick={handleRefresh}
              disabled={state.loading}
              className="toolbar__button toolbar__button--refresh"
              title="Refresh hierarchy data"
            >
              <RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="stats-bar">
          <div className="stats-bar__group">
            <div className="stat-item">
              <span className="stat-item__value">{stats.branches}</span>
              <span className="stat-item__label">Branches</span>
            </div>
            <div className="stat-item">
              <span className="stat-item__value">{stats.producers}</span>
              <span className="stat-item__label">Producers</span>
            </div>
          </div>
          
          <div className="stats-bar__group">
            {state.loadingProgress.isLoading && (
              <div className="progress-info">
                <div className="progress-info__bar">
                  <div 
                    className="progress-info__fill"
                    style={{
                      width: `${(state.loadingProgress.loaded / state.loadingProgress.total) * 100}%`
                    }}
                  />
                </div>
                <span className="progress-info__text">
                  Loading names... {state.loadingProgress.loaded}/{state.loadingProgress.total}
                </span>
              </div>
            )}
            <span className="last-updated">
              Last Updated: {new Date(state.lastRefresh).toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      <main className="org-chart-content">
        {state.error && (
          <div className="error-message">
            <AlertCircle size={16} />
            {state.error}
          </div>
        )}

        {state.loading && (
          <div className="loading-message">
            <RefreshCw size={16} className="spinning" />
            Loading hierarchy data...
          </div>
        )}

        {state.tree && !state.loading && (
          <div className="hierarchy-tree">
            <div className="hierarchy-tree__container">
              {renderFlowchartNode(state.tree)}
            </div>
          </div>
        )}
        
        {!state.tree && !state.loading && !state.error && (
          <div className="empty-state">
            <Building2 size={48} className="empty-state__icon" />
            <h3 className="empty-state__title">No Data Available</h3>
            <p className="empty-state__description">
              No hierarchy data found for this agency.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default OrgChart;