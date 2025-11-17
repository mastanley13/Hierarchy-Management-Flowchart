// Test script to verify all upline fields are being fetched correctly
// Run with: node scripts/test-upline-fields.js

async function testUplineFields() {
  try {
    console.log('🔍 Testing upline field extraction from HighLevel...\n');
    
    const response = await fetch('http://localhost:3000/api/ghl/snapshot?debug=raw');
    const data = await response.json();

    if (!data || !data.samples) {
      console.error('❌ No sample data found');
      return;
    }

    console.log('📊 UPLINE FIELD EXTRACTION TEST');
    console.log('================================\n');
    console.log(`Total contacts sampled: ${data.samples.length}\n`);

    // Check which fields are present
    const fieldPresence = {
      'contact.upline_producer_id': 0,
      'contact.onboarding__upline_npn': 0,
      'contact.onboarding__upline_email': 0,
      'contact.upline_name': 0,
      'contact.upline_highest_stage': 0,
      'contact.upline_code_equita': 0,
      'contact.upline_code_quility': 0,
      'contact.onboarding__npn': 0,
    };

    data.samples.forEach(contact => {
      Object.keys(contact.allCustomFields || {}).forEach(key => {
        if (contact.allCustomFields[key] && contact.allCustomFields[key] !== null && contact.allCustomFields[key] !== '') {
          if (fieldPresence.hasOwnProperty(key)) {
            fieldPresence[key]++;
          }
        }
      });
    });

    console.log('📋 FIELD PRESENCE COUNT:');
    console.log('------------------------');
    Object.entries(fieldPresence).forEach(([field, count]) => {
      const status = count > 0 ? '✅' : '❌';
      console.log(`${status} ${field}: ${count} contacts`);
    });

    console.log(`\n📊 SUMMARY FROM DEBUG ENDPOINT:`);
    console.log(`  Contacts with uplineProducerId: ${data.uplineFieldStats.contactsWithUplineProducerId}`);
    console.log(`  Contacts with uplineEmail: ${data.uplineFieldStats.contactsWithUplineEmail}`);
    console.log(`  Contacts with uplineName: ${data.uplineFieldStats.contactsWithUplineName}`);
    console.log(`  Contacts with NPN: ${data.uplineFieldStats.contactsWithNpn}`);

    console.log('\n📋 ALL UPLINE-RELATED FIELDS FOUND:');
    console.log('-----------------------------------');
    data.allUplineFields.forEach(field => {
      console.log(`  - ${field}`);
    });

    // Show sample contacts with upline data
    const contactsWithUpline = data.samples.filter(c => 
      c.uplineProducerId || c.uplineEmail || c.uplineName
    );

    if (contactsWithUpline.length > 0) {
      console.log(`\n✅ FOUND ${contactsWithUpline.length} CONTACTS WITH UPLINE DATA:`);
      console.log('='.repeat(50));
      contactsWithUpline.slice(0, 5).forEach(contact => {
        console.log(`\n  ${contact.name}`);
        console.log(`    NPN: ${contact.npn || 'none'}`);
        console.log(`    Upline Producer ID: ${contact.uplineProducerId || 'none'}`);
        console.log(`    Upline Email: ${contact.uplineEmail || 'none'}`);
        console.log(`    Upline Name: ${contact.uplineName || 'none'}`);
        console.log(`    All upline fields:`, contact.allCustomFields);
      });
    } else {
      console.log('\n⚠️  NO CONTACTS HAVE UPLINE DATA POPULATED');
      console.log('   This means the custom fields exist but are empty in HighLevel.');
      console.log('   You need to populate these fields in HighLevel for the hierarchy to build.');
    }

  } catch (error) {
    console.error('❌ Error testing upline fields:', error);
    console.error(error.stack);
  }
}

// Run the test
testUplineFields();

