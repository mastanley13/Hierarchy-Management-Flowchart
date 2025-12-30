// Serverless endpoint to fetch SureLC data for a single contact.
//
// Query params:
//   - npn: string (optional)
//   - producerId: string|number (optional)
//   - which: "QUILITY" | "EQUITA" | "GENERAL" | "AUTO" (optional, default AUTO)
//
// Environment variables (server-side; do NOT use VITE_* in production):
//   - SURELC_BASE (optional, default https://surelc.surancebay.com/sbweb/ws)
//   - SURELC_USER_EQUITA / SURELC_PASS_EQUITA
//   - SURELC_USER_QUILITY / SURELC_PASS_QUILITY
//   - SURELC_USER / SURELC_PASS (fallback)
//
// Compatibility fallback (discouraged): will read VITE_SURELC_* if SURELC_* missing.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE = 'https://surelc.surancebay.com/sbweb/ws';
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = globalThis.__SURELC_CONTACT_CACHE__ || new Map();
globalThis.__SURELC_CONTACT_CACHE__ = cache;

// Best-effort .env fallback in dev: Vite's dev middleware does not always populate process.env.
function loadEnvFallback() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // noop: only a dev convenience
  }
}

function loadTestCredentialFallback() {
  try {
    const credPath = path.join(process.cwd(), 'test.credentials.md');
    if (!fs.existsSync(credPath)) return;
    const text = fs.readFileSync(credPath, 'utf8');

    // Support JS snippets like: var AUTH_EQ = 'Basic ...';
    const eq = text.match(/AUTH_EQ\s*=\s*['"]([^'"]+)['"]/);
    const qu = text.match(/AUTH_QU\s*=\s*['"]([^'"]+)['"]/);

    // Only use these tokens as a fallback when user/pass is not configured.
    const hasEquitaUserPass =
      Boolean((process.env.SURELC_USER_EQUITA || process.env.VITE_SURELC_USER_EQUITA || process.env.VITE_SURELC_USER) &&
      (process.env.SURELC_PASS_EQUITA || process.env.VITE_SURELC_PASS_EQUITA || process.env.VITE_SURELC_PASS));
    const hasQuilityUserPass =
      Boolean((process.env.SURELC_USER_QUILITY || process.env.VITE_SURELC_USER_QUILITY) &&
      (process.env.SURELC_PASS_QUILITY || process.env.VITE_SURELC_PASS_QUILITY));

    if (eq && !hasEquitaUserPass && !process.env.SURELC_AUTH_EQUITA) {
      process.env.SURELC_AUTH_EQUITA = eq[1].trim();
    }
    if (qu && !hasQuilityUserPass && !process.env.SURELC_AUTH_QUILITY) {
      process.env.SURELC_AUTH_QUILITY = qu[1].trim();
    }
  } catch {
    // noop: only a dev convenience
  }
}

loadEnvFallback();
loadTestCredentialFallback();

const normalizeDigits = (value) =>
  typeof value === 'string'
    ? value.replace(/\D+/g, '')
    : typeof value === 'number'
      ? String(value).replace(/\D+/g, '')
      : '';

