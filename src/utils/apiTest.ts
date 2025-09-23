// Simple API test utility to diagnose 500 errors
import { 
  createAuthToken, 
  fetchFirmRelationsAfter, 
  getHierarchyUploadStatus, 
  createCarrierAuthToken,
  fetchProducerRelationship,
  fetchCSVReport,
  fetchFirmDetails,
  fetchProducerLabel,
  uploadHierarchyFile
} from '../lib/api';
import type { GARelation, ProducerLabel } from '../lib/types';

type FirmRelationsResult =
  | { success: true; count: number; sample: GARelation[] }
  | { success: false; error: string };

type ProducerRelationsResult =
  | { success: true; producerId: number; data: GARelation | null }
  | { success: false; error: string };

type CsvReportResult =
  | { success: true; lineCount: number; sample: string[] }
  | { success: false; error: string };

type FirmDetailsResult =
  | { success: true; firmId: number; data: any }
  | { success: false; error: string };

type ProducerDetailsResult =
  | { success: true; producerId: number; data: ProducerLabel }
  | { success: false; error: string };

interface HierarchyDataTestResults {
  firmRelations: FirmRelationsResult | null;
  producerRelations: ProducerRelationsResult | null;
  csvReports: Record<string, CsvReportResult>;
  firmDetails: FirmDetailsResult | null;
  producerDetails: ProducerDetailsResult | null;
}

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

