import { useState } from 'react';
import OrgChart from './components/OrgChart';
import AdminDebugPanel from './components/AdminDebugPanel';
import { createAuthToken } from './lib/api';
import { testAPIEndpoints } from './utils/apiTest';
import './utils/debugTestRunner'; // Load debug utilities
import './App.css';

// Run API test to diagnose 500 errors (temporary)
if (import.meta.env.DEV) {
  setTimeout(() => {
    testAPIEndpoints();
  }, 3000);
}

function App() {
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Get configuration from environment variables
  const firmId = parseInt(
    import.meta.env.VITE_FIRM_ID_EQUITA ||
    import.meta.env.VITE_FIRM_ID ||
    '323'
  ); // Default to Equita firm 323 for backward compatibility
  const initialDate = import.meta.env.VITE_INITIAL_SNAPSHOT_DATE || '2000-01-01T00:00:00Z';
  const pageLimit = parseInt(import.meta.env.VITE_PAGE_LIMIT || '1000');


  if (!firmId) {
    return (
      <div className="app-error">
        <h1>Configuration Error</h1>
        <p>Please set up your environment variables:</p>
        <ul>
          <li>VITE_FIRM_ID_EQUITA - Equita (Primary) firm ID</li>
          <li>VITE_FIRM_ID_QUILITY - Quility (Secondary) firm ID</li>
          <li>VITE_SURELC_USER_EQUITA / VITE_SURELC_PASS_EQUITA - Equita SureLC credentials</li>
          <li>VITE_SURELC_USER_QUILITY / VITE_SURELC_PASS_QUILITY - Quility SureLC credentials</li>
          <li>(Optional legacy) VITE_SURELC_USER / VITE_SURELC_PASS / VITE_FIRM_ID - single-account fallback</li>
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
        <p>Please check your SureLC credentials in the environment variables.</p>
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
            <span className="firm-name">Major Revolution Financial Group</span>
          </div>
          <div className="header-controls">
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <OrgChart
          firmId={firmId}
          initialDate={initialDate}
          pageLimit={pageLimit}
          fetchAuth={createAuthToken}
          onOpenDebugPanel={() => setShowDebugPanel(true)}
        />
      </main>
      
      <AdminDebugPanel 
        isOpen={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
      />
    </div>
  );
}

export default App;
