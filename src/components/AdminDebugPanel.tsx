import { useState } from 'react';
import { Bug, Play, CheckCircle, XCircle, AlertTriangle, Building2, Database } from 'lucide-react';
import { compareAdminSets, quickAdminTest, type AdminTestResult } from '../utils/adminComparisonTest';
import { createAuthToken } from '../lib/api';
import { testAllHierarchyDataEndpoints } from '../utils/apiTest';
import './AdminDebugPanel.css';

interface AdminDebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminDebugPanel({ isOpen, onClose }: AdminDebugPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isAllHierarchyDataTestRunning, setIsAllHierarchyDataTestRunning] = useState(false);
  const [allHierarchyDataTestResult, setAllHierarchyDataTestResult] = useState<any>(null);
  const [results, setResults] = useState<{
    equita: AdminTestResult;
    quility: AdminTestResult;
    comparison: any;
  } | null>(null);

  const runComparison = async () => {
    setIsRunning(true);
    try {
      const testResults = await compareAdminSets();
      setResults(testResults);
    } catch (error) {
      console.error('Debug test failed:', error);
    } finally {
      setIsRunning(false);
    }
  };



  const runAllHierarchyDataTest = async () => {
    setIsAllHierarchyDataTestRunning(true);
    setAllHierarchyDataTestResult(null);
    try {
      const result = await testAllHierarchyDataEndpoints();
      setAllHierarchyDataTestResult(result);
    } catch (error) {
      console.error('All hierarchy data test failed:', error);
      setAllHierarchyDataTestResult({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsAllHierarchyDataTestRunning(false);
    }
  };

  const runQuickTest = async () => {
    setIsRunning(true);
    try {
      await quickAdminTest();
      // Re-run comparison to get results for display
      const testResults = await compareAdminSets();
      setResults(testResults);
    } catch (error) {
      console.error('Quick test failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="admin-debug-overlay">
      <div className="admin-debug-panel">
        <div className="debug-header">
          <h2>🔍 Admin Set Debug Panel</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <div className="debug-controls">
          <button 
            onClick={runQuickTest} 
            disabled={isRunning}
            className="debug-button primary"
          >
            <Play size={16} />
            Quick Test (Console)
          </button>
          <button 
            onClick={runComparison} 
            disabled={isRunning}
            className="debug-button secondary"
          >
            <Bug size={16} />
            Full Comparison
          </button>
          <button 
            onClick={runAllHierarchyDataTest} 
            disabled={isAllHierarchyDataTestRunning}
            className="debug-button primary"
          >
            <Database size={16} />
            Test All Hierarchy Data
          </button>
        </div>

        {(isRunning || isAllHierarchyDataTestRunning) && (
          <div className="debug-loading">
            <div className="spinner"></div>
            <p>
              {isAllHierarchyDataTestRunning ? 'Testing all hierarchy data endpoints...' : 
               'Running tests...'}
            </p>
          </div>
        )}

        {results && (
          <div className="debug-results">
            <h3>Test Results</h3>
            
            <div className="result-summary">
              <div className={`result-item ${results.comparison.bothWorking ? 'success' : 'error'}`}>
                {results.comparison.bothWorking ? <CheckCircle size={20} /> : <XCircle size={20} />}
                <span>Both Admin Sets Working</span>
              </div>
              
              {results.comparison.bothWorking && (
                <>
                  <div className={`result-item ${results.comparison.sameProducerCount ? 'success' : 'warning'}`}>
                    {results.comparison.sameProducerCount ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                    <span>Same Producer Count</span>
                  </div>
                  
                  <div className={`result-item ${results.comparison.sameFirmIds ? 'success' : 'warning'}`}>
                    {results.comparison.sameFirmIds ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                    <span>Same Firm IDs</span>
                  </div>
                </>
              )}
            </div>

            <div className="detailed-results">
              <div className="admin-result">
                <h4>Equita Results</h4>
                <div className="result-details">
                  <p><strong>Status:</strong> {results.equita.success ? '✅ Success' : '❌ Failed'}</p>
                  {results.equita.success && results.equita.data && (
                    <>
                      <p><strong>Relations:</strong> {results.equita.data.relationsCount}</p>
                      <p><strong>Firm IDs:</strong> {results.equita.data.uniqueGaIds.join(', ')}</p>
                      <p><strong>Duration:</strong> {results.equita.data.testDuration}ms</p>
                    </>
                  )}
                  {results.equita.error && (
                    <p><strong>Error:</strong> {results.equita.error}</p>
                  )}
                </div>
              </div>

              <div className="admin-result">
                <h4>Quility Results</h4>
                <div className="result-details">
                  <p><strong>Status:</strong> {results.quility.success ? '✅ Success' : '❌ Failed'}</p>
                  {results.quility.success && results.quility.data && (
                    <>
                      <p><strong>Relations:</strong> {results.quility.data.relationsCount}</p>
                      <p><strong>Firm IDs:</strong> {results.quility.data.uniqueGaIds.join(', ')}</p>
                      <p><strong>Duration:</strong> {results.quility.data.testDuration}ms</p>
                    </>
                  )}
                  {results.quility.error && (
                    <p><strong>Error:</strong> {results.quility.error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="debug-conclusion">
              <h4>🔍 Analysis</h4>
              {results.comparison.bothWorking ? (
                results.comparison.dataDifference ? (
                  <div className="conclusion warning">
                    <AlertTriangle size={20} />
                    <div>
                      <strong>API Issue Detected:</strong> Both admin sets work but return different data.
                      This suggests the admin sets access different datasets or have different permissions.
                    </div>
                  </div>
                ) : (
                  <div className="conclusion success">
                    <CheckCircle size={20} />
                    <div>
                      <strong>UI Issue Likely:</strong> Both admin sets return identical data.
                      The problem is likely in the UI switching logic or state management.
                    </div>
                  </div>
                )
              ) : (
                <div className="conclusion error">
                  <XCircle size={20} />
                  <div>
                    <strong>Authentication Issue:</strong> One or both admin sets are failing.
                    Check credentials and network connectivity.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {allHierarchyDataTestResult && (
          <div className="debug-results">
            <h3>All Hierarchy Data Test Results</h3>
            <div className="result-summary">
              <div className={`result-item ${allHierarchyDataTestResult.success ? 'success' : 'error'}`}>
                {allHierarchyDataTestResult.success ? <CheckCircle size={20} /> : <XCircle size={20} />}
                <span>Comprehensive Data Test</span>
              </div>
            </div>
            <div className="result-details">
              <p><strong>Test Result:</strong> {allHierarchyDataTestResult.success ? '✅ Success' : '❌ Failed'}</p>
              
              {allHierarchyDataTestResult.firmRelations && (
                <div className="test-section">
                  <h4>📊 Firm Relationships</h4>
                  <p><strong>Status:</strong> {allHierarchyDataTestResult.firmRelations.success ? '✅ Success' : '❌ Failed'}</p>
                  {allHierarchyDataTestResult.firmRelations.success && (
                    <p><strong>Records:</strong> {allHierarchyDataTestResult.firmRelations.count} available</p>
                  )}
                  {allHierarchyDataTestResult.firmRelations.error && (
                    <p><strong>Error:</strong> {allHierarchyDataTestResult.firmRelations.error}</p>
                  )}
                </div>
              )}
              
              {allHierarchyDataTestResult.producerRelations && (
                <div className="test-section">
                  <h4>👤 Producer Relationships</h4>
                  <p><strong>Status:</strong> {allHierarchyDataTestResult.producerRelations.success ? '✅ Success' : '❌ Failed'}</p>
                  {allHierarchyDataTestResult.producerRelations.success && (
                    <p><strong>Producer ID:</strong> {allHierarchyDataTestResult.producerRelations.producerId}</p>
                  )}
                  {allHierarchyDataTestResult.producerRelations.error && (
                    <p><strong>Error:</strong> {allHierarchyDataTestResult.producerRelations.error}</p>
                  )}
                </div>
              )}
              
              {allHierarchyDataTestResult.csvReports && Object.keys(allHierarchyDataTestResult.csvReports).length > 0 && (
                <div className="test-section">
                  <h4>📋 CSV Reports</h4>
                  {Object.entries(allHierarchyDataTestResult.csvReports).map(([type, result]: [string, any]) => (
                    <div key={type} className="csv-report-item">
                      <p><strong>{type.toUpperCase()}:</strong> {result.success ? `✅ ${result.lineCount} lines` : `❌ ${result.error}`}</p>
                    </div>
                  ))}
                </div>
              )}
              
              {allHierarchyDataTestResult.firmDetails && (
                <div className="test-section">
                  <h4>🏢 Firm Details</h4>
                  <p><strong>Status:</strong> {allHierarchyDataTestResult.firmDetails.success ? '✅ Success' : '❌ Failed'}</p>
                  {allHierarchyDataTestResult.firmDetails.success && (
                    <p><strong>Firm ID:</strong> {allHierarchyDataTestResult.firmDetails.firmId}</p>
                  )}
                  {allHierarchyDataTestResult.firmDetails.error && (
                    <p><strong>Error:</strong> {allHierarchyDataTestResult.firmDetails.error}</p>
                  )}
                </div>
              )}
              
              {allHierarchyDataTestResult.producerDetails && (
                <div className="test-section">
                  <h4>👨‍💼 Producer Details</h4>
                  <p><strong>Status:</strong> {allHierarchyDataTestResult.producerDetails.success ? '✅ Success' : '❌ Failed'}</p>
                  {allHierarchyDataTestResult.producerDetails.success && (
                    <p><strong>Producer ID:</strong> {allHierarchyDataTestResult.producerDetails.producerId}</p>
                  )}
                  {allHierarchyDataTestResult.producerDetails.error && (
                    <p><strong>Error:</strong> {allHierarchyDataTestResult.producerDetails.error}</p>
                  )}
                </div>
              )}
              
              {allHierarchyDataTestResult.error && (
                <p><strong>Overall Error:</strong> {allHierarchyDataTestResult.error}</p>
              )}
            </div>
          </div>
        )}


        <div className="debug-instructions">
          <h4>📋 How to Use</h4>
          <ol>
            <li><strong>Quick Test:</strong> Runs tests and logs detailed results to browser console</li>
            <li><strong>Full Comparison:</strong> Shows results in this panel</li>
            <li><strong>Check Console:</strong> Open browser DevTools (F12) to see detailed logs</li>
            <li><strong>Compare Results:</strong> Look for differences in relation counts and firm IDs</li>
          </ol>
        </div>
      </div>
    </div>
  );
}