const basicAuthHeader = (user, pass) =>
  `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;

const buildCors = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  );
};

function getCredentialOptions() {
  const read = (key, legacyKey) =>
    (process.env[key] || '').trim() || (process.env[legacyKey] || '').trim() || '';

  const equita = {
    label: 'EQUITA',
    token: read('SURELC_AUTH_EQUITA', ''),
    user: read('SURELC_USER_EQUITA', 'VITE_SURELC_USER_EQUITA'),
    pass: read('SURELC_PASS_EQUITA', 'VITE_SURELC_PASS_EQUITA'),
  };
  const quility = {
    label: 'QUILITY',
    token: read('SURELC_AUTH_QUILITY', ''),
    user: read('SURELC_USER_QUILITY', 'VITE_SURELC_USER_QUILITY'),
    pass: read('SURELC_PASS_QUILITY', 'VITE_SURELC_PASS_QUILITY'),
  };
  const general = {
    label: 'GENERAL',
    token: read('SURELC_AUTH', ''),
    user: read('SURELC_USER', 'VITE_SURELC_USER'),
    pass: read('SURELC_PASS', 'VITE_SURELC_PASS'),
  };

  return { equita, quility, general };
}

function resolveCredentialOrder(whichRaw) {
  const which = String(whichRaw || 'AUTO').trim().toUpperCase();
  const { equita, quility, general } = getCredentialOptions();

  const asToken = (entry) =>
    // Prefer user/pass so password changes take effect even if old SURELC_AUTH_* tokens exist.
    entry.user && entry.pass
      ? { ...entry, token: basicAuthHeader(entry.user, entry.pass) }
      : entry.token
        ? { ...entry, token: entry.token }
        : null;

  const tokens = {
    EQUITA: asToken(equita),
    QUILITY: asToken(quility),
    GENERAL: asToken(general),
  };

  const order =
    which === 'EQUITA'
      ? ['EQUITA', 'GENERAL', 'QUILITY']
      : which === 'QUILITY'
        ? ['QUILITY', 'GENERAL', 'EQUITA']
        : which === 'GENERAL'
          ? ['GENERAL', 'QUILITY', 'EQUITA']
          : ['QUILITY', 'EQUITA', 'GENERAL'];

  const resolved = order.map((k) => tokens[k]).filter(Boolean);
  if (!resolved.length) {
    throw new Error(
      'Missing SureLC credentials. Set SURELC_USER_*/SURELC_PASS_* server-side (recommended).',
    );
  }
  return resolved;
}

function classifyLookupStatus(endpoints) {
  const lookup = endpoints?.producerByNpn || endpoints?.producerById || null;
  const status = lookup?.status ?? null;
  if (status === 200) return { state: 'ok', status };
  if (status === 404) return { state: 'not_found', status };
  if (status === 401 || status === 403) return { state: 'blocked', status };
  if (status) return { state: 'failed', status };
  return { state: 'failed', status: null };
}

async function buildView(baseUrl, cred, identifiers) {
  if (!cred?.token) {
    return {
      ok: false,
      which: cred?.label || 'UNKNOWN',
      available: false,
      errorCode: 'MISSING_CREDENTIALS',
      error: 'Credentials not configured for this view.',
      identifiers,
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const result = await fetchAll(baseUrl, cred.token, identifiers);
    const endpoints = result.endpoints || {};
    const includeEndpoints = Boolean(cred?.includeEndpoints);
    const producerResolved = result.producerId || identifiers.producerId || null;
    const lookupClass = classifyLookupStatus(endpoints);

    if (lookupClass.state === 'ok' || Object.values(endpoints).some((r) => r && r.ok)) {
      return {
        ok: true,
        which: cred.label,
        available: true,
        identifiers: { npn: identifiers.npn || null, producerId: producerResolved },
        fetchedAt: new Date().toISOString(),
        summary: buildSummary(endpoints, { npn: identifiers.npn || null, producerId: producerResolved }),
        endpoints: includeEndpoints ? redactEndpoints(endpoints) : undefined,
        endpointsMeta: Object.fromEntries(
          Object.entries(endpoints).map(([key, value]) => [
            key,
            value
              ? {
                  ok: value.ok,
                  status: value.status,
                  statusText: value.statusText,
                  url: value.url,
                  shape: Array.isArray(value.body)
                    ? { type: 'array', count: value.body.length }
                    : value.body && typeof value.body === 'object'
                      ? { type: 'object', keys: Object.keys(value.body).length }
                      : { type: typeof value.body },
                }
              : null,
          ]),
        ),
      };
    }

    const errorCode =
      lookupClass.state === 'not_found'
        ? 'NOT_FOUND'
        : lookupClass.state === 'blocked'
          ? 'ACCESS_DENIED'
          : 'FAILED';

    const blockedHint =
      lookupClass.state === 'blocked' && lookupClass.status === 401
        ? 'SureLC rejected these credentials. Verify the username/password env vars and restart the dev server so the backend picks up the change.'
        : lookupClass.state === 'blocked' && lookupClass.status === 403
          ? 'This usually means the producer is outside your SureLC account scope (firm/subscription/permissions).'
          : undefined;

    return {
      ok: false,
      which: cred.label,
      available: true,
      errorCode,
      error:
        errorCode === 'NOT_FOUND'
          ? 'Producer not found in SureLC for the provided identifier.'
        : errorCode === 'ACCESS_DENIED'
            ? lookupClass.status === 401
              ? 'SureLC rejected the configured credentials for this account.'
              : 'Access denied in SureLC for this producer.'
            : 'SureLC request failed.',
      identifiers: { npn: identifiers.npn || null, producerId: producerResolved },
      fetchedAt: new Date().toISOString(),
      hint:
        errorCode === 'ACCESS_DENIED' ? blockedHint : undefined,
      endpoints: includeEndpoints ? redactEndpoints(endpoints) : undefined,
      endpointsMeta: Object.fromEntries(
        Object.entries(endpoints).map(([key, value]) => [
          key,
          value ? { ok: value.ok, status: value.status, statusText: value.statusText, url: value.url } : null,
        ]),
      ),
    };
  } catch (err) {
    return {
      ok: false,
      which: cred.label,
      available: true,
      errorCode: 'FAILED',
      error: 'SureLC request failed.',
      details: String(err?.message || err),
      identifiers,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function redactPII(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactPII);

  const piiKeys = new Set([
    'ssn',
    'socialSecurityNumber',
    'social_security_number',
    'dob',
    'dateOfBirth',
    'birthDate',
    'email',
    'entityEmail',
    'phone',
    'entityPhone',
    'mobile',
    'cell',
    'fax',
    'address',
    'businessAddress',
    'mailingAddress',
    'residentAddress',
    'dbaBusinessAddress',
    'dbaMailingAddress',
    'address1',
    'address2',
    'line1',
    'line2',
    'city',
    'zip',
    'zipCode',
    'zipcode',
    'postalCode',
    'firstName',
    'lastName',
    'middleName',
    'driverLic',
    'driverLicense',
    'driverLicState',
    'driverLicenseExp',
    'entityTin',
    'tin',
    'taxId',
    // Financial / policy identifiers (sensitive)
    'routingNum',
    'accountNum',
    'accountNumber',
    'bankPhoneNumber',
    'policyNo',
    'certificateNo',
  ]);

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (piiKeys.has(k) || /ssn|social/i.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactPII(v);
    }
  }
  return out;
}

function includeEndpointsFromQuery(query) {
  const truthy = (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
  };

  if (truthy(query?.includeEndpoints) || truthy(query?.endpoints) || truthy(query?.raw)) return true;

  const include = String(query?.include ?? '').trim().toLowerCase();
  if (!include) return false;
  const parts = include
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.includes('endpoints') || parts.includes('endpoint') || parts.includes('raw') || parts.includes('all');
}

function redactEndpoints(endpoints) {
  if (!endpoints || typeof endpoints !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(endpoints).map(([key, value]) => {
      if (!value || typeof value !== 'object') return [key, value];
      return [
        key,
        {
          ...value,
          body: redactPII(value.body),
        },
      ];
    }),
  );
}

function isInvalidCredential401(view) {
  if (!view || typeof view !== 'object') return false;
  if (view.errorCode !== 'ACCESS_DENIED') return false;
  const meta = view.endpointsMeta || {};
  const statuses = [
    meta.producerByNpn?.status,
    meta.producerById?.status,
    meta.relationship?.status,
  ].filter((s) => typeof s === 'number');
  return statuses.includes(401);
}

async function surelcGet(baseUrl, pathname, token) {
  const url = `${baseUrl}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: 'application/json',
    },
  });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text().catch(() => '');
  const body = contentType.includes('application/json')
    ? (() => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return { raw: text };
        }
      })()
    : text;
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    url,
    body,
  };
}

