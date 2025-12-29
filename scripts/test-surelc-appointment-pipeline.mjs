// Test "highest appointment stage by NPN" mapping against SureLC (Equita/Quility).
//
// Usage:
//   node scripts/test-surelc-appointment-pipeline.mjs --npn 20592489 --which EQUITA --env test.credentials.md
//
// Credentials (read from process.env and/or --env file):
//   - SURELC_AUTH_EQUITA / SURELC_AUTH_QUILITY / SURELC_AUTH (pre-encoded "Basic ...")
//   - SURELC_USER_* / SURELC_PASS_* (or VITE_SURELC_USER_* / VITE_SURELC_PASS_*)

import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.SURELC_BASE || 'https://surelc.surancebay.com/sbweb/ws').replace(/\/+$/, '');

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

    // Support JS snippets like: var AUTH_EQ = 'Basic ...';
    try {
      const eq = text.match(/AUTH_EQ\s*=\s*['"]([^'"]+)['"]/);
      const qu = text.match(/AUTH_QU\s*=\s*['"]([^'"]+)['"]/);
      if (eq && !process.env.SURELC_AUTH_EQUITA) process.env.SURELC_AUTH_EQUITA = eq[1].trim();
      if (qu && !process.env.SURELC_AUTH_QUILITY) process.env.SURELC_AUTH_QUILITY = qu[1].trim();
    } catch {}

    for (const rawLine of text.split(/\\r?\\n/)) {
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
    console.warn('Warning: failed to load env file:', String(err?.message || err));
  }
}

function basicAuthHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

function pickCredentials(whichRaw) {
  const which = String(whichRaw || process.env.SURELC_WHICH || 'EQUITA').toUpperCase();

  const read = (key, legacyKey) => (process.env[key] || '').trim() || (process.env[legacyKey] || '').trim() || '';

  const options = {
    EQUITA: {
      label: 'EQUITA',
      auth: read('SURELC_AUTH_EQUITA', ''),
      user: read('SURELC_USER_EQUITA', 'VITE_SURELC_USER_EQUITA'),
      pass: read('SURELC_PASS_EQUITA', 'VITE_SURELC_PASS_EQUITA'),
    },
    QUILITY: {
      label: 'QUILITY',
      auth: read('SURELC_AUTH_QUILITY', ''),
      user: read('SURELC_USER_QUILITY', 'VITE_SURELC_USER_QUILITY'),
      pass: read('SURELC_PASS_QUILITY', 'VITE_SURELC_PASS_QUILITY'),
    },
    GENERAL: {
      label: 'GENERAL',
      auth: read('SURELC_AUTH', ''),
      user: read('SURELC_USER', 'VITE_SURELC_USER'),
      pass: read('SURELC_PASS', 'VITE_SURELC_PASS'),
    },
  };

  const preferred = options[which] || options.EQUITA;
  const fallback = which === 'GENERAL' ? null : options.GENERAL;

  const resolved =
    preferred.auth
      ? preferred
      : preferred.user && preferred.pass
        ? preferred
        : fallback && (fallback.auth || (fallback.user && fallback.pass))
          ? { ...fallback, label: `${preferred.label} (fallback->GENERAL)` }
          : preferred;

  const token = resolved.auth ? resolved.auth : resolved.user && resolved.pass ? basicAuthHeader(resolved.user, resolved.pass) : '';
  if (!token) {
    throw new Error(
      'Missing SureLC credentials. Set SURELC_AUTH_* or SURELC_USER_*/SURELC_PASS_* (or VITE_* equivalents) in env.',
    );
  }

  return { label: resolved.label, token };
}

async function httpGet(url, token) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: token },
  });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
  return { status: res.status, data: body, ok: res.ok, statusText: res.statusText };
}

function toStr(v) {
  return v == null ? '' : String(v);
}

async function fetchAppointmentsByNpn(npn, token) {
  const url = `${BASE}/producer/npn/${encodeURIComponent(npn)}/appointments?origin=All&carrier=All`;
  const r = await httpGet(url, token);
  if (r.status === 404) return { status: 404, list: [] };
  if (r.ok && Array.isArray(r.data) && r.data.length) return { status: r.status, list: r.data };
  if (r.ok && Array.isArray(r.data)) return { status: r.status, list: r.data };
  return { status: r.status, list: [] };
}

