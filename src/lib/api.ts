import type { GARelation, Producer, ProducerLabel } from './types';

export const authHeader = (user: string, pass: string): string =>
  'Basic ' + btoa(`${user}:${pass}`);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Request cache to prevent duplicate API calls
const requestCache = new Map<string, Promise<any>>();
const cacheTimeout = 30000; // 30 seconds cache

export async function getJSON<T>(path: string, token: string): Promise<T> {
  const cacheKey = `${path}:${token}`;
  
  // Check if we have a cached request in progress
  if (requestCache.has(cacheKey)) {
    console.log(`Using cached request for: ${path}`);
    return requestCache.get(cacheKey)!;
  }
  
  // Create the request promise
  const requestPromise = (async () => {
    // Use proxy in development, direct URL in production
    const baseUrl = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_SURELC_BASE || 'https://surelc.surancebay.com/sbweb/ws');
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 
        'Authorization': token,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    
    return res.json() as Promise<T>;
  })();
  
  // Cache the request
  requestCache.set(cacheKey, requestPromise);
  
  // Clear cache after timeout
  setTimeout(() => {
    requestCache.delete(cacheKey);
  }, cacheTimeout);
  
  try {
    return await requestPromise;
  } catch (error) {
    // Remove failed request from cache immediately
    requestCache.delete(cacheKey);
    throw error;
  }
}

export async function fetchFirmRelationsAfter(
  dateISO: string,
  token: string,
  pageSize = 1000 // Increased page size for better performance
): Promise<GARelation[]> {
  let offset = 0;
  const out: GARelation[] = [];
  
  console.log(`Starting to fetch firm relations from ${dateISO}`);
  
  while (true) {
    try {
      const url = `/firm/relationship/after/${encodeURIComponent(dateISO)}?offset=${offset}&limit=${pageSize}`;
      console.log(`Fetching: ${url}`);
      
      const chunk = await getJSON<GARelation[]>(url, token);
      out.push(...chunk);
      
      console.log(`Fetched ${chunk.length} relations (total: ${out.length})`);
      
      // If we got fewer results than requested, we've reached the end
      if (chunk.length < pageSize) {
        console.log(`Finished fetching. Total relations: ${out.length}`);
        break;
      }
      
      offset += pageSize;
      
      // Rate limiting - stay under 20 req/sec but be more aggressive
      await sleep(30); // Reduced from 60ms to 30ms for faster loading
    } catch (error) {
      console.error(`Error fetching firm relations at offset ${offset}:`, error);
      throw error;
    }
  }
  
  return out;
}

export async function fetchProducerLabel(id: number, token: string): Promise<ProducerLabel> {
  try {
    const producer = await getJSON<Producer>(`/producer/${id}`, token);
    const name = [producer.firstName, producer.lastName]
      .filter(Boolean)
      .join(' ') || `Producer ${id}`;
    
    return { 
      id, 
      name, 
      npn: producer.npn,
      firstName: producer.firstName,
      lastName: producer.lastName
    };
  } catch (error) {
    console.error(`Error fetching producer ${id}:`, error);
    // Return fallback data if fetch fails
    return { 
      id, 
      name: `Producer ${id}`,
      npn: undefined 
    };
  }
}

export async function fetchProducerByNPN(npn: string, token: string): Promise<Producer | null> {
  try {
    return await getJSON<Producer>(`/producer/npn/${npn}`, token);
  } catch (error) {
    console.error(`Error fetching producer by NPN ${npn}:`, error);
    return null;
  }
}

export async function fetchProducerRelationship(producerId: number, token: string): Promise<GARelation | null> {
  try {
    return await getJSON<GARelation>(`/producer/${producerId}/relationship`, token);
  } catch (error) {
    console.error(`Error fetching producer ${producerId} relationship:`, error);
    return null;
  }
}

// Utility function to create auth token from environment variables
export function createAuthToken(): string {
  const user = import.meta.env.VITE_SURELC_USER;
  const pass = import.meta.env.VITE_SURELC_PASS;
  
  if (!user || !pass) {
    throw new Error('Missing SURELC credentials in environment variables');
  }
  
  return authHeader(user, pass);
}