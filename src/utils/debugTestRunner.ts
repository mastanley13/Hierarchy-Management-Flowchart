// Simple test runner for debugging admin sets
// This can be run from the browser console for quick testing

import { quickAdminTest, compareAdminSets } from './adminComparisonTest';
import { compareUIWithData } from './hierarchyAudit';
import { testHierarchyUploadStatusAPI, testHierarchyUploadStatusWithRealID, testHierarchyUploadEndpointAccessibility, testHierarchyUploadStatusWithCarrierId, testAllHierarchyDataEndpoints } from './apiTest';

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).debugAdminSets = {
    quickTest: quickAdminTest,
    fullComparison: compareAdminSets,
    compareWithUI: compareUIWithData,
    
    // Helper function to test specific admin set
    testEquita: async () => {
      console.log('dY? Testing Equita admin set...');
      // This would require implementing a single admin set test
      console.log('Use quickTest() or fullComparison() for comprehensive testing');
    },
    
    // Helper function to test specific admin set  
    testQuility: async () => {
      console.log('dY? Testing Quility admin set...');
      // This would require implementing a single admin set test
      console.log('Use quickTest() or fullComparison() for comprehensive testing');
    },
    
    // Helper to clear all caches
    clearCaches: () => {
      if ((window as any).clearAPICache) {
        (window as any).clearAPICache();
        console.log('dY1 All caches cleared');
      } else {
        console.log('?s??,? Cache clearing not available');
      }
    },
    
    // Hierarchy upload status API tests
    testHierarchyUploadStatus: testHierarchyUploadStatusAPI,
    testHierarchyUploadWithID: testHierarchyUploadStatusWithRealID,
    testHierarchyUploadEndpoint: testHierarchyUploadEndpointAccessibility,
    testHierarchyUploadWithCarrierId: testHierarchyUploadStatusWithCarrierId,
    
    // Hierarchy data retrieval tests
    testAllHierarchyData: testAllHierarchyDataEndpoints
  };
  
  console.log('dY" Debug utilities loaded! Available commands:');
  console.log('  debugAdminSets.quickTest() - Run quick comparison test');
  console.log('  debugAdminSets.fullComparison() - Run full comparison test');
  console.log('  debugAdminSets.compareWithUI() - Compare UI counts with API data for the active admin set');
  console.log('  debugAdminSets.clearCaches() - Clear all API caches');
  console.log('  debugAdminSets.testHierarchyUploadStatus() - Test hierarchy upload status API');
  console.log('  debugAdminSets.testHierarchyUploadWithID("upload-id") - Test with specific upload ID');
  console.log('  debugAdminSets.testHierarchyUploadEndpoint() - Test upload endpoint accessibility');
  console.log('  debugAdminSets.testHierarchyUploadWithCarrierId() - Test with different carrier IDs');
  console.log('  debugAdminSets.testAllHierarchyData() - Test ALL hierarchy data retrieval endpoints');
}
