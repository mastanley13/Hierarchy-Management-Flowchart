import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  RefreshCw, 
  AlertCircle, 
  AlertTriangle, 
  User, 
  Building2, 
  Users, 
  ChevronDown, 
  ChevronRight, 
  Loader2, 
  Download,
  Eye,
  EyeOff,
  BarChart3,
  Shield,
  Upload
} from 'lucide-react';
import './OrgChart.css';
import MRFGDashboard from './MRFGDashboard';
import ProducerDetailPanel from './ProducerDetailPanel';
import HierarchyUpload from './HierarchyUpload';
import APITestButton from './APITestButton';
import type { ChartTree, GARelation, ProducerLabel, OrgChartProps, EnhancedProducerProfile } from '../lib/types';
import { 
  fetchFirmRelationsAfter, 
  fetchProducerByNPN, 
  createAuthToken, 
  testMRFGProducerNameResolution, 
  fetchFirmDetails, 
  fetchMRFGBulkData,
  fetchEnhancedProducerProfile
} from '../lib/api';
import { relationsToChart, searchTreeByNPN, countNodes } from '../lib/transform';
import { loadProducerNamesProgressively } from '../lib/progressive-loader';
// Temporarily disable virtualization to fix import issues
// We'll implement custom virtualization if needed

// Local state type definition (using updated type from types.ts)
type OrgChartState = {
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
  firmDetails?: any;
  activeFirmId: number;
  firmIdNotice: string | null;
  enhancedProfiles: Map<number, EnhancedProducerProfile>;
  csvReports?: {
    licenses: string;
    appointments: string;
    contracts: string;
    agents: string;
  };
  showMRFGFocus: boolean;
  complianceFilter: 'all' | 'compliant' | 'expiring' | 'expired';
  showDashboard: boolean;
  bulkDataLoading: boolean;
  showUpload: boolean;
  // Selected MRFG admin account for SureLC auth
  mrfgAccount: 'equita' | 'quility';
};


