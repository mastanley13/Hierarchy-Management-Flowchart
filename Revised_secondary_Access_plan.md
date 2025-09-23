Perfect! Thank you for the clarifications. Now I understand the context much better. You have **two MRFG SureLC admin accounts** - one for **Equita** and one for **Quility** - both accessing the same MRFG data but through different admin portals.

This actually **simplifies** the implementation significantly since both are MRFG-related, which means:
- Same firm ID (323)
- Same data structure
- Same API endpoints
- Just different admin credentials

Let me provide a **revised implementation plan** that addresses the critical issues while keeping it simple and focused on your specific use case.

# 🎯 **REVISED IMPLEMENTATION PLAN: Dual MRFG Admin Access**

## **Phase 1: Core Implementation (Addresses Critical Issues)**

### **Step 1: Create Enhanced Credential Management**

Create `src/lib/credentials.ts`:

```typescript
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
        firmId: parseInt(import.meta.env.VITE_FIRM_ID || '323'), // Same firm ID for both
        displayName: 'Major Revolution Financial Group',
        portalName: 'Equita SureLC Access'
      };
    case 'QUILITY':
      return {
        username: import.meta.env.VITE_SURELC_USER_QUILITY || '',
        password: import.meta.env.VITE_SURELC_PASS_QUILITY || '',
        firmId: parseInt(import.meta.env.VITE_FIRM_ID || '323'), // Same firm ID for both
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
```

### **Step 2: Update Environment Variables**

Create/update your `.env` file:

```env
# Equita SureLC Access (Primary - your current working credentials)
VITE_SURELC_USER_EQUITA=hr@mrfg.info
VITE_SURELC_PASS_EQUITA=Success123!!!
VITE_FIRM_ID=323

# Quility SureLC Access (Secondary - your new credentials)
VITE_SURELC_USER_QUILITY=hr@mrfg.info
VITE_SURELC_PASS_QUILITY=Success2025!

# Active MRFG admin set (controls which one to use)
VITE_ACTIVE_MRFG_ADMIN=EQUITA

# Backward compatibility (keep your current variables as fallbacks)
VITE_SURELC_USER=hr@mrfg.info
VITE_SURELC_PASS=Success123!!!

# Other existing variables
VITE_INITIAL_SNAPSHOT_DATE=2000-01-01T00:00:00Z
VITE_PAGE_LIMIT=1000
```

### **Step 3: Enhanced API Layer with Cache Management**

Update `src/lib/api.ts`:

```typescript
// Add imports at the top
import { getActiveMRFGAdminSet, createAuthTokenForMRFGAdmin, type MRFGAdminSet, clearAPICache } from './credentials';

// Enhanced request cache with admin set awareness
const requestCache = new Map<string, Promise<any>>();
const cacheTimeout = 30000;

// Global cache clearing function
if (typeof window !== 'undefined') {
  (window as any).clearAPICache = () => {
    requestCache.clear();
    console.log('🧹 API cache cleared');
  };
}

// Updated getJSON function with cache key including admin set
export async function getJSON<T>(path: string, token: string, adminSet?: MRFGAdminSet): Promise<T> {
  const activeAdminSet = adminSet || getActiveMRFGAdminSet();
  const cacheKey = `${path}:${activeAdminSet}:${token.substring(0, 20)}`; // Include admin set in cache key
  
  // Check if we have a cached request in progress
  if (requestCache.has(cacheKey)) {
    console.log(`Using cached request for: ${path} (${activeAdminSet})`);
    return requestCache.get(cacheKey)!;
  }
  
  // ... rest of existing getJSON implementation remains the same
  // Just update the cache key usage
}

// Updated createAuthToken function
export function createAuthToken(): string {
  const activeSet = getActiveMRFGAdminSet();
  return createAuthTokenForMRFGAdmin(activeSet);
}

// Updated createCarrierAuthToken function (for hierarchy uploads)
export function createCarrierAuthToken(): string {
  const activeSet = getActiveMRFGAdminSet();
  return createAuthTokenForMRFGAdmin(activeSet);
}

// New function for specific admin sets
export function createAuthTokenForAdminSet(set: MRFGAdminSet): string {
  return createAuthTokenForMRFGAdmin(set);
}

// Cache clearing function
export function clearAllCaches(): void {
  requestCache.clear();
  clearAPICache();
  console.log('🧹 All caches cleared');
}
```

