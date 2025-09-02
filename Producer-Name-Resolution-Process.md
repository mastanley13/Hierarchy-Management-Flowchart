# Producer Name Resolution Process

## Overview

This document details how Producer names are discovered, fetched, and displayed in the Hierarchy Management System. The system uses a sophisticated multi-layered approach to efficiently load and display producer information while respecting API rate limits and providing a smooth user experience.

## Architecture Overview

The Producer name resolution process involves several key components working together:

1. **API Layer** (`src/lib/api.ts`) - Handles HTTP requests to the SURELC API
2. **Data Transformation** (`src/lib/transform.ts`) - Converts raw API data to chart structure
3. **Progressive Loader** (`src/lib/progressive-loader.ts`) - Manages background loading of producer names
4. **UI Component** (`src/components/OrgChart.tsx`) - Displays the hierarchy and manages state
5. **Type Definitions** (`src/lib/types.ts`) - Defines data structures

## API Endpoints

### Base Configuration
- **Development**: Uses proxy at `/api` (configured in Vite)
- **Production**: Direct connection to `https://surelc.surancebay.com/sbweb/ws`
- **Authentication**: Basic Auth using environment variables `VITE_SURELC_USER` and `VITE_SURELC_PASS`

### Key Endpoints

#### 1. Firm Relationships
```
GET /firm/relationship/after/{dateISO}?offset={offset}&limit={pageSize}
```
- Fetches all firm relationships after a specified date
- Supports pagination with configurable page size (default: 500)
- Returns `GARelation[]` array containing producer relationships

#### 2. Individual Producer Details
```
GET /producer/{id}
```
- Fetches detailed information for a specific producer by ID
- Returns `Producer` object with firstName, lastName, NPN, etc.

#### 3. Producer by NPN
```
GET /producer/npn/{npn}
```
- Searches for a producer using their National Producer Number (NPN)
- Returns `Producer` object or null if not found

#### 4. Producer Relationship
```
GET /producer/{producerId}/relationship
```
- Fetches relationship information for a specific producer
- Returns `GARelation` object

## Data Flow

### Phase 1: Initial Data Loading
1. **Fetch Firm Relations**: System calls `fetchFirmRelationsAfter()` to get all relationships
2. **Filter by Firm ID**: Relations are filtered to show only those belonging to the specified firm
3. **Create Chart Structure**: Raw relations are transformed into a hierarchical chart structure
4. **Display Placeholder Names**: Producers initially show as "Agent {ID}" or "Producer {ID}"

### Phase 2: Progressive Name Loading
1. **Identify Producers Needing Names**: System flags producers with `needsNameFetch: true`
2. **Background Processing**: `loadProducerNamesProgressively()` runs in the background
3. **Batch Processing**: Names are fetched in small batches (default: 3 concurrent requests)
4. **Rate Limiting**: 100ms delay between batches to respect API limits
5. **UI Updates**: Chart updates every 5 names loaded to show progress

## Producer Name Resolution Strategy

### 1. Caching System
- **Label Cache**: `Map<number, ProducerLabel>` stores resolved producer information
- **Persistent Storage**: Cache persists across component re-renders using `useRef`
- **Fallback Handling**: Failed fetches maintain fallback names to prevent UI breaks

### 2. Progressive Loading
```typescript
// Example of progressive loading configuration
loadProducerNamesProgressively(
  tree,
  labelCacheRef.current,
  token,
  updateCallback,
  2 // Only 2 concurrent API calls for conservative rate limiting
)
```

### 3. Error Handling
- **Network Failures**: Fallback to placeholder names
- **API Errors**: Logged to console, producer maintains fallback name
- **Rate Limit Exceeded**: Built-in delays prevent overwhelming the API

## Data Structures

### ProducerLabel
```typescript
export type ProducerLabel = {
  id: number;
  name: string;
  npn?: string;
  firstName?: string;
  lastName?: string;
};
```

### Producer
```typescript
export type Producer = {
  id: number;
  firstName?: string;
  lastName?: string;
  npn?: string;
  email?: string;
  licenses?: any[];
};
```

### GARelation
```typescript
export type GARelation = {
  id: number;
  gaId: number;
  producerId: number;
  branchCode?: string;
  upline?: string;
  subscribed?: string;
  unsubscriptionDate?: string;
  status?: string;
  addedOn?: string;
  errors?: string;
  errorDate?: string;
  warnings?: string;
  warningDate?: string;
  ts?: string;
};
```

