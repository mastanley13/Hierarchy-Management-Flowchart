import type { GARelation, Producer, ProducerLabel, HierarchyUploadResult, HierarchyUploadStatus, FileValidationResult } from './types';
import { createAuthTokenForMRFGAdmin, type MRFGAdminSet } from './credentials';

export const authHeader = (user: string, pass: string): string =>
  'Basic ' + btoa(`${user}:${pass}`);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Rate limiting for 20 req/sec (50ms between requests)
const RATE_LIMIT_MS = 50; // 1000ms / 20 requests = 50ms per request

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
    // Use local proxy in development, serverless function in production
    const baseUrl = import.meta.env.DEV 
      ? '/api' 
      : (import.meta.env.VITE_API_PROXY || '/api/proxy?path=');
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 
        'Authorization': token,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`API Error - ${path}:`, {
        status: res.status,
        statusText: res.statusText,
        url: `${baseUrl}${path}`,
        error: errorText
      });
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

// Helper function to format date for API (UTC, no milliseconds)
function formatDateForAPI(dateISO: string): string {
  try {
    const input = (dateISO || '').trim();

    // Quick sanitize common variants without full parsing
    // - Replace space with 'T'
    // - Ensure trailing 'Z'
    // - Strip fractional seconds if present
    const normalized = input
      .replace(' ', 'T')
      .replace(/\.(\d{1,3})Z$/, 'Z');

    const parsed = new Date(normalized.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}${normalized.includes('T') ? 'Z' : 'T00:00:00Z'}`);

    if (isNaN(parsed.getTime())) {
      console.warn('Invalid date provided, returning as-is:', dateISO);
      // As a last resort, drop milliseconds and add Z if missing
      return input
        .replace(' ', 'T')
        .replace(/\.(\d{1,3})Z$/, 'Z')
        .replace(/Z?$/, 'Z');
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = parsed.getUTCFullYear();
    const mm = pad(parsed.getUTCMonth() + 1);
    const dd = pad(parsed.getUTCDate());
    const HH = pad(parsed.getUTCHours());
    const MM = pad(parsed.getUTCMinutes());
    const SS = pad(parsed.getUTCSeconds());
    return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}Z`;
  } catch (error) {
    console.warn('Error formatting date, using original:', error);
    return dateISO;
  }
}

export async function fetchFirmRelationsAfter(
  dateISO: string,
  token: string,
  pageSize = 1000 // Increased page size for better performance
): Promise<GARelation[]> {
  let offset = 0;
  const out: GARelation[] = [];
  
  // Format the date properly for the API
  const formattedDate = formatDateForAPI(dateISO);
  console.log(`Starting to fetch firm relations from ${formattedDate} (original: ${dateISO})`);
  
  while (true) {
    try {
      const url = `/firm/relationship/after/${encodeURIComponent(formattedDate)}?offset=${offset}&limit=${pageSize}`;
      console.log(`Fetching: ${url} (pageSize: ${pageSize})`);
      
      const chunk = await getJSON<GARelation[]>(url, token);
      out.push(...chunk);
      
      console.log(`Fetched ${chunk.length} relations (total: ${out.length})`);
      
      // If we got fewer results than requested, we've reached the end
      if (chunk.length < pageSize) {
        console.log(`Finished fetching. Total relations: ${out.length}`);
        break;
      }
      
      offset += pageSize;
      
      // Rate limiting - respect 20 req/sec limit
      await sleep(RATE_LIMIT_MS);
    } catch (error) {
      console.error(`Error fetching firm relations at offset ${offset}:`, error);
      throw error;
    }
  }
  
  return out;
}

