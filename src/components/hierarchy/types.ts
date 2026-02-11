import type { GHLHierarchyNode } from '../../lib/types';

export type Density = 'comfortable' | 'cozy' | 'compact';

export type PersonStatus = 'active' | 'inactive' | 'pending';

export type BranchSummary = {
  active: number;
  inactive: number;
  pending: number;
};

export type PersonMetrics = {
  descendantCount?: number;
  directReports?: number;
  lastSeen?: string | null;
};

export type PersonNode = {
  id: string;
  name: string;
  npn: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  status: PersonStatus;
  parentId: string | null;
  childrenIds: string[];
  depth: number;
  branchSummary: BranchSummary;
  metrics: PersonMetrics;
  vendorGroup?: 'equita' | 'quility' | 'combined';
  uplineSource?: GHLHierarchyNode['uplineSource'];
  duplicateGroupId?: string | null;
  duplicateGroupNpn?: string | null;
  duplicateGroupSize?: number;
  sourceNode: GHLHierarchyNode;
};

export type HierarchyGraph = {
  nodesById: Map<string, PersonNode>;
  rootIds: string[];
};