// Test hierarchy upload status API
export async function testHierarchyUploadStatusAPI() {
  console.log('🔍 Testing Hierarchy Upload Status API...');
  
  try {
    // Test 1: Create carrier auth token
    console.log('1. Testing carrier auth token creation...');
    
    // Check if SureLC credentials are available
    const equitaUser = import.meta.env.VITE_SURELC_USER_EQUITA;
    const equitaPass = import.meta.env.VITE_SURELC_PASS_EQUITA;
    const quilityUser = import.meta.env.VITE_SURELC_USER_QUILITY;
    const quilityPass = import.meta.env.VITE_SURELC_PASS_QUILITY;
    const surelcUser = import.meta.env.VITE_SURELC_USER;
    const surelcPass = import.meta.env.VITE_SURELC_PASS;

    const hasEquitaCredentials = Boolean(equitaUser && equitaPass);
    const hasQuilityCredentials = Boolean(quilityUser && quilityPass);
    const hasGeneralCredentials = Boolean(surelcUser && surelcPass);

    if (!hasEquitaCredentials && !hasQuilityCredentials && !hasGeneralCredentials) {
      console.error('❌ No SureLC credentials found!');
      console.log('📝 To fix this, create a .env file in your project root with:');
      console.log('   # Primary Equita Account:');
      console.log('   VITE_SURELC_USER_EQUITA=your-equita-username');
      console.log('   VITE_SURELC_PASS_EQUITA=your-equita-password');
      console.log('   # OR Secondary Quility Account:');
      console.log('   VITE_SURELC_USER_QUILITY=your-quility-username');
      console.log('   VITE_SURELC_PASS_QUILITY=your-quility-password');
      console.log('   # OR General SureLC credentials:');
      console.log('   VITE_SURELC_USER=your-username');
      console.log('   VITE_SURELC_PASS=your-password');
      return { 
        success: false, 
        error: 'Missing SureLC credentials - see console for setup instructions',
        setupRequired: true
      };
    }
    
    const carrierToken = createCarrierAuthToken();
    console.log('✅ Carrier auth token created successfully');
    
    // Test 2: Test with different upload ID formats
    console.log('2. Testing hierarchy upload status with different ID formats...');
    
    const testIds = [
      'test-upload-123',
      '1',
      '123',
      'upload-123',
      'hierarchy-upload-123',
      // Try more realistic formats
      '20250101-001',
      'upload-20250101-001',
      'hierarchy-20250101-001',
      // Try UUID-like formats
      '123e4567-e89b-12d3-a456-426614174000',
      '550e8400-e29b-41d4-a716-446655440000',
      // Try numeric only
      '1001',
      '2001',
      '3001'
    ];
    
    let lastError: any = null;
    
    for (const testId of testIds) {
      try {
        console.log(`   Testing with ID: "${testId}"`);
        const status = await getHierarchyUploadStatus(testId, carrierToken);
        console.log('✅ Upload status retrieved successfully:', status);
        return { success: true, status, testId };
      } catch (error: any) {
        console.log(`   ❌ Failed with ID "${testId}":`, {
          status: error.message.includes('HTTP 404') ? '404 Not Found' : 
                 error.message.includes('HTTP 500') ? '500 Server Error' : 'Other Error',
          message: error.message.substring(0, 200) + (error.message.length > 200 ? '...' : '')
        });
        lastError = error;
        
        // If it's a 404, that's actually good - it means the API endpoint is working
        if (error.message.includes('HTTP 404')) {
          console.log('✅ API endpoint is working correctly (404 for non-existent ID)');
          return { success: true, status: 'API endpoint working', error: '404 Not Found (expected)', testId };
        }
        
        // If it's a 500 error, continue trying other IDs
        if (error.message.includes('HTTP 500')) {
          console.log('   ⚠️ Server error - trying next ID format...');
          continue;
        }
      }
    }
    
    // If we get here, all test IDs failed
    console.log('📊 All test IDs failed. Last error:', {
      status: lastError?.message?.includes('HTTP 500') ? '500 Server Error' : 'Other Error',
      message: lastError?.message?.substring(0, 200) + (lastError?.message?.length > 200 ? '...' : ''),
      note: 'This suggests the API endpoint exists but has server-side issues'
    });
    
    return { 
      success: false, 
      error: lastError?.message || 'All test IDs failed',
      note: 'API endpoint exists but server-side error occurred'
    };
    
  } catch (error) {
    console.error('❌ Hierarchy upload status API test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Test with a real upload ID if available
export async function testHierarchyUploadStatusWithRealID(uploadId: string) {
  console.log(`🔍 Testing Hierarchy Upload Status API with real ID: ${uploadId}`);
  
  try {
    const carrierToken = createCarrierAuthToken();
    const status = await getHierarchyUploadStatus(uploadId, carrierToken);
    console.log('✅ Real upload status retrieved:', status);
    return { success: true, status };
  } catch (error) {
    console.error('❌ Real upload status test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Test with different carrier IDs
export async function testHierarchyUploadStatusWithCarrierId() {
  console.log('🔍 Testing Hierarchy Upload Status API with different carrier IDs...');
  
  try {
    const carrierToken = createCarrierAuthToken();
    console.log('✅ Carrier auth token created successfully');
    
    // Common carrier IDs to try
    const carrierIds = [60739, 61999, 60740, 60741, 1, 2, 3];
    const testUploadId = 'test-upload-123';
    
    for (const carrierId of carrierIds) {
      try {
        console.log(`   Testing with carrierId: ${carrierId}`);
        const status = await getHierarchyUploadStatus(testUploadId, carrierToken, carrierId);
        console.log('✅ Upload status retrieved successfully:', status);
        return { success: true, status, carrierId };
      } catch (error: any) {
        console.log(`   ❌ Failed with carrierId ${carrierId}:`, {
          status: error.message.includes('HTTP 404') ? '404 Not Found' : 
                 error.message.includes('HTTP 500') ? '500 Server Error' : 'Other Error',
          message: error.message.substring(0, 200) + (error.message.length > 200 ? '...' : '')
        });
        
        // If it's a 404, that's actually good - it means the API endpoint is working
        if (error.message.includes('HTTP 404')) {
          console.log('✅ API endpoint is working correctly (404 for non-existent ID)');
          return { success: true, status: 'API endpoint working', error: '404 Not Found (expected)', carrierId };
        }
        
        // If it's a 500 error, continue trying other carrier IDs
        if (error.message.includes('HTTP 500')) {
          console.log('   ⚠️ Server error - trying next carrier ID...');
          continue;
        }
      }
    }
    
    console.log('📊 All carrier IDs failed');
    return { 
      success: false, 
      error: 'All carrier IDs failed',
      note: 'API endpoint exists but server-side error occurred with all carrier IDs'
    };
    
  } catch (error) {
    console.error('❌ Carrier ID test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Test the API endpoint accessibility without requiring a valid upload ID
export async function testHierarchyUploadEndpointAccessibility() {
  console.log('🔍 Testing Hierarchy Upload API endpoint accessibility...');
  
  try {
    const carrierToken = createCarrierAuthToken();
    console.log('✅ Carrier auth token created successfully');
    
    // Test the upload endpoint (POST) to see if it's accessible
    console.log('📤 Testing upload endpoint accessibility...');
    
    // Create a minimal test file
    const testContent = 'Producer ID,Producer Name,NPN\n123,Test Producer,1234567890';
    const testFile = new File([testContent], 'test-hierarchy.csv', { type: 'text/csv' });
    
    try {
      // This will likely fail due to file validation, but we can see the response
      const result = await uploadHierarchyFile(testFile, carrierToken);
      console.log('✅ Upload endpoint is accessible:', result);
      return { success: true, endpoint: 'upload', result };
    } catch (error: any) {
      console.log('📊 Upload endpoint response:', {
        status: error.message.includes('HTTP 400') ? '400 Bad Request' : 
               error.message.includes('HTTP 401') ? '401 Unauthorized' :
               error.message.includes('HTTP 403') ? '403 Forbidden' :
               error.message.includes('HTTP 500') ? '500 Server Error' : 'Other Error',
        message: error.message.substring(0, 200) + (error.message.length > 200 ? '...' : ''),
        note: 'This shows the endpoint is accessible but may have validation issues'
      });
      
      // If it's a 400 error, that's actually good - it means the endpoint is working
      if (error.message.includes('HTTP 400')) {
        console.log('✅ Upload endpoint is working correctly (400 for invalid file is expected)');
        return { success: true, endpoint: 'upload', error: '400 Bad Request (expected for test file)' };
      }
      
      return { success: false, endpoint: 'upload', error: error.message };
    }
    
  } catch (error) {
    console.error('❌ Endpoint accessibility test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Test all available hierarchy data retrieval endpoints
export async function testAllHierarchyDataEndpoints() {
  console.log('🔍 Testing ALL available hierarchy data retrieval endpoints...');
  
  try {
    const token = createAuthToken();
    console.log('✅ Auth token created successfully');
    
    const results: HierarchyDataTestResults = {
      firmRelations: null,
      producerRelations: null,
      csvReports: {} as Record<string, CsvReportResult>,
      firmDetails: null,
      producerDetails: null
    };
    
    // Test 1: Firm relationships (what you're already using)
    console.log('\n1️⃣ Testing firm relationships endpoint...');
    try {
      const firmRelations = await fetchFirmRelationsAfter('2000-01-01T00:00:00Z', token, 10);
      results.firmRelations = { success: true, count: firmRelations.length, sample: firmRelations.slice(0, 2) };
      console.log(`✅ Firm relationships: ${firmRelations.length} records`);
    } catch (error: any) {
      results.firmRelations = { success: false, error: error.message };
      console.log(`❌ Firm relationships failed: ${error.message}`);
    }
    
    // Test 2: Individual producer relationships
    console.log('\n2️⃣ Testing individual producer relationships endpoint...');
    try {
      // Get a sample producer ID from firm relations
      if (results.firmRelations?.success && results.firmRelations.sample?.length > 0) {
        const sampleProducerId = results.firmRelations.sample[0].producerId;
        const producerRelation = await fetchProducerRelationship(sampleProducerId, token);
        results.producerRelations = { success: true, producerId: sampleProducerId, data: producerRelation };
        console.log(`✅ Producer relationship for ID ${sampleProducerId}:`, producerRelation);
      } else {
        results.producerRelations = { success: false, error: 'No sample producer ID available' };
        console.log('⚠️ Skipping producer relationships - no sample producer ID');
      }
    } catch (error: any) {
      results.producerRelations = { success: false, error: error.message };
      console.log(`❌ Producer relationships failed: ${error.message}`);
    }
    
    // Test 3: CSV Reports (carrier endpoints)
    console.log('\n3️⃣ Testing CSV reports endpoints...');
    const csvReportTypes = ['agent', 'contract', 'producer_license', 'appointment'];
    
    for (const reportType of csvReportTypes) {
      try {
        console.log(`   Testing ${reportType} CSV report...`);
        const csvData = await fetchCSVReport(reportType as any, token);
        const lineCount = csvData.split('\n').length;
        results.csvReports[reportType] = { success: true, lineCount, sample: csvData.split('\n').slice(0, 3) };
        console.log(`   ✅ ${reportType} CSV: ${lineCount} lines`);
      } catch (error: any) {
        results.csvReports[reportType] = { success: false, error: error.message };
        console.log(`   ❌ ${reportType} CSV failed: ${error.message}`);
      }
    }
    
    // Test 4: Firm details
    console.log('\n4️⃣ Testing firm details endpoint...');
    try {
      if (results.firmRelations?.success && results.firmRelations.sample?.length > 0) {
        const sampleFirmId = results.firmRelations.sample[0].gaId;
        const firmDetails = await fetchFirmDetails(sampleFirmId, token);
        results.firmDetails = { success: true, firmId: sampleFirmId, data: firmDetails };
        console.log(`✅ Firm details for ID ${sampleFirmId}:`, firmDetails);
      } else {
        results.firmDetails = { success: false, error: 'No sample firm ID available' };
        console.log('⚠️ Skipping firm details - no sample firm ID');
      }
    } catch (error: any) {
      results.firmDetails = { success: false, error: error.message };
      console.log(`❌ Firm details failed: ${error.message}`);
    }
    
    // Test 5: Producer details
    console.log('\n5️⃣ Testing producer details endpoint...');
    try {
      if (results.firmRelations?.success && results.firmRelations.sample?.length > 0) {
        const sampleProducerId = results.firmRelations.sample[0].producerId;
        const producerLabel = await fetchProducerLabel(sampleProducerId, token);
        results.producerDetails = { success: true, producerId: sampleProducerId, data: producerLabel };
        console.log(`✅ Producer details for ID ${sampleProducerId}:`, producerLabel);
      } else {
        results.producerDetails = { success: false, error: 'No sample producer ID available' };
        console.log('⚠️ Skipping producer details - no sample producer ID');
      }
    } catch (error: any) {
      results.producerDetails = { success: false, error: error.message };
      console.log(`❌ Producer details failed: ${error.message}`);
    }
    
    console.log('\n📊 SUMMARY - Available Hierarchy Data Sources:');
    console.log('=' .repeat(60));
    
    if (results.firmRelations?.success) {
      console.log(`✅ Firm Relationships: ${results.firmRelations.count} records available`);
    } else {
      console.log(`❌ Firm Relationships: ${results.firmRelations?.error}`);
    }
    
    if (results.producerRelations?.success) {
      console.log(`✅ Individual Producer Relationships: Available`);
    } else {
      console.log(`❌ Individual Producer Relationships: ${results.producerRelations?.error}`);
    }
    
    Object.entries(results.csvReports).forEach(([type, report]) => {
      if (report.success) {
        console.log(`✅ ${type.toUpperCase()} CSV Report: ${report.lineCount} lines available`);
      } else {
        console.log(`❌ ${type.toUpperCase()} CSV Report: ${report.error}`);
      }
    });
    
    if (results.firmDetails?.success) {
      console.log(`✅ Firm Details: Available for firm ID ${results.firmDetails.firmId}`);
    } else {
      console.log(`❌ Firm Details: ${results.firmDetails?.error}`);
    }
    
    if (results.producerDetails?.success) {
      console.log(`✅ Producer Details: Available for producer ID ${results.producerDetails.producerId}`);
    } else {
      console.log(`❌ Producer Details: ${results.producerDetails?.error}`);
    }
    
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('- Use firm relationships for organizational structure');
    console.log('- Use CSV reports for bulk data export');
    console.log('- Use individual endpoints for detailed producer/firm info');
    console.log('- Combine data sources for comprehensive hierarchy view');
    
    // Determine overall success based on key endpoints working
    const hasWorkingEndpoints = Boolean(
      results.firmRelations?.success ||
      results.producerRelations?.success ||
      results.firmDetails?.success ||
      results.producerDetails?.success
    );
    
    return {
      success: hasWorkingEndpoints,
      ...results
    };
    
  } catch (error) {
    console.error('❌ Hierarchy data endpoints test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Auto-run test in development
if (import.meta.env.DEV) {
  // Run test after a short delay to let the app initialize
  setTimeout(() => {
    testAPIEndpoints();
    testHierarchyUploadStatusAPI();
  }, 2000);
}
