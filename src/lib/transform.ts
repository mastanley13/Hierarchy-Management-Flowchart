import type { GARelation, ChartTree, ProducerLabel } from './types';
import { fetchProducerLabel } from './api';

export async function relationsToChart(
  firmId: number,
  relations: GARelation[],
  labelCache: Map<number, ProducerLabel>,
  token: string
): Promise<ChartTree> {
  // Group relations by branch code
  const byBranch = new Map<string, GARelation[]>();
  
  console.log(`Processing ${relations.length} relations for firm ${firmId}`);
  
  for (const relation of relations) {
    if (relation.gaId !== firmId) continue; // Only include relations for our firm
    
    const branchKey = relation.branchCode?.trim() || 'Unassigned';
    if (!byBranch.has(branchKey)) {
      byBranch.set(branchKey, []);
    }
    byBranch.get(branchKey)!.push(relation);
  }
  
  console.log(`Grouped into ${byBranch.size} branches:`, Array.from(byBranch.keys()));

  // Create producer nodes WITHOUT fetching individual names (fast loading)
  function createProducerNodes(relations: GARelation[]): ChartTree[] {
    const producerNodes: ChartTree[] = [];
    
    for (const relation of relations) {
      // Use cached label if available, otherwise use placeholder
      const cachedLabel = labelCache.get(relation.producerId);
      const displayName = cachedLabel?.name || `Agent ${relation.producerId}`;

      producerNodes.push({
        id: `producer:${relation.producerId}`,
        label: displayName,
        type: 'producer',
        badges: {
          status: relation.status,
          hasErrors: !!relation.errors?.trim(),
          hasWarnings: !!relation.warnings?.trim()
        },
        meta: {
          producerId: relation.producerId,
          gaId: relation.gaId,
          branchCode: relation.branchCode,
          upline: relation.upline,
          errors: relation.errors,
          warnings: relation.warnings,
          needsNameFetch: !cachedLabel // Flag to indicate name needs fetching
        }
      });
    }

    return producerNodes;
  }

  // Create branch nodes (process first 10 branches only for initial load)
  const branchEntries = Array.from(byBranch.entries());
  const branchesToProcess = branchEntries.slice(0, 10); // Limit to first 10 branches for faster loading
  console.log(`Processing ${branchesToProcess.length} branches out of ${branchEntries.length} total`);
  
  const branchNodes: ChartTree[] = [];
  for (const [branchCode, branchRelations] of branchesToProcess) {
    const producerNodes = createProducerNodes(branchRelations); // No await needed now!
    
    branchNodes.push({
      id: `branch:${branchCode}`,
      label: branchCode === 'Unassigned' ? 'Unassigned' : `${branchCode}`,
      type: 'branch',
      meta: { branchCode },
      children: producerNodes
    });
  }

  // Create root agency node
  return {
    id: `ga:${firmId}`,
    label: `MY AGENCY`,
    type: 'agency',
    meta: { gaId: firmId },
    children: branchNodes
  };
}

export function findProducerInTree(tree: ChartTree, producerId: number): ChartTree | null {
  if (tree.meta?.producerId === producerId) {
    return tree;
  }

  if (tree.children) {
    for (const child of tree.children) {
      const found = findProducerInTree(child, producerId);
      if (found) return found;
    }
  }

  return null;
}

export function searchTreeByNPN(tree: ChartTree, targetNPN: string, labelCache: Map<number, ProducerLabel>): ChartTree | null {
  // Check if this is a producer node and matches NPN
  if (tree.type === 'producer' && tree.meta?.producerId) {
    const label = labelCache.get(tree.meta.producerId);
    if (label?.npn === targetNPN) {
      return tree;
    }
  }

  // Search children recursively
  if (tree.children) {
    for (const child of tree.children) {
      const found = searchTreeByNPN(child, targetNPN, labelCache);
      if (found) return found;
    }
  }

  return null;
}

export function updateTreeWithNewRelations(
  existingTree: ChartTree,
  newRelations: GARelation[],
  labelCache: Map<number, ProducerLabel>,
  token: string
): Promise<ChartTree> {
  // For simplicity, rebuild the entire tree with combined relations
  // In a production app, you might want more sophisticated merging
  const firmId = existingTree.meta?.gaId;
  if (!firmId) {
    throw new Error('Cannot update tree: missing firm ID');
  }

  return relationsToChart(firmId, newRelations, labelCache, token);
}

export function countNodes(tree: ChartTree): { agencies: number; branches: number; producers: number } {
  let agencies = 0;
  let branches = 0; 
  let producers = 0;

  function count(node: ChartTree) {
    switch (node.type) {
      case 'agency':
        agencies++;
        break;
      case 'branch':
        branches++;
        break;
      case 'producer':
        producers++;
        break;
    }

    if (node.children) {
      node.children.forEach(count);
    }
  }

  count(tree);
  return { agencies, branches, producers };
}