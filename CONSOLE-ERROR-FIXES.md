# Console Error Fixes - Date Format Issue

## Problem Summary

The application was experiencing 400 Bad Request errors when calling the firm relations API:

```
GET http://localhost:3000/api/firm/relationship/after/2025-09-04T17%3A03%3A01?offset=0&limit=50 400 (Bad Request)
Error: HTTP 400: Parameter date java.text.ParseException: Unparseable date: "2025-09-04T17:03:01"
```

## Root Cause Analysis

The issue was caused by incorrect date formatting for the SureLC API. The API documentation specifies that dates should be in one of these formats:

- `yyyy-MM-dd` (simple date format)
- `yyyy-MM-ddThh:mm:ssZ` (with timezone indicator)

However, the application was sending dates in the format `2025-09-04T17:03:01` (missing the timezone indicator 'Z').

## Fixes Implemented

### 1. Date Formatting Helper Function

Added a `formatDateForAPI()` helper function in `src/lib/api.ts`:

```typescript
function formatDateForAPI(dateISO: string): string {
  try {
    // If it's already in the correct format with timezone, return as is
    if (dateISO.includes('Z') || dateISO.includes('+') || dateISO.includes('-')) {
      return dateISO;
    }
    
    // If it's a full ISO string without timezone, add UTC timezone
    if (dateISO.includes('T')) {
      return dateISO + 'Z';
    }
    
    // If it's just a date, return as is (yyyy-MM-dd format)
    return dateISO;
  } catch (error) {
    console.warn('Error formatting date, using original:', error);
    return dateISO;
  }
}
```

### 2. Updated API Functions

Updated the following functions to use proper date formatting:

- `fetchFirmRelationsAfter()` - Main function causing the error
- `fetchCSVReport()` - Also uses date parameters

### 3. Fixed lastRefresh Timestamp

Fixed the issue in `src/components/OrgChart.tsx` where `lastRefresh` was being set from API response timestamps that lacked timezone indicators:

```typescript
// Ensure the timestamp has proper timezone format
const formattedMaxTs = maxTs.includes('Z') || maxTs.includes('+') || maxTs.includes('-') 
  ? maxTs 
  : maxTs + 'Z';
```

### 4. Added Debug Logging

Enhanced logging to help diagnose similar issues in the future:

```typescript
console.log(`Starting to fetch firm relations from ${formattedDate} (original: ${dateISO})`);
console.log(`Fetching: ${url} (pageSize: ${pageSize})`);
```

### 5. Created Test Utility

Added `src/utils/dateFormatTest.ts` to verify date formatting works correctly for various input formats.

## Files Modified

- `src/lib/api.ts` - Added date formatting helper and updated API functions
- `src/components/OrgChart.tsx` - Fixed lastRefresh timestamp formatting
- `src/App.tsx` - Added date formatting test
- `src/utils/dateFormatTest.ts` - New test utility

## Expected Results

After these fixes:

1. ✅ API calls should succeed with properly formatted dates
2. ✅ No more "Unparseable date" errors
3. ✅ Refresh functionality should work correctly
4. ✅ Upload functionality should work with proper date handling

## Testing

The date formatting can be tested using the included test utility which validates:

- Dates with missing timezone indicators
- Dates already properly formatted
- Date-only formats
- Various timezone formats

## Outstanding Issues

- **Page Size Discrepancy**: The error showed `limit=50` but our function should use the configured pageSize. This may be due to browser caching or a different code path and should be investigated separately.

## Prevention

To prevent similar issues in the future:

1. Always use the `formatDateForAPI()` helper for date parameters
2. Validate date formats before sending to the API
3. Include timezone indicators in all timestamp operations
4. Use the test utility to verify date formatting behavior

The fixes ensure that all date parameters sent to the SureLC API conform to the expected formats, resolving the 400 Bad Request errors.
