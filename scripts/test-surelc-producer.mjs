// Test SureLC endpoints for a single producer (by NPN and/or producerId).
//
// Usage:
//   node scripts/test-surelc-producer.mjs --npn 18550335 --which EQUITA
//   node scripts/test-surelc-producer.mjs --producerId 123456 --which QUILITY
//   node scripts/test-surelc-producer.mjs --npn 18550335 --producerId 123456 --rawOut tmp/surelc.json
//
// Credentials (read from process.env and/or .env in repo root):
//   - VITE_SURELC_USER_EQUITA / VITE_SURELC_PASS_EQUITA
//   - VITE_SURELC_USER_QUILITY / VITE_SURELC_PASS_QUILITY
//   - VITE_SURELC_USER / VITE_SURELC_PASS (fallback)
//
// Notes:
// - This script prints summaries and avoids dumping PII by default.
// - If you pass --rawOut, it will write raw API payloads to disk (may contain PII).

import fs from 'node:fs';
import path from 'node:path';

const SURELC_BASE = (process.env.SURELC_BASE || 'https://surelc.surancebay.com/sbweb/ws').replace(/\/+$/, '');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith('--') ? next : true;
    args[key] = value;
    if (value !== true) i += 1;
  }
  return args;
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
  } catch (err) {
    console.warn('Warning: failed to load .env:', String(err?.message || err));
  }
}

function basicAuthHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

function pickCredentials(whichRaw) {
  const which = String(whichRaw || process.env.SURELC_WHICH || 'EQUITA').toUpperCase();

  const equitaUser = process.env.VITE_SURELC_USER_EQUITA || process.env.SURELC_USER_EQUITA;
  const equitaPass = process.env.VITE_SURELC_PASS_EQUITA || process.env.SURELC_PASS_EQUITA;

  const quilityUser = process.env.VITE_SURELC_USER_QUILITY || process.env.SURELC_USER_QUILITY;
  const quilityPass = process.env.VITE_SURELC_PASS_QUILITY || process.env.SURELC_PASS_QUILITY;

  const generalUser = process.env.VITE_SURELC_USER || process.env.SURELC_USER;
  const generalPass = process.env.VITE_SURELC_PASS || process.env.SURELC_PASS;

  const options = {
    EQUITA: { user: equitaUser, pass: equitaPass, label: 'EQUITA' },
    QUILITY: { user: quilityUser, pass: quilityPass, label: 'QUILITY' },
    GENERAL: { user: generalUser, pass: generalPass, label: 'GENERAL' },
  };

  const preferred = options[which] || options.EQUITA;
  const fallback = which === 'GENERAL' ? null : options.GENERAL;

  const resolved =
    preferred.user && preferred.pass
      ? preferred
      : fallback && fallback.user && fallback.pass
        ? { ...fallback, label: `${preferred.label} (fallback->GENERAL)` }
        : preferred;

  if (!resolved.user || !resolved.pass) {
    throw new Error(
      `Missing SureLC credentials. Set VITE_SURELC_USER_*/VITE_SURELC_PASS_* in .env, or pass env vars directly.`,
    );
  }

  return resolved;
}

