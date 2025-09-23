import { createAuthToken, fetchFirmRelationsAfter } from '../lib/api';
import type { ChartTree, GARelation } from '../lib/types';

type AdminAccount = 'equita' | 'quility';

type OrgChartDebugContext = {
  state?: any;
  stats?: {
    branches: number;
    producers: number;
  };
  config?: {
    firmId?: number;
    initialDate?: string;
    pageLimit?: number;
  };
  firmIds?: {
    equita?: number;
    quility?: number;
  };
  relations?: GARelation[];
};

function countProducers(tree: ChartTree | null): number {
  if (!tree) return 0;
  const stack: ChartTree[] = [tree];
  let count = 0;
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === 'producer') {
      count += 1;
    }
    if (node.children && node.children.length > 0) {
      stack.push(...node.children);
    }
  }
  return count;
}

function summarizeRelations(relations: GARelation[], firmId: number) {
  const firmRelations = relations.filter(r => r.gaId === firmId);
  const uniqueProducers = new Set(firmRelations.map(r => r.producerId));
  const uniqueBranches = new Set(firmRelations.map(r => r.branchCode).filter(Boolean));
  return {
    firmRelations,
    uniqueProducersCount: uniqueProducers.size,
    uniqueBranchesCount: uniqueBranches.size
  };
}

export async function compareUIWithData(account?: AdminAccount) {
  if (typeof window === 'undefined') {
    console.warn('compareUIWithData can only run in the browser.');
    return null;
  }

  const debug: OrgChartDebugContext | undefined = (window as any).__orgChartDebug;
  if (!debug?.state) {
    console.warn('OrgChart debug state not available yet. Load the hierarchy first.');
    return null;
  }

  const selectedAccount: AdminAccount = account ?? debug.state?.mrfgAccount ?? 'equita';
  const config = debug.config ?? {};
  const firmIds = debug.firmIds ?? {};
  const firmId: number | undefined = selectedAccount === 'quility'
    ? (firmIds.quility ?? firmIds.equita ?? config.firmId)
    : (firmIds.equita ?? config.firmId);

  if (!firmId) {
    console.warn('Unable to determine firm ID for comparison.');
    return null;
  }

  const uiVisibleProducers = debug.stats?.producers ?? countProducers(debug.state?.tree ?? null);
  const uiBranchCount = debug.stats?.branches ?? 0;
  const mrfgFocus = debug.state?.showMRFGFocus ?? false;

  const loadedSummary = Array.isArray(debug.relations)
    ? summarizeRelations(debug.relations as GARelation[], firmId)
    : { firmRelations: [], uniqueProducersCount: 0, uniqueBranchesCount: 0 };

  const initialDate: string = config.initialDate ?? '2000-01-01T00:00:00Z';
  const pageLimit = Number(config.pageLimit ?? 1000);

  try {
    const token = createAuthToken(selectedAccount);
    const apiRelations = await fetchFirmRelationsAfter(initialDate, token, pageLimit);
    const apiSummary = summarizeRelations(apiRelations, firmId);
    const apiSample = apiSummary.firmRelations.slice(0, 5).map(r => ({
      producerId: r.producerId,
      branchCode: r.branchCode,
      status: r.status
    }));

    const result = {
      account: selectedAccount,
      firmId,
      ui: {
        producers: uiVisibleProducers,
        branches: uiBranchCount,
        showMRFGFocus: mrfgFocus
      },
      loadedData: {
        producers: loadedSummary.uniqueProducersCount,
        branches: loadedSummary.uniqueBranchesCount,
        relations: loadedSummary.firmRelations.length
      },
      apiData: {
        producers: apiSummary.uniqueProducersCount,
        branches: apiSummary.uniqueBranchesCount,
        relations: apiSummary.firmRelations.length,
        sample: apiSample
      },
      discrepancies: {
        uiVsApi: uiVisibleProducers - apiSummary.uniqueProducersCount,
        loadedVsApi: loadedSummary.uniqueProducersCount - apiSummary.uniqueProducersCount
      }
    };

    console.groupCollapsed(`[HIERARCHY TEST] ${selectedAccount.toUpperCase()} firm ${firmId}`);
    console.table([
      { source: 'UI (visible)', producers: result.ui.producers, branches: result.ui.branches, relations: 'n/a' },
      { source: 'Loaded relations (current state)', producers: result.loadedData.producers, branches: result.loadedData.branches, relations: result.loadedData.relations },
      { source: `API (${selectedAccount})`, producers: result.apiData.producers, branches: result.apiData.branches, relations: result.apiData.relations }
    ]);
    if (mrfgFocus) {
      console.warn('MRFG Focus is enabled. UI producer count reflects only the MRFG branch.');
    }
    console.log('Sample producers from API:', apiSample);
    console.log('Discrepancies', result.discrepancies);
    console.groupEnd();

    return result;
  } catch (error) {
    console.error('compareUIWithData failed:', error);
    throw error;
  }
}
