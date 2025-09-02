import type { ChartTree, ProducerLabel } from './types';
import { fetchProducerLabel } from './api';

// Progressively load producer names in the background
export async function loadProducerNamesProgressively(
  tree: ChartTree,
  labelCache: Map<number, ProducerLabel>,
  token: string,
  updateCallback: (updatedTree: ChartTree) => void,
  maxConcurrent = 3 // Limit concurrent API calls to respect rate limits
): Promise<void> {
  const producersToLoad: ChartTree[] = [];
  
  // Collect all producers that need name fetching
  function collectProducers(node: ChartTree) {
    if (node.type === 'producer' && node.meta?.needsNameFetch && node.meta?.producerId) {
      producersToLoad.push(node);
    }
    if (node.children) {
      node.children.forEach(collectProducers);
    }
  }
  
  collectProducers(tree);
  console.log(`Found ${producersToLoad.length} producers that need names loaded`);
  
  if (producersToLoad.length === 0) return;
  
  // Process producers in small batches to respect rate limits
  const batchSize = maxConcurrent;
  let processed = 0;
  
  for (let i = 0; i < producersToLoad.length; i += batchSize) {
    const batch = producersToLoad.slice(i, i + batchSize);
    
    // Process batch concurrently
    const promises = batch.map(async (producerNode) => {
      const producerId = producerNode.meta!.producerId!;
      
      try {
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
          updateCallback({ ...tree }); // Trigger re-render
        }
        
      } catch (error) {
        console.warn(`Failed to load name for producer ${producerId}:`, error);
        // Keep the fallback name
        if (producerNode.meta) {
          producerNode.meta.needsNameFetch = false;
        }
      }
    });
    
    await Promise.all(promises);
    
    // Rate limiting: wait between batches
    if (i + batchSize < producersToLoad.length) {
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms between batches
    }
  }
  
  console.log(`Loaded names for ${processed} producers`);
}