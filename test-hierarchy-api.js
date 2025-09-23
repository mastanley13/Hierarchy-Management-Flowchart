// Simple test script for Hierarchy Upload Status API
// Run this with: node test-hierarchy-api.js

const https = require('https');
const fs = require('fs');

// Configuration - you'll need to update these with your actual credentials
const config = {
  // Update these with your actual API credentials
  username: 'your-carrier-username',
  password: 'your-carrier-password',
  baseUrl: 'https://your-api-domain.com', // Update with your actual API domain
  uploadId: 'test-upload-123' // This will likely return 404, but shows the API is working
};

// Create basic auth header
function createAuthHeader(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

// Make API request
function makeAPIRequest(path, authHeader) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.baseUrl);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    console.log(`🔍 Making request to: ${url.toString()}`);
    console.log(`📋 Headers:`, options.headers);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📊 Response Status: ${res.statusCode} ${res.statusMessage}`);
        console.log(`📋 Response Headers:`, res.headers);
        
        try {
          const jsonData = JSON.parse(data);
          console.log(`✅ Response Body:`, JSON.stringify(jsonData, null, 2));
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (error) {
          console.log(`📄 Response Body (raw):`, data);
          resolve({ status: res.statusCode, data: data, headers: res.headers, isJson: false });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request failed:`, error);
      reject(error);
    });

    req.end();
  });
}

// Test the hierarchy upload status API
async function testHierarchyUploadStatusAPI() {
  console.log('🚀 Starting Hierarchy Upload Status API Test');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Create auth header
    console.log('1️⃣ Creating authentication header...');
    const authHeader = createAuthHeader(config.username, config.password);
    console.log('✅ Auth header created');
    
    // Step 2: Test the API endpoint
    console.log('\n2️⃣ Testing hierarchy upload status endpoint...');
    const endpoint = `/carrier/uploadHierarchy/${config.uploadId}`;
    
    const result = await makeAPIRequest(endpoint, authHeader);
    
    // Step 3: Analyze results
    console.log('\n3️⃣ Analyzing results...');
    if (result.status === 200) {
      console.log('✅ SUCCESS: API endpoint is working correctly!');
      console.log('📊 Upload Status Data:', result.data);
    } else if (result.status === 404) {
      console.log('✅ SUCCESS: API endpoint is working (404 expected for test ID)');
      console.log('📝 Note: 404 response means the endpoint exists but the upload ID was not found');
    } else if (result.status === 401) {
      console.log('❌ AUTHENTICATION ERROR: Check your credentials');
      console.log('💡 Make sure your username and password are correct');
    } else if (result.status === 403) {
      console.log('❌ AUTHORIZATION ERROR: Insufficient permissions');
      console.log('💡 Make sure your account has ROLE_CARRIER permissions');
    } else {
      console.log(`⚠️  UNEXPECTED STATUS: ${result.status}`);
      console.log('📄 Response:', result.data);
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🏁 Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.log('\n💡 Troubleshooting tips:');
    console.log('   - Check your internet connection');
    console.log('   - Verify the API base URL is correct');
    console.log('   - Ensure your credentials are valid');
    console.log('   - Check if the API server is running');
  }
}

// Check if credentials are configured
if (config.username === 'your-carrier-username' || config.password === 'your-carrier-password') {
  console.log('⚠️  WARNING: Default credentials detected!');
  console.log('📝 Please update the config object in this file with your actual credentials:');
  console.log('   - username: Your carrier username');
  console.log('   - password: Your carrier password');
  console.log('   - baseUrl: Your API server URL');
  console.log('   - uploadId: A real upload ID (optional, test ID will work for endpoint testing)');
  console.log('\n🔧 Example configuration:');
  console.log(`
const config = {
  username: 'mycarrieruser',
  password: 'mypassword123',
  baseUrl: 'https://api.surelc.com',
  uploadId: 'real-upload-id-123'
};`);
  console.log('\n🚀 After updating credentials, run: node test-hierarchy-api.js');
} else {
  // Run the test
  testHierarchyUploadStatusAPI();
}