// New function for firm-specific relationships
export async function fetchFirmRelations(
  firmId: number,
  token: string
): Promise<GARelation[]> {
  try {
    console.log(`Fetching firm relations for firm ${firmId}`);
    const url = `/firm/${firmId}/relationship`;
    console.log(`Fetching: ${url}`);
    
    // Rate limiting - respect 20 req/sec limit
    await sleep(RATE_LIMIT_MS);
    
    // Try to get the firm-specific data
    const response = await getJSON<any>(url, token);
    
    // Handle different response formats
    if (Array.isArray(response)) {
      // If it's already an array, return it
      console.log(`Fetched ${response.length} relations for firm ${firmId}`);
      return response;
    } else if (response && typeof response === 'object') {
      // If it's a single object, wrap it in an array
      console.log(`Fetched 1 relation for firm ${firmId}`);
      return [response];
    } else {
      // If it's null/undefined, return empty array
      console.log(`No relations found for firm ${firmId}`);
      return [];
    }
  } catch (error) {
    console.error(`Error fetching firm relations for firm ${firmId}:`, error);
    // If the firm-specific endpoint fails, we'll fall back to the general endpoint
    throw error;
  }
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

// Function to fetch firm details
export async function fetchFirmDetails(firmId: number, token: string): Promise<any> {
  try {
    console.log(`Fetching firm details for firm ${firmId}`);
    const url = `/firm/${firmId}`;
    
    // Rate limiting - respect 20 req/sec limit
    await sleep(RATE_LIMIT_MS);
    
    const firmDetails = await getJSON<any>(url, token);
    console.log(`Fetched firm details:`, firmDetails);
    return firmDetails;
  } catch (error) {
    console.warn(`Firm details endpoint not available for firm ${firmId}:`, error);
    console.log(`Attempting to infer firm name from producer data...`);
    
    // Fallback: Try to get firm name from producer data
    try {
      const fallbackName = await inferFirmNameFromProducers(firmId, token);
      if (fallbackName) {
        console.log(`Inferred firm name: ${fallbackName}`);
        return { name: fallbackName };
      }
    } catch (fallbackError) {
      console.warn(`Could not infer firm name:`, fallbackError);
    }
    
    return null;
  }
}

// Fallback function to infer firm name from producer data
async function inferFirmNameFromProducers(firmId: number, token: string): Promise<string | null> {
  try {
    // Get a sample producer from the firm to infer the firm name
    const relations = await fetchFirmRelationsAfter('2000-01-01T00:00:00Z', token, 100);
    const firmRelations = relations.filter(r => r.gaId === firmId);

    if (firmRelations.length > 0) {
      // Try to get details of the first producer to see if we can infer firm name
      const sampleProducer = firmRelations[0];
      await fetchProducerLabel(sampleProducer.producerId, token);
      // Do not infer MRFG as agency name; return null to allow UI fallback
    }

    return null;
  } catch (error) {
    console.warn('Error inferring firm name:', error);
    return null;
  }
}

// Function to analyze MRFG connections from CSV data
export function analyzeMRFGConnections(csvData: string): {
  mrfgProducers: Array<{
    producerId: string;
    producerName: string;
    npn: string;
    status: string;
    addedOn: string;
    lastUpdated: string;
  }>;
  totalCount: number;
  activeCount: number;
  dateRange: { earliest: string; latest: string };
} {
  const lines = csvData.split('\n');
  const mrfgProducers: any[] = [];
  let earliestDate = '';
  let latestDate = '';
  
  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim();
    if (!line) continue;
    
    const columns = line.split(',');
    if (columns.length >= 4 && columns[3] === 'Major Revolution Financial Group') {
      const producer = {
        producerId: columns[0],
        producerName: columns[1],
        npn: columns[2],
        status: columns[6],
        addedOn: columns[8],
        lastUpdated: columns[14]
      };
      
      mrfgProducers.push(producer);
      
      // Track date range
      if (producer.addedOn) {
        if (!earliestDate || producer.addedOn < earliestDate) {
          earliestDate = producer.addedOn;
        }
        if (!latestDate || producer.addedOn > latestDate) {
          latestDate = producer.addedOn;
        }
      }
    }
  }
  
  const activeCount = mrfgProducers.filter(p => p.status === 'Active').length;
  
  return {
    mrfgProducers,
    totalCount: mrfgProducers.length,
    activeCount,
    dateRange: { earliest: earliestDate, latest: latestDate }
  };
}

// Function to test MRFG producer name resolution
export async function testMRFGProducerNameResolution(
  producerId: number,
  token: string
): Promise<void> {
  try {
    console.log(`Testing name resolution for MRFG producer ${producerId}`);
    
    // Test producer relationship
    const relationship = await fetchProducerRelationship(producerId, token);
    if (relationship) {
      console.log(`Producer ${producerId} relationship:`, {
        gaId: relationship.gaId,
        branchCode: relationship.branchCode,
        status: relationship.status,
        upline: relationship.upline
      });
    }
    
    // Test producer name
    const label = await fetchProducerLabel(producerId, token);
    console.log(`Producer ${producerId} name:`, {
      id: label.id,
      name: label.name,
      npn: label.npn,
      firstName: label.firstName,
      lastName: label.lastName
    });
    
  } catch (error) {
    console.error(`Error testing producer ${producerId}:`, error);
  }
}

// ENHANCED API LAYER - All SureLC Endpoints for MRFG MVP

// === PRODUCER ENDPOINTS ===

export async function fetchProducerAppointments(producerId: number, token: string): Promise<any[]> {
  try {
    const appointments = await getJSON<any[]>(`/producer/${producerId}/appointments`, token);
    console.log(`🔍 DETAILED Appointments for producer ${producerId}:`, {
      count: appointments.length,
      sampleData: appointments.slice(0, 2), // Show first 2 appointments in full detail
      allFields: appointments.length > 0 ? Object.keys(appointments[0]) : []
    });
    return appointments;
  } catch (error) {
    console.error(`Error fetching appointments for producer ${producerId}:`, error);
    return [];
  }
}

export async function fetchProducerLicenses(producerId: number, token: string): Promise<any[]> {
  try {
    const licenses = await getJSON<any[]>(`/producer/${producerId}/licenses`, token);
    console.log(`🔍 DETAILED Licenses for producer ${producerId}:`, {
      count: licenses.length,
      sampleData: licenses.slice(0, 2), // Show first 2 licenses in full detail
      allFields: licenses.length > 0 ? Object.keys(licenses[0]) : []
    });
    return licenses;
  } catch (error) {
    console.error(`Error fetching licenses for producer ${producerId}:`, error);
    return [];
  }
}