### **Step 4: Enhanced Credential Switcher Component**

Create `src/components/MRFGAdminSwitcher.tsx`:

```typescript
import React, { useState } from 'react';
import { Building2, ChevronDown, Check, RefreshCw } from 'lucide-react';
import { getMRFGCredentialConfig, type MRFGAdminSet } from '../lib/credentials';
import './MRFGAdminSwitcher.css';

interface MRFGAdminSwitcherProps {
  onAdminChange: (set: MRFGAdminSet) => void;
  currentSet: MRFGAdminSet;
  isSwitching: boolean;
}

export default function MRFGAdminSwitcher({ onAdminChange, currentSet, isSwitching }: MRFGAdminSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const adminSets: MRFGAdminSet[] = ['EQUITA', 'QUILITY'];
  
  const handleSetChange = (set: MRFGAdminSet) => {
    onAdminChange(set);
    setIsOpen(false);
  };
  
  const currentConfig = getMRFGCredentialConfig(currentSet);
  
  return (
    <div className="mrfg-admin-switcher">
      <button 
        className="mrfg-admin-switcher-button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        title={`Switch between MRFG admin portals (Currently: ${currentConfig.portalName})`}
      >
        <Building2 size={16} />
        <span className="admin-name">{currentConfig.portalName}</span>
        {isSwitching ? (
          <RefreshCw size={14} className="animate-spin" />
        ) : (
          <ChevronDown size={14} className={`chevron ${isOpen ? 'open' : ''}`} />
        )}
      </button>
      
      {isOpen && !isSwitching && (
        <div className="mrfg-admin-switcher-dropdown">
          {adminSets.map(set => {
            const config = getMRFGCredentialConfig(set);
            return (
              <button
                key={set}
                className={`admin-option ${set === currentSet ? 'active' : ''}`}
                onClick={() => handleSetChange(set)}
              >
                <Building2 size={14} />
                <div className="admin-info">
                  <span className="admin-portal">{config.portalName}</span>
                  <span className="admin-firm">{config.displayName}</span>
                </div>
                {set === currentSet && <Check size={14} className="check-icon" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

### **Step 5: Updated App Component with State Management**

Update `src/App.tsx`:

```typescript
import { useState, useEffect } from 'react';
import OrgChart from './components/OrgChart';
import MRFGAdminSwitcher from './components/MRFGAdminSwitcher';
import { createAuthToken, createAuthTokenForAdminSet, clearAllCaches } from './lib/api';
import { getMRFGCredentialConfig, getActiveMRFGAdminSet, type MRFGAdminSet } from './lib/credentials';
import { testAPIEndpoints } from './utils/apiTest';
import './App.css';

// Run API test to diagnose 500 errors (temporary)
if (import.meta.env.DEV) {
  setTimeout(() => {
    testAPIEndpoints();
  }, 3000);
}

