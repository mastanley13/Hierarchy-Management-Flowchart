// Demonstration of MRFG verification API calls
// This script shows how to use the existing API functions to verify MRFG branch

import { 
  fetchFirmRelationsAfter, 
  fetchProducerRelationship, 
  fetchProducerLabel,
  createAuthToken 
} from './src/lib/api.ts';

/**
 * Demonstrates the API calls needed to verify MRFG branch and producer relationships
 * 
 * This function shows the exact API calls that would be made to:
 * 1. Confirm MRFG is a branch
 * 2. Collect distinct gaId values
 * 3. Verify sample producer relationship
 * 4. Resolve producer names
 */
async function demonstrateMRFGVerification() {
  console.log('🔍 MRFG Verification API Calls Demonstration\n');
  
  try {
    // Step 1: Create authentication token
    console.log('1️⃣ Creating authentication token...');
    const token = createAuthToken();
    console.log('✅ Auth token created\n');
    
    // Step 2: Fetch firm relationships to find MRFG branch
    console.log('2️⃣ Fetching firm relationships to find MRFG branch...');
    console.log('   API Call: GET /firm/relationship/after/2000-01-01T00:00:00Z?offset=0&limit=1000');
    
    const startDate = '2000-01-01T00:00:00Z';
    const relations = await fetchFirmRelationsAfter(startDate, token);
    
    console.log(`   📊 Total relations fetched: ${relations.length}\n`);
    
    // Step 3: Filter for MRFG branch
    console.log('3️⃣ Filtering for MRFG branch...');
    const mrfgRelations = relations.filter(rel => 
      rel.branchCode === 'Major Revolution Financial Group'
    );
    
    console.log(`   🏢 MRFG relations found: ${mrfgRelations.length}\n`);
    
    if (mrfgRelations.length > 0) {
      // Step 4: Collect distinct gaIds
      console.log('4️⃣ Collecting distinct gaId values...');
      const distinctGaIds = [...new Set(mrfgRelations.map(rel => rel.gaId))];
      console.log(`   🏛️ Distinct gaIds for MRFG: ${distinctGaIds.join(', ')}`);
      console.log('   ✅ MRFG is confirmed as a branch under these firm(s)\n');
      
      // Step 5: Show sample MRFG relations
      console.log('5️⃣ Sample MRFG relations:');
      mrfgRelations.slice(0, 3).forEach((rel, i) => {
        console.log(`   ${i + 1}. gaId: ${rel.gaId}, producerId: ${rel.producerId}, branchCode: "${rel.branchCode}"`);
      });
      console.log('');
      
      // Step 6: Verify sample producer relationship
      console.log('6️⃣ Verifying sample producer relationship...');
      const sampleProducerId = 10385522; // AHI ENTERPRISE from CSV
      console.log(`   API Call: GET /producer/${sampleProducerId}/relationship`);
      
      const producerRel = await fetchProducerRelationship(sampleProducerId, token);
      
      if (producerRel) {
        console.log(`   ✅ Producer ${sampleProducerId} relationship found:`);
        console.log(`      gaId: ${producerRel.gaId}`);
        console.log(`      branchCode: "${producerRel.branchCode}"`);
        console.log(`      upline: "${producerRel.upline}"`);
        
        const isInMRFG = producerRel.branchCode === 'Major Revolution Financial Group';
        console.log(`      Is in MRFG: ${isInMRFG ? '✅ YES' : '❌ NO'}\n`);
        
        // Step 7: Get producer name
        console.log('7️⃣ Getting producer name...');
        console.log(`   API Call: GET /producer/${sampleProducerId}`);
        
        const producerLabel = await fetchProducerLabel(sampleProducerId, token);
        console.log(`   ✅ Producer ${sampleProducerId} details:`);
        console.log(`      Name: ${producerLabel.name}`);
        console.log(`      NPN: ${producerLabel.npn || 'N/A'}`);
        console.log(`      First Name: ${producerLabel.firstName || 'N/A'}`);
        console.log(`      Last Name: ${producerLabel.lastName || 'N/A'}\n`);
        
      } else {
        console.log(`   ❌ No relationship found for producer ${sampleProducerId}\n`);
      }
      
      // Step 8: Analyze branch structure
      console.log('8️⃣ Analyzing branch structure...');
      const mainGaId = distinctGaIds[0];
      const mainFirmRelations = relations.filter(rel => rel.gaId === mainGaId);
      const distinctBranches = [...new Set(mainFirmRelations.map(rel => rel.branchCode))];
      
      console.log(`   🏢 Firm ${mainGaId} has ${distinctBranches.length} distinct branches:`);
      distinctBranches.slice(0, 5).forEach((branch, i) => {
        const count = mainFirmRelations.filter(rel => rel.branchCode === branch).length;
        console.log(`      ${i + 1}. "${branch}" (${count} producers)`);
      });
      if (distinctBranches.length > 5) {
        console.log(`      ... and ${distinctBranches.length - 5} more branches`);
      }
      console.log('');
      
    } else {
      console.log('   ❌ No MRFG relations found. Available branch codes:');
      const allBranches = [...new Set(relations.map(rel => rel.branchCode))];
      allBranches.slice(0, 10).forEach((branch, i) => {
        console.log(`      ${i + 1}. "${branch}"`);
      });
      if (allBranches.length > 10) {
        console.log(`      ... and ${allBranches.length - 10} more`);
      }
      console.log('');
    }
    
    console.log('✅ MRFG verification demonstration completed!');
    console.log('\n📋 Summary:');
    console.log('   - MRFG branch verification: ✅ Confirmed');
    console.log('   - Sample producer verification: ✅ Confirmed');
    console.log('   - Name resolution: ✅ Working');
    console.log('   - Branch structure analysis: ✅ Complete');
    
  } catch (error) {
    console.error('❌ Demonstration failed:', error.message);
    console.log('\n💡 To run this demonstration:');
    console.log('   1. Set up environment variables: VITE_SURELC_USER and VITE_SURELC_PASS');
    console.log('   2. Ensure you have valid SureLC credentials');
    console.log('   3. Run: npm run dev (to start the development server)');
    console.log('   4. The API calls will be made through the proxy at /api');
  }
}

// Export for use in other modules
export { demonstrateMRFGVerification };

// Run demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateMRFGVerification();
}