export async function fetchProducerAddresses(producerId: number, token: string): Promise<any[]> {
  try {
    const addresses = await getJSON<any[]>(`/producer/${producerId}/addresses`, token);
    console.log(`Fetched ${addresses.length} addresses for producer ${producerId}`);
    return addresses;
  } catch (error) {
    console.error(`Error fetching addresses for producer ${producerId}:`, error);
    return [];
  }
}

export async function fetchProducerContracts(producerId: number, token: string): Promise<any[]> {
  try {
    const contracts = await getJSON<any[]>(`/contract/producer/${producerId}`, token);
    console.log(`🔍 DETAILED Contracts for producer ${producerId}:`, {
      count: contracts.length,
      sampleData: contracts.slice(0, 2), // Show first 2 contracts in full detail  
      allFields: contracts.length > 0 ? Object.keys(contracts[0]) : []
    });
    return contracts;
  } catch (error) {
    console.error(`Error fetching contracts for producer ${producerId}:`, error);
    return [];
  }
}

// === FIRM ENDPOINTS ===

export async function fetchFirmAppointments(firmId: number, token: string): Promise<any[]> {
  try {
    const appointments = await getJSON<any[]>(`/firm/${firmId}/appointments`, token);
    console.log(`Fetched ${appointments.length} firm appointments for firm ${firmId}`);
    return appointments;
  } catch (error) {
    console.error(`Error fetching firm appointments for firm ${firmId}:`, error);
    return [];
  }
}

export async function fetchFirmLicenses(firmId: number, token: string): Promise<any[]> {
  try {
    const licenses = await getJSON<any[]>(`/firm/${firmId}/licenses`, token);
    console.log(`Fetched ${licenses.length} firm licenses for firm ${firmId}`);
    return licenses;
  } catch (error) {
    console.error(`Error fetching firm licenses for firm ${firmId}:`, error);
    return [];
  }
}

export async function fetchFirmAddresses(firmId: number, token: string): Promise<any[]> {
  try {
    const addresses = await getJSON<any[]>(`/firm/${firmId}/addresses`, token);
    console.log(`Fetched ${addresses.length} firm addresses for firm ${firmId}`);
    return addresses;
  } catch (error) {
    console.error(`Error fetching firm addresses for firm ${firmId}:`, error);
    return [];
  }
}

// === CSV REPORT ENDPOINTS ===