async function fetchAll(baseUrl, token, identifiers) {
  const out = {};
  const npn = identifiers.npn || null;
  let producerId = identifiers.producerId || null;

  if (npn) {
    const byNpn = await surelcGet(baseUrl, `/producer/npn/${encodeURIComponent(npn)}`, token);
    out.producerByNpn = byNpn;
    if (byNpn.ok && byNpn.body && typeof byNpn.body === 'object') {
      const id = byNpn.body.id ?? byNpn.body.producerId ?? byNpn.body.producer_id;
      if (!producerId && id) producerId = normalizeDigits(id);
    }
  }

  if (!producerId) {
    return { producerId: null, endpoints: out };
  }

  const endpoints = [
    ['producerById', `/producer/${encodeURIComponent(producerId)}`],
    ['relationship', `/producer/${encodeURIComponent(producerId)}/relationship`],
    ['licenses', `/producer/${encodeURIComponent(producerId)}/licenses`],
    ['appointments', `/producer/${encodeURIComponent(producerId)}/appointments`],
    ['contracts', `/contract/producer/${encodeURIComponent(producerId)}`],
    ['addresses', `/producer/${encodeURIComponent(producerId)}/addresses`],
  ];

  for (const [key, pathname] of endpoints) {
    out[key] = await surelcGet(baseUrl, pathname, token);
  }

  return { producerId, endpoints: out };
}

