I'll create a detailed step-by-step guide for implementing Option 1 with your new username and password. Let me first examine your current setup more closely to provide the most accurate implementation steps.


[2 tools called]

Now let me check the current createAuthToken function:


[1 tool called]

Perfect! Now I have a complete understanding of your current setup. Here's your detailed step-by-step implementation guide:

# Complete Implementation Guide: Adding Second Username/Password

## Step 1: Create the Credential Management System

### 1.1 Create the credentials configuration file

Create a new file: `src/lib/credentials.ts`

```typescript
export type CredentialSet = 'MRFG' | 'SECONDARY';

export interface CredentialConfig {
  username: string;
  password: string;
  firmId: number;
  displayName: string;
}

export function getCredentialConfig(set: CredentialSet): CredentialConfig {
  switch (set) {
    case 'MRFG':
      return {
        username: import.meta.env.VITE_SURELC_USER_MRFG || import.meta.env.VITE_SURELC_USER || '',
        password: import.meta.env.VITE_SURELC_PASS_MRFG || import.meta.env.VITE_SURELC_PASS || '',
        firmId: parseInt(import.meta.env.VITE_FIRM_ID_MRFG || import.meta.env.VITE_FIRM_ID || '323'),
        displayName: 'Major Revolution Financial Group'
      };
    case 'SECONDARY':
      return {
        username: import.meta.env.VITE_SURELC_USER_SECONDARY || '',
        password: import.meta.env.VITE_SURELC_PASS_SECONDARY || '',
        firmId: parseInt(import.meta.env.VITE_FIRM_ID_SECONDARY || '0'),
        displayName: 'Secondary Firm'
      };
    default:
      throw new Error(`Unknown credential set: ${set}`);
  }
}

export function getActiveCredentialSet(): CredentialSet {
  const active = import.meta.env.VITE_ACTIVE_CREDENTIAL_SET as CredentialSet;
  return active || 'MRFG';
}

export function createAuthTokenForSet(set: CredentialSet): string {
  const config = getCredentialConfig(set);
  
  if (!config.username || !config.password) {
    throw new Error(`Missing credentials for ${set} set`);
  }
  
  return 'Basic ' + btoa(`${config.username}:${config.password}`);
}
```

## Step 2: Update Your Environment Variables

### 2.1 Create/Update your `.env` file