## Search Functionality

### NPN Search
1. **User Input**: User enters NPN in search bar
2. **API Call**: `fetchProducerByNPN(npn, token)` searches for producer
3. **Tree Search**: `searchTreeByNPN()` locates producer in current hierarchy
4. **Selection**: Producer is highlighted and selected in the chart

### Search Flow
```typescript
const handleSearch = useCallback(async () => {
  const producer = await fetchProducerByNPN(state.searchQuery.trim(), token);
  if (producer && state.tree) {
    const foundNode = searchTreeByNPN(state.tree, producer.npn || '', labelCacheRef.current);
    if (foundNode) {
      setState(prev => ({ ...prev, selectedProducerId: producer.id }));
    }
  }
}, [state.searchQuery, state.tree]);
```

## Performance Optimizations

### 1. Lazy Loading
- Initial chart loads with placeholder names
- Producer details fetched progressively in background
- UI remains responsive during data loading

### 2. Rate Limiting
- Maximum 3 concurrent API requests
- 100ms delay between batches
- Respects API rate limits (target: under 20 req/sec)

### 3. Caching Strategy
- Producer names cached after first fetch
- Cache persists across component lifecycle
- Reduces redundant API calls

### 4. Batch Processing
- Names loaded in small batches
- Progress indicators show loading status
- Incremental UI updates every 5 names

## Error Handling and Fallbacks

### Network Failures
```typescript
try {
  const label = await fetchProducerLabel(producerId, token);
  labelCache.set(producerId, label);
} catch (error) {
  console.warn(`Failed to load name for producer ${producerId}:`, error);
  // Keep the fallback name
  if (producerNode.meta) {
    producerNode.meta.needsNameFetch = false;
  }
}
```

### Missing Data
- **No Producer Found**: Shows "Producer {ID}" as fallback
- **API Unavailable**: Maintains existing cached data
- **Invalid NPN**: Clear error message displayed to user

## Monitoring and Debugging

### Console Logging
- API request URLs and responses
- Producer loading progress
- Error conditions and fallbacks
- Cache hit/miss statistics

### Progress Indicators
- Loading bars for initial data fetch
- Name loading progress (X/Y producers)
- Visual indicators for producers with pending names

## Configuration Options

### Environment Variables
```bash
VITE_SURELC_BASE=https://surelc.surancebay.com/sbweb/ws
VITE_SURELC_USER=your_username
VITE_SURELC_PASS=your_password
```

### Rate Limiting
- **Concurrent Requests**: Configurable via `maxConcurrent` parameter
- **Batch Delays**: Adjustable timing between batches
- **Page Size**: Configurable pagination for initial data fetch

## Future Enhancements

### Potential Improvements
1. **Offline Support**: Cache producer names in localStorage
2. **Smart Prefetching**: Load names for visible producers first
3. **Background Sync**: Periodic refresh of producer information
4. **Advanced Caching**: TTL-based cache invalidation
5. **Bulk Operations**: Batch API calls for multiple producers

### Scalability Considerations
- **Large Hierarchies**: Current system handles 500+ producers efficiently
- **Memory Management**: Cache size monitoring and cleanup
- **API Optimization**: Request batching and compression

## Troubleshooting

### Common Issues

#### 1. Producer Names Not Loading
- Check API credentials in environment variables
- Verify network connectivity to SURELC API
- Check browser console for error messages
- Ensure rate limiting is not blocking requests

#### 2. Slow Performance
- Reduce concurrent request limit
- Increase delay between batches
- Check API response times
- Monitor cache hit rates

#### 3. Authentication Errors
- Verify `VITE_SURELC_USER` and `VITE_SURELC_PASS` are set
- Check if credentials have expired
- Ensure proper API permissions

### Debug Commands
```typescript
// Enable verbose logging
console.log('Label cache size:', labelCacheRef.current.size);
console.log('Producers needing names:', countProducersNeedingNames(tree));

// Check API responses
console.log('API response:', await fetchProducerLabel(producerId, token));
```

## Conclusion

The Producer name resolution process is designed to provide a smooth, responsive user experience while efficiently managing API resources. The progressive loading approach ensures that users can interact with the hierarchy immediately while producer details load in the background. The robust error handling and fallback mechanisms ensure the system remains functional even when facing network issues or API limitations.

This architecture balances performance, user experience, and API efficiency, making it suitable for both small agencies and large enterprise hierarchies with hundreds of producers.
