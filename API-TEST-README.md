# Hierarchy Upload Status API Test

This document explains how to test the Hierarchy Upload Status API endpoint that you showed in the image.

## API Endpoint Details

Based on your image, the API endpoint is:
- **Method**: GET
- **Path**: `/carrier/uploadHierarchy/{id}`
- **Description**: Read ongoing hierarchy upload status
- **Authentication**: BASIC_AUTH with ROLE_CARRIER
- **Response**: `hierarchyuploadresult` object

## Testing Methods

### Method 1: Browser Console (Recommended)

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Open the application** in your browser (usually `http://localhost:5173`)

3. **Open Developer Tools** (F12) and go to the Console tab

4. **Run the test**:
   ```javascript
   // Test with a sample ID (will likely return 404, but shows API is working)
   debugAdminSets.testHierarchyUploadStatus()
   
   // Test with a real upload ID if you have one
   debugAdminSets.testHierarchyUploadWithID("your-real-upload-id")
   ```

5. **Check the results** in the console - you'll see detailed logging of the API call and response

### Method 2: Debug Panel UI

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Open the application** and look for the "Run API Test" button (bug icon)

3. **Click the button** to open the Admin Debug Panel

4. **Click "Test Hierarchy Upload Status"** button

5. **View the results** in the panel

### Method 3: Standalone Node.js Script

1. **Update the configuration** in `test-hierarchy-api.js`:
   ```javascript
   const config = {
     username: 'your-carrier-username',
     password: 'your-carrier-password', 
     baseUrl: 'https://your-api-domain.com',
     uploadId: 'test-upload-123'
   };
   ```

2. **Run the test**:
   ```bash
   node test-hierarchy-api.js
   ```

## Expected Results

### Success Scenarios

1. **200 OK**: Upload ID exists and returns status data
   ```json
   {
     "id": "upload-123",
     "status": "completed",
     "progress": 100,
     "message": "Upload completed successfully"
   }
   ```

2. **404 Not Found**: Upload ID doesn't exist (expected for test IDs)
   - This actually indicates the API endpoint is working correctly
   - The endpoint exists but the specific upload ID was not found

### Error Scenarios

1. **401 Unauthorized**: Invalid credentials
   - Check your username and password
   - Ensure you're using carrier credentials, not agency credentials

2. **403 Forbidden**: Insufficient permissions
   - Ensure your account has ROLE_CARRIER permissions
   - Check if you're using the correct authentication method

3. **500 Internal Server Error**: Server-side issue
   - Check server logs
   - Verify API server is running properly

## Environment Variables

Make sure you have the following environment variables set in your `.env` file:

```env
# Carrier credentials for hierarchy upload API
VITE_CARRIER_USER=your-carrier-username
VITE_CARRIER_PASS=your-carrier-password

# Or fallback to general SureLC credentials
VITE_SURELC_USER=your-username
VITE_SURELC_PASS=your-password
```

## Troubleshooting

### Common Issues

1. **"Missing CARRIER credentials" error**:
   - Set `VITE_CARRIER_USER` and `VITE_CARRIER_PASS` in your `.env` file
   - Or ensure `VITE_SURELC_USER` and `VITE_SURELC_PASS` are set

2. **Network errors**:
   - Check your internet connection
   - Verify the API server URL is correct
   - Check if the API server is running

3. **Authentication errors**:
   - Double-check your credentials
   - Ensure you're using carrier credentials, not agency credentials
   - Verify your account has ROLE_CARRIER permissions

### Debug Information

The test will log detailed information including:
- Request URL and headers
- Response status and headers  
- Response body (JSON or raw text)
- Error details if the request fails

## Next Steps

Once you've confirmed the API endpoint is working:

1. **Test with real upload IDs** if you have any active uploads
2. **Check the response format** to understand the data structure
3. **Integrate the API call** into your application logic
4. **Handle different status values** (pending, processing, completed, failed)

## Files Modified

- `src/utils/apiTest.ts` - Added hierarchy upload status test functions
- `src/components/AdminDebugPanel.tsx` - Added test button and results display
- `src/components/AdminDebugPanel.css` - Added styling for new button
- `src/utils/debugTestRunner.ts` - Added console test functions
- `test-hierarchy-api.js` - Standalone Node.js test script
- `API-TEST-README.md` - This documentation file
