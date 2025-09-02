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
  };
  meta?: { 
    branchCode?: string;
    producerId?: number;
    gaId?: number;
    upline?: string;
    errors?: string;
    warnings?: string;
    needsNameFetch?: boolean;
  };
  children?: ChartTree[];
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