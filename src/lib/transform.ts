import type { GARelation, ChartTree, ProducerLabel } from './types';

export function relationsToChart(
  firmId: number,
  relations: GARelation[],
  labelCache: Map<number, ProducerLabel>,
  firmDetails?: any
): ChartTree {
  console.log(`Processing ${relations.length} relations for firm ${firmId}`);
  console.log('Firm details parameter:', firmDetails);
  
  // Filter relations for our firm
  const firmRelations = relations.filter(r => r.gaId === firmId);
  console.log(`Found ${firmRelations.length} relations for firm ${firmId}`);
  
  // Build hierarchy based on upline relationships
  const hierarchyTree = buildHierarchyTree(firmId, firmRelations, labelCache);
  
  // Update the root node with proper firm name if firm details are available
  if (firmDetails) {
    console.log('Firm details received:', firmDetails);
    let firmName = `FIRM ${firmId}`;
    
    if (firmDetails.firstName && firmDetails.lastName) {
      firmName = `${firmDetails.firstName} ${firmDetails.lastName}`;
    } else if (firmDetails.name) {
      firmName = firmDetails.name;
    }
    
    hierarchyTree.label = firmName;
  } else {
    // Fallback logic: never set agency label to a branch name
    console.log('No firm details available, using generic fallback');
    if (firmId === 1756822500362) {
      hierarchyTree.label = 'SURANCEBAY INSURANCE FIRM';
    } else if (firmId === 323) {
      hierarchyTree.label = 'FIRM 323 - AGENCY';
    }
  }
  
  return hierarchyTree;
}

function buildHierarchyTree(
  firmId: number,
  relations: GARelation[],
  labelCache: Map<number, ProducerLabel>
): ChartTree {
  // Create a map of producerId to relation for quick lookup
  const relationMap = new Map<number, GARelation>();
  relations.forEach(relation => {
    relationMap.set(relation.producerId, relation);
  });

  // Create hierarchy mapping: upline -> children
  const hierarchyMap = new Map<string, ChartTree[]>(); // upline -> children

  console.log('Building hierarchy from upline relationships...');
  
  // First, create all producer nodes
  const allProducerNodes = new Map<number, ChartTree>();
  
  relations.forEach(relation => {
    const cachedLabel = labelCache.get(relation.producerId);
    const displayName = cachedLabel?.name || `Agent ${relation.producerId}`;
    
    const producerNode: ChartTree = {
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
        needsNameFetch: !cachedLabel || cachedLabel.name.startsWith('Agent ')
      },
      children: []
    };
    
    allProducerNodes.set(relation.producerId, producerNode);
  });

  // Group by upline to build hierarchy
  relations.forEach(relation => {
    const uplineKey = relation.upline?.trim() || 'ROOT';
    
    if (!hierarchyMap.has(uplineKey)) {
      hierarchyMap.set(uplineKey, []);
    }
    
    const producerNode = allProducerNodes.get(relation.producerId);
    if (producerNode) {
      // Check if this producer is already in the upline group to prevent duplicates
      const existingGroup = hierarchyMap.get(uplineKey)!;
      if (!existingGroup.some(node => node.id === producerNode.id)) {
        existingGroup.push(producerNode);
      }
    }
  });

  console.log('Hierarchy groups:', Array.from(hierarchyMap.keys()));
  
  // Log deduplication statistics
  const totalProducers = allProducerNodes.size;
  const totalInHierarchy = Array.from(hierarchyMap.values()).reduce((sum, group) => sum + group.length, 0);
  console.log(`Deduplication check: ${totalProducers} unique producers, ${totalInHierarchy} total entries in hierarchy`);

  // Build the tree recursively
  function buildSubTree(uplineKey: string, level: number = 0): ChartTree[] {
    const children = hierarchyMap.get(uplineKey) || [];
    const result: ChartTree[] = [];
    
    for (const child of children) {
      // Find this producer's downline (children)
      const childUplineKey = child.meta?.producerId?.toString();
      if (childUplineKey) {
        const grandChildren = buildSubTree(childUplineKey, level + 1);
        child.children = grandChildren;
      }
      
      result.push(child);
    }
    
    return result;
  }

  // Get root level producers (those with no upline or upline not in our data)
  const rootProducers = buildSubTree('ROOT');
  
  // Also check for producers whose upline is not in our dataset
  relations.forEach(relation => {
    if (relation.upline && relation.upline.trim()) {
      // Check if upline exists as a producer in our data
      const uplineExists = relations.some(r => r.producerId.toString() === relation.upline?.trim());
      if (!uplineExists) {
        // This producer's upline is external, so they should be at root level
        const producerNode = allProducerNodes.get(relation.producerId);
        if (producerNode && !rootProducers.some(p => p.id === producerNode.id)) {
          const childUplineKey = relation.producerId.toString();
          const grandChildren = buildSubTree(childUplineKey);
          producerNode.children = grandChildren;
          rootProducers.push(producerNode);
        }
      }
    }
  });

  // If we have a complex hierarchy, organize by branch and then by upline
  const branchGroups = new Map<string, ChartTree[]>();
  
  // Group root producers by branch
  rootProducers.forEach(producer => {
    const branchCode = producer.meta?.branchCode || 'Unassigned';
    if (!branchGroups.has(branchCode)) {
      branchGroups.set(branchCode, []);
    }
    branchGroups.get(branchCode)!.push(producer);
  });

  // Create branch nodes with hierarchical children
  const branchNodes: ChartTree[] = [];
  for (const [branchCode, producers] of branchGroups.entries()) {
    const branchLabel = branchCode === 'Unassigned' ? 'Unassigned Agents' : `${branchCode}`;
    
    branchNodes.push({
      id: `branch:${branchCode}`,
      label: branchLabel,
      type: 'branch',
      meta: { branchCode },
      children: producers
    });
  }

  // Create root agency node
  let firmName = `FIRM ${firmId}`;
  if (firmId === 1756822500362) {
    firmName = 'SURANCEBAY INSURANCE FIRM';
  } else if (firmId === 323) {
    firmName = 'FIRM 323 - AGENCY';
  }
  
  return {
    id: `ga:${firmId}`,
    label: firmName,
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
  labelCache: Map<number, ProducerLabel>
): ChartTree {
  // For simplicity, rebuild the entire tree with combined relations
  // In a production app, you might want more sophisticated merging
  const firmId = existingTree.meta?.gaId;
  if (!firmId) {
    throw new Error('Cannot update tree: missing firm ID');
  }

  return relationsToChart(firmId, newRelations, labelCache);
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
