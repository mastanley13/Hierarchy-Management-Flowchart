export type MRFGAdminSet = 'EQUITA' | 'QUILITY';

export interface MRFGCredentialConfig {
  username: string;
  password: string;
  firmId: number;
  displayName: string;
  portalName: string;
}

export function getMRFGCredentialConfig(set: MRFGAdminSet): MRFGCredentialConfig {
  switch (set) {
    case 'EQUITA':
      return {
        username: import.meta.env.VITE_SURELC_USER_EQUITA || import.meta.env.VITE_SURELC_USER || '',
        password: import.meta.env.VITE_SURELC_PASS_EQUITA || import.meta.env.VITE_SURELC_PASS || '',
        firmId: parseInt(import.meta.env.VITE_FIRM_ID_EQUITA || import.meta.env.VITE_FIRM_ID || '323'),
        displayName: 'Major Revolution Financial Group',
        portalName: 'Equita SureLC Access'
      };
    case 'QUILITY':
      return {
        username: import.meta.env.VITE_SURELC_USER_QUILITY || '',
        password: import.meta.env.VITE_SURELC_PASS_QUILITY || '',
        firmId: parseInt(import.meta.env.VITE_FIRM_ID_QUILITY || import.meta.env.VITE_FIRM_ID_EQUITA || import.meta.env.VITE_FIRM_ID || '323'),
        displayName: 'Major Revolution Financial Group',
        portalName: 'Quility SureLC Access'
      };
    default:
      throw new Error(`Unknown MRFG admin set: ${set}`);
  }
}

export function getActiveMRFGAdminSet(): MRFGAdminSet {
  const active = import.meta.env.VITE_ACTIVE_MRFG_ADMIN as MRFGAdminSet;
  return active || 'EQUITA'; // Default to Equita (current working setup)
}

export function createAuthTokenForMRFGAdmin(set: MRFGAdminSet): string {
  const config = getMRFGCredentialConfig(set);
  
  if (!config.username || !config.password) {
    throw new Error(`Missing credentials for ${config.portalName}`);
  }
  
  return 'Basic ' + btoa(`${config.username}:${config.password}`);
}

// Cache clearing utility
export function clearAPICache(): void {
  // This will be implemented in the API layer
  if (typeof window !== 'undefined' && (window as any).clearAPICache) {
    (window as any).clearAPICache();
  }
}