async function surelcRequest(pathname, token, options = {}) {
  const url = `${SURELC_BASE}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: options.accept || 'application/json',
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    url,
    contentType,
    body,
  };
}

function summarizeKeys(payload) {
  if (!payload || typeof payload !== 'object') return { type: typeof payload };
  if (Array.isArray(payload)) {
    const firstObj = payload.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) || null;
    return {
      type: 'array',
      count: payload.length,
      itemKeys: firstObj ? Object.keys(firstObj).sort() : [],
    };
  }
  return { type: 'object', keys: Object.keys(payload).sort() };
}

function countBy(items, getter) {
  const out = new Map();
  for (const item of items || []) {
    const key = getter(item);
    out.set(key, (out.get(key) || 0) + 1);
  }
  return Array.from(out.entries()).sort((a, b) => b[1] - a[1]);
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function asDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function summarizeLicenses(licenses) {
  if (!Array.isArray(licenses)) return null;
  const statusCounts = countBy(licenses, (l) => String(pick(l, ['status', 'licenseStatus', 'stateStatus']) || 'unknown'));

  const expDates = licenses
    .map((l) => asDate(pick(l, ['expires', 'expirationDate', 'expiryDate', 'expireDate', 'expiration', 'expiresOn'])))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  const soonestExpiration = expDates[0] ? expDates[0].toISOString().slice(0, 10) : null;
  return {
    count: licenses.length,
    statusCounts: statusCounts.slice(0, 10),
    soonestExpiration,
    itemKeys: (licenses[0] && typeof licenses[0] === 'object') ? Object.keys(licenses[0]).sort() : [],
  };
}

function summarizeAppointments(appointments) {
  if (!Array.isArray(appointments)) return null;
  const statusCounts = countBy(appointments, (a) => String(pick(a, ['status', 'appointmentStatus']) || 'unknown'));
  const byCarrier = countBy(appointments, (a) => {
    const carrier = pick(a, ['carrierName', 'carrier', 'companyName', 'company']) || pick(a, ['carrierId', 'carrier_id', 'id']);
    return String(carrier || 'unknown');
  });
  const byState = countBy(appointments, (a) => String(pick(a, ['state', 'licenseState', 'jurisdiction']) || 'unknown'));

  return {
    count: appointments.length,
    statusCounts: statusCounts.slice(0, 10),
    carriersTop: byCarrier.slice(0, 10),
    statesTop: byState.slice(0, 10),
    itemKeys: (appointments[0] && typeof appointments[0] === 'object') ? Object.keys(appointments[0]).sort() : [],
  };
}

function summarizeContracts(contracts) {
  if (!Array.isArray(contracts)) return null;
  const statusCounts = countBy(contracts, (c) => String(pick(c, ['status', 'contractStatus']) || 'unknown'));
  const byCarrier = countBy(contracts, (c) => {
    const carrier = pick(c, ['carrierName', 'carrier', 'companyName', 'company']) || pick(c, ['carrierId', 'carrier_id', 'id']);
    return String(carrier || 'unknown');
  });

  return {
    count: contracts.length,
    statusCounts: statusCounts.slice(0, 10),
    carriersTop: byCarrier.slice(0, 10),
    itemKeys: (contracts[0] && typeof contracts[0] === 'object') ? Object.keys(contracts[0]).sort() : [],
  };
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
    'phone',
    'mobile',
    'cell',
    'fax',
    'address',
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
    'fullName',
    'driverLic',
    'driverLicense',
    'driverLicState',
    'driverLicenseExp',
    'entityTin',
    'tin',
    'taxId',
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.env && args.env !== true ? String(args.env) : undefined);

  const creds = pickCredentials(args.which);
  const token = basicAuthHeader(creds.user, creds.pass);

  const npn = args.npn && args.npn !== true ? String(args.npn).replace(/\D+/g, '') : (process.env.TEST_NPN || '').replace(/\D+/g, '');
  const producerIdArg = args.producerId && args.producerId !== true ? String(args.producerId).replace(/\D+/g, '') : '';

  if (!npn && !producerIdArg) {
    throw new Error('Provide --npn or --producerId (or set TEST_NPN in env).');
  }

  console.log(`SureLC base: ${SURELC_BASE}`);
  console.log(`Credential set: ${creds.label}`);
  if (npn) console.log(`NPN: ${npn}`);
  if (producerIdArg) console.log(`Producer ID (provided): ${producerIdArg}`);
  console.log('');

  const rawOutPath = args.rawOut && args.rawOut !== true ? String(args.rawOut) : null;
  const raw = {};

  let producerId = producerIdArg || null;

  if (npn) {
    const byNpn = await surelcRequest(`/producer/npn/${npn}`, token);
    raw.producerByNpn = byNpn;
    console.log(`[GET] /producer/npn/${npn} -> ${byNpn.status} ${byNpn.statusText}`);
    console.log('  Summary:', summarizeKeys(byNpn.body));
    if (byNpn.ok && byNpn.body && typeof byNpn.body === 'object') {
      const id = pick(byNpn.body, ['id', 'producerId', 'producer_id']);
      if (!producerId && id) producerId = String(id).replace(/\D+/g, '');
    }
    console.log('');
  }

  if (!producerId) {
    throw new Error('Could not determine producerId. Provide --producerId explicitly (or use an NPN that resolves).');
  }

  const endpoints = [
    { key: 'producerById', path: `/producer/${producerId}` },
    { key: 'relationship', path: `/producer/${producerId}/relationship` },
    { key: 'licenses', path: `/producer/${producerId}/licenses` },
    { key: 'appointments', path: `/producer/${producerId}/appointments` },
    { key: 'contracts', path: `/contract/producer/${producerId}` },
    { key: 'addresses', path: `/producer/${producerId}/addresses` },
  ];

  for (const ep of endpoints) {
    const res = await surelcRequest(ep.path, token);
    raw[ep.key] = res;
    console.log(`[GET] ${ep.path} -> ${res.status} ${res.statusText}`);
    console.log('  Summary:', summarizeKeys(res.body));
    console.log('');
  }

  const licenses = raw.licenses?.ok ? raw.licenses.body : null;
  const appointments = raw.appointments?.ok ? raw.appointments.body : null;
  const contracts = raw.contracts?.ok ? raw.contracts.body : null;

  console.log('=== Card-oriented summaries ===');
  if (licenses) console.log('Licenses:', summarizeLicenses(licenses));
  if (appointments) console.log('Appointments:', summarizeAppointments(appointments));
  if (contracts) console.log('Contracts:', summarizeContracts(contracts));
  console.log('');

  if (rawOutPath) {
    const dir = path.dirname(rawOutPath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(rawOutPath, JSON.stringify(redactPII(raw), null, 2), 'utf8');
    console.log(`Wrote raw responses to ${rawOutPath} (PII redacted, but still review before sharing).`);
  }
}

main().catch((err) => {
  console.error('SureLC test failed:', String(err?.message || err));
  process.exitCode = 1;
});
