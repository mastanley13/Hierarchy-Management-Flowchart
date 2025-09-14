# Hierarchy Upload Functionality

## Overview

The Hierarchy Upload functionality has been successfully implemented to complement the existing hierarchy management system. This feature allows users to upload Excel or CSV files to update their organization's hierarchy structure using the carrier upload APIs.

## Features Implemented

### ✅ Core Upload APIs
- **POST /carrier/uploadHierarchy** - Upload hierarchy files (Excel/CSV)
- **GET /carrier/uploadHierarchy/{id}** - Monitor upload status
- **File validation** - Type, size, and format validation
- **Progress monitoring** - Real-time upload progress tracking
- **Error handling** - Comprehensive error reporting and recovery

### ✅ User Interface Components
- **HierarchyUpload Component** - Complete upload interface with drag-and-drop
- **Progress tracking** - Visual progress bars and status indicators
- **Upload history** - Track and manage previous uploads
- **File validation feedback** - Real-time validation with helpful error messages

### ✅ Integration
- **OrgChart Integration** - Upload button in main toolbar
- **Automatic refresh** - Hierarchy data refreshes after successful upload
- **State management** - Proper loading states and error handling
- **Authentication** - Carrier role authentication support

## File Structure

```
src/
├── components/
│   ├── HierarchyUpload.tsx      # Main upload component
│   ├── HierarchyUpload.css      # Upload component styles
│   └── UploadTest.tsx           # Test suite for upload functionality
├── lib/
│   ├── api.ts                   # Upload API functions
│   └── types.ts                 # Upload-related type definitions
└── demo-hierarchy-upload.csv    # Sample upload file
```

## API Functions

### Core Upload Functions
```typescript
// Upload a hierarchy file
uploadHierarchyFile(file: File, token: string): Promise<HierarchyUploadResult>

// Get upload status
getHierarchyUploadStatus(uploadId: string, token: string): Promise<HierarchyUploadStatus>

// Monitor upload progress with polling
monitorUploadProgress(uploadId: string, token: string, onProgress?: Function): Promise<HierarchyUploadStatus>

// Complete upload workflow
uploadHierarchyWithMonitoring(file: File, token: string, onProgress?: Function): Promise<HierarchyUploadStatus>
```

### Utility Functions
```typescript
// Validate file before upload
validateHierarchyFile(file: File): FileValidationResult

// Create carrier authentication token
createCarrierAuthToken(): string
```

## Usage

### 1. Access Upload Feature
- Click the "Upload Data" button in the main toolbar
- The upload interface will appear below the toolbar

### 2. Upload a File
- Drag and drop a file or click "Browse Files"
- Supported formats: .xls, .xlsx, .csv (max 10MB)
- File validation happens automatically

### 3. Monitor Progress
- Real-time progress bar shows upload status
- Status updates: pending → processing → completed/failed
- Record count and processing details displayed

### 4. View History
- Click "Upload History" to see previous uploads
- Track upload status, errors, and warnings
- View processing times and record counts

## File Format Requirements

### CSV Format
```csv
Producer ID,Producer Name,NPN,Branch Code,Upline ID,Status,Subscribed,Added On,Errors,Warnings
7472150,John Smith,1234567890,Major Revolution Financial Group,,Active,Yes,2025-05-05,,
7937890,Jane Doe,2345678901,Major Revolution Financial Group,7472150,Active,Yes,2025-06-15,,
```

### Excel Format
- Same column structure as CSV
- First row should contain headers
- Data starts from row 2

## Configuration

### Environment Variables
```env
# Carrier authentication (optional - falls back to agency auth)
VITE_CARRIER_USER=your_carrier_username
VITE_CARRIER_PASS=your_carrier_password

# API proxy configuration
VITE_API_PROXY=/api/proxy?path=
```

### Authentication
- Uses `ROLE_CARRIER` authentication for upload operations
- Falls back to `ROLE_AGENCY` credentials if carrier credentials not provided
- Basic Auth with username/password

## Error Handling

### File Validation Errors
- Invalid file type (not Excel/CSV)
- File too large (>10MB)
- Empty file
- Malformed data

### Upload Errors
- Authentication failures
- Network connectivity issues
- Server processing errors
- Data validation failures

### Recovery
- Automatic retry for transient errors
- Clear error messages with actionable guidance
- Upload history preserves error details for debugging

## Testing

### Test Suite
The `UploadTest` component provides comprehensive testing:
- File validation testing
- Authentication token creation
- API endpoint availability
- Component integration verification

### Manual Testing
1. Use the provided `demo-hierarchy-upload.csv` file
2. Test with various file formats and sizes
3. Verify progress tracking and error handling
4. Check upload history functionality

## Integration Points

### With Existing System
- **OrgChart Component**: Upload button in toolbar
- **State Management**: Integrated with existing loading states
- **Data Refresh**: Automatic hierarchy refresh after successful upload
- **Error Handling**: Consistent with existing error patterns

### API Integration
- **Rate Limiting**: Respects 20 req/sec limit
- **Authentication**: Uses existing auth infrastructure
- **Proxy Support**: Works with development and production proxy setups

## Future Enhancements

### Potential Improvements
- **Batch Upload**: Support for multiple files
- **Template Download**: Provide upload templates
- **Advanced Validation**: More sophisticated data validation
- **Upload Scheduling**: Scheduled uploads for large datasets
- **Notification System**: Email/SMS notifications for upload completion

### Performance Optimizations
- **Chunked Upload**: For very large files
- **Compression**: File compression before upload
- **Caching**: Upload result caching
- **Background Processing**: Non-blocking upload processing

## Troubleshooting

### Common Issues

1. **Upload Button Not Visible**
   - Check if `showUpload` state is properly initialized
   - Verify component imports are correct

2. **Authentication Errors**
   - Verify carrier credentials in environment variables
   - Check if `ROLE_CARRIER` permissions are available

3. **File Validation Failures**
   - Ensure file is Excel (.xls, .xlsx) or CSV format
   - Check file size is under 10MB
   - Verify file is not empty

4. **Progress Not Updating**
   - Check network connectivity
   - Verify API endpoint is accessible
   - Check browser console for errors

### Debug Mode
Enable debug logging by setting:
```javascript
localStorage.setItem('debug', 'hierarchy-upload');
```

## Conclusion

The Hierarchy Upload functionality is now fully implemented and integrated into the existing hierarchy management system. It provides a complete solution for bulk hierarchy updates with proper validation, progress tracking, and error handling. The implementation follows the existing code patterns and integrates seamlessly with the current architecture.

The feature is ready for production use and provides a solid foundation for future enhancements and optimizations.
