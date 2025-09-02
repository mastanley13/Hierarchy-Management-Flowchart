Awesome—here’s a tight, Cursor-ready build pack you can paste straight into your repo. It has everything a dev needs to ship the **one-page SureLC hierarchy org chart UI**: endpoints, auth, schemas, data flow, UI contract, pseudocode, and acceptance tests.

---

# **0\) Repo structure (suggested)**

/docs  
  /README.md                 \# quick start \+ run  
  /api\_spec.md               \# SureLC endpoints (HPRP format)  
  /ui\_contract.md            \# props, events, state, data shapes  
  /implementation\_plan.md    \# step-by-step tasks  
/src  
  /lib/api.ts                \# API client (fetch wrappers \+ pagination)  
  /lib/transform.ts          \# GARelation \-\> ChartTree mapping  
  /components/OrgChart.tsx   \# React org chart (or single-file HTML alt)  
/.env.example                \# env vars

If you prefer a single file, just keep **README.md** and embed the other sections below.

---

# **1\) README.md (Quick Start)**

## **Goal**

Render a vertical, one-page **Org Chart** of your **Agency (Firm) → Branch (branchCode) → Producers**, live from the **SureLC REST API** (no database required).

## **Auth & Environment**

Create `.env` (or Secrets in Cursor):

SURELC\_BASE=https://surelc.surancebay.com/sbweb/ws  
SURELC\_USER={AGENCY\_USERNAME}  
SURELC\_PASS={AGENCY\_PASSWORD}  
FIRM\_ID={YOUR\_FIRM\_ID}        \# numeric internal firm/GA id  
INITIAL\_SNAPSHOT\_DATE=2000-01-01T00:00:00Z  
PAGE\_LIMIT=500

## **Install & Run**

\# React \+ Vite (or Next.js) baseline  
pnpm i  
pnpm dev   \# or: npm run dev / yarn dev

---

# **2\) api\_spec.md (HPRP format)**

**SERVICE:** SureLC REST API  
 **BASE:** `${SURELC_BASE}` (default `https://surelc.surancebay.com/sbweb/ws`)  
 **AUTH:** `BASIC_AUTH` (HTTP Basic with Agency user), role: `ROLE_AGENCY` (NPN lookup also allows `ROLE_CARRIER`)  
 **LIMITS:** \~20 req/sec per service (be polite; throttle & batch)

## **2.1 Resolve Producer by NPN**

* **METHOD+PATH**: `GET /producer/npn/{npn}`

* **Purpose**: Get full Producer \+ **internal `id`** used in other endpoints.

* **Path params**: `npn: long (required)`

* **Query**: `licenseStatus?: string` (optional)

* **Response**: `Producer` (includes `id`, `firstName`, `lastName`, `npn`, `licenses[]`, etc.)

* **Errors**: 400, 403, 404, 500

* **Why this endpoint (not others)**: We can start from a public key (NPN) and get the canonical SureLC `producerId`.

## **2.2 Producer → GA relationship (single node)**

* **METHOD+PATH**: `GET /producer/{producerId}/relationship`

* **Purpose**: Find upline/downline linkage **for one producer**.

* **Path params**: `producerId: long (required)`

* **Response**: `GARelation`

* **Errors**: 400, 403, 404, 500

* **Why**: Node detail edges for a selected producer.

## **2.3 Firm → Producer relationships (bulk/deltas)**

* **METHOD+PATH**: `GET /firm/relationship/after/{date}?offset={long}&limit={long}`

* **Purpose**: **All** producer↔GA relations modified after a date.

* **Path params**:

  * `date: string` (formats: `yyyy-MM-dd` or `yyyy-MM-ddThh:mm:ssZ`)

* **Query**:

  * `offset: long` (pagination)

  * `limit: long` (pagination)

* **Response**: `GARelation[]`

* **Errors**: 400, 403, 404, 500

* **Why**: First load (use very early date) and incremental refreshes (use last `ts`).

*(If your tenant exposes `GET /firm/{firmId}/relationship`, you can use that for a non-paged snapshot of one firm. The paged “after” route is universal.)*

### **2.4 Object: `GARelation` (from vendor docs)**

* `id: long` — internal relationship row id

* `gaId: long` — **Firm** internal id (the parent)

* `producerId: long` — **Producer** internal id (the child)

* `branchCode: string` — use as our “Sub-agency / Branch” grouping

* `upline: string` — label of the upline in agency (informational)

* `subscribed: string` — NIPR alerts subscription flag

* `unsubscriptionDate: date`

* `status: string` — agency-level status (**badge**)

* `addedOn: string`

* `errors: string` — critical errors (badge/tooltip)

* `errorDate: string`

* `warnings: string` — warnings (badge/tooltip)

* `warningDate: string`

* `ts: string (YYYY-MM-DDThh:mm:ss)` — last modification timestamp (ET)

**Sibling check:** We considered `/producer/relationship/after/{date}` (producer-scoped deltas). We’re building a firm org chart—**firm-scoped** deltas are a better fit to avoid cross-firm joins.

---

