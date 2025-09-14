import { useState } from 'react';
import OrgChart from './components/OrgChart';
import AdminDebugPanel from './components/AdminDebugPanel';
import { createAuthToken } from './lib/api';
import { testAPIEndpoints } from './utils/apiTest';
import './utils/debugTestRunner'; // Load debug utilities
import { Bug } from 'lucide-react';
import './App.css';

// Run API test to diagnose 500 errors (temporary)
if (import.meta.env.DEV) {
  setTimeout(() => {
    testAPIEndpoints();
  }, 3000);
}

function App() {
  const [selectedProducerId, setSelectedProducerId] = useState<number | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Get configuration from environment variables
  const firmId = parseInt(import.meta.env.VITE_FIRM_ID || '323'); // Default to firm 323
  const initialDate = import.meta.env.VITE_INITIAL_SNAPSHOT_DATE || '2000-01-01T00:00:00Z';
  const pageLimit = parseInt(import.meta.env.VITE_PAGE_LIMIT || '1000');

  const handleProducerSelect = (producerId: number) => {
    setSelectedProducerId(producerId);
    console.log('Selected producer:', producerId);
    // Here you could open a details panel, navigate to a detail page, etc.
  };

  if (!firmId) {
    return (
      <div className="app-error">
        <h1>Configuration Error</h1>
        <p>Please set up your environment variables:</p>
        <ul>
          <li>VITE_FIRM_ID - Your firm/agency ID</li>
          <li>VITE_SURELC_USER_EQUITA / VITE_SURELC_PASS_EQUITA - Equita (Primary) SureLC credentials</li>
          <li>VITE_SURELC_USER_QUILITY / VITE_SURELC_PASS_QUILITY - Quility (Secondary) SureLC credentials</li>
          <li>(Optional legacy) VITE_SURELC_USER / VITE_SURELC_PASS - single-account fallback</li>
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
            <button 
              onClick={() => setShowDebugPanel(true)}
              className="debug-button"
              title="Debug admin set comparison"
            >
              <Bug size={16} />
              Debug
            </button>
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <OrgChart
          firmId={firmId}
          initialDate={initialDate}
          pageLimit={pageLimit}
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
      
      <AdminDebugPanel 
        isOpen={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
      />
    </div>
  );
}

export default App;
