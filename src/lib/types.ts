export type ProducerLabel = {
  id: number;
  name: string;
  npn?: string;
  firstName?: string;
  lastName?: string;
};

export type GARelation = {
  id: number;
  gaId: number;
  producerId: number;
  branchCode?: string;
  upline?: string;
  subscribed?: string;
  unsubscriptionDate?: string;
  status?: string;
  addedOn?: string;
  errors?: string;
  errorDate?: string;
  warnings?: string;
  warningDate?: string;
  ts?: string; // YYYY-MM-DDThh:mm:ss
};

export type ChartTree = {
  id: string; // "ga:123" | "branch:ABC" | "producer:908"
  label: string;
  type: 'agency' | 'branch' | 'producer';
  badges?: { 
    status?: string; 
    hasErrors?: boolean; 
    hasWarnings?: boolean;
    licenseCompliance?: 'compliant' | 'expiring' | 'expired' | 'unknown';
    appointmentStatus?: 'active' | 'pending' | 'completed' | 'unknown';
  };
  meta?: { 
    branchCode?: string;
    producerId?: number;
    gaId?: number;
    upline?: string;
    errors?: string;
    warnings?: string;
    needsNameFetch?: boolean;
    enhancedProfile?: EnhancedProducerProfile;
    isMRFG?: boolean;
  };
  children?: ChartTree[];
};

export type OrgChartState = {
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
  mrfgAnalysis?: any;
  mrfgDashboard?: MRFGDashboardData;
  enhancedProfiles: Map<number, EnhancedProducerProfile>;
  csvReports?: {
    licenses: string;
    appointments: string;
    contracts: string;
    agents: string;
  };
  showMRFGFocus: boolean;
  complianceFilter: 'all' | 'compliant' | 'expiring' | 'expired';
};

export type OrgChartProps = {
  firmId: number;
  initialDate?: string;
  pageLimit?: number;
  fetchAuth: () => string;
  onSelectProducer?: (producerId: number) => void;
};

export type Producer = {
  id: number;
  firstName?: string;
  lastName?: string;
  npn?: string;
  email?: string;
  licenses?: any[];
  // Additional fields from API but avoid PII
};

// ENHANCED TYPES FOR MRFG MVP

export type License = {
  id: number;
  licenseNumber: string;
  state: string;
  type: string;
  status: 'active' | 'inactive' | 'expired' | 'pending';
  issuedDate?: string;
  expirationDate?: string;
  lineOfAuthority?: string[];
  residentState?: boolean;
};

export type Appointment = {
  id: number;
  carrierId: number;
  carrierName: string;
  state: string;
  status: 'active' | 'pending' | 'terminated' | 'completed';
  appointmentDate?: string;
  terminationDate?: string;
  lineOfAuthority?: string[];
  agentNumber?: string;
};

export type Contract = {
  id: number;
  carrierId: number;
  carrierName: string;
  contractNumber: string;
  effectiveDate: string;
  terminationDate?: string;
  status: 'active' | 'terminated' | 'pending';
  commissionSchedule?: any;
  contractType?: string;
};

export type Address = {
  id: number;
  type: 'home' | 'business' | 'mailing';
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  isPrimary: boolean;
};

export type ComplianceStatus = {
  licenseCompliance: 'compliant' | 'expiring' | 'expired' | 'unknown';
  appointmentStatus: 'active' | 'pending' | 'completed' | 'unknown';
  hasErrors: boolean;
  hasWarnings: boolean;
  lastReviewDate?: string;
  nextReviewDate?: string;
};

export type EnhancedProducerProfile = {
  basic: ProducerLabel;
  relationship: GARelation | null;
  appointments: Appointment[];
  licenses: License[];
  addresses: Address[];
  contracts: Contract[];
  complianceStatus: ComplianceStatus;
  lastUpdated: string;
};

export type MRFGDashboardData = {
  totalProducers: number;
  activeProducers: number;
  complianceSummary: {
    compliant: number;
    expiring: number;
    expired: number;
    unknown: number;
  };
  appointmentSummary: {
    active: number;
    pending: number;
    completed: number;
    unknown: number;
  };
  recentActivity: {
    newProducers: number;
    licenseChanges: number;
    appointmentChanges: number;
  };
  growthMetrics: {
    monthlyGrowthRate: number;
    quarterlyGrowthRate: number;
    retentionRate: number;
  };
};

// HIERARCHY UPLOAD TYPES

export type HierarchyUploadResult = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  progress?: number;
  totalRecords?: number;
  processedRecords?: number;
  errors?: string[];
  warnings?: string[];
  startTime?: string;
  endTime?: string;
  fileName?: string;
  fileSize?: number;
};

export type HierarchyUploadStatus = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  progress?: number;
  totalRecords?: number;
  processedRecords?: number;
  errors?: string[];
  warnings?: string[];
  startTime?: string;
  endTime?: string;
  fileName?: string;
  fileSize?: number;
  estimatedTimeRemaining?: number;
};

export type UploadHistoryItem = {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  progress: number;
  totalRecords?: number;
  processedRecords?: number;
  errors?: string[];
  warnings?: string[];
};

export type FileValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recordCount?: number;
  fileType?: 'excel' | 'csv';
};