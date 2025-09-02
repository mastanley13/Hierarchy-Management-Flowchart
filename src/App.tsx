import { useState } from 'react';
import OrgChart from './components/OrgChart';
import { createAuthToken } from './lib/api';
import './App.css';

function App() {
  const [selectedProducerId, setSelectedProducerId] = useState<number | null>(null);

  // Get configuration from environment variables
  const firmId = parseInt(import.meta.env.VITE_FIRM_ID || '323'); // Default to firm 323
  const initialDate = import.meta.env.VITE_INITIAL_SNAPSHOT_DATE || '2000-01-01T00:00:00Z';
  const pageLimit = parseInt(import.meta.env.VITE_PAGE_LIMIT || '500');

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
          <li>VITE_SURELC_USER - Your SureLC username</li>
          <li>VITE_SURELC_PASS - Your SureLC password</li>
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
    </div>
  );
}

export default App;