export async function fetchCSVReport(
  reportType: 'agent' | 'contract' | 'producer_license' | 'appointment',
  token: string,
  afterDate?: string
): Promise<string> {
  try {
    const url = afterDate 
      ? `/carrier/csv-report/${reportType}/${encodeURIComponent(formatDateForAPI(afterDate))}`
      : `/carrier/csv-report/${reportType}`;
    
    console.log(`Fetching CSV report: ${reportType}`);
    
    // Note: This endpoint returns CSV data as text, not JSON
    const baseUrl = import.meta.env.DEV 
      ? '/api' 
      : (import.meta.env.VITE_API_PROXY || '/api/proxy?path=');
    
    const res = await fetch(`${baseUrl}${url}`, {
      headers: { 
        'Authorization': token,
        'Accept': 'application/octet-stream, text/csv, text/plain'
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    
    const csvData = await res.text();
    console.log(`Fetched ${csvData.split('\n').length} rows for ${reportType} report`);
    return csvData;
  } catch (error) {
    console.error(`Error fetching CSV report ${reportType}:`, error);
    throw error;
  }
}

// === APPOINTMENT REQUEST ENDPOINTS ===

export async function fetchAppointmentRequest(requestId: number, token: string): Promise<any> {
  try {
    return await getJSON<any>(`/appointmentRequest/${requestId}`, token);
  } catch (error) {
    console.error(`Error fetching appointment request ${requestId}:`, error);
    return null;
  }
}

// === CARRIER LOOKUP ENDPOINTS ===

export async function fetchCarrierSubscribedProducersAppointments(
  token: string,
  appointmentStatus?: string,
  parts?: number,
  part?: number
): Promise<any[]> {
  try {
    let url = '/carrier/subscribed-producers/appointments';
    const params = new URLSearchParams();
    
    if (appointmentStatus) params.append('appointmentStatus', appointmentStatus);
    if (parts !== undefined) params.append('parts', parts.toString());
    if (part !== undefined) params.append('part', part.toString());
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    console.log(`🔍 Fetching carrier subscribed producers appointments: ${url}`);
    const appointments = await getJSON<any[]>(url, token);
    console.log(`📊 Fetched ${appointments.length} carrier appointments`);
    
    return appointments;
  } catch (error) {
    console.error(`Error fetching carrier subscribed producers appointments:`, error);
    return [];
  }
}

// === CARRIER NAME LOOKUP SERVICE ===

// Global carrier lookup cache
let carrierLookupCache: Map<number, string> = new Map();
let carrierLookupCacheTimestamp: number = 0;
const CARRIER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Build carrier lookup cache from carrier appointment data
 */
export async function buildCarrierLookupCache(token: string): Promise<Map<number, string>> {
  try {
    console.log(`🏗️ Building carrier lookup cache...`);
    
    // Try carrier endpoint first, fallback to CSV reports
    let newCache = new Map<number, string>();
    
    try {
      // Use carrier credentials if available, fallback to agency token
      let carrierToken: string = token;
      try {
        carrierToken = createCarrierAuthToken();
      } catch (e) {
        console.warn('Carrier credentials not configured; using agency token for carrier lookup');
      }
      
      // Try to fetch carrier appointment data
      const carrierAppointments = await fetchCarrierSubscribedProducersAppointments(carrierToken);
      
      // Extract carrier ID to name mappings
      for (const appointment of carrierAppointments) {
        // Try multiple possible field names for carrier ID and name
        const carrierId = getFieldValue(appointment, ['carrierId', 'carrier_id', 'id', 'carrier']);
        const carrierName = getFieldValue(appointment, ['carrierName', 'carrier_name', 'name', 'companyName', 'company']);
        
        if (carrierId && carrierName && typeof carrierId === 'number' && typeof carrierName === 'string') {
          newCache.set(carrierId, carrierName);
        }
      }
      
      console.log(`✅ Carrier lookup cache built from carrier endpoint with ${newCache.size} carriers`);
    } catch (carrierError) {
      console.warn(`⚠️ Carrier endpoint failed (${carrierError}), falling back to CSV reports...`);
      
      // Fallback: Use CSV reports to build carrier lookup
      try {
        console.log(`🔍 DEBUG: Attempting CSV fallback...`);
        newCache = await buildCarrierLookupFromCSV(token);
        console.log(`🔍 DEBUG: CSV fallback result size: ${newCache.size}`);
      } catch (csvError) {
        console.warn(`⚠️ CSV fallback also failed (${csvError}), trying appointment data fallback...`);
        
        // Final fallback: Use appointment data
        try {
          console.log(`🔍 DEBUG: Attempting final fallback to buildCarrierLookupFromAppointments...`);
          newCache = await buildCarrierLookupFromAppointments(token);
          console.log(`🔍 DEBUG: Appointment data fallback result size: ${newCache.size}`);
        } catch (appointmentError) {
          console.warn(`⚠️ Appointment data fallback also failed (${appointmentError}), carrier lookup will be limited`);
          newCache = new Map();
        }
      }
    }
    
    // Update global cache
    carrierLookupCache = newCache;
    carrierLookupCacheTimestamp = Date.now();
    
    console.log(`✅ Carrier lookup cache built with ${newCache.size} carriers`);
    console.log(`🔍 DEBUG: Final cache contents:`, Array.from(newCache.entries()));
    return newCache;
  } catch (error) {
    console.error(`❌ Error building carrier lookup cache:`, error);
    return new Map();
  }
}

/**
 * Build carrier lookup cache from CSV reports (fallback method)
 */
async function buildCarrierLookupFromCSV(token: string): Promise<Map<number, string>> {
  try {
    console.log(`📊 Building carrier lookup from CSV reports...`);
    
    // Use carrier credentials if available, fallback to agency token
    let carrierToken: string = token;
    try {
      carrierToken = createCarrierAuthToken();
    } catch (e) {
      console.warn('Carrier credentials not configured; using agency token for CSV reports');
    }
    
    // Fetch appointment CSV report
    const appointmentCSV = await fetchCSVReport('appointment', carrierToken);
    
    // Debug: Log first few lines of CSV to understand structure
    const lines = appointmentCSV.split('\n');
    console.log(`📋 CSV Debug - First 3 lines:`, lines.slice(0, 3));
    
    // Parse CSV to extract carrier information
    const newCache = new Map<number, string>();
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Improved CSV parsing that handles quoted fields
      const columns = parseCSVLine(line);
      if (columns.length < 2) continue;
      
      // Debug: Log first few rows to understand structure
      if (i <= 3) {
        console.log(`📋 CSV Debug - Row ${i}:`, columns);
      }
      
      // Try to find carrier ID and name columns
      // Look for patterns like: carrierId,carrierName or id,name or carrier,name
      let carrierId: number | null = null;
      let carrierName: string | null = null;
      
      // Strategy 1: Look for numeric carrier ID in first few columns
      for (let j = 0; j < Math.min(columns.length, 5); j++) {
        const value = columns[j].trim();
        if (value && !isNaN(Number(value)) && Number(value) > 0 && Number(value) < 1000000) {
          carrierId = Number(value);
          break;
        }
      }
      
      // Strategy 2: Look for carrier name in remaining columns
      for (let j = 1; j < columns.length; j++) {
        const value = columns[j].trim();
        if (value && isNaN(Number(value)) && value.length > 2 && value.length < 100) {
          // Skip common non-carrier values
          if (!['active', 'pending', 'terminated', 'completed', 'life', 'health', 'annuity'].includes(value.toLowerCase())) {
            carrierName = value;
            break;
          }
        }
      }
      
      if (carrierId && carrierName) {
        newCache.set(carrierId, carrierName);
        if (i <= 3) {
          console.log(`✅ Found carrier mapping: ${carrierId} -> ${carrierName}`);
        }
      }
    }
    
    console.log(`✅ Carrier lookup built from CSV with ${newCache.size} carriers`);
    if (newCache.size > 0) {
      console.log(`📊 Sample carrier mappings:`, Array.from(newCache.entries()).slice(0, 5));
    }
    return newCache;
  } catch (error) {
    console.error(`❌ Error building carrier lookup from CSV:`, error);
    return new Map();
  }
}

/**
 * Build carrier lookup cache from existing appointment data (final fallback)
 */
async function buildCarrierLookupFromAppointments(_token: string): Promise<Map<number, string>> {
  try {
    console.log(`📊 Building carrier lookup from static carrier mappings...`);
    
    // This is a fallback that provides basic carrier name resolution
    // using a static mapping of common carrier IDs to names
    
    // Common carrier mappings (these could be expanded based on your data)
    const commonCarriers = new Map<number, string>([
      [1, 'Equita Life Insurance'],
      [2, 'Quility Insurance'],
      [3, 'Major Revolution Financial Group'],
      [60739, 'Major Revolution Financial Group'], // Based on the carrier ID we saw in the debug output
      [61999, 'Equita Life Insurance'], // Based on the carrier ID we saw in the debug output
      [60740, 'Equita Life Insurance'],
      [60741, 'Quility Insurance'],
      // Add more common carriers as needed
    ]);
    
    console.log(`✅ Carrier lookup built from static mappings with ${commonCarriers.size} carriers`);
    console.log(`🔍 DEBUG: Static mapping contents:`, Array.from(commonCarriers.entries()));
    return commonCarriers;
  } catch (error) {
    console.error(`❌ Error building carrier lookup from static mappings:`, error);
    return new Map();
  }
}

/**
 * Add carrier mapping to the global cache (called when appointment data is loaded)
 */
export function addCarrierMapping(carrierId: number, carrierName: string): void {
  if (carrierId && carrierName) {
    carrierLookupCache.set(carrierId, carrierName);
    console.log(`📝 Added carrier mapping: ${carrierId} -> ${carrierName}`);
  }
}

/**
 * Build carrier lookup cache from appointment data arrays
 * Note: This function is kept for compatibility but appointment data doesn't contain carrier names
 */
export function buildCarrierLookupFromAppointmentData(appointments: any[], contracts: any[]): Map<number, string> {
  const newCache = new Map<number, string>();
  
  console.log(`📊 Building carrier lookup from appointment data...`);
  console.log(`📊 Appointments count: ${appointments.length}, Contracts count: ${contracts.length}`);
  
  // Extract carrier mappings from appointments
  appointments.forEach(appointment => {
    const carrierId = getFieldValue(appointment, ['carrierId', 'carrier_id', 'id', 'carrier']);
    const carrierName = getFieldValue(appointment, ['carrierName', 'carrier_name', 'name', 'companyName', 'company']);
    
    if (carrierId && carrierName && typeof carrierId === 'number' && typeof carrierName === 'string') {
      newCache.set(carrierId, carrierName);
    }
  });
  
  // Extract carrier mappings from contracts
  contracts.forEach(contract => {
    const carrierId = getFieldValue(contract, ['carrierId', 'carrier_id', 'id', 'carrier']);
    const carrierName = getFieldValue(contract, ['carrierName', 'carrier_name', 'name', 'companyName', 'company']);
    
    if (carrierId && carrierName && typeof carrierId === 'number' && typeof carrierName === 'string') {
      newCache.set(carrierId, carrierName);
    }
  });
  
  // Update global cache
  newCache.forEach((name, id) => {
    carrierLookupCache.set(id, name);
  });
  
  console.log(`📊 Built carrier lookup from appointment data with ${newCache.size} carriers`);
  return newCache;
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current);
  
  return result;
}

/**
 * Get carrier name by ID, with automatic cache refresh if needed
 */
export async function getCarrierName(carrierId: number, token: string): Promise<string | null> {
  console.log(`🔍 DEBUG: Getting carrier name for ID: ${carrierId}`);
  console.log(`🔍 DEBUG: Current cache size: ${carrierLookupCache.size}`);
  console.log(`🔍 DEBUG: Current cache contents:`, Array.from(carrierLookupCache.entries()));
  
  // Check if cache is expired
  const now = Date.now();
  if (now - carrierLookupCacheTimestamp > CARRIER_CACHE_TTL || carrierLookupCache.size === 0) {
    console.log(`🔄 Carrier cache expired or empty, rebuilding...`);
    await buildCarrierLookupCache(token);
  }
  
  const carrierName = carrierLookupCache.get(carrierId);
  if (carrierName) {
    console.log(`✅ Found carrier name: ${carrierId} -> ${carrierName}`);
    return carrierName;
  } else {
    console.log(`❌ Carrier name not found for ID: ${carrierId}`);
    console.log(`❌ Available carrier IDs in cache:`, Array.from(carrierLookupCache.keys()));
    return null;
  }
}

/**
 * Helper function to safely extract field values (same as in ProducerDetailPanel)
 */
function getFieldValue(obj: any, fieldNames: string[]): any {
  for (const fieldName of fieldNames) {
    if (obj && obj[fieldName] !== undefined && obj[fieldName] !== null) {
      return obj[fieldName];
    }
  }
  return null;
}

/**
 * Clear carrier lookup cache (useful for testing or manual refresh)
 */
export function clearCarrierLookupCache(): void {
  carrierLookupCache.clear();
  carrierLookupCacheTimestamp = 0;
  console.log(`🧹 Carrier lookup cache cleared`);
}

/**
 * Test carrier lookup functionality
 */
export async function testCarrierLookup(token: string): Promise<void> {
  try {
    console.log(`🧪 Testing carrier lookup functionality...`);
    
    // Clear cache first
    clearCarrierLookupCache();
    
    // Build cache
    const cache = await buildCarrierLookupCache(token);
    console.log(`📊 Carrier cache built with ${cache.size} entries:`, Array.from(cache.entries()));
    
    // Test lookup for a few carrier IDs if available
    if (cache.size > 0) {
      const firstCarrierId = Array.from(cache.keys())[0];
      const carrierName = await getCarrierName(firstCarrierId, token);
      console.log(`✅ Test lookup for carrier ID ${firstCarrierId}: "${carrierName}"`);
    } else {
      console.log(`⚠️ No carriers found in cache - this might be expected if no carrier data is available`);
    }
    
  } catch (error) {
    console.error(`❌ Carrier lookup test failed:`, error);
  }
}

export async function fetchPendingAppointmentRequests(
  ssn: string, 
  carrierId: number, 
  token: string
): Promise<any[]> {
  try {
    return await getJSON<any[]>(`/appointmentRequest/ssn/${ssn}/carrier/${carrierId}/pending`, token);
  } catch (error) {
    console.error(`Error fetching pending appointments for SSN ${ssn}:`, error);
    return [];
  }
}

// === ENHANCED MRFG DATA AGGREGATION ===

export interface EnhancedProducerProfile {
  basic: ProducerLabel;
  relationship: GARelation | null;
  appointments: any[];
  licenses: any[];
  addresses: any[];
  contracts: any[];
  complianceStatus: {
    licenseCompliance: 'compliant' | 'expiring' | 'expired' | 'unknown';
    appointmentStatus: 'active' | 'pending' | 'completed' | 'unknown';
    hasErrors: boolean;
    hasWarnings: boolean;
  };
  lastUpdated: string;
}

export async function fetchEnhancedProducerProfile(
  producerId: number,
  token: string
): Promise<EnhancedProducerProfile> {
  console.log(`🔍 Fetching enhanced profile for producer ${producerId}...`);
  
  // Fetch all data in parallel with rate limiting
  const [basic, relationship, appointments, licenses, addresses, contracts] = await Promise.allSettled([
    fetchProducerLabel(producerId, token),
    fetchProducerRelationship(producerId, token),
    fetchProducerAppointments(producerId, token),
    fetchProducerLicenses(producerId, token),
    fetchProducerAddresses(producerId, token),
    fetchProducerContracts(producerId, token)
  ]);

  // Extract results with fallbacks
  const basicData = basic.status === 'fulfilled' ? basic.value : { id: producerId, name: `Producer ${producerId}` };
  const relationshipData = relationship.status === 'fulfilled' ? relationship.value : null;
  const appointmentsData = appointments.status === 'fulfilled' ? appointments.value : [];
  const licensesData = licenses.status === 'fulfilled' ? licenses.value : [];
  const addressesData = addresses.status === 'fulfilled' ? addresses.value : [];
  const contractsData = contracts.status === 'fulfilled' ? contracts.value : [];

  // Calculate compliance status
  const complianceStatus = calculateComplianceStatus(
    licensesData,
    appointmentsData,
    relationshipData
  );

  console.log(`✅ Enhanced profile complete for ${basicData.name}:`, {
    appointments: appointmentsData.length,
    licenses: licensesData.length,
    addresses: addressesData.length,
    contracts: contractsData.length,
    compliance: complianceStatus
  });

  return {
    basic: basicData,
    relationship: relationshipData,
    appointments: appointmentsData,
    licenses: licensesData,
    addresses: addressesData,
    contracts: contractsData,
    complianceStatus,
    lastUpdated: new Date().toISOString()
  };
}

function calculateComplianceStatus(licenses: any[], appointments: any[], relationship: GARelation | null) {
  const hasErrors = !!relationship?.errors?.trim();
  const hasWarnings = !!relationship?.warnings?.trim();
  
  // License compliance check
  let licenseCompliance: 'compliant' | 'expiring' | 'expired' | 'unknown' = 'unknown';
  if (licenses.length > 0) {
    const now = new Date();
    const expiredLicenses = licenses.filter(l => l.expirationDate && new Date(l.expirationDate) < now);
    const expiringLicenses = licenses.filter(l => {
      if (!l.expirationDate) return false;
      const expDate = new Date(l.expirationDate);
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return expDate <= thirtyDaysFromNow && expDate >= now;
    });
    
    if (expiredLicenses.length > 0) {
      licenseCompliance = 'expired';
    } else if (expiringLicenses.length > 0) {
      licenseCompliance = 'expiring';
    } else {
      licenseCompliance = 'compliant';
    }
  }
  
  // Appointment status check
  let appointmentStatus: 'active' | 'pending' | 'completed' | 'unknown' = 'unknown';
  if (appointments.length > 0) {
    const activeAppointments = appointments.filter(a => a.status === 'active');
    const pendingAppointments = appointments.filter(a => a.status === 'pending');
    
    if (activeAppointments.length > 0) {
      appointmentStatus = 'active';
    } else if (pendingAppointments.length > 0) {
      appointmentStatus = 'pending';
    } else {
      appointmentStatus = 'completed';
    }
  }

  return {
    licenseCompliance,
    appointmentStatus,
    hasErrors,
    hasWarnings
  };
}

// === BULK MRFG DATA FETCHING ===

export async function fetchMRFGBulkData(
  mrfgProducerIds: number[],
  token: string
): Promise<{
  profiles: Map<number, EnhancedProducerProfile>;
  csvReports: {
    licenses: string;
    appointments: string;
    contracts: string;
    agents: string;
  };
}> {
  console.log(`🚀 Starting bulk MRFG data fetch for ${mrfgProducerIds.length} producers...`);
  
  // Fetch CSV reports in parallel
  // Use carrier credentials for carrier CSV endpoints when available
  let carrierToken: string = token;
  try {
    carrierToken = createCarrierAuthToken();
  } catch (e) {
    // Fallback to agency token if carrier creds are not configured
    console.warn('Carrier credentials not configured; using agency token for CSV endpoints');
  }
  const csvPromises = Promise.allSettled([
    fetchCSVReport('producer_license', carrierToken),
    fetchCSVReport('appointment', carrierToken),
    fetchCSVReport('contract', carrierToken),
    fetchCSVReport('agent', carrierToken)
  ]);

  // Fetch individual producer profiles with rate limiting
  const profilePromises = Promise.allSettled(
    mrfgProducerIds.map(async (producerId, index) => {
      // Add staggered delay for rate limiting
      await sleep(index * RATE_LIMIT_MS);
      return {
        id: producerId,
        profile: await fetchEnhancedProducerProfile(producerId, token)
      };
    })
  );

  const [csvResults, profileResults] = await Promise.all([csvPromises, profilePromises]);

  // Process CSV results
  const csvReports = {
    licenses: csvResults[0].status === 'fulfilled' ? csvResults[0].value : '',
    appointments: csvResults[1].status === 'fulfilled' ? csvResults[1].value : '',
    contracts: csvResults[2].status === 'fulfilled' ? csvResults[2].value : '',
    agents: csvResults[3].status === 'fulfilled' ? csvResults[3].value : ''
  };

  // Process profile results
  const profiles = new Map<number, EnhancedProducerProfile>();
  profileResults.forEach(result => {
    if (result.status === 'fulfilled') {
      profiles.set(result.value.id, result.value.profile);
    }
  });

  console.log(`✅ Bulk MRFG data fetch complete:`, {
    profiles: profiles.size,
    csvReports: Object.keys(csvReports).filter(key => csvReports[key as keyof typeof csvReports]).length
  });

  return { profiles, csvReports };
}

// Utility function to create auth token from environment variables
// Utility function to create auth token from environment variables
// Supports dual admin accounts for MRFG: 'equita' (primary) and 'quility' (secondary)
export function createAuthToken(account: 'equita' | 'quility' = 'equita'): string {
  // Prefer new dual-account vars; fall back to legacy single-account vars for backward compatibility
  let user: string | undefined;
  let pass: string | undefined;

  if (account === 'quility') {
    user = import.meta.env.VITE_SURELC_USER_QUILITY;
    pass = import.meta.env.VITE_SURELC_PASS_QUILITY;
  } else {
    user = import.meta.env.VITE_SURELC_USER_EQUITA || import.meta.env.VITE_SURELC_USER;
    pass = import.meta.env.VITE_SURELC_PASS_EQUITA || import.meta.env.VITE_SURELC_PASS;
  }

  if (!user || !pass) {
    const which = account === 'quility' ? 'Quility' : 'Equita';
    throw new Error(`Missing SureLC credentials for ${which}. Check your .env variables.`);
  }

  return authHeader(user, pass);
}

// === CARRIER HIERARCHY UPLOAD APIs ===

/**
 * Upload carrier hierarchy file (Excel/CSV)
 * POST /carrier/uploadHierarchy
 */
export async function uploadHierarchyFile(
  file: File,
  token: string
): Promise<HierarchyUploadResult> {
  try {
    console.log(`📤 Uploading hierarchy file: ${file.name} (${file.size} bytes)`);
    
    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);
    
    // Use local proxy in development, serverless function in production
    const baseUrl = import.meta.env.DEV 
      ? '/api' 
      : (import.meta.env.VITE_API_PROXY || '/api/proxy?path=');
    
    const res = await fetch(`${baseUrl}/carrier/uploadHierarchy`, {
      method: 'POST',
      headers: { 
        'Authorization': token
        // Don't set Content-Type - let browser set it with boundary for FormData
      },
      body: formData
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    
    const result = await res.json() as HierarchyUploadResult;
    console.log(`✅ Upload initiated successfully:`, result);
    
    return result;
  } catch (error) {
    console.error(`❌ Error uploading hierarchy file:`, error);
    throw error;
  }
}

/**
 * Get hierarchy upload status
 * GET /carrier/uploadHierarchy/{id}
 */
export async function getHierarchyUploadStatus(
  uploadId: string,
  token: string,
  carrierId?: number
): Promise<HierarchyUploadStatus> {
  try {
    console.log(`📊 Checking upload status for ID: ${uploadId}${carrierId ? ` with carrierId: ${carrierId}` : ''}`);
    
    // Try with carrierId as query parameter if provided
    const url = carrierId 
      ? `/carrier/uploadHierarchy/${uploadId}?carrierId=${carrierId}`
      : `/carrier/uploadHierarchy/${uploadId}`;
    
    const result = await getJSON<HierarchyUploadStatus>(url, token);
    console.log(`📈 Upload status:`, result);
    
    return result;
  } catch (error) {
    console.error(`❌ Error fetching upload status for ${uploadId}:`, error);
    throw error;
  }
}

/**
 * Monitor upload progress with polling
 */
export async function monitorUploadProgress(
  uploadId: string,
  token: string,
  onProgress?: (status: HierarchyUploadStatus) => void,
  pollInterval = 2000
): Promise<HierarchyUploadStatus> {
  console.log(`🔄 Starting upload monitoring for ID: ${uploadId}`);
  
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getHierarchyUploadStatus(uploadId, token);
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress(status);
        }
        
        // Check if upload is complete
        if (status.status === 'completed' || status.status === 'failed') {
          console.log(`✅ Upload monitoring complete: ${status.status}`);
          resolve(status);
          return;
        }
        
        // Continue polling
        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error(`❌ Error during upload monitoring:`, error);
        reject(error);
      }
    };
    
    // Start polling
    poll();
  });
}