const CARRIER_TERMS = ['appoint', 'appointed', 'active', 'approved', 'issued', 'contracted'];
const BGA_TERMS = [
  'pending',
  'submit',
  'submitted',
  'sent',
  'review',
  'processing',
  'process',
  'await',
  'awaiting',
  'incomplete',
  'hold',
  'additional',
  'missing',
  'require',
  'required',
  'correction',
  'signature',
  'sign',
  'aml',
  'e&o',
  'code',
  'upline',
];
const NEGATIVE_TERMS = ['terminate', 'terminated', 'decline', 'declined', 'reject', 'rejected', 'inactive', 'lapse', 'lapsed', 'expired'];

function includesAny(hay, arr) {
  const lower = (hay || '').toLowerCase();
  for (let i = 0; i < arr.length; i += 1) {
    if (lower.indexOf(arr[i]) !== -1) return true;
  }
  return false;
}

function mapStage(rawStatus) {
  if (!rawStatus) return 'Unknown';
  const s = String(rawStatus).toLowerCase();
  if (includesAny(s, NEGATIVE_TERMS)) return 'At CARRIER';
  if (includesAny(s, CARRIER_TERMS)) return 'At CARRIER';
  if (includesAny(s, BGA_TERMS)) return 'At BGA';
  if (s.indexOf('producer') !== -1) return 'At Producer';
  return 'Unknown';
}

function pickCarrierId(a) {
  if (!a || typeof a !== 'object') return '';
  if (a.carrierId != null) return toStr(a.carrierId);
  if (a.carrier && a.carrier.id != null) return toStr(a.carrier.id);
  return '';
}

function pickCarrierName(a) {
  if (!a || typeof a !== 'object') return '';
  if (a.carrier && a.carrier.name != null) return toStr(a.carrier.name);
  if (a.carrierName != null) return toStr(a.carrierName);
  return '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.env && args.env !== true ? String(args.env) : undefined);

  const npn = args.npn && args.npn !== true ? String(args.npn).trim() : (process.env.TEST_NPN || '').trim();
  if (!npn) {
    console.log(
      JSON.stringify(
        {
          anyBga: false,
          allCarrier: false,
          counts: { carrier: 0, bga: 0, producer: 0, unknown: 0, total: 0 },
          currentlyAtRows: [],
          pipelineSuggestion: 'S2',
          status: 400,
          error: 'Missing NPN',
        },
        null,
        2,
      ),
    );
    return;
  }

  const { label, token } = pickCredentials(args.which);
  const { status, list } = await fetchAppointmentsByNpn(npn, token);

  let cCarrier = 0;
  let cBga = 0;
  let cProducer = 0;
  let cUnknown = 0;
  let total = 0;
  const rows = [];

  for (let i = 0; i < list.length; i += 1) {
    const a = list[i] || {};
    const stage = mapStage(a.status || a.stage || a.appointmentStatus);
    rows.push({ carrierId: pickCarrierId(a), carrierName: pickCarrierName(a), stage });
    total += 1;
    if (stage === 'At CARRIER') cCarrier += 1;
    else if (stage === 'At BGA') cBga += 1;
    else if (stage === 'At Producer') cProducer += 1;
    else cUnknown += 1;
  }

  const anyBga = cBga > 0;
  const allCarrier = total > 0 && cCarrier === total;
  const counts = { carrier: cCarrier, bga: cBga, producer: cProducer, unknown: cUnknown, total };

  let pipe = 'S2';
  if (anyBga) pipe = 'S3';
  else if (allCarrier) pipe = 'S4';

  const ok = status >= 200 && status < 300;
  console.log(
    JSON.stringify(
      {
        anyBga,
        allCarrier,
        counts,
        currentlyAtRows: rows,
        pipelineSuggestion: pipe,
        status: ok ? 200 : status,
        which: label,
        npn,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(
    JSON.stringify(
      {
        anyBga: false,
        allCarrier: false,
        counts: { carrier: 0, bga: 0, producer: 0, unknown: 0, total: 0 },
        currentlyAtRows: [],
        pipelineSuggestion: 'S2',
        status: 500,
        error: String((e && e.message) || e),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
