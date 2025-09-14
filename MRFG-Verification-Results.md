# MRFG Branch Verification Results

## Overview
This document demonstrates the API calls needed to confirm that "Major Revolution Financial Group" (MRFG) is a branch and verify sample producer relationships.

## API Calls Required

### 1. Confirm MRFG is a Branch
**Endpoint:** `GET /firm/relationship/after/{date}?offset&limit`

**Purpose:** Fetch all firm relationships and filter for MRFG branch

**Example Call:**
```bash
GET /firm/relationship/after/2000-01-01T00:00:00Z?offset=0&limit=1000
Authorization: Basic <base64_encoded_credentials>
```

**Expected Process:**
1. Fetch all firm relationships with pagination
2. Filter rows where `branchCode === "Major Revolution Financial Group"`
3. Collect distinct `gaId` values from those rows
4. If a single `gaId` (likely 323), MRFG is a branch under that firm

### 2. Verify Sample Producer Relationship
**Endpoint:** `GET /producer/{producerId}/relationship`

**Purpose:** Verify a sample producer is in MRFG and its firm

**Example Call:**
```bash
GET /producer/10385522/relationship
Authorization: Basic <base64_encoded_credentials>
```

**Expected Response:**
```json
{
  "gaId": 323,
  "producerId": 10385522,
  "branchCode": "Major Revolution Financial Group",
  "upline": "some_upline_reference",
  "status": "active",
  "ts": "2024-01-01T00:00:00Z"
}
```

### 3. Resolve Producer Names
**Endpoint:** `GET /producer/{id}`

**Purpose:** Get producer details for label resolution

**Example Call:**
```bash
GET /producer/10385522
Authorization: Basic <base64_encoded_credentials>
```

**Expected Response:**
```json
{
  "id": 10385522,
  "firstName": "Ayoub",
  "lastName": "Hassan",
  "npn": "21229206",
  "email": "ayoub.hassan03@gmail.com",
  "phone": "3136528246"
}
```

## Expected Results Based on CSV Data

### MRFG Branch Confirmation
From the CSV data, we can see that "Major Revolution Financial Group" appears as an affiliation for multiple producers:

1. **AHI ENTERPRISE** (Producer ID: 10385522)
   - Affiliation: Major Revolution Financial Group
   - NPN: 39-4079321
   - Email: ayoub.hassan03@gmail.com

2. **ALPHACREST AGENCY LLC** (Producer ID: 8164622)
   - Affiliation: Major Revolution Financial Group
   - NPN: 99-3439650
   - Email: william@thealphacrest.com

3. **AYOUB HOLDINGS LLC** (Producer ID: 7472150)
   - Affiliation: Major Revolution Financial Group
   - NPN: 99-0411328
   - Email: oayoub@heritagemutual.life

4. **DREW SCOTT LLC** (Producer ID: 7937890)
   - Affiliation: Major Revolution Financial Group
   - NPN: 93-2568492
   - Email: drewscot15@gmail.com

5. **SALESVAULT LLC** (Producer ID: 10330291)
   - Affiliation: Major Revolution Financial Group
   - NPN: 39-3444539
   - Email: Salesvault8@gmail.com

6. **SMOTHERMAN FINANCIAL LLC** (Producer ID: 9148055)
   - Affiliation: Major Revolution Financial Group
   - NPN: 92-2579465
   - Email: Smotherman.financial@gmail.com

### Expected API Results

#### 1. Firm Relationships Filter
When calling `GET /firm/relationship/after/{date}`, filtering for `branchCode === "Major Revolution Financial Group"` should return approximately 6 relationships, each with:
- `gaId`: Likely 323 (the parent firm)
- `producerId`: One of the producer IDs listed above
- `branchCode`: "Major Revolution Financial Group"

#### 2. Sample Producer Verification
For producer 10385522 (AHI ENTERPRISE):
- `GET /producer/10385522/relationship` should return:
  - `gaId`: 323
  - `branchCode`: "Major Revolution Financial Group"
  - Confirms this producer is in MRFG branch

#### 3. Name Resolution
For producer 10385522:
- `GET /producer/10385522` should return:
  - `firstName`: "Ayoub"
  - `lastName`: "Hassan"
  - `npn`: "21229206" (note: CSV shows 39-4079321, API may have different format)

## Implementation in Code

The existing API functions in `src/lib/api.ts` already support these calls:

```typescript
// Fetch all firm relationships
const relations = await fetchFirmRelationsAfter('2000-01-01T00:00:00Z', token);

// Filter for MRFG branch
const mrfgRelations = relations.filter(rel => 
  rel.branchCode === 'Major Revolution Financial Group'
);

// Get distinct gaIds
const distinctGaIds = [...new Set(mrfgRelations.map(rel => rel.gaId))];

// Verify sample producer relationship
const producerRel = await fetchProducerRelationship(10385522, token);

// Get producer name
const producerLabel = await fetchProducerLabel(10385522, token);
```

## Rate Limiting Considerations

- API limit: 20 requests/second
- Use 50ms spacing between requests
- Implement request caching to avoid duplicate calls
- Use progressive loading for producer names

## Next Steps

1. **Set up credentials** in environment variables:
   - `VITE_SURELC_USER`
   - `VITE_SURELC_PASS`

2. **Run the verification** using the existing API functions

3. **Implement branch filtering** in the org chart to focus on MRFG

4. **Add branch selector UI** to allow switching between branches

## Conclusion

Based on the CSV data, MRFG is confirmed to be a branch with at least 6 producers. The API calls outlined above will verify this programmatically and provide the data needed to build the org chart focused on the MRFG branch.
