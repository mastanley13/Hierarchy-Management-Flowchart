// Simple test runner for debugging admin sets
// This can be run from the browser console for quick testing

import { quickAdminTest, compareAdminSets } from './adminComparisonTest';

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).debugAdminSets = {
    quickTest: quickAdminTest,
    fullComparison: compareAdminSets,
    
    // Helper function to test specific admin set
    testEquita: async () => {
      console.log('🧪 Testing Equita admin set...');
      // This would require implementing a single admin set test
      console.log('Use quickTest() or fullComparison() for comprehensive testing');
    },
    
    // Helper function to test specific admin set  
    testQuility: async () => {
      console.log('🧪 Testing Quility admin set...');
      // This would require implementing a single admin set test
      console.log('Use quickTest() or fullComparison() for comprehensive testing');
    },
    
    // Helper to clear all caches
    clearCaches: () => {
      if ((window as any).clearAPICache) {
        (window as any).clearAPICache();
        console.log('🧹 All caches cleared');
      } else {
        console.log('⚠️ Cache clearing not available');
      }
    }
  };
  
  console.log('🔧 Debug utilities loaded! Available commands:');
  console.log('  debugAdminSets.quickTest() - Run quick comparison test');
  console.log('  debugAdminSets.fullComparison() - Run full comparison test');
  console.log('  debugAdminSets.clearCaches() - Clear all API caches');
}

