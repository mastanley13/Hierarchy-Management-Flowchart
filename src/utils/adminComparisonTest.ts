import { 
  createAuthTokenForAdminSet, 
  fetchFirmRelationsAfter, 
  fetchFirmDetails,
  fetchProducerLabel,
  fetchProducerRelationship
} from '../lib/api';
import { getMRFGCredentialConfig, type MRFGAdminSet } from '../lib/credentials';

export interface AdminTestResult {
  adminSet: MRFGAdminSet;
  success: boolean;
  error?: string;
  data?: {
    authToken: string;
    relationsCount: number;
    sampleRelations: any[];
    firmDetails: any;
    uniqueGaIds: number[];
    sampleProducer?: any;
    testDuration: number;
  };
}

export async function compareAdminSets(): Promise<{
  equita: AdminTestResult;
  quility: AdminTestResult;
  comparison: {
    bothWorking: boolean;
    dataDifference: boolean;
    sameFirmIds: boolean;
    sameProducerCount: boolean;
  };
}> {
  console.log('🔍 Starting comprehensive admin set comparison...');
  
  const results = {
    equita: await testAdminSet('EQUITA'),
    quility: await testAdminSet('QUILITY'),
    comparison: {
      bothWorking: false,
      dataDifference: false,
      sameFirmIds: false,
      sameProducerCount: false
    }
  };

  // Analyze results
  results.comparison.bothWorking = results.equita.success && results.quility.success;
  
  if (results.comparison.bothWorking) {
    const equitaData = results.equita.data!;
    const quilityData = results.quility.data!;
    
    results.comparison.sameProducerCount = equitaData.relationsCount === quilityData.relationsCount;
    results.comparison.sameFirmIds = JSON.stringify(equitaData.uniqueGaIds.sort()) === JSON.stringify(quilityData.uniqueGaIds.sort());
    results.comparison.dataDifference = !results.comparison.sameProducerCount || !results.comparison.sameFirmIds;
  }

  // Log comprehensive results
  console.log('📊 ADMIN SET COMPARISON RESULTS:');
  console.log('================================');
  console.log('✅ Both admin sets working:', results.comparison.bothWorking);
  console.log('📈 Same producer count:', results.comparison.sameProducerCount);
  console.log('🏢 Same firm IDs:', results.comparison.sameFirmIds);
  console.log('🔄 Data differences detected:', results.comparison.dataDifference);
  
  if (results.comparison.bothWorking) {
    console.log('\n📋 DETAILED COMPARISON:');
    console.log('Equita Relations:', results.equita.data!.relationsCount);
    console.log('Quility Relations:', results.quility.data!.relationsCount);
    console.log('Equita Firm IDs:', results.equita.data!.uniqueGaIds);
    console.log('Quility Firm IDs:', results.quility.data!.uniqueGaIds);
  }

  return results;
}

async function testAdminSet(adminSet: MRFGAdminSet): Promise<AdminTestResult> {
  const startTime = Date.now();
  const config = getMRFGCredentialConfig(adminSet);
  
  console.log(`\n🧪 Testing ${config.portalName}...`);
  
  try {
    // Test 1: Auth token creation
    console.log(`1. Creating auth token for ${adminSet}...`);
    const authToken = createAuthTokenForAdminSet(adminSet);
    console.log(`✅ Auth token created for ${adminSet}`);
    
    // Test 2: Fetch firm relations
    console.log(`2. Fetching firm relations for ${adminSet}...`);
    const relations = await fetchFirmRelationsAfter('2000-01-01T00:00:00Z', authToken, 100);
    console.log(`✅ Fetched ${relations.length} relations for ${adminSet}`);
    
    // Test 3: Get unique firm IDs
    const uniqueGaIds = [...new Set(relations.map(r => r.gaId))];
    console.log(`🏢 Unique firm IDs for ${adminSet}:`, uniqueGaIds);
    
    // Test 4: Fetch firm details
    console.log(`3. Fetching firm details for ${adminSet}...`);
    let firmDetails = null;
    try {
      firmDetails = await fetchFirmDetails(323, authToken); // MRFG firm ID
      console.log(`✅ Firm details for ${adminSet}:`, firmDetails);
    } catch (error) {
      console.warn(`⚠️ Firm details failed for ${adminSet}:`, error);
    }
    
    // Test 5: Test a sample producer (if available)
    let sampleProducer = null;
    if (relations.length > 0) {
      const sampleRelation = relations[0];
      console.log(`4. Testing producer ${sampleRelation.producerId} for ${adminSet}...`);
      try {
        const producerLabel = await fetchProducerLabel(sampleRelation.producerId, authToken);
        const producerRelationship = await fetchProducerRelationship(sampleRelation.producerId, authToken);
        sampleProducer = {
          id: sampleRelation.producerId,
          label: producerLabel,
          relationship: producerRelationship
        };
        console.log(`✅ Sample producer for ${adminSet}:`, sampleProducer);
      } catch (error) {
        console.warn(`⚠️ Sample producer failed for ${adminSet}:`, error);
      }
    }
    
    const testDuration = Date.now() - startTime;
    
    return {
      adminSet,
      success: true,
      data: {
        authToken: authToken.substring(0, 20) + '...', // Truncate for security
        relationsCount: relations.length,
        sampleRelations: relations.slice(0, 3), // First 3 relations
        firmDetails,
        uniqueGaIds,
        sampleProducer,
        testDuration
      }
    };
    
  } catch (error) {
    console.error(`❌ ${adminSet} test failed:`, error);
    return {
      adminSet,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Quick test function for console debugging
export async function quickAdminTest(): Promise<void> {
  console.clear();
  console.log('🚀 Starting Quick Admin Test...');
  
  try {
    const results = await compareAdminSets();
    
    // Display results in a user-friendly format
    console.log('\n📊 QUICK TEST SUMMARY:');
    console.log('=====================');
    
    if (results.comparison.bothWorking) {
      console.log('✅ Both admin sets are working!');
      
      if (results.comparison.dataDifference) {
        console.log('⚠️  WARNING: Data differences detected between admin sets');
        console.log('   This suggests the admin sets access different data');
      } else {
        console.log('✅ Both admin sets return identical data');
        console.log('   This suggests the issue is in the UI, not the API');
      }
    } else {
      console.log('❌ One or both admin sets are failing');
      if (!results.equita.success) {
        console.log('❌ Equita admin set failed:', results.equita.error);
      }
      if (!results.quility.success) {
        console.log('❌ Quility admin set failed:', results.quility.error);
      }
    }
    
  } catch (error) {
    console.error('❌ Quick test failed:', error);
  }
}