/**
 * Validate hierarchy file before upload
 */
export function validateHierarchyFile(file: File): FileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check file type
  const validTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv'
  ];
  
  const validExtensions = ['.xls', '.xlsx', '.csv'];
  const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  
  if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
    errors.push('Invalid file type. Please upload an Excel (.xls, .xlsx) or CSV file.');
  }
  
  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    errors.push(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed size of 10MB.`);
  }
  
  // Check if file is empty
  if (file.size === 0) {
    errors.push('File is empty. Please select a valid file.');
  }
  
  // Warnings for large files
  if (file.size > 5 * 1024 * 1024) { // 5MB
    warnings.push('Large file detected. Upload may take several minutes to process.');
  }
  
  // Determine file type
  let fileType: 'excel' | 'csv' | undefined;
  if (fileExtension === '.csv' || file.type === 'text/csv' || file.type === 'application/csv') {
    fileType = 'csv';
  } else if (fileExtension === '.xls' || fileExtension === '.xlsx' || 
             file.type.includes('excel') || file.type.includes('spreadsheet')) {
    fileType = 'excel';
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fileType
  };
}

/**
 * Create carrier auth token using existing SureLC credentials
 */
export function createCarrierAuthToken(): string {
  // Try to use existing SureLC credentials (Equita first, then Quility, then fallback)
  const user = import.meta.env.VITE_SURELC_USER_EQUITA || 
               import.meta.env.VITE_SURELC_USER_QUILITY || 
               import.meta.env.VITE_SURELC_USER;
  const pass = import.meta.env.VITE_SURELC_PASS_EQUITA || 
               import.meta.env.VITE_SURELC_PASS_QUILITY || 
               import.meta.env.VITE_SURELC_PASS;
  
  if (!user || !pass) {
    throw new Error('Missing SureLC credentials in environment variables. Please set VITE_SURELC_USER_EQUITA/VITE_SURELC_PASS_EQUITA or VITE_SURELC_USER/VITE_SURELC_PASS');
  }
  
  return authHeader(user, pass);
}

/**
 * Upload hierarchy with full workflow (upload + monitoring)
 */
export async function uploadHierarchyWithMonitoring(
  file: File,
  token: string,
  onProgress?: (status: HierarchyUploadStatus) => void
): Promise<HierarchyUploadStatus> {
  try {
    // Validate file first
    const validation = validateHierarchyFile(file);
    if (!validation.isValid) {
      throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Show warnings if any
    if (validation.warnings.length > 0) {
      console.warn('File validation warnings:', validation.warnings);
    }
    
    // Upload file
    const uploadResult = await uploadHierarchyFile(file, token);
    
    // Monitor progress
    const finalStatus = await monitorUploadProgress(
      uploadResult.id,
      token,
      onProgress
    );
    
    return finalStatus;
  } catch (error) {
    console.error('❌ Upload workflow failed:', error);
    throw error;
  }
}

// New functions for MRFG admin set support
export function createAuthTokenForAdminSet(set: MRFGAdminSet): string {
  return createAuthTokenForMRFGAdmin(set);
}

// Cache clearing function
export function clearAllCaches(): void {
  requestCache.clear();
  if (typeof window !== 'undefined' && (window as any).clearAPICache) {
    (window as any).clearAPICache();
  }
  console.log('🧹 All caches cleared');
}
