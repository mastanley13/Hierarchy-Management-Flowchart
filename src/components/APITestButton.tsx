import React, { useState } from 'react';
import { Play, CheckCircle, XCircle, Loader } from 'lucide-react';
import { 
  validateHierarchyFile, 
  createCarrierAuthToken 
} from '../lib/api';

interface APITestButtonProps {
  className?: string;
}

const APITestButton: React.FC<APITestButtonProps> = ({ className = '' }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null);

  const runQuickTest = async () => {
    setIsRunning(true);
    setLastResult(null);
    
    try {
      // Quick test: File validation and auth token creation
      const testFile = new File(['test,data\n1,2,3'], 'test.csv', { type: 'text/csv' });
      const validation = validateHierarchyFile(testFile);
      
      if (!validation.isValid) {
        throw new Error('File validation failed');
      }
      
      const token = createCarrierAuthToken();
      if (!token) {
        throw new Error('Auth token creation failed');
      }
      
      setLastResult('success');
      console.log('✅ API Test passed: File validation and auth token creation successful');
      
    } catch (error) {
      setLastResult('error');
      console.error('❌ API Test failed:', error);
    } finally {
      setIsRunning(false);
      // Clear result after 3 seconds
      setTimeout(() => setLastResult(null), 3000);
    }
  };

  const getButtonIcon = () => {
    if (isRunning) return <Loader size={16} className="animate-spin" />;
    if (lastResult === 'success') return <CheckCircle size={16} className="text-green-500" />;
    if (lastResult === 'error') return <XCircle size={16} className="text-red-500" />;
    return <Play size={16} />;
  };

  const getButtonText = () => {
    if (isRunning) return 'Testing...';
    if (lastResult === 'success') return 'Test Passed';
    if (lastResult === 'error') return 'Test Failed';
    return 'Run API Test';
  };

  return (
    <button 
      onClick={runQuickTest}
      disabled={isRunning}
      className={`toolbar__button ${className}`}
      title="Run quick API functionality test"
    >
      {getButtonIcon()}
      {getButtonText()}
    </button>
  );
};

export default APITestButton;