Create a `.env` file in your project root (if it doesn't exist) with the following structure:

```env
# Current MRFG Credentials (Primary - your working credentials)
VITE_SURELC_USER_MRFG=your_current_mrfg_username
VITE_SURELC_PASS_MRFG=your_current_mrfg_password
VITE_FIRM_ID_MRFG=323

# New Secondary Credentials (your new username/password)
VITE_SURELC_USER_SECONDARY=your_new_username
VITE_SURELC_PASS_SECONDARY=your_new_password
VITE_FIRM_ID_SECONDARY=your_new_firm_id

# Active credential set (controls which one to use)
VITE_ACTIVE_CREDENTIAL_SET=MRFG

# Other existing variables (keep these as they are)
VITE_INITIAL_SNAPSHOT_DATE=2000-01-01T00:00:00Z
VITE_PAGE_LIMIT=1000
```

**Important Notes:**
- Replace `your_current_mrfg_username` and `your_current_mrfg_password` with your working MRFG credentials
- Replace `your_new_username`, `your_new_password`, and `your_new_firm_id` with your new credentials
- The `VITE_ACTIVE_CREDENTIAL_SET` controls which credential set is currently active

## Step 3: Update the API Layer

### 3.1 Modify `src/lib/api.ts`

Add these imports at the top of the file (around line 1):

```typescript
import type { GARelation, Producer, ProducerLabel, HierarchyUploadResult, HierarchyUploadStatus, FileValidationResult } from './types';
import { getActiveCredentialSet, createAuthTokenForSet, type CredentialSet } from './credentials';
```

### 3.2 Update the createAuthToken function

Replace the existing `createAuthToken` function (around line 712) with:

```typescript
// Utility function to create auth token from environment variables
export function createAuthToken(): string {
  const activeSet = getActiveCredentialSet();
  return createAuthTokenForSet(activeSet);
}

// New function for specific credential sets
export function createAuthTokenForCredentialSet(set: CredentialSet): string {
  return createAuthTokenForSet(set);
}
```

## Step 4: Create the Credential Switcher Component

### 4.1 Create `src/components/CredentialSwitcher.tsx`

```typescript
import React, { useState } from 'react';
import { Settings, Building2, ChevronDown, Check } from 'lucide-react';
import { getCredentialConfig, type CredentialSet } from '../lib/credentials';
import './CredentialSwitcher.css';

interface CredentialSwitcherProps {
  onCredentialChange: (set: CredentialSet) => void;
  currentSet: CredentialSet;
}

export default function CredentialSwitcher({ onCredentialChange, currentSet }: CredentialSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const credentialSets: CredentialSet[] = ['MRFG', 'SECONDARY'];
  
  const handleSetChange = (set: CredentialSet) => {
    onCredentialChange(set);
    setIsOpen(false);
  };
  
  return (
    <div className="credential-switcher">
      <button 
        className="credential-switcher-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch between credential sets"
      >
        <Building2 size={16} />
        <span className="credential-name">{getCredentialConfig(currentSet).displayName}</span>
        <ChevronDown size={14} className={`chevron ${isOpen ? 'open' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="credential-switcher-dropdown">
          {credentialSets.map(set => (
            <button
              key={set}
              className={`credential-option ${set === currentSet ? 'active' : ''}`}
              onClick={() => handleSetChange(set)}
            >
              <Building2 size={14} />
              <span>{getCredentialConfig(set).displayName}</span>
              {set === currentSet && <Check size={14} className="check-icon" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4.2 Create `src/components/CredentialSwitcher.css`

```css
.credential-switcher {
  position: relative;
  display: inline-block;
}

.credential-switcher-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #495057;
  transition: all 0.2s ease;
}

.credential-switcher-button:hover {
  background: #e9ecef;
  border-color: #adb5bd;
}

.credential-name {
  font-weight: 500;
}

.chevron {
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.credential-switcher-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  margin-top: 4px;
}

.credential-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  color: #495057;
  transition: background-color 0.2s ease;
}

.credential-option:hover {
  background: #f8f9fa;
}

.credential-option.active {
  background: #e3f2fd;
  color: #1976d2;
  font-weight: 500;
}

.check-icon {
  margin-left: auto;
  color: #1976d2;
}
```

## Step 5: Update the Main App Component

### 5.1 Modify `src/App.tsx`

Replace the entire content with:

```typescript
import { useState, useEffect } from 'react';
import OrgChart from './components/OrgChart';
import CredentialSwitcher from './components/CredentialSwitcher';
import { createAuthToken, createAuthTokenForCredentialSet } from './lib/api';
import { getCredentialConfig, getActiveCredentialSet, type CredentialSet } from './lib/credentials';
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
  const [activeCredentialSet, setActiveCredentialSet] = useState<CredentialSet>(getActiveCredentialSet());
  const [isLoading, setIsLoading] = useState(false);
  
  // Get configuration from current credential set
  const config = getCredentialConfig(activeCredentialSet);
  
  const handleCredentialChange = async (set: CredentialSet) => {
    setIsLoading(true);
    try {
      // Test the new credentials before switching
      createAuthTokenForCredentialSet(set);
      setActiveCredentialSet(set);
      
      // Reload the page to refresh all data with new credentials
      window.location.reload();
    } catch (error) {
      console.error('Failed to switch credentials:', error);
      alert(`Failed to switch to ${getCredentialConfig(set).displayName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
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
        <p>Please set up your environment variables for {config.displayName}:</p>
        <ul>
          <li>VITE_SURELC_USER_{activeCredentialSet} - Your SureLC username</li>
          <li>VITE_SURELC_PASS_{activeCredentialSet} - Your SureLC password</li>
          <li>VITE_FIRM_ID_{activeCredentialSet} - Your firm/agency ID</li>
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
        <p>Please check your SureLC credentials for {config.displayName} in the environment variables.</p>
        <p>Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>Hierarchy Management System</h1>
          <div className="header-controls">
            <CredentialSwitcher 
              onCredentialChange={handleCredentialChange}
              currentSet={activeCredentialSet}
            />
            {isLoading && <div className="loading-indicator">Switching...</div>}
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

### 5.2 Update `src/App.css`

Add these styles to your existing `App.css`:

```css
/* Add to your existing App.css */

.app-header {
  background: #fff;
  border-bottom: 1px solid #dee2e6;
  padding: 1rem 0;
  margin-bottom: 1rem;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-content h1 {
  margin: 0;
  color: #495057;
  font-size: 1.5rem;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.loading-indicator {
  color: #6c757d;
  font-size: 0.875rem;
  font-style: italic;
}

.app-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}
```

## Step 6: Testing and Validation

### 6.1 Test Your Implementation

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Verify the credential switcher appears** in the top-right corner of your app

3. **Test switching between credentials:**
   - Click the credential switcher dropdown
   - Try switching to your new credentials
   - Verify the page reloads and shows data from the new firm

4. **Check browser console** for any errors during the switch

### 6.2 Troubleshooting Common Issues

**Issue: "Missing credentials" error**
- **Solution:** Double-check your `.env` file has the correct variable names
- **Check:** Ensure no extra spaces or quotes around your credentials

**Issue: "Authentication Error" after switching**
- **Solution:** Verify your new username/password are correct
- **Check:** Test the credentials manually with a tool like Postman

**Issue: No data showing after switch**
- **Solution:** Check if the new firm ID is correct
- **Check:** Verify the new firm has data in the SureLC system

**Issue: Credential switcher not appearing**
- **Solution:** Check browser console for import errors
- **Check:** Ensure all new files were created correctly

## Step 7: Production Deployment

### 7.1 Update Vercel Environment Variables

If you're using Vercel for deployment:

1. Go to your Vercel dashboard
2. Navigate to your project settings
3. Go to "Environment Variables"
4. Add all the new environment variables:
   - `VITE_SURELC_USER_MRFG`
   - `VITE_SURELC_PASS_MRFG`
   - `VITE_FIRM_ID_MRFG`
   - `VITE_SURELC_USER_SECONDARY`
   - `VITE_SURELC_PASS_SECONDARY`
   - `VITE_FIRM_ID_SECONDARY`
   - `VITE_ACTIVE_CREDENTIAL_SET`

### 7.2 Deploy and Test

1. **Deploy your changes:**
   ```bash
   git add .
   git commit -m "Add dual credential support"
   git push
   ```

2. **Test in production** to ensure everything works correctly

## Summary of Changes Made

1. ✅ **Created credential management system** (`src/lib/credentials.ts`)
2. ✅ **Updated API layer** to support multiple credential sets
3. ✅ **Created credential switcher component** with UI
4. ✅ **Modified main App component** to handle credential switching
5. ✅ **Added proper error handling** and validation
6. ✅ **Updated styling** for the new UI elements

## What You Need to Do

1. **Create the files** as shown above
2. **Update your `.env`** with both sets of credentials
3. **Test the implementation** in development
4. **Deploy to production** and update environment variables

After completing these steps, you'll have a fully functional system that can switch between your MRFG credentials and your new secondary credentials with a simple dropdown in the UI!