# **3\) ui\_contract.md (components, props, types)**

## **3.1 TypeScript shapes**

// Thin Producer label for UI  
export type ProducerLabel \= {  
  id: number;  
  name: string;     // "First Last"  
  npn?: string;  
};

// Raw relation from API (subset used)  
export type GARelation \= {  
  gaId: number;  
  producerId: number;  
  branchCode?: string;  
  status?: string;  
  errors?: string;  
  warnings?: string;  
  ts?: string;      // YYYY-MM-DDThh:mm:ss  
};

// Tree shape for the chart  
export type ChartTree \= {  
  id: string;                        // "ga:123" | "branch:ABC" | "producer:908"  
  label: string;                     // display name  
  badges?: { status?: string; hasErrors?: boolean; hasWarnings?: boolean };  
  meta?: { branchCode?: string };  
  children?: ChartTree\[\];  
};

// Component props  
export type OrgChartProps \= {  
  firmId: number;                    // root GA id  
  initialDate?: string;              // ISO; default: 2000-01-01T00:00:00Z  
  pageLimit?: number;                // default: 500  
  fetchAuth: () \=\> string;           // returns Basic token header value  
  onSelectProducer?: (producerId: number) \=\> void; // click handler  
};

## **3.2 Events**

* `onSelectProducer(producerId)` → open a right-hand drawer and fetch `/producer/{producerId}` for detail.

## **3.3 Rendering rules**

* Vertical layout: GA → Branch → Producers

* Branch grouping: `branchCode` (fallback “Unassigned”)

* Producer node:

  * label \= Producer “First Last”

  * badges: `status` chip; red dot if `errors`; yellow dot if `warnings`

* Search bar (optional): NPN → fetch `/producer/npn/{npn}` → auto-scroll/flash node

* Refresh button: rerun delta pull using `lastSeenTs` → update nodes

---

# **4\) implementation\_plan.md (step-by-step)**

## **Milestone A — API client**

1. **Auth helper**

