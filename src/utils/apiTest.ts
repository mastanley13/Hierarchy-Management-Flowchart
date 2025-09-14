// Simple API test utility to diagnose 500 errors
import { createAuthToken, fetchFirmRelationsAfter } from '../lib/api';

export async function testAPIEndpoints() {
  console.log('🔍 Testing API endpoints...');
  
  try {
    // Test 1: Auth token creation
    console.log('1. Testing auth token creation...');
    const token = createAuthToken();
    console.log('✅ Auth token created successfully');
    
    // Test 2: Simple API call with a safe date
    console.log('2. Testing API call with safe date...');
    const safeDate = '2000-01-01T00:00:00Z'; // This should work
    const relations = await fetchFirmRelationsAfter(safeDate, token, 10); // Small limit
    console.log(`✅ API call successful, got ${relations.length} relations`);
    
    // Test 3: Test with the problematic date format (now fixed)
    console.log('3. Testing with previously problematic date format...');
    const problematicDate = '2025-09-04T17:03:01'; // This should now work with proper formatting
    try {
      const relations2 = await fetchFirmRelationsAfter(problematicDate, token, 10);
      console.log(`✅ Previously problematic date format now works, got ${relations2.length} relations`);
    } catch (error) {
      console.error('❌ Date format still failing:', error);
    }
    
    return { success: true, relationsCount: relations.length };
    
  } catch (error) {
    console.error('❌ API test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Auto-run test in development
if (import.meta.env.DEV) {
  // Run test after a short delay to let the app initialize
  setTimeout(() => {
    testAPIEndpoints();
  }, 2000);
}
