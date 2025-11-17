// Diagnostic script to check raw contact data for upline fields
// Run with: node scripts/check-upline-fields.js

async function checkUplineFields() {
  try {
    console.log('🔍 Fetching snapshot data...\n');
    const response = await fetch('http://localhost:3000/api/ghl/snapshot');
    const snapshot = await response.json();

    if (!snapshot || !snapshot.hierarchy) {
      console.error('❌ No snapshot data found');
      return;
    }

    // Fetch raw contacts to see what custom fields exist
    console.log('📋 Checking API endpoint for raw contact data...\n');
    
    // Let's check what fields are actually in the snapshot
    console.log('🔍 ANALYZING SNAPSHOT DATA STRUCTURE');
    console.log('====================================\n');

    // Sample a few nodes to see their structure
    const sampleNodes = snapshot.hierarchy.slice(0, 5);
    
    console.log('Sample node structure:');
    console.log(JSON.stringify(sampleNodes[0], null, 2).substring(0, 500));
    console.log('\n...\n');

    // Check for upline-related fields in raw data
    console.log('🔍 CHECKING FOR UPLINE FIELDS IN NODES');
    console.log('======================================\n');

    const allNodes = [];
    const flattenNodes = (nodes) => {
      nodes.forEach(node => {
        allNodes.push(node);
        if (node.children && node.children.length > 0) {
          flattenNodes(node.children);
        }
      });
    };
    flattenNodes(snapshot.hierarchy);

    // Check what fields exist
    const nodesWithUplineData = [];
    const fieldNames = new Set();

    allNodes.forEach(node => {
      // Check all possible upline field names
      const uplineFields = {
        'raw.uplineProducerId': node.raw?.uplineProducerId,
        'raw.uplineEmail': node.raw?.uplineEmail,
        'raw.surelcId': node.raw?.surelcId,
        'uplineSource': node.uplineSource,
        'uplineConfidence': node.uplineConfidence,
      };

      const hasAnyUplineData = Object.values(uplineFields).some(v => v && v !== 'unknown' && v !== 0);

      if (hasAnyUplineData) {
        nodesWithUplineData.push({
          label: node.label,
          npn: node.npn,
          ...uplineFields,
        });
      }

      // Collect all field names
      Object.keys(node).forEach(key => fieldNames.add(key));
      if (node.raw) {
        Object.keys(node.raw).forEach(key => fieldNames.add(`raw.${key}`));
      }
    });

    console.log(`Nodes with any upline data: ${nodesWithUplineData.length} out of ${allNodes.length}`);
    
    if (nodesWithUplineData.length > 0) {
      console.log('\n📋 SAMPLE NODES WITH UPLINE DATA (first 10):');
      nodesWithUplineData.slice(0, 10).forEach(node => {
        console.log(`\n  ${node.label}`);
        console.log(`    NPN: ${node.npn || 'none'}`);
        console.log(`    uplineProducerId: ${node['raw.uplineProducerId'] || 'none'}`);
        console.log(`    uplineEmail: ${node['raw.uplineEmail'] || 'none'}`);
        console.log(`    uplineSource: ${node.uplineSource || 'unknown'}`);
        console.log(`    uplineConfidence: ${node.uplineConfidence || 0}`);
      });
    } else {
      console.log('\n⚠️  NO NODES HAVE UPLINE DATA!');
      console.log('   This suggests the custom fields are not being read correctly.');
    }

    console.log(`\n📋 All available fields in nodes:`);
    Array.from(fieldNames).sort().forEach(field => {
      console.log(`  - ${field}`);
    });

  } catch (error) {
    console.error('❌ Error checking upline fields:', error);
    console.error(error.stack);
  }
}

// Run the check
checkUplineFields();

