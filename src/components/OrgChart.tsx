import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, AlertCircle, AlertTriangle, User, Building2, Users } from 'lucide-react';
import './OrgChart.css';
import type { ChartTree, GARelation, ProducerLabel, OrgChartProps } from '../lib/types';
import { fetchFirmRelationsAfter, fetchProducerByNPN, createAuthToken } from '../lib/api';
import { relationsToChart, searchTreeByNPN, countNodes } from '../lib/transform';

interface OrgChartState {
  tree: ChartTree | null;
  loading: boolean;
  error: string | null;
  lastRefresh: string;
  searchQuery: string;
  selectedProducerId: number | null;
}

const OrgChart: React.FC<OrgChartProps> = ({
  firmId,
  initialDate = '2000-01-01T00:00:00Z',
  pageLimit = 500,
  onSelectProducer
}) => {
  const [state, setState] = useState<OrgChartState>({
    tree: null,
    loading: false,
    error: null,
    lastRefresh: initialDate,
    searchQuery: '',
    selectedProducerId: null
  });

  const labelCacheRef = useRef(new Map<number, ProducerLabel>());
  const relationsRef = useRef<GARelation[]>([]);

  const loadHierarchyData = useCallback(async (fromDate: string = initialDate) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const token = createAuthToken();
      console.log(`Loading hierarchy data from ${fromDate}`);
      
      const relations = await fetchFirmRelationsAfter(fromDate, token, pageLimit);
      console.log(`Fetched ${relations.length} relations`);
      
      // Log the unique gaId values to see what firms are actually in the data
      const uniqueGaIds = [...new Set(relations.map(r => r.gaId))];
      console.log('Available firm IDs (gaIds) in the data:', uniqueGaIds);
      console.log('Looking for firm ID:', firmId);
      
      if (relations.length === 0) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: `No hierarchy data found for firm ${firmId} after ${fromDate}`
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

      const tree = await relationsToChart(
        actualFirmId,
        firmRelations,
        labelCacheRef.current,
        token
      );
      
      console.log('Generated tree:', tree);

      const maxTs = relations.reduce((max, r) => 
        r.ts && r.ts > max ? r.ts : max, 
        fromDate
      );

      setState(prev => ({
        ...prev,
        tree,
        loading: false,
        lastRefresh: maxTs,
        error: null
      }));

    } catch (error) {
      console.error('Error loading hierarchy data:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load hierarchy data'
      }));
    }
  }, [firmId, initialDate, pageLimit]);

  const handleRefresh = useCallback(async () => {
    await loadHierarchyData(state.lastRefresh);
  }, [loadHierarchyData, state.lastRefresh]);

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
          setState(prev => ({ 
            ...prev, 
            selectedProducerId: producer.id,
            loading: false 
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

  useEffect(() => {
    loadHierarchyData();
  }, [loadHierarchyData]);

  const renderNode = (node: ChartTree, level: number = 0): React.ReactElement => {
    const isSelected = node.meta?.producerId === state.selectedProducerId;
    
    return (
      <div key={node.id} className={`org-node level-${level} ${node.type}`}>
        <div 
          className={`node-content ${isSelected ? 'selected' : ''}`}
          onClick={() => {
            if (node.type === 'producer' && node.meta?.producerId) {
              setState(prev => ({ ...prev, selectedProducerId: node.meta!.producerId! }));
              onSelectProducer?.(node.meta.producerId);
            }
          }}
        >
          <div className="node-icon">
            {node.type === 'agency' && <Building2 size={20} />}
            {node.type === 'branch' && <Users size={18} />}
            {node.type === 'producer' && <User size={16} />}
          </div>
          
          <div className="node-label">{node.label}</div>
          
          {node.badges && (
            <div className="node-badges">
              {node.badges.status && (
                <span className={`status-badge ${node.badges.status.toLowerCase()}`}>
                  {node.badges.status}
                </span>
              )}
              {node.badges.hasErrors && (
                <AlertCircle 
                  size={16} 
                  className="error-badge" 
                  title={node.meta?.errors || 'Has errors'} 
                />
              )}
              {node.badges.hasWarnings && (
                <AlertTriangle 
                  size={16} 
                  className="warning-badge" 
                  title={node.meta?.warnings || 'Has warnings'} 
                />
              )}
            </div>
          )}
        </div>
        
        {node.children && node.children.length > 0 && (
          <div className="node-children">
            {node.children.map(child => renderNode(child, level + 1))}
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
        
        <div className="controls">
          <div className="search-section">
            <input
              type="text"
              placeholder="Search by NPN..."
              value={state.searchQuery}
              onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="search-input"
            />
            <button 
              onClick={handleSearch}
              disabled={state.loading || !state.searchQuery.trim()}
              className="search-button"
            >
              <Search size={16} />
            </button>
          </div>

          <button 
            onClick={handleRefresh}
            disabled={state.loading}
            className="refresh-button"
            title="Refresh hierarchy data"
          >
            <RefreshCw size={16} className={state.loading ? 'spinning' : ''} />
            Refresh
          </button>
        </div>

        <div className="stats">
          <span>Branches: {stats.branches}</span>
          <span>Producers: {stats.producers}</span>
          <span>Last Updated: {new Date(state.lastRefresh).toLocaleString()}</span>
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
          <div className="org-tree">
            {renderNode(state.tree)}
          </div>
        )}
      </main>
    </div>
  );
};

export default OrgChart;