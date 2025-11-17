# Upline Fields Verification

## Fields Being Fetched from HighLevel

The snapshot API is now correctly fetching **all** upline-related custom fields:

### ✅ Upline Linking Fields (for hierarchy building):
- `contact.upline_producer_id` - Primary field for linking contacts (NPN of upline)
- `contact.onboarding__upline_npn` - Alternative field for upline NPN
- `contact.onboarding__upline_email` - Email of upline contact

### ✅ Upline Metadata Fields:
- `contact.upline_name` - Name of the upline contact
- `contact.upline_highest_stage` - Highest stage of upline

### ✅ Upline Code Flags (Checkbox fields):
- `contact.upline_code_equita` - Indicates Equita vendor relationship
- `contact.upline_code_quility` - Indicates Quility vendor relationship

## How Fields Are Extracted

The code extracts these fields from the HighLevel API response:

```javascript
// Lines 189-206 in api/ghl/snapshot.js

// Upline Producer ID (for linking)
const uplineProducerRaw = custom['contact.upline_producer_id'] ?? custom['contact.onboarding__upline_npn'];
const uplineProducerId = normalizeDigits(Array.isArray(uplineProducerRaw) ? uplineProducerRaw[0] : uplineProducerRaw);

// Upline Email
const uplineEmailRaw = custom['contact.onboarding__upline_email'];
const uplineEmail = normalizeEmail(Array.isArray(uplineEmailRaw) ? uplineEmailRaw[0] : uplineEmailRaw);

// Upline Name
const uplineNameRaw = custom['contact.upline_name'];
const uplineName = safeTrim(Array.isArray(uplineNameRaw) ? uplineNameRaw[0] : uplineNameRaw);

// Upline Highest Stage
const uplineHighestStageRaw = custom['contact.upline_highest_stage'];
const uplineHighestStage = safeTrim(Array.isArray(uplineHighestStageRaw) ? uplineHighestStageRaw[0] : uplineHighestStageRaw);

// Upline Code Flags
const uplineCodeEquita = isTruthy(custom['contact.upline_code_equita']);
const uplineCodeQuility = isTruthy(custom['contact.upline_code_quility']);
```

## Field Storage in Node Structure

All fields are stored in the node object (lines 225-235):
- `uplineProducerId` - Normalized for matching
- `uplineProducerIdRaw` - Original raw value
- `uplineEmail` - Normalized email
- `uplineEmailRaw` - Original raw value
- `uplineName` - Name of upline
- `uplineNameRaw` - Original raw value
- `uplineHighestStage` - Stage information
- `aggregator.equita` - Boolean from `contact.upline_code_equita`
- `aggregator.quility` - Boolean from `contact.upline_code_quility`

## Returned in Hierarchy Response

All upline fields are included in the `raw` object (lines 442-448):
```javascript
raw: {
  uplineProducerId: node.uplineProducerIdRaw || null,
  uplineEmail: node.uplineEmailRaw || null,
  uplineName: node.uplineNameRaw || null,
  uplineHighestStage: node.uplineHighestStage || null,
  surelcId: node.surelcRaw || null,
}
```

## Verification

To verify fields are being fetched correctly:
1. Run: `node scripts/test-upline-fields.js`
2. Or visit: `http://localhost:3000/api/ghl/snapshot?debug=raw`

## Current Status

✅ **All fields are correctly configured**
- The field names match the custom fields in HighLevel
- The code extracts all upline-related fields
- Fields are normalized and stored properly

⚠️ **Data Issue**: Currently, none of the contacts have upline data populated in HighLevel
- This is why the hierarchy is flat (all contacts are root nodes)
- Once upline fields are populated in HighLevel, the hierarchy will build automatically

## Next Steps

To enable hierarchy visualization:
1. Populate `contact.upline_producer_id` field in HighLevel with the NPN of the upline contact
2. Or populate `contact.onboarding__upline_npn` field
3. The snapshot API will automatically match these to contact NPNs and build the hierarchy