// CSV Export Utility Functions
const escapeCSVField = (field: any): string => {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const generateCSVFromRelations = (relations: GARelation[], labelCache: Map<number, ProducerLabel>): string => {
  const headers = [
    'Producer ID',
    'Producer Name',
    'NPN',
    'Branch Code',
    'Upline ID',
    'Upline Name',
    'Status',
    'Subscribed',
    'Added On',
    'Unsubscription Date',
    'Errors',
    'Error Date',
    'Warnings',
    'Warning Date',
    'Last Updated'
  ];

  const rows = relations.map(relation => {
    const producerLabel = labelCache.get(relation.producerId);
    const uplineLabel = relation.upline ? labelCache.get(parseInt(relation.upline)) : null;
    
    return [
      relation.producerId,
      producerLabel?.name || `Producer ${relation.producerId}`,
      producerLabel?.npn || '',
      relation.branchCode || '',
      relation.upline || '',
      uplineLabel?.name || '',
      relation.status || '',
      relation.subscribed || '',
      relation.addedOn || '',
      relation.unsubscriptionDate || '',
      relation.errors || '',
      relation.errorDate || '',
      relation.warnings || '',
      relation.warningDate || '',
      relation.ts || ''
    ].map(escapeCSVField);
  });

  return [headers.map(escapeCSVField), ...rows].map(row => row.join(',')).join('\n');
};

const downloadCSV = (csvContent: string, filename: string) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Utility function to enhance tree nodes with profile data
const addEnhancedProfilesToTree = (
  tree: ChartTree, 
  profiles: Map<number, EnhancedProducerProfile>
): ChartTree => {
  const enhanced: ChartTree = { ...tree };
  
  if (tree.type === 'producer' && tree.meta?.producerId) {
    const profile = profiles.get(tree.meta.producerId);
    if (profile) {
      enhanced.meta = {
        ...tree.meta,
        enhancedProfile: profile,
        isMRFG: tree.meta.branchCode === 'Major Revolution Financial Group'
      };
      enhanced.badges = {
        ...tree.badges,
        licenseCompliance: profile.complianceStatus.licenseCompliance,
        appointmentStatus: profile.complianceStatus.appointmentStatus
      };
    }
  }
  
  if (tree.children) {
    enhanced.children = tree.children.map(child => addEnhancedProfilesToTree(child, profiles));
  }
  
  return enhanced;
};

const OrgChart: React.FC<OrgChartProps> = ({
  firmId,
  initialDate = '2000-01-01T00:00:00Z',
  pageLimit = 10000, // Increased limit to fetch more producers
  fetchAuth,
  onOpenDebugPanel
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
    expandedFromSearch: new Set(),
    enhancedProfiles: new Map(),
    showMRFGFocus: true,
    complianceFilter: 'all',
    showDashboard: false,
    bulkDataLoading: false,
    showUpload: false,
    mrfgAccount: 'equita',
    activeFirmId: firmId,
    firmIdNotice: null
  });

  const parseFirmId = (value?: string) => {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const equitaDefaultFirmId = parseFirmId(import.meta.env.VITE_FIRM_ID_EQUITA)
    ?? parseFirmId(import.meta.env.VITE_FIRM_ID)
    ?? firmId;

  const quilityDefaultFirmId = parseFirmId(import.meta.env.VITE_FIRM_ID_QUILITY)
    ?? equitaDefaultFirmId
    ?? firmId;

  const accountFirmIdRef = useRef<{ equita: number; quility: number }>({
    equita: equitaDefaultFirmId ?? firmId,
    quility: quilityDefaultFirmId,
  });

  const labelCacheRef = useRef(new Map<number, ProducerLabel>());
  const relationsRef = useRef<GARelation[]>([]);
  const isLoadingRef = useRef(false);

  // CSV Export Handler
  const handleCSVExport = useCallback(() => {
    if (!relationsRef.current || relationsRef.current.length === 0) {
      alert('No data available to export. Please refresh the hierarchy first.');
      return;
    }

    try {
      const csvContent = generateCSVFromRelations(relationsRef.current, labelCacheRef.current);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const activeFirmId = state.activeFirmId || firmId;
      const filename = `hierarchy-export-firm-${activeFirmId}-${timestamp}.csv`;
      
      downloadCSV(csvContent, filename);
      
      console.log(`Exported ${relationsRef.current.length} records to ${filename}`);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Error exporting CSV. Please try again.');
    }
  }, [firmId, state.activeFirmId]);

  // Removed virtualization constants as we're not using react-window anymore

  // We no longer need this since we're using on-demand loading
  // const lastNameUpdateRef = useRef(0);

  const loadHierarchyData = useCallback(async (fromDate?: string, accountOverride?: 'equita' | 'quility') => {
    const dateToUse = fromDate || initialDate;
    const accountToUse = accountOverride ?? state.mrfgAccount;
    
    // Prevent duplicate API calls
    if (isLoadingRef.current) {
      console.log('Already loading, skipping duplicate call');
      return;
    }
    
    isLoadingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null, firmIdNotice: null }));

    try {
      const token = createAuthToken(accountToUse);
      const preferredFirmId = accountFirmIdRef.current[accountToUse] ?? (accountToUse === 'quility' ? quilityDefaultFirmId : firmId);
      console.log(`Loading hierarchy data from ${dateToUse} for firm ${preferredFirmId} using ${accountToUse} credentials`);
      
      // Use the general endpoint that was working
      const relations = await fetchFirmRelationsAfter(dateToUse, token, pageLimit);
      console.log(`Fetched ${relations.length} total relations`);
      
      // Log the unique gaId values to see what firms are actually in the data
      const uniqueGaIds = [...new Set(relations.map(r => r.gaId))];
      console.log('Available firm IDs (gaIds) in the data:', uniqueGaIds);
      console.log('Looking for firm ID:', preferredFirmId);
      
      if (relations.length === 0) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: `No hierarchy data found. Please check your credentials and firm ID.`,
          firmIdNotice: null
        }));
        return;
      }

      // Filter relations for our specific firm
      let firmRelations = relations.filter(r => r.gaId === preferredFirmId);
      let actualFirmId = preferredFirmId;
      let firmIdMessage: string | null = null;
      
      // If no relations found for the specified firm ID, show available options
      if (firmRelations.length === 0) {
        console.log(`No relations found for firm ${preferredFirmId}`);
        console.log('Available firms:', uniqueGaIds);
        
        // For now, let's use the first available firm to show the user what's available
        if (uniqueGaIds.length > 0) {
          const fallbackFirmId = uniqueGaIds.find(id => typeof id === 'number' && !Number.isNaN(id));

          if (fallbackFirmId === undefined) {
            console.warn('No numeric firm IDs available in the dataset.');
          } else {
            console.log(`Using first available firm: ${fallbackFirmId} to show available data`);
            actualFirmId = fallbackFirmId;
            firmRelations = relations.filter(r => r.gaId === actualFirmId);

            // Show a warning that we're using a different firm
            firmIdMessage = `Firm ${preferredFirmId} not found. Showing data for firm ${actualFirmId} instead. Available firms: ${uniqueGaIds.join(', ')}`;
          }
        } else {
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            error: `No hierarchy data found for firm ${preferredFirmId}. No firms available in the data.`,
            firmIdNotice: null
          }));
          return;
        }
      }
      
      if (firmRelations.length === 0) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: `No hierarchy data found for available firms. Detected firms: ${uniqueGaIds.join(', ') || 'none'}.`,
          firmIdNotice: null
        }));
        return;
      }

      console.log(`Filtered ${firmRelations.length} relations for firm ${actualFirmId}`);
      
      // MRFG Branch Detection (for UI-only filtering & diagnostics)
      const mrfgBranch = 'Major Revolution Financial Group';
      const mrfgProducers = firmRelations.filter(r => (r.branchCode || '').trim() === mrfgBranch);
      console.log(`MRFG branch detection:`);
      console.log(`- Total relations for firm ${actualFirmId}: ${firmRelations.length}`);
      console.log(`- MRFG producers found: ${mrfgProducers.length}`);
      console.log(`- MRFG producer IDs:`, mrfgProducers.map(r => r.producerId));
      
      // Get distinct branch codes for this firm (diagnostic only)
      const distinctBranches = [...new Set(firmRelations.map(r => r.branchCode).filter(Boolean))];
      console.log(`- Available branches in firm ${actualFirmId}:`, distinctBranches);
      
      // Always use ALL firm relations to build the tree. MRFG focus is applied in shouldShowNode.
      const relationsToUse = firmRelations;
      console.log(`Building tree with ALL relations: ${relationsToUse.length}`);
      console.log('Sample relations:', relationsToUse.slice(0, 3));
      relationsRef.current = relationsToUse;
      
      // Fetch firm details for proper name display
      console.log(`Fetching firm details for firm ${actualFirmId}...`);
      const firmDetails = await fetchFirmDetails(actualFirmId, token);
      
      if (firmDetails) {
        console.log(`✅ Firm details successfully retrieved:`, firmDetails);
      } else {
        console.log(`⚠️ Firm details not available - will use fallback logic`);
      }
      
      // Test MRFG producer name resolution if we found MRFG producers
      if (mrfgProducers.length > 0) {
        const testProducerId = 10385522; // AHI ENTERPRISE from verification results
        console.log(`Testing name resolution for known MRFG producer ${testProducerId}...`);
        testMRFGProducerNameResolution(testProducerId, token).catch(error => {
          console.warn('MRFG producer test failed:', error);
        });
      }
      
      // Note: CSV analysis functionality moved to MRFG Dashboard
      console.log('MRFG data analysis now handled by Dashboard component');

      const tree = relationsToChart(
        actualFirmId,
        relationsToUse,
        labelCacheRef.current,
        firmDetails
      );
      
      console.log('Generated tree:', tree);

      const maxTs = relationsToUse.reduce((max, r) => 
        r.ts && r.ts > max ? r.ts : max, 
        dateToUse
      );
      
      // Ensure the timestamp has proper timezone format
      const formattedMaxTs = maxTs.includes('Z') || maxTs.includes('+') || maxTs.includes('-') 
        ? maxTs 
        : maxTs + 'Z';

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
        lastRefresh: formattedMaxTs,
        error: null,
        collapsedNodes: initialCollapsedNodes,
        firmDetails: firmDetails,
        activeFirmId: actualFirmId,
        firmIdNotice: firmIdMessage
      }));

      accountFirmIdRef.current[accountToUse] = actualFirmId;

      // Enhanced MRFG Data Loading
      if (mrfgProducers.length > 0) {
        console.log(`🚀 Starting enhanced MRFG data loading for ${mrfgProducers.length} producers...`);
        
        setState(prev => ({ ...prev, bulkDataLoading: true }));
        
        try {
          const mrfgProducerIds = mrfgProducers.map(r => r.producerId);
          const bulkData = await fetchMRFGBulkData(mrfgProducerIds, token);
          
          console.log(`✅ MRFG bulk data loaded:`, {
            profiles: bulkData.profiles.size,
            csvReports: Object.keys(bulkData.csvReports).length
          });

          setState(prev => ({
            ...prev,
            enhancedProfiles: bulkData.profiles,
            csvReports: bulkData.csvReports,
            bulkDataLoading: false
          }));

          // Update tree with enhanced profile data
          if (tree) {
            const enhancedTree = addEnhancedProfilesToTree(tree, bulkData.profiles);
            setState(prev => ({ ...prev, tree: enhancedTree }));
          }

        } catch (error) {
          console.error('Failed to load MRFG bulk data:', error);
          setState(prev => ({ ...prev, bulkDataLoading: false }));
        }
      }
      
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
            6, // modestly increased concurrency
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
        error: error instanceof Error ? error.message : 'Failed to load hierarchy data',
        firmIdNotice: null
      }));
    } finally {
      isLoadingRef.current = false;
    }
  }, [firmId, pageLimit, state.mrfgAccount]); // include account so token updates

  // Upload handlers
  const handleUploadStart = useCallback(() => {
    console.log('📤 Upload started');
    setState(prev => ({ ...prev, loading: true }));
  }, []);

  const handleUploadComplete = useCallback((status: any) => {
    console.log('✅ Upload completed:', status);
    setState(prev => ({ ...prev, loading: false }));
    
    if (status.status === 'completed') {
      // Refresh the hierarchy data after successful upload
      setTimeout(() => {
        loadHierarchyData(state.lastRefresh, state.mrfgAccount);
      }, 1000);
    }
  }, [state.lastRefresh, loadHierarchyData, state.mrfgAccount]);

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
            const token = createAuthToken(state.mrfgAccount);
            
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
                6, // modestly increased concurrency
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
  }, [state.tree, state.collapsedNodes, state.mrfgAccount]);

  const handleRefresh = useCallback(async () => {
    await loadHierarchyData(state.lastRefresh, state.mrfgAccount);
  }, [loadHierarchyData, state.lastRefresh, state.mrfgAccount]);

  const handleSearch = useCallback(async () => {
    if (!state.searchQuery.trim()) return;

    setState(prev => ({ ...prev, loading: true, error: null, firmIdNotice: null }));

    try {
      const token = createAuthToken(state.mrfgAccount);
      const producer = await fetchProducerByNPN(state.searchQuery.trim(), token);
      
      if (!producer) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: `No producer found with NPN: ${state.searchQuery}`,
          firmIdNotice: null 
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
  }, [state.searchQuery, state.tree, state.mrfgAccount]);

  // New handlers for enhanced functionality
  const handleToggleDashboard = useCallback(async () => {
    const newShowDashboard = !state.showDashboard;
    setState(prev => ({ ...prev, showDashboard: newShowDashboard }));
    
    // If opening dashboard and we have no enhanced profiles, try to load MRFG data
    if (newShowDashboard && state.enhancedProfiles.size === 0 && state.tree && !state.bulkDataLoading) {
      console.log('📊 Dashboard opened with no enhanced profiles. Loading MRFG bulk data...');
      
      // Find MRFG producers in the current tree
      const findMRFGProducers = (node: ChartTree): ChartTree[] => {
        const mrfgNodes: ChartTree[] = [];
        
        if (node.type === 'producer' && node.meta?.branchCode === 'Major Revolution Financial Group') {
          mrfgNodes.push(node);
        }
        
        if (node.children) {
          for (const child of node.children) {
            mrfgNodes.push(...findMRFGProducers(child));
          }
        }
        
        return mrfgNodes;
      };
      
      const mrfgProducers = findMRFGProducers(state.tree);
      
      if (mrfgProducers.length > 0) {
        setState(prev => ({ ...prev, bulkDataLoading: true }));
        
        try {
          const token = createAuthToken(state.mrfgAccount);
          const mrfgProducerIds = mrfgProducers
            .map(p => p.meta?.producerId)
            .filter((id): id is number => typeof id === 'number');
          const bulkData = await fetchMRFGBulkData(mrfgProducerIds, token);
          
          console.log(`✅ Dashboard-triggered MRFG bulk data loaded:`, {
            profiles: bulkData.profiles.size,
            csvReports: Object.keys(bulkData.csvReports).length
          });

          setState(prev => ({
            ...prev,
            enhancedProfiles: bulkData.profiles,
            csvReports: bulkData.csvReports,
            bulkDataLoading: false
          }));

          // Update tree with enhanced profile data
          const enhancedTree = addEnhancedProfilesToTree(state.tree!, bulkData.profiles);
          setState(prev => ({ ...prev, tree: enhancedTree }));

        } catch (error) {
          console.error('Failed to load MRFG bulk data for dashboard:', error);
          setState(prev => ({ ...prev, bulkDataLoading: false }));
        }
      } else {
        console.log('No MRFG producers found in current tree');
      }
    }
  }, [state.showDashboard, state.enhancedProfiles.size, state.tree, state.bulkDataLoading, state.mrfgAccount]);

  const handleToggleMRFGFocus = useCallback(() => {
    setState(prev => ({ ...prev, showMRFGFocus: !prev.showMRFGFocus }));
  }, []);

  const handleComplianceFilterChange = useCallback((filter: 'all' | 'compliant' | 'expiring' | 'expired') => {
    setState(prev => ({ ...prev, complianceFilter: filter }));
  }, []);

  const handleProducerDetailSelect = useCallback(async (producerId: number) => {
    // Check if we already have enhanced profile
    if (state.enhancedProfiles.has(producerId)) {
      setState(prev => ({ ...prev, selectedProducerId: producerId }));
      return;
    }

    // Fetch enhanced profile on-demand
    setState(prev => ({ ...prev, loading: true }));
    try {
      const token = createAuthToken(state.mrfgAccount);
      const profile = await fetchEnhancedProducerProfile(producerId, token);
      
      setState(prev => ({
        ...prev,
        enhancedProfiles: new Map(prev.enhancedProfiles).set(producerId, profile),
        selectedProducerId: producerId,
        loading: false
      }));
    } catch (error) {
      console.error('Failed to fetch enhanced profile:', error);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [state.enhancedProfiles, state.mrfgAccount]);

  const handleRefreshProducer = useCallback(async (producerId: number) => {
    setState(prev => ({ ...prev, bulkDataLoading: true }));
    try {
      const token = createAuthToken(state.mrfgAccount);
      const profile = await fetchEnhancedProducerProfile(producerId, token);
      
      setState(prev => ({
        ...prev,
        enhancedProfiles: new Map(prev.enhancedProfiles).set(producerId, profile),
        bulkDataLoading: false
      }));
      
      console.log(`✅ Refreshed profile for producer ${producerId}`);
    } catch (error) {
      console.error('Failed to refresh producer profile:', error);
      setState(prev => ({ ...prev, bulkDataLoading: false }));
    }
  }, [state.mrfgAccount]);

  // Filter function for nodes
  const shouldShowNode = useCallback((node: ChartTree): boolean => {
    // Safety check for valid node
    if (!node || !node.type) {
      return false;
    }
    
    // Always show agency nodes
    if (node.type === 'agency') return true;
    
    // MRFG Focus filter - only show MRFG branch if enabled
    if (node.type === 'branch' && state.showMRFGFocus) {
      return node.meta?.branchCode === 'Major Revolution Financial Group';
    }
    
    // Show all branches if MRFG focus is disabled
    if (node.type === 'branch') return true;
    
    // Apply filters to producer nodes
    if (node.type === 'producer') {
      // MRFG Focus filter
      if (state.showMRFGFocus && node.meta?.branchCode !== 'Major Revolution Financial Group') {
        return false;
      }
      
      // Status filter
      if (state.filterStatus !== 'all') {
        const nodeStatus = node.badges?.status?.toLowerCase();
        if (state.filterStatus === 'active' && nodeStatus !== 'active') return false;
        if (state.filterStatus === 'archived' && nodeStatus !== 'archived') return false;
      }
      
      // Compliance filter
      if (state.complianceFilter !== 'all') {
        const complianceStatus = node.badges?.licenseCompliance;
        if (state.complianceFilter !== complianceStatus) return false;
      }
      
      // Errors filter
      if (state.showErrorsOnly) {
        if (!node.badges?.hasErrors && !node.badges?.hasWarnings) return false;
      }
    }
    
    return true;
  }, [state.filterStatus, state.showErrorsOnly, state.showMRFGFocus, state.complianceFilter]);

  // Removed unused function: countFilteredNodes

  // Load data for the active admin account
  useEffect(() => {
    // Ensure the hierarchy reloads when the active admin account changes
    loadHierarchyData(undefined, state.mrfgAccount);
  }, [loadHierarchyData, state.mrfgAccount]);

  const renderFlowchartNode = useCallback((node: ChartTree, level: number = 0): React.ReactElement => {
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
      
      // Then check if it should be shown (respect focus/filter for all node types)
      return shouldShowNode(child);
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
                handleProducerDetailSelect(node.meta.producerId);
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
                {node.meta?.isMRFG && (
                  <span className="mrfg-badge" title="Major Revolution Financial Group Producer">
                    MRFG
                  </span>
                )}
                {node.badges.licenseCompliance && node.badges.licenseCompliance !== 'unknown' && (
                  <div 
                    className={`compliance-indicator compliance-indicator--${node.badges.licenseCompliance}`} 
                    title={`License: ${node.badges.licenseCompliance}`}
                  >
                    <Shield size={12} />
                  </div>
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
  }, [
    shouldShowNode,
    state.selectedProducerId,
    state.collapsedNodes,
    state.showMRFGFocus,
    state.filterStatus,
    state.showErrorsOnly,
    state.complianceFilter,
    toggleNodeCollapse,
    handleProducerDetailSelect
  ]);

  // Compute stats; if MRFG focus is ON, count only the MRFG subtree
  const stats = (() => {
    if (!state.tree) return { agencies: 0, branches: 0, producers: 0 };
    if (!state.showMRFGFocus) return countNodes(state.tree);
    const findMRFGBranch = (node: ChartTree): ChartTree | null => {
      if (node.type === 'branch' && node.meta?.branchCode === 'Major Revolution Financial Group') return node;
      if (node.children) {
        for (const child of node.children) {
          const found = findMRFGBranch(child);
          if (found) return found;
        }
      }
      return null;
    };
    const mrfg = findMRFGBranch(state.tree);
    return mrfg ? countNodes(mrfg) : countNodes(state.tree);
  })();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__orgChartDebug = {
        state,
        stats,
        config: {
          firmId,
          initialDate,
          pageLimit
        },
        firmIds: accountFirmIdRef.current,
        relations: relationsRef.current
      };
    }
  }, [state, stats, firmId, initialDate, pageLimit]);

  return (
    <div className="org-chart-container">
      <header className="org-chart-header">
        {/* Compact Top Bar */}
        <div className="compact-header">
          <div className="compact-header__left">
            <h1 className="compact-header__title">Hierarchy Management System</h1>
            <span className="compact-header__firm">Major Revolution Financial Group</span>
          </div>
          
          <div className="compact-header__center">
            <div className="search-container">
              <Search size={16} className="search-icon" />
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
                Search
              </button>
            </div>
          </div>
          
          <div className="compact-header__right">
            <div className="account-selector">
              <button
                onClick={() => {
                  if (state.mrfgAccount !== 'equita') {
                    setState(prev => ({ ...prev, mrfgAccount: 'equita', firmIdNotice: null }));
                  }
                }}
                className={`account-button ${state.mrfgAccount === 'equita' ? 'account-button--active' : ''}`}
                title="Equita (Primary)"
              >
                Equita
              </button>
              <button
                onClick={() => {
                  if (state.mrfgAccount !== 'quility') {
                    setState(prev => ({ ...prev, mrfgAccount: 'quility', firmIdNotice: null }));
                  }
                }}
                className={`account-button ${state.mrfgAccount === 'quility' ? 'account-button--active' : ''}`}
                title="Quility (Secondary)"
              >
                Quility
              </button>
            </div>
            
            <div className="header-actions">
              <button 
                onClick={handleRefresh}
                disabled={state.loading}
                className="header-action-button"
                title="Refresh"
              >
                <RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} />
              </button>
              
              <APITestButton onOpenDebugPanel={onOpenDebugPanel} />
            </div>
          </div>
        </div>

        {/* Quick Action Cards */}
        <div className="quick-actions">
          <div className="quick-actions__stats">
            <div className="quick-stat-card">
              <Building2 size={20} />
              <div className="quick-stat-content">
                <span className="quick-stat-value">{stats.branches}</span>
                <span className="quick-stat-label">Branches</span>
              </div>
            </div>
            
            <div className="quick-stat-card">
              <Users size={20} />
              <div className="quick-stat-content">
                <span className="quick-stat-value">{stats.producers}</span>
                <span className="quick-stat-label">Producers</span>
              </div>
            </div>
            
            <div className="quick-stat-card">
              <Shield size={20} />
              <div className="quick-stat-content">
                <span 
                  className="quick-stat-value" 
                  style={{color: state.enhancedProfiles.size > 0 ? '#22c55e' : '#6b7280'}}
                >
                  {state.enhancedProfiles.size}
                </span>
                <span className="quick-stat-label">Enhanced</span>
              </div>
            </div>
          </div>
          
          <div className="quick-actions__controls">
            <button 
              onClick={async () => {
                if (state.tree && !state.bulkDataLoading) {
                  console.log('📊 Manual MRFG data load triggered');
                  
                  const findMRFGProducers = (node: ChartTree): ChartTree[] => {
                    const mrfgNodes: ChartTree[] = [];
                    
                    if (node.type === 'producer' && node.meta?.branchCode === 'Major Revolution Financial Group') {
                      mrfgNodes.push(node);
                    }
                    
                    if (node.children) {
                      for (const child of node.children) {
                        mrfgNodes.push(...findMRFGProducers(child));
                      }
                    }
                    
                    return mrfgNodes;
                  };
                  
                  const mrfgProducers = findMRFGProducers(state.tree);
                  console.log(`Found ${mrfgProducers.length} MRFG producers to load`);
                  
                  if (mrfgProducers.length > 0) {
                    setState(prev => ({ ...prev, bulkDataLoading: true }));
                    
                    try {
                      const token = createAuthToken(state.mrfgAccount);
                      const mrfgProducerIds = mrfgProducers
                        .map(p => p.meta?.producerId)
                        .filter((id): id is number => typeof id === 'number');
                      const bulkData = await fetchMRFGBulkData(mrfgProducerIds, token);
                      
                      console.log(`✅ Manual MRFG bulk data loaded:`, {
                        profiles: bulkData.profiles.size,
                        csvReports: Object.keys(bulkData.csvReports).length
                      });

                      setState(prev => ({
                        ...prev,
                        enhancedProfiles: bulkData.profiles,
                        csvReports: bulkData.csvReports,
                        bulkDataLoading: false
                      }));

                      const enhancedTree = addEnhancedProfilesToTree(state.tree!, bulkData.profiles);
                      setState(prev => ({ ...prev, tree: enhancedTree }));

                    } catch (error) {
                      console.error('Failed to load MRFG bulk data manually:', error);
                      setState(prev => ({ ...prev, bulkDataLoading: false }));
                    }
                  }
                }
              }}
              disabled={state.bulkDataLoading || !state.tree}
              className="quick-action-button"
              title="Load MRFG Data"
            >
              <Users size={18} />
              <span>Load Data</span>
            </button>
            
            <button 
              onClick={() => setState(prev => ({ ...prev, showUpload: !prev.showUpload }))}
              className={`quick-action-button ${state.showUpload ? 'quick-action-button--active' : ''}`}
              title="Upload Data"
            >
              <Upload size={18} />
              <span>Upload</span>
            </button>
            
            <button 
              onClick={handleCSVExport}
              disabled={state.loading || !relationsRef.current || relationsRef.current.length === 0}
              className="quick-action-button"
              title="Export CSV"
            >
              <Download size={18} />
              <span>Export</span>
            </button>
            
            <button 
              onClick={handleToggleDashboard}
              className={`quick-action-button ${state.showDashboard ? 'quick-action-button--active' : ''}`}
              title="Dashboard"
            >
              <BarChart3 size={18} />
              <span>Dashboard</span>
            </button>
            
            <button 
              onClick={handleToggleMRFGFocus}
              className={`quick-action-button ${state.showMRFGFocus ? 'quick-action-button--active' : ''}`}
              title="MRFG Focus"
            >
              {state.showMRFGFocus ? <Eye size={18} /> : <EyeOff size={18} />}
              <span>MRFG</span>
            </button>
            
            <div className="filter-dropdown">
              <select 
                value={state.complianceFilter}
                onChange={(e) => handleComplianceFilterChange(e.target.value as any)}
                className="filter-select"
                title="Filter by compliance status"
              >
                <option value="all">All Compliance</option>
                <option value="compliant">Compliant</option>
                <option value="expiring">Expiring Soon</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>
          
          <div className="quick-actions__status">
            {state.loadingProgress.isLoading && (
              <div className="loading-progress">
                <span className="loading-text">
                  Loading... {state.loadingProgress.loaded}/{state.loadingProgress.total}
                </span>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{
                      width: `${(state.loadingProgress.loaded / state.loadingProgress.total) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
            
            <div className="last-updated">
              <span className="last-updated-label">Updated:</span>
              <span className="last-updated-value">
                {new Date(state.lastRefresh).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        
      </header>

      <main className="org-chart-content">
        {/* MRFG Dashboard */}
        {state.showDashboard && (
          <MRFGDashboard 
            enhancedProfiles={state.enhancedProfiles}
            onProducerSelect={handleProducerDetailSelect}
          />
        )}

        {/* Hierarchy Upload */}
        {state.showUpload && (
          <HierarchyUpload 
            onUploadStart={handleUploadStart}
            onUploadComplete={handleUploadComplete}
          />
        )}

        {state.error && (
          <div className="error-message">
            <AlertCircle size={16} />
            {state.error}
          </div>
        )}

        {!state.error && state.firmIdNotice && (
          <div className="warning-message">
            <AlertTriangle size={16} />
            {state.firmIdNotice}
          </div>
        )}

        {state.loading && (
          <div className="loading-message">
            <div className="loading-spinner-container">
              <RefreshCw size={24} className="animate-spin" />
            </div>
            <div className="loading-text">
              Loading hierarchy data...
            </div>
          </div>
        )}

        {state.tree && !state.loading && (() => {
          // When MRFG Focus is ON, render the MRFG branch as the root
          if (state.showMRFGFocus) {
            const findMRFGBranch = (node: ChartTree): ChartTree | null => {
              if (!node) return null;
              if (node.type === 'branch' && node.meta?.branchCode === 'Major Revolution Financial Group') {
                return node;
              }
              if (node.children) {
                for (const child of node.children) {
                  const found = findMRFGBranch(child);
                  if (found) return found;
                }
              }
              return null;
            };
            const mrfgRoot = findMRFGBranch(state.tree);
            return (
              <div className="hierarchy-tree">
                <div className="hierarchy-tree__container">
                  {renderFlowchartNode(mrfgRoot || state.tree)}
                </div>
              </div>
            );
          }
          // Default: render full firm tree
          return (
            <div className="hierarchy-tree">
              <div className="hierarchy-tree__container">
                {renderFlowchartNode(state.tree)}
              </div>
            </div>
          );
        })()}
        
        {!state.tree && !state.loading && !state.error && (
          <div className="empty-state">
            <Building2 size={48} className="empty-state__icon" />
            <h3 className="empty-state__title">No Data Available</h3>
            <p className="empty-state__description">
              No hierarchy data found for this agency.
            </p>
          </div>
        )}

        {/* Producer Detail Panel */}
        <ProducerDetailPanel
          profile={state.selectedProducerId ? state.enhancedProfiles.get(state.selectedProducerId) || null : null}
          isOpen={!!state.selectedProducerId}
          onClose={() => setState(prev => ({ ...prev, selectedProducerId: null }))}
          onRefresh={handleRefreshProducer}
          fetchAuth={fetchAuth}
        />
      </main>
    </div>
  );
};

export default OrgChart;
