import type { ChartTree, ProducerLabel } from './types';
import { fetchProducerLabel } from './api';

// Find a node in the tree by its ID
export function findNodeById(tree: ChartTree, nodeId: string): ChartTree | null {
  // Safety checks for valid tree and nodeId
  if (!tree || !nodeId) {
    console.warn('Invalid tree or nodeId in findNodeById:', { tree, nodeId });
    return null;
  }

  // Handle special case for "Click here for Contracts" which might be causing issues
  if (nodeId === 'branch:Click here for Contracts') {
    console.warn('Special handling for "Click here for Contracts" branch');
    // Try to find it by searching through all branches
    if (tree.children) {
      for (const child of tree.children) {
        if (child.type === 'branch' && child.label?.includes('Contracts')) {
          console.log('Found contracts branch by label:', child);
          return child;
        }
      }
    }
  }

  // Normal ID matching
  if (tree.id === nodeId) {
    return tree;
  }
  
  // Recursively search children
  if (tree.children) {
    for (const child of tree.children) {
      if (!child) continue; // Skip invalid children
      
      try {
        const found = findNodeById(child, nodeId);
        if (found) return found;
      } catch (error) {
        console.error('Error in findNodeById recursion:', error);
        // Continue with next child
      }
    }
  }
  
  return null;
}

// Progressively load producer names in the background
// If nodeId is provided, only load names for that subtree
export async function loadProducerNamesProgressively(
  tree: ChartTree,
  labelCache: Map<number, ProducerLabel>,
  token: string,
  updateCallback: (updatedTree: ChartTree) => void,
  maxConcurrent = 5, // Increased concurrent calls for better performance
  nodeId?: string // Optional: only load names for this specific node and its children
): Promise<void> {
  const producersToLoad: ChartTree[] = [];
  
  // If nodeId is provided, find that specific node to start from
  try {
    const startNode = nodeId ? findNodeById(tree, nodeId) : tree;
    
    if (!startNode) {
      console.warn(`Node with ID ${nodeId} not found in tree`);
      return;
    }
    
    // Collect all producers that need name fetching
    function collectProducers(node: ChartTree) {
      try {
        // Safety checks for valid node structure
        if (!node || !node.type) {
          console.warn('Invalid node in collectProducers:', node);
          return;
        }
        
        if (node.type === 'producer' && node.meta?.needsNameFetch && node.meta?.producerId) {
          producersToLoad.push(node);
        }
        
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(child => {
            if (child) { // Only process valid children
              collectProducers(child);
            }
          });
        }
      } catch (error) {
        console.error('Error in collectProducers:', error);
        // Continue with other nodes
      }
    }
    
    collectProducers(startNode);
  } catch (error) {
    console.error('Error finding or processing node:', error);
    return;
  }
  
  console.log(`Found ${producersToLoad.length} producers that need names loaded${nodeId ? ` in subtree ${nodeId}` : ''}`);
  
  if (producersToLoad.length === 0) return;
  
  // Process producers in small batches to respect rate limits
  const batchSize = maxConcurrent;
  let processed = 0;
  
  for (let i = 0; i < producersToLoad.length; i += batchSize) {
    try {
      const batch = producersToLoad.slice(i, i + batchSize);
      
      // Process batch concurrently with better error handling
      const promises = batch.map(async (producerNode) => {
        try {
          // Safety checks
          if (!producerNode || !producerNode.meta || !producerNode.meta.producerId) {
            console.warn('Invalid producer node:', producerNode);
            return;
          }
          
          const producerId = producerNode.meta.producerId;
          
          // Check if we already have this label in cache
          if (labelCache.has(producerId) && !producerNode.meta?.needsNameFetch) {
            return;
          }
          
          const label = await fetchProducerLabel(producerId, token);
          labelCache.set(producerId, label);
          
          // Update the node with the real name
          producerNode.label = label.name;
          if (producerNode.meta) {
            producerNode.meta.needsNameFetch = false;
          }
          
          processed++;
          
          // Update UI every few names loaded
          if (processed % 5 === 0 || processed === producersToLoad.length) {
            try {
              updateCallback({ ...tree }); // Trigger re-render
            } catch (updateError) {
              console.error('Error in updateCallback:', updateError);
            }
          }
          
        } catch (error) {
          console.warn(`Failed to load name for producer ${producerNode?.meta?.producerId}:`, error);
          // Keep the fallback name
          if (producerNode?.meta) {
            producerNode.meta.needsNameFetch = false;
          }
        }
      });
      
      await Promise.allSettled(promises); // Use allSettled to handle individual failures
      
      // Rate limiting: wait between batches
      if (i + batchSize < producersToLoad.length) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 100ms to 50ms
      }
    } catch (batchError) {
      console.error(`Error processing batch ${i}-${i + batchSize}:`, batchError);
      // Continue with next batch
    }
  }
  
  console.log(`Loaded names for ${processed} producers${nodeId ? ` in subtree ${nodeId}` : ''}`);
}