export const authHeader \= (user: string, pass: string) \=\>  
  'Basic ' \+ btoa(\`${user}:${pass}\`);

2. **GET JSON with throttling**

const sleep \= (ms:number)=\>new Promise(r=\>setTimeout(r,ms));

export async function getJSON\<T\>(path: string, token: string): Promise\<T\> {  
  const res \= await fetch(\`${import.meta.env.VITE\_SURELC\_BASE}${path}\`, {  
    headers: { 'Authorization': token }  
  });  
  if (\!res.ok) throw new Error(\`${res.status} ${await res.text()}\`);  
  return res.json() as Promise\<T\>;  
}

3. **Paged fetch for firm relations**

export async function fetchFirmRelationsAfter(  
  dateISO: string,  
  token: string,  
  page=500  
): Promise\<GARelation\[\]\> {  
  const base \= import.meta.env.VITE\_SURELC\_BASE;  
  let offset \= 0, out: GARelation\[\] \= \[\];  
  while (true) {  
    const url \= \`/firm/relationship/after/${encodeURIComponent(dateISO)}?offset=${offset}\&limit=${page}\`;  
    const chunk \= await getJSON\<GARelation\[\]\>(url, token);  
    out.push(...chunk);  
    if (chunk.length \< page) break;  
    offset \+= page;  
    await sleep(60); // gentle pacing under 20 rps  
  }  
  return out;  
}

4. **Producer label hydrator (on demand)**

export async function fetchProducerLabel(id: number, token: string): Promise\<ProducerLabel\> {  
  const p \= await getJSON\<any\>(\`/producer/${id}\`, token);  
  const name \= \[p.firstName, p.lastName\].filter(Boolean).join(' ');  
  return { id, name, npn: p.npn };  
}

## **Milestone B — Transform to chart tree**

export function relationsToChart(  
  firmId: number,  
  rels: GARelation\[\],  
  labelLookup: (id:number)=\>Promise\<ProducerLabel\>  
): Promise\<ChartTree\> {  
  const byBranch \= new Map\<string, GARelation\[\]\>();  
  for (const r of rels) {  
    if (r.gaId \!== firmId) continue;       // safety filter  
    const key \= r.branchCode?.trim() || 'Unassigned';  
    if (\!byBranch.has(key)) byBranch.set(key, \[\]);  
    byBranch.get(key)\!.push(r);  
  }

  async function branchNode(branch: string, rows: GARelation\[\]): Promise\<ChartTree\> {  
    const kids: ChartTree\[\] \= \[\];  
    for (const r of rows) {  
      const label \= await labelLookup(r.producerId);  
      kids.push({  
        id: \`producer:${r.producerId}\`,  
        label: label.name,  
        badges: {  
          status: r.status,  
          hasErrors: \!\!r.errors?.trim(),  
          hasWarnings: \!\!r.warnings?.trim()  
        }  
      });  
    }  
    return { id: \`branch:${branch}\`, label: branch, meta: { branchCode: branch }, children: kids };  
  }

  return Promise.all(  
    \[...byBranch.entries()\].map((\[b, rows\]) \=\> branchNode(b, rows))  
  ).then(children \=\> ({  
    id: \`ga:${firmId}\`,  
    label: \`Agency ${firmId}\`,  // or hydrate once via GET /firm/{firmId}  
    children  
  }));  
}

## **Milestone C — UI (React; swap for vanilla if you prefer)**

* Use a small org-chart lib or `d3-hierarchy + d3-tree`.

* Add **search (NPN)**, **refresh**, and **drawer**.

export default function OrgChart(props: OrgChartProps) {  
  const \[tree, setTree\] \= useState\<ChartTree | null\>(null);  
  const \[lastTs, setLastTs\] \= useState(props.initialDate ?? '2000-01-01T00:00:00Z');  
  const token \= props.fetchAuth();

  const load \= useCallback(async () \=\> {  
    const rels \= await fetchFirmRelationsAfter(lastTs, token, props.pageLimit ?? 500);  
    // NOTE: if first load, you may want a “full” date; for refreshes, pass the latest ts you saw.  
    const labelCache \= new Map\<number, ProducerLabel\>();  
    const getLabel \= (id:number) \=\>  
      labelCache.get(id) ?? fetchProducerLabel(id, token).then(l \=\> (labelCache.set(id, l), l));  
    const t \= await relationsToChart(props.firmId, rels, getLabel);  
    // update lastTs to the max r.ts seen  
    const maxTs \= rels.reduce((m,r)=\> r.ts && r.ts\>m ? r.ts : m, lastTs);  
    setLastTs(maxTs);  
    setTree(t);  
  }, \[props.firmId, token, lastTs\]);

  useEffect(() \=\> { load(); }, \[\]);

  return (  
    \<div className="orgchart"\>  
      \<header\>  
        \<button onClick={load}\>Refresh\</button\>  
      \</header\>  
      {tree ? \<ChartRenderer tree={tree} onSelectProducer={props.onSelectProducer}/\> : 'Loading…'}  
    \</div\>  
  );  
}

---

# **5\) Security & PII**

* Never render or log **SSN**, **EFT**, or other sensitive fields from `Producer`.

* Limit profile pane to `name`, `npn`, `email` (optional), and a **brief license summary**.

* Keep **Basic Auth** in server-side env if you later deploy behind a backend; for local dev, Cursor will inject secrets at runtime.

---

# **6\) Acceptance criteria**

1. **Initial render**: Given a valid `FIRM_ID`, the UI shows:

   * Root “Agency {FIRM\_ID}”

   * One child node per **branchCode** (fallback “Unassigned”)

   * Under each branch, all Producers for that branch

2. **Badges**: Each producer node shows:

   * status chip (text)

   * red dot if `errors` present; yellow dot if `warnings` present (tooltip with full text on hover)

3. **Search**: Enter NPN → chart scrolls to producer node (or shows “Not found” toast).

4. **Refresh**: Clicking **Refresh** calls the “after/{date}” endpoint using the last seen `ts`, updates nodes without full re-render pauses.

5. **Performance**: For 1,000+ producers:

   * Initial snapshot completes under 5s on a normal connection (paging with `limit=500`)

   * Subsequent refreshes complete under 1s with small deltas

6. **Limits**: The app stays comfortably under \~20 req/sec (throttled label hydration).

---

# **7\) Manual test checklist**

* ✅ Known NPN returns proper Producer label; drawer shows profile sans PII

* ✅ Producers with no `branchCode` appear under “Unassigned”

* ✅ Relationship errors/warnings visible as badges; tooltip shows string from GARelation

* ✅ Pagination works (`offset` increments) until short page received

* ✅ Invalid creds produce a user-friendly error (403)

* ✅ 404 on NPN search produces a toast “No producer found”

---

# **8\) cURL snippets (copy to Postman)**

\# Producer by NPN  
curl \-u "$SURELC\_USER:$SURELC\_PASS" \\  
  "$SURELC\_BASE/producer/npn/19421270"

\# Producer → GA relationship  
curl \-u "$SURELC\_USER:$SURELC\_PASS" \\  
  "$SURELC\_BASE/producer/5086079/relationship"

\# Firm relationships (deltas; first snapshot uses early date)  
curl \-u "$SURELC\_USER:$SURELC\_PASS" \\  
  "$SURELC\_BASE/firm/relationship/after/2000-01-01T00:00:00Z?offset=0\&limit=500"

---

# **9\) Prompt Tweaks (for Cursor)**

* “Build a React component `<OrgChart />` using the **api\_spec.md** and **ui\_contract.md**. Start with a mocked `GARelation[]` then wire to the real API.”

* “Use `d3-hierarchy` \+ `d3-tree` for a vertical layout; producers as leaf nodes with status chips; branches as group nodes.”

* “Throttle API calls to \< 10/second during label hydration.”

---

## **Next Steps**

* Paste this pack into `/docs` and `/src` in Cursor.

* Set `.env` with `SURELC_*` creds \+ `FIRM_ID`.

* Build `<OrgChart />` using the provided types and functions.

* When ready, I can also deliver a **single-file HTML** version (no React) if you want a pure drop-in demo.