function buildSummary(endpoints, identifiers) {
  const summary = {
    identifiers: {
      npn: identifiers?.npn || null,
      producerId: identifiers?.producerId || null,
    },
    compliance: {
      aml: {
        date: null,
        provider: null,
      },
      eno: {
        carrierName: null,
        policyNoMasked: null,
        certificateNoMasked: null,
        startedOn: null,
        expiresOn: null,
        caseLimit: null,
        totalLimit: null,
      },
      securities: {
        finraLicense: null,
        crdNo: null,
        brokerDealer: null,
        investmentAdviser: null,
      },
      designations: [],
      dataAsOf: null,
    },
    producer: {
      recordType: null,
      title: null,
      companyType: null,
      entityType: null,
      createdDate: null,
    },
    relationship: {
      gaId: null,
      branchCode: null,
      upline: null,
      status: null,
      subscribed: null,
      unsubscriptionDate: null,
      addedOn: null,
      errors: null,
      warnings: null,
    },
    statuses: {
      producer: null,
      bga: null,
      carrier: null,
    },
    licenses: {
      total: 0,
      byStatus: [],
      soonestExpiration: null,
      residentStates: [],
    },
    appointments: {
      total: 0,
      byStatus: [],
      appointedCarriers: 0,
      terminatedCarriers: 0,
      byCarrierTop: [],
    },
    contracts: {
      total: 0,
      byStatus: [],
      activeCarriers: 0,
      byCarrierTop: [],
    },
  };

  const safeObject = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const safeArray = (value) => (Array.isArray(value) ? value : []);

  const pick = (obj, keys) => {
    if (!obj) return null;
    for (const key of keys) {
      const val = obj[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') return val;
    }
    return null;
  };

  const toISODate = (value) => {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  };

  const maskId = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const last4 = raw.slice(-4);
    return raw.length > 4 ? `••••${last4}` : `••••${raw}`;
  };

  const countBy = (items, getter) => {
    const map = new Map();
    for (const item of items) {
      const key = String(getter(item) ?? 'unknown');
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  };

  const producer =
    safeObject(endpoints.producerById?.body) ||
    safeObject(endpoints.producerByNpn?.body) ||
    safeObject(endpoints.producerByNpn?.body?.producer);
  if (producer) {
    summary.producer.recordType = pick(producer, ['recordType']);
    summary.producer.title = pick(producer, ['title', 'entityTitle']);
    summary.producer.companyType = pick(producer, ['companyType', 'companyTypeW9']);
    summary.producer.entityType = pick(producer, ['entityType']);
    summary.producer.createdDate = toISODate(pick(producer, ['createdDate']));

    summary.compliance.aml.date = toISODate(pick(producer, ['amlDate']));
    summary.compliance.aml.provider = pick(producer, ['amlProvider']);

    const eno = safeObject(pick(producer, ['eno'])) || safeObject(producer.eno);
    if (eno) {
      summary.compliance.eno.carrierName = pick(eno, ['carrierName']);
      summary.compliance.eno.policyNoMasked = maskId(pick(eno, ['policyNo', 'policyNoMasked']));
      summary.compliance.eno.certificateNoMasked = maskId(pick(eno, ['certificateNo', 'certificateNoMasked']));
      summary.compliance.eno.startedOn = toISODate(pick(eno, ['startedOn']));
      summary.compliance.eno.expiresOn = toISODate(pick(eno, ['expiresOn']));
      summary.compliance.eno.caseLimit = pick(eno, ['caseLimit']);
      summary.compliance.eno.totalLimit = pick(eno, ['totalLimit']);
    }

    summary.compliance.securities.finraLicense = pick(producer, ['finraLicense']);
    summary.compliance.securities.crdNo = pick(producer, ['crdNo']);
    summary.compliance.securities.brokerDealer = pick(producer, ['brokerDealer']);
    summary.compliance.securities.investmentAdviser = pick(producer, ['investmentAdviser']);

    const designationFields = [
      ['clu', 'CLU'],
      ['chfc', 'ChFC'],
      ['cfp', 'CFP'],
      ['mdrt', 'MDRT'],
      ['flmi', 'FLMI'],
      ['nqa', 'NQA'],
      ['cfc', 'CFC'],
    ];
    const designations = [];
    for (const [field, label] of designationFields) {
      const val = pick(producer, [field]);
      if (val === true || String(val).toLowerCase() === 'true') designations.push(label);
    }
    const other = pick(producer, ['honorsOtherText']);
    if (other) designations.push(String(other));
    summary.compliance.designations = designations;

    summary.compliance.dataAsOf = toISODate(pick(producer, ['ts']));
  }

  const relationship = safeObject(endpoints.relationship?.body);
  if (relationship) {
    summary.relationship.gaId = pick(relationship, ['gaId', 'ga_id']);
    summary.relationship.branchCode = pick(relationship, ['branchCode', 'branch_code']);
    summary.relationship.upline = pick(relationship, ['upline']);
    summary.relationship.status = pick(relationship, ['status']);
    summary.relationship.subscribed = pick(relationship, ['subscribed']);
    summary.relationship.unsubscriptionDate = pick(relationship, ['unsubscriptionDate']);
    summary.relationship.addedOn = pick(relationship, ['addedOn']);
    summary.relationship.errors = pick(relationship, ['errors']);
    summary.relationship.warnings = pick(relationship, ['warnings']);
  }

  // Producer/BGA status derivations
  summary.statuses.producer = summary.relationship.status || null;
  summary.statuses.bga = (() => {
    const subscribed = summary.relationship.subscribed;
    if (typeof subscribed === 'boolean') return subscribed ? 'Subscribed' : 'Unsubscribed';
    if (typeof subscribed === 'string') {
      const v = subscribed.trim().toLowerCase();
      if (['true', 'yes', '1', 'subscribed', 'active'].includes(v)) return 'Subscribed';
    }
    if (summary.relationship.unsubscriptionDate) return 'Unsubscribed';
    if (summary.relationship.gaId || summary.relationship.branchCode) return 'Associated';
    return null;
  })();

  const licenses = safeArray(endpoints.licenses?.body);
  if (licenses.length) {
    summary.licenses.total = licenses.length;
    summary.licenses.byStatus = countBy(licenses, (l) => pick(l, ['status']) || 'unknown')
      .slice(0, 10)
      .map(([status, count]) => ({ status, count }));
    const expDates = licenses
      .map((l) => toISODate(pick(l, ['expires', 'expirationDate', 'expiryDate', 'expireDate'])))
      .filter(Boolean)
      .sort();
    summary.licenses.soonestExpiration = expDates[0] || null;
    const residentStates = licenses
      .filter((l) => Boolean(pick(l, ['isResidentState', 'resident'])))
      .map((l) => pick(l, ['state']))
      .filter(Boolean);
    summary.licenses.residentStates = Array.from(new Set(residentStates)).slice(0, 10);
  }

  const appointments = safeArray(endpoints.appointments?.body);
  if (appointments.length) {
    summary.appointments.total = appointments.length;
    summary.appointments.byStatus = countBy(appointments, (a) => pick(a, ['status']) || 'unknown')
      .slice(0, 10)
      .map(([status, count]) => ({ status, count }));

    const carrierMap = new Map();
    for (const appt of appointments) {
      const carrierId = pick(appt, ['carrierId', 'carrier_id', 'carrier', 'id']);
      const state = pick(appt, ['state', 'licenseState', 'jurisdiction']);
      const status = pick(appt, ['status']) || 'unknown';
      const key = carrierId !== null ? String(carrierId) : 'unknown';
      const entry = carrierMap.get(key) || { carrierId: key, total: 0, byStatus: new Map(), states: new Map() };
      entry.total += 1;
      entry.byStatus.set(status, (entry.byStatus.get(status) || 0) + 1);
      if (state) entry.states.set(state, (entry.states.get(state) || 0) + 1);
      carrierMap.set(key, entry);
    }

    const carriers = Array.from(carrierMap.values()).sort((a, b) => b.total - a.total);
    summary.appointments.byCarrierTop = carriers.slice(0, 10).map((c) => ({
      carrierId: c.carrierId,
      total: c.total,
      byStatus: Array.from(c.byStatus.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([status, count]) => ({ status, count })),
      statesTop: Array.from(c.states.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([state, count]) => ({ state, count })),
    }));

    const appointedCarrierSet = new Set();
    const terminatedCarrierSet = new Set();
    for (const c of carriers) {
      for (const [status, count] of c.byStatus.entries()) {
        const s = String(status).toLowerCase();
        if (count > 0 && s.includes('appoint')) appointedCarrierSet.add(c.carrierId);
        if (count > 0 && s.includes('termin')) terminatedCarrierSet.add(c.carrierId);
      }
    }
    summary.appointments.appointedCarriers = appointedCarrierSet.size;
    summary.appointments.terminatedCarriers = terminatedCarrierSet.size;
  }

  const contracts = safeArray(endpoints.contracts?.body);
  if (contracts.length) {
    summary.contracts.total = contracts.length;
    summary.contracts.byStatus = countBy(contracts, (c) => pick(c, ['status']) || 'unknown')
      .slice(0, 10)
      .map(([status, count]) => ({ status, count }));

    const contractCarrierMap = new Map();
    for (const contract of contracts) {
      const carrierId = pick(contract, ['carrierId', 'carrier_id', 'carrier', 'id']);
      const status = pick(contract, ['status']) || 'unknown';
      const key = carrierId !== null ? String(carrierId) : 'unknown';
      const entry = contractCarrierMap.get(key) || { carrierId: key, total: 0, byStatus: new Map() };
      entry.total += 1;
      entry.byStatus.set(status, (entry.byStatus.get(status) || 0) + 1);
      contractCarrierMap.set(key, entry);
    }

    const carriers = Array.from(contractCarrierMap.values()).sort((a, b) => b.total - a.total);
    summary.contracts.byCarrierTop = carriers.slice(0, 10).map((c) => ({
      carrierId: c.carrierId,
      total: c.total,
      byStatus: Array.from(c.byStatus.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([status, count]) => ({ status, count })),
    }));

    const activeCarrierSet = new Set();
    for (const c of carriers) {
      for (const [status, count] of c.byStatus.entries()) {
        const s = String(status).toLowerCase();
        if (count > 0 && s.includes('active')) activeCarrierSet.add(c.carrierId);
      }
    }
    summary.contracts.activeCarriers = activeCarrierSet.size;
  }

  summary.statuses.carrier = (() => {
    if (summary.appointments.appointedCarriers || summary.appointments.terminatedCarriers) {
      return `${summary.appointments.appointedCarriers} appointed / ${summary.appointments.terminatedCarriers} terminated carriers`;
    }
    if (summary.appointments.total) return `${summary.appointments.total} appointments`;
    if (summary.contracts.total) return `${summary.contracts.total} contracts`;
    return null;
  })();

  return summary;
}

export default async function handler(req, res) {
  buildCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const baseUrl = (process.env.SURELC_BASE || process.env.VITE_SURELC_BASE || DEFAULT_BASE).replace(/\/+$/, '');
    const npn = normalizeDigits(req.query?.npn || req.query?.NPN || '');
    const producerIdRaw = req.query?.producerId || req.query?.producerID || req.query?.id || '';
    const producerId = normalizeDigits(producerIdRaw);
    const which = req.query?.which || 'AUTO';
    const mode = String(req.query?.mode || req.query?.view || 'single').toLowerCase();
    const nocacheRaw = String(req.query?.nocache ?? req.query?.noCache ?? req.query?.refresh ?? '').toLowerCase();
    const noCache = nocacheRaw === '1' || nocacheRaw === 'true' || nocacheRaw === 'yes';
    const includeEndpoints = includeEndpointsFromQuery(req.query);

    if (!npn && !producerId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Provide npn or producerId' }));
      return;
    }

    const cacheKey = JSON.stringify({
      npn: npn || null,
      producerId: producerId || null,
      which: String(which).toUpperCase(),
      mode,
      includeEndpoints,
    });
    const now = Date.now();
    if (!noCache) {
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ...cached.value, cached: true }));
        return;
      }
    }

    if (mode === 'both') {
      const { equita, quility } = getCredentialOptions();
      const asToken = (entry) =>
        entry.user && entry.pass
          ? { ...entry, token: basicAuthHeader(entry.user, entry.pass) }
          : entry.token
            ? { ...entry, token: entry.token }
            : null;
      const equitaCred = asToken(equita) || { ...equita, token: null };
      const quilityCred = asToken(quility) || { ...quility, token: null };

      const identifiers = { npn: npn || null, producerId: producerId || null };

      // Run both in parallel.
      const [quilityView, equitaView] = await Promise.all([
        buildView(baseUrl, { label: 'QUILITY', token: quilityCred.token, includeEndpoints }, identifiers),
        buildView(baseUrl, { label: 'EQUITA', token: equitaCred.token, includeEndpoints }, identifiers),
      ]);

      const payload = {
        ok: true,
        cached: false,
        mode: 'both',
        identifiers,
        fetchedAt: new Date().toISOString(),
        views: {
          QUILITY: quilityView,
          EQUITA: equitaView,
        },
      };

      // Avoid caching invalid-credentials responses (401) so credential fixes take effect immediately in dev.
      const cacheable = !isInvalidCredential401(quilityView) && !isInvalidCredential401(equitaView);
      if (cacheable) {
        cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, value: payload });
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    const candidates = resolveCredentialOrder(which);
    const attempts = [];
    let lastError = null;

    for (const cand of candidates) {
      try {
        const result = await fetchAll(baseUrl, cand.token, { npn: npn || null, producerId: producerId || null });
        const endpoints = result.endpoints || {};
        const endpointsRedacted = includeEndpoints ? redactEndpoints(endpoints) : undefined;
        const anyOk = Object.values(endpoints).some((r) => r && typeof r === 'object' && r.ok);
        const producerResolved = result.producerId || producerId || null;

        const primaryLookup = endpoints.producerByNpn || endpoints.producerById || null;
        attempts.push({
          which: cand.label,
          producerByNpn: endpoints.producerByNpn
            ? { status: endpoints.producerByNpn.status, ok: endpoints.producerByNpn.ok }
            : null,
          producerById: endpoints.producerById
            ? { status: endpoints.producerById.status, ok: endpoints.producerById.ok }
            : null,
          relationship: endpoints.relationship
            ? { status: endpoints.relationship.status, ok: endpoints.relationship.ok }
            : null,
        });

        // If lookup is blocked by auth/scope, try next credential set.
        // We consider 401 Unauthorized and 403 Forbidden to be "credential/scope mismatch" candidates.
        const status = primaryLookup?.status;
        const authBlocked = status === 401 || status === 403;
        if (!anyOk && authBlocked) {
          lastError = new Error(`${cand.label} blocked`);
          continue;
        }

        const payload = {
          ok: true,
          cached: false,
          whichUsed: cand.label,
          mode: 'single',
          identifiers: { npn: npn || null, producerId: producerResolved },
          fetchedAt: new Date().toISOString(),
          summary: buildSummary(endpoints, { npn: npn || null, producerId: producerResolved }),
          endpoints: endpointsRedacted,
          endpointsMeta: Object.fromEntries(
            Object.entries(endpoints).map(([key, value]) => [
              key,
              value
                ? {
                    ok: value.ok,
                    status: value.status,
                    statusText: value.statusText,
                    url: value.url,
                    shape: Array.isArray(value.body)
                      ? { type: 'array', count: value.body.length }
                      : value.body && typeof value.body === 'object'
                        ? { type: 'object', keys: Object.keys(value.body).length }
                        : { type: typeof value.body },
                  }
                : null,
            ]),
          ),
          attempts,
        };

        cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, value: payload });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
        return;
      } catch (err) {
        lastError = err;
      }
    }

    const hadNotFound = attempts.some((a) => a.producerByNpn?.status === 404 || a.producerById?.status === 404);
    const hadAuthBlocked = attempts.some((a) => [401, 403].includes(a.producerByNpn?.status) || [401, 403].includes(a.producerById?.status));
    const allBlocked = attempts.length > 0 && attempts.every((a) => {
      const s = a.producerByNpn?.status ?? a.producerById?.status ?? null;
      return s === 401 || s === 403;
    });

    const failurePayload = {
      ok: false,
      cached: false,
      mode: 'single',
      errorCode: hadNotFound ? 'NOT_FOUND' : allBlocked ? 'ACCESS_DENIED' : 'FAILED',
      error: hadNotFound
        ? 'Producer not found in SureLC for the provided identifier.'
        : allBlocked
          ? 'Access denied in SureLC for this producer under all configured credentials.'
          : 'SureLC request failed.',
      details: String(lastError?.message || lastError || ''),
      identifiers: { npn: npn || null, producerId: producerId || null },
      attemptedCredentials: attempts.map((a) => a.which),
      attempts,
      fetchedAt: new Date().toISOString(),
      hint: hadAuthBlocked
        ? 'This can mean invalid credentials or the producer is outside your SureLC account scope (firm/subscription/permissions).'
        : undefined,
    };

    // Avoid caching invalid-credentials failures (401) so env fixes take effect immediately in dev.
    const failureHas401 = attempts.some((a) => (a.producerByNpn?.status === 401) || (a.producerById?.status === 401));
    if (!failureHas401) {
      cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, value: failurePayload });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(failurePayload));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'SureLC handler failed', details: String(error?.message || error) }));
  }
}