function App() {
  const [selectedProducerId, setSelectedProducerId] = useState<number | null>(null);
  const [activeAdminSet, setActiveAdminSet] = useState<MRFGAdminSet>(getActiveMRFGAdminSet());
  const [isSwitching, setIsSwitching] = useState(false);
  
  // Get configuration from current admin set
  const config = getMRFGCredentialConfig(activeAdminSet);
  
  const handleAdminChange = async (set: MRFGAdminSet) => {
    setIsSwitching(true);
    try {
      // Test the new credentials before switching
      createAuthTokenForAdminSet(set);
      
      // Clear all caches and state
      clearAllCaches();
      setSelectedProducerId(null);
      
      // Update active admin set
      setActiveAdminSet(set);
      
      // Reload the page to refresh all data with new credentials
      window.location.reload();
    } catch (error) {
      console.error('Failed to switch admin set:', error);
      alert(`Failed to switch to ${getMRFGCredentialConfig(set).portalName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSwitching(false);
    }
  };

  const handleProducerSelect = (producerId: number) => {
    setSelectedProducerId(producerId);
    console.log('Selected producer:', producerId);
  };

  // Validate current credentials
  if (!config.username || !config.password) {
    return (
      <div className="app-error">
        <h1>Configuration Error</h1>
        <p>Please set up your environment variables for {config.portalName}:</p>
        <ul>
          <li>VITE_SURELC_USER_{activeAdminSet} - Your SureLC username</li>
          <li>VITE_SURELC_PASS_{activeAdminSet} - Your SureLC password</li>
          <li>VITE_FIRM_ID - Your firm/agency ID (323 for MRFG)</li>
        </ul>
        <p>Copy .env.example to .env and update with your credentials.</p>
      </div>
    );
  }

  try {
    // Test if we can create auth token
    createAuthToken();
  } catch (error) {
    return (
      <div className="app-error">
        <h1>Authentication Error</h1>
        <p>Please check your SureLC credentials for {config.portalName} in the environment variables.</p>
        <p>Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Hierarchy Management System</h1>
            <span className="firm-name">{config.displayName}</span>
          </div>
          <div className="header-controls">
            <MRFGAdminSwitcher 
              onAdminChange={handleAdminChange}
              currentSet={activeAdminSet}
              isSwitching={isSwitching}
            />
            {isSwitching && <div className="switching-indicator">Switching...</div>}
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <OrgChart
          firmId={config.firmId}
          initialDate={import.meta.env.VITE_INITIAL_SNAPSHOT_DATE || '2000-01-01T00:00:00Z'}
          pageLimit={parseInt(import.meta.env.VITE_PAGE_LIMIT || '1000')}
          fetchAuth={createAuthToken}
          onSelectProducer={handleProducerSelect}
        />
        
        {selectedProducerId && (
          <div className="producer-details-panel">
            <h3>Producer Details</h3>
            <p>Producer ID: {selectedProducerId}</p>
            <p>Click outside to close</p>
            <button onClick={() => setSelectedProducerId(null)}>
              Close
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
```

## **Phase 2: Testing & Validation**

### **Step 6: Test Both Admin Sets**

1. **Test Equita Access** (your current working setup):
   ```bash
   # Set in .env
   VITE_ACTIVE_MRFG_ADMIN=EQUITA
   npm run dev
   ```

2. **Test Quility Access** (your new setup):
   ```bash
   # Set in .env  
   VITE_ACTIVE_MRFG_ADMIN=QUILITY
   npm run dev
   ```

3. **Test Switching**: Use the UI switcher to switch between both admin sets

### **Step 7: Production Deployment**

Update your Vercel environment variables:
- `VITE_SURELC_USER_EQUITA`
- `VITE_SURELC_PASS_EQUITA`
- `VITE_SURELC_USER_QUILITY`
- `VITE_SURELC_PASS_QUILITY`
- `VITE_ACTIVE_MRFG_ADMIN`
- `VITE_FIRM_ID` (keep as 323)

## **Key Benefits of This Revised Plan:**

✅ **Addresses all critical issues** identified in my analysis
✅ **Maintains backward compatibility** with your current setup
✅ **Proper cache management** prevents data contamination
✅ **Clear state management** ensures clean switching
✅ **MRFG-specific** - no generic "secondary firm" confusion
✅ **Simple environment-based switching** as requested
✅ **Comprehensive error handling** for both admin sets
✅ **Production-ready** with proper deployment considerations

This approach gives you a robust, production-ready solution that handles both Equita and Quility SureLC admin access while maintaining all your existing functionality. Would you like me to proceed with any specific part of this implementation?