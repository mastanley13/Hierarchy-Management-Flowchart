// Generate a SureLC access report for all HighLevel contacts.
//
// Output: CSV with per-contact Equita/Quility status (success/blocked + 401/403).
//
// Usage:
//   node scripts/surelc-access-report.mjs --out reports/surelc-access-report.csv
//   node scripts/surelc-access-report.mjs --concurrency 4 --maxContacts 5000
//
// Required env:
//   HL_PRIVATE_API_KEY, HL_LOCATION_ID
//
// SureLC creds (any combination; prefer user/pass):
//   SURELC_USER_EQUITA / SURELC_PASS_EQUITA   (or VITE_ equivalents)
//   SURELC_USER_QUILITY / SURELC_PASS_QUILITY (or VITE_ equivalents)
//   SURELC_USER / SURELC_PASS                 (fallback, optional)

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SURELC_BASE = 'https://surelc.surancebay.com/sbweb/ws';
const DEFAULT_HL_API_BASE = 'https://services.leadconnectorhq.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith('--') ? next : true;
    out[key] = value;
    if (value !== true) i += 1;
  }
  return out;
}

function isTruthy(value) {
  if (Array.isArray(value)) return value.some((entry) => isTruthy(entry));
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['yes', 'true', '1', 'on', 'checked', 'y'].includes(normalized);
  }
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return value;
  return Boolean(value);
}

function loadEnvFile(envPath = path.join(process.cwd(), '.env')) {
  try {
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
    // noop: dev convenience only
  }
}

function normalizeDigits(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value).replace(/\D+/g, '');
  return String(value).replace(/\D+/g, '');
}

function digitLength(value) {
  const digits = normalizeDigits(value);
  return digits ? digits.length : 0;
}

function basicAuthHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function readEnv(key, legacyKey) {
  return (process.env[key] || '').trim() || (legacyKey ? (process.env[legacyKey] || '').trim() : '') || '';
}

function getSurelcCredential(label) {
  const tokenKey = label === 'EQUITA' ? 'SURELC_AUTH_EQUITA' : label === 'QUILITY' ? 'SURELC_AUTH_QUILITY' : 'SURELC_AUTH';
  const userKey = label === 'EQUITA' ? 'SURELC_USER_EQUITA' : label === 'QUILITY' ? 'SURELC_USER_QUILITY' : 'SURELC_USER';
  const passKey = label === 'EQUITA' ? 'SURELC_PASS_EQUITA' : label === 'QUILITY' ? 'SURELC_PASS_QUILITY' : 'SURELC_PASS';
  const legacyUserKey =
    label === 'EQUITA' ? 'VITE_SURELC_USER_EQUITA' : label === 'QUILITY' ? 'VITE_SURELC_USER_QUILITY' : 'VITE_SURELC_USER';
  const legacyPassKey =
    label === 'EQUITA' ? 'VITE_SURELC_PASS_EQUITA' : label === 'QUILITY' ? 'VITE_SURELC_PASS_QUILITY' : 'VITE_SURELC_PASS';

  const user = readEnv(userKey, legacyUserKey);
  const pass = readEnv(passKey, legacyPassKey);
  const token = readEnv(tokenKey, '');

  if (user && pass) return { label, token: basicAuthHeader(user, pass), configured: true };
  if (token) return { label, token, configured: true };
  return { label, token: '', configured: false };
}

async function hlFetchWithRetry(baseUrl, pathname, options = {}, attempt = 0) {
  const url = `${baseUrl}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  const res = await fetch(url, options);

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const delay = Math.min(2000, 200 * (attempt + 1));
    await sleep(delay);
    return hlFetchWithRetry(baseUrl, pathname, options, attempt + 1);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`HighLevel request failed: ${res.status} ${errorText}`);
  }

  return res.json();
}

async function fetchCustomFields(hlBase, locationId, apiKey) {
  const payload = await hlFetchWithRetry(hlBase, `/locations/${encodeURIComponent(locationId)}/customFields`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Location-Id': locationId,
      Version: '2021-07-28',
    },
  });

  const items = Array.isArray(payload?.customFields) ? payload.customFields : [];
  const byId = new Map();
  items.forEach((field) => byId.set(field.id, field));
  return { items, byId };
}

async function fetchAllContacts(hlBase, locationId, apiKey, pageSize, maxContacts) {
  const contacts = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (contacts.length < maxContacts && page < 10_000) {
    const payload = await hlFetchWithRetry(hlBase, '/contacts/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Location-Id': locationId,
        Version: '2021-07-28',
      },
      body: JSON.stringify({
        locationId,
        page,
        pageLimit: pageSize,
      }),
    });

    const chunk = Array.isArray(payload?.contacts) ? payload.contacts : [];
    contacts.push(...chunk);

    if (Number.isFinite(payload?.total)) total = payload.total;
    if (chunk.length === 0 || contacts.length >= total) break;

    page += 1;
    await sleep(200);
  }

  return contacts.slice(0, maxContacts);
}

function buildCustomMap(contact, customFieldsById) {
  const custom = {};
  for (const entry of contact?.customFields || []) {
    const field = customFieldsById.get(entry.id);
    const key = field?.fieldKey || entry.id;
    custom[key] = entry.value;
  }
  return custom;
}

function contactDisplayName(contact) {
  const first = contact?.firstNameRaw || contact?.firstName || '';
  const last = contact?.lastNameRaw || contact?.lastName || '';
  const full = `${first} ${last}`.trim();
  return full || contact?.contactName || contact?.email || `Contact ${String(contact?.id || '').slice(-6)}`;
}

function pickIdentifier(custom) {
  const npnRaw = custom['contact.onboarding__npn'];
  const surelcRaw = custom['contact.onboarding__producer_number'];
  const npn = normalizeDigits(Array.isArray(npnRaw) ? npnRaw[0] : npnRaw);
  const producerId = normalizeDigits(Array.isArray(surelcRaw) ? surelcRaw[0] : surelcRaw);
  if (npn) return { type: 'npn', value: npn, npn, producerId: producerId || '' };
  if (producerId) return { type: 'producerId', value: producerId, npn: '', producerId };
  return { type: 'none', value: '', npn: '', producerId: '' };
}

async function surelcGetWithRetry(baseUrl, pathname, token, attempt = 0) {
  const url = `${baseUrl}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: 'application/json',
    },
  });

  if ((res.status === 429 || res.status >= 500) && attempt < 6) {
    const retryAfter = Number.parseInt(res.headers.get('retry-after') || '', 10);
    const delay = Number.isFinite(retryAfter) ? Math.min(10_000, retryAfter * 1000) : Math.min(10_000, 250 * 2 ** attempt);
    await sleep(delay);
    return surelcGetWithRetry(baseUrl, pathname, token, attempt + 1);
  }

  return { ok: res.ok, status: res.status, statusText: res.statusText, url };
}

function buildSurelcLookupPath(identifier) {
  if (!identifier || !identifier.type || !identifier.value) return null;
  if (identifier.type === 'npn') return `/producer/npn/${encodeURIComponent(identifier.value)}`;
  if (identifier.type === 'producerId') return `/producer/${encodeURIComponent(identifier.value)}`;
  return null;
}

function flipIdentifierType(identifier) {
  if (!identifier || !identifier.type || !identifier.value) return null;
  if (identifier.type === 'npn') return { ...identifier, type: 'producerId' };
  if (identifier.type === 'producerId') return { ...identifier, type: 'npn' };
  return null;
}

async function checkSurelcAccess(baseUrl, credential, identifier) {
  if (!credential?.configured) {
    return { result: 'not_configured', status: null, checked: null, alt: null };
  }
  if (!identifier || identifier.type === 'none' || !identifier.value) {
    return { result: 'no_identifier', status: null, checked: null, alt: null };
  }

  const pathname = buildSurelcLookupPath(identifier);
  if (!pathname) return { result: 'failed', status: null, checked: null, alt: null };

  const res = await surelcGetWithRetry(baseUrl, pathname, credential.token);
  const checked = { type: identifier.type, status: res.status };

  let result = 'failed';
  if (res.status === 200) result = 'success';
  else if (res.status === 401 || res.status === 403) result = 'blocked';
  else if (res.status === 404) result = 'not_found';

  // Diagnose HTTP 400 by testing the same value against the alternate lookup path.
  // This helps distinguish "invalid NPN" vs "producerId stored in the NPN field" (and vice versa).
  let alt = null;
  if (res.status === 400) {
    const flipped = flipIdentifierType(identifier);
    const altPath = buildSurelcLookupPath(flipped);
    if (altPath) {
      const altRes = await surelcGetWithRetry(baseUrl, altPath, credential.token);
      alt = { type: flipped.type, status: altRes.status };
    }
  }

  return { result, status: res.status, checked, alt };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function countBy(rows, getter) {
  const map = new Map();
  for (const row of rows) {
    const key = getter(row);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile();

  const hlBase = (process.env.HL_API_BASE || DEFAULT_HL_API_BASE).trim().replace(/\/+$/, '');
  const hlKey = (process.env.HL_PRIVATE_API_KEY || '').trim();
  const hlLocationId = (process.env.HL_LOCATION_ID || '').trim();
  if (!hlKey || !hlLocationId) {
    throw new Error('Missing HL_PRIVATE_API_KEY or HL_LOCATION_ID in environment/.env.');
  }

  const pageSizeRaw = Number.parseInt(String(args.pageSize || process.env.HL_PAGE_SIZE || '100'), 10);
  const pageSize = Number.isNaN(pageSizeRaw) ? 100 : Math.min(Math.max(pageSizeRaw, 1), 100);
  const maxContactsRaw = Number.parseInt(String(args.maxContacts || process.env.HL_MAX_CONTACTS || '2000'), 10);
  const maxContacts = Number.isNaN(maxContactsRaw) ? 2000 : Math.max(1, maxContactsRaw);

  const concurrencyRaw = Number.parseInt(String(args.concurrency || process.env.SURELC_REPORT_CONCURRENCY || '4'), 10);
  const concurrency = Number.isNaN(concurrencyRaw) ? 4 : Math.min(Math.max(concurrencyRaw, 1), 25);

  const includeUpline = isTruthy(args.includeUpline || process.env.SURELC_REPORT_INCLUDE_UPLINE || false);

  const surelcBase = (process.env.SURELC_BASE || process.env.VITE_SURELC_BASE || DEFAULT_SURELC_BASE).trim().replace(/\/+$/, '');

  const outPath = String(
    args.out ||
      path.join(
        'reports',
        `surelc-access-report-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      ),
  );
  ensureDirForFile(outPath);

  console.log(`[surelc-report] Fetching HighLevel contacts (max ${maxContacts})...`);
  const { byId: customFieldsById } = await fetchCustomFields(hlBase, hlLocationId, hlKey);
  const contacts = await fetchAllContacts(hlBase, hlLocationId, hlKey, pageSize, maxContacts);
  console.log(`[surelc-report] Loaded ${contacts.length} contacts. Checking SureLC access (concurrency ${concurrency})...`);

  const equita = getSurelcCredential('EQUITA');
  const quility = getSurelcCredential('QUILITY');

  const cache = new Map(); // key: `${which}:${type}:${value}`
  const fetchedAt = new Date().toISOString();

  const rows = await mapWithConcurrency(contacts, concurrency, async (contact) => {
    const custom = buildCustomMap(contact, customFieldsById);
    const identifier = pickIdentifier(custom);
    const npnRaw = custom['contact.onboarding__npn'];
    const surelcProducerRaw = custom['contact.onboarding__producer_number'];
    const npnDigits = normalizeDigits(Array.isArray(npnRaw) ? npnRaw[0] : npnRaw);
    const surelcProducerDigits = normalizeDigits(Array.isArray(surelcProducerRaw) ? surelcProducerRaw[0] : surelcProducerRaw);

    const uplineProducerRaw = custom['contact.upline_producer_id'] ?? custom['contact.onboarding__upline_npn'];
    const uplineProducerId = normalizeDigits(Array.isArray(uplineProducerRaw) ? uplineProducerRaw[0] : uplineProducerRaw);

    const effectiveIdentifier = includeUpline && identifier.type === 'none' && uplineProducerId
      ? { type: 'npn', value: uplineProducerId, npn: uplineProducerId, producerId: '' }
      : identifier;

    const check = async (cred) => {
      const key = `${cred.label}:${effectiveIdentifier.type}:${effectiveIdentifier.value}`;
      if (cache.has(key)) return cache.get(key);
      const result = await checkSurelcAccess(surelcBase, cred, effectiveIdentifier);
      cache.set(key, result);
      return result;
    };

    const [equitaRes, quilityRes] = await Promise.all([check(equita), check(quility)]);
    const anySuccess = equitaRes.result === 'success' || quilityRes.result === 'success';

    const identifierDigitsLen = digitLength(effectiveIdentifier.value);
    const npnDigitsLen = npnDigits ? npnDigits.length : 0;
    const surelcProducerDigitsLen = surelcProducerDigits ? surelcProducerDigits.length : 0;

    const baseDiagnosis = (() => {
      if (!effectiveIdentifier.value) return 'missing_identifier';
      if (effectiveIdentifier.type === 'npn' && identifierDigitsLen !== 10) return 'npn_invalid_length';
      return '';
    })();

    const diagnose400 = (res) => {
      if (!res || res.status !== 400) return '';
      if (effectiveIdentifier.type === 'npn') {
        if (identifierDigitsLen !== 10) return 'npn_invalid_length';
        return 'bad_request_npn_lookup';
      }

      if (effectiveIdentifier.type === 'producerId') {
        return 'bad_request_producerId_lookup';
      }

      return 'bad_request';
    };

    return {
      fetchedAt,
      contactId: contact.id,
      name: contactDisplayName(contact),
      npn: npnDigits,
      surelcProducerId: surelcProducerDigits,
      uplineNpnId: uplineProducerId || '',
      identifierUsed: effectiveIdentifier.type,
      identifierValue: effectiveIdentifier.value,
      npn_digits_len: npnDigitsLen,
      surelcProducerId_digits_len: surelcProducerDigitsLen,
      identifier_digits_len: identifierDigitsLen,
      identifier_diagnosis: baseDiagnosis,
      equita_result: equitaRes.result,
      equita_status: equitaRes.status ?? '',
      equita_400_diagnosis: diagnose400(equitaRes),
      equita_alt_type: equitaRes.alt?.type || '',
      equita_alt_status: equitaRes.alt?.status || '',
      quility_result: quilityRes.result,
      quility_status: quilityRes.status ?? '',
      quility_400_diagnosis: diagnose400(quilityRes),
      quility_alt_type: quilityRes.alt?.type || '',
      quility_alt_status: quilityRes.alt?.status || '',
      any_success: anySuccess ? 'true' : 'false',
    };
  });

  const header = [
    'fetchedAt',
    'contactId',
    'name',
    'npn',
    'surelcProducerId',
    'uplineNpnId',
    'identifierUsed',
    'identifierValue',
    'npn_digits_len',
    'surelcProducerId_digits_len',
    'identifier_digits_len',
    'identifier_diagnosis',
    'equita_result',
    'equita_status',
    'equita_400_diagnosis',
    'equita_alt_type',
    'equita_alt_status',
    'quility_result',
    'quility_status',
    'quility_400_diagnosis',
    'quility_alt_type',
    'quility_alt_status',
    'any_success',
  ];

  const lines = [header.join(',')].concat(
    rows.map((row) =>
      header.map((key) => csvEscape(row[key])).join(','),
    ),
  );

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');

  const summary = {
    fetchedAt,
    contacts: rows.length,
    uniqueLookups: cache.size,
    equitaConfigured: equita.configured,
    quilityConfigured: quility.configured,
    equitaBreakdown: countBy(rows, (r) => `${r.equita_result}:${r.equita_status || ''}`),
    quilityBreakdown: countBy(rows, (r) => `${r.quility_result}:${r.quility_status || ''}`),
    anySuccess: countBy(rows, (r) => r.any_success),
  };

  const summaryPath = outPath.replace(/\.csv$/i, '') + '.summary.json';
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`[surelc-report] Wrote ${outPath}`);
  console.log(`[surelc-report] Wrote ${summaryPath}`);
  console.log(`[surelc-report] any_success breakdown: ${summary.anySuccess.map(([k, v]) => `${k}=${v}`).join(', ')}`);
}

main().catch((err) => {
  console.error(`[surelc-report] Failed: ${String(err?.message || err)}`);
  process.exitCode = 1;
});
