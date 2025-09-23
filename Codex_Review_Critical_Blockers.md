Critical Blockers

High: All SureLC Basic Auth credentials are pulled into the browser bundle via VITE_* env vars and encoded on the client (src/lib/api.ts:1105, src/App.tsx:48, ENVIRONMENT-SETUP.md:16). Any user inspecting the app can recover the username/password pair, which is a direct breach of the carrier portal’s credential policy.
High: The frontend tries to call SureLC endpoints directly from the browser and only “proxies” to /api by string substitution (src/lib/api.ts:26). There is no protected backend in this repo, so production calls will fail CORS/preflight and you would be sending Basic credentials over the public internet even if it did work.
High: The shipped UI exposes the Run API Test control and full debug panel to every user (src/components/OrgChart.tsx:1349, src/components/APITestButton.tsx:17, src/components/AdminDebugPanel.tsx:17). These flows create auth tokens, hit bulk endpoints, and even attempt hierarchy uploads with fabricated files (src/utils/apiTest.ts:73), which is dangerous in production.
High: When the configured firm ID returns no data the app silently loads the first firm present in the payload and even exports it (src/components/OrgChart.tsx:231, src/components/OrgChart.tsx:305). That can disclose another agency’s hierarchy without the user realizing they’re looking at the wrong organization.
Major Gaps

Medium: The experience is single-tenant—firm name, badges, and MRFG-specific toggles are hard-coded (src/App.tsx:65, src/lib/transform.ts:142). Shipping to other clients would require a code deploy instead of configuration.
Medium: Virtualization is disabled and the chart renders every node (src/components/OrgChart.tsx:24). Large hierarchies will freeze the browser and spike API traffic when progressive loading kicks in.
Medium: Extensive console logging exposes raw API payloads (NPNs, status, error strings) and occasionally auth headers (src/lib/api.ts:120, src/components/OrgChart.tsx:280, src/utils/adminComparisonTest.ts:41). That’s a compliance concern for a licensed data set.
Medium: AdminDebugPanel renders mojibake strings like dY"? throughout the UI (src/components/AdminDebugPanel.tsx:38), which signals an encoding/copy issue and will look broken to end users.
Medium: There is no authentication or role model around the app; any person who loads the site gets full hierarchy access and export rights (src/App.tsx:59).
Open Questions

Where will the secure proxy/service that owns SureLC credentials run, and how will tokens be rotated?
Who should see debugging/test utilities, and how do we gate them?
Do we need audit logs or download controls around CSV export of producer NPNs/statuses?
What SLAs exist for data freshness and failure alerts when SureLC returns errors?
Next Steps

Stand up a backend (or serverless edge) that stores credentials, signs requests to SureLC, and exposes authenticated APIs to the UI; strip credentials from the client bundle.
Remove or behind feature flags the debug/test panels and noisy logging before production; replace with observability that runs server side.
Replace firm-specific constants with tenant-configurable data and reintroduce virtualization/pagination so large books of business remain usable.
-----------------------
I'll investigate the background mess in your application and console. Let me start by examining the current state and understanding what's causing the verbose logging.


[3 tools called]

Now let me examine more of the logging patterns and search for other sources of console output:


[3 tools called]

Let me also check for any debug/test utilities that might be running automatically:


[3 tools called]

Now let me check the environment setup and see if there are any production vs development flags:


[2 tools called]

Perfect! Now I have a comprehensive understanding of the issue. Let me also check what the debug utilities are doing:


[1 tool called]

## Analysis: Background Mess in Your Application

Based on my investigation, I've identified several sources of excessive console logging and background activity that are creating the "background mess" you're seeing. Here's what's happening and my recommendations:

### **Root Causes of Background Mess:**

1. **Automatic API Testing in Development** (`src/App.tsx:10-14`)
   - The app automatically runs `testAPIEndpoints()` after 3 seconds in development mode
   - This triggers comprehensive API testing that logs extensively

2. **Verbose API Logging** (`src/lib/api.ts`)
   - Every API request logs: URL, page size, fetch status, and total counts
   - The pagination loop in `fetchFirmRelationsAfter()` logs every single page fetch
   - Error handling logs detailed payloads and auth information

3. **Debug Utilities Auto-Loading** (`src/utils/debugTestRunner.ts`)
   - Debug utilities are imported and loaded automatically (`src/App.tsx:6`)
   - These expose extensive console commands and logging

4. **Admin Debug Panel Exposed to All Users**
   - Debug panels and API test buttons are visible to all users
   - These can trigger bulk data operations and extensive logging

### **Security & Compliance Issues (from your Critical Blockers doc):**
- Console logging exposes raw API payloads, NPNs, status data, and auth headers
- Debug utilities create auth tokens and hit bulk endpoints
- This is flagged as a compliance concern for licensed data

### **Recommended Action Plan:**

#### **Phase 1: Immediate Cleanup (High Priority)**
1. **Remove Auto-Running Tests**
   - Remove the automatic `testAPIEndpoints()` call in `App.tsx`
   - Only run tests when explicitly requested

2. **Reduce API Logging Verbosity**
   - Replace detailed fetch logging with summary logging
   - Remove sensitive data from console output
   - Keep only essential error logging

3. **Gate Debug Features**
   - Hide debug panels behind feature flags or admin-only access
   - Remove debug utilities from production builds

#### **Phase 2: Production Hardening (Medium Priority)**
1. **Environment-Based Logging**
   - Use `import.meta.env.DEV` to conditionally enable verbose logging
   - Implement proper log levels (error, warn, info, debug)

2. **Replace Console Logging**
   - Implement server-side logging/observability
   - Use proper logging framework instead of console statements

#### **Phase 3: Performance Optimization (Lower Priority)**
1. **Optimize API Calls**
   - Implement request deduplication
   - Add proper caching strategies
   - Reduce unnecessary API calls

### **Specific Changes Needed:**

1. **Remove automatic testing** from `App.tsx`
2. **Add environment checks** around all console.log statements
3. **Implement log levels** for different environments
4. **Gate debug features** behind proper authentication
5. **Remove sensitive data** from all console output

### **Is This Necessary?**
- **Development debugging**: Some logging is useful for development
- **Production**: Absolutely not - this violates security best practices
- **Current state**: The logging is excessive even for development
