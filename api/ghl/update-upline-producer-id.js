// Serverless endpoint to update a contact's "Upline Producer ID" custom field in HighLevel (GHL).
//
// Body (JSON):
//   - contactId: string (required)
//   - uplineProducerId: string | null (optional; digits-only recommended; null/empty clears)
//
// Env:
//   - HL_PRIVATE_API_KEY (required)
//   - HL_LOCATION_ID (required)
//   - HL_API_BASE (optional, default https://services.leadconnectorhq.com)
//   - HL_UPLINE_PRODUCER_FIELD_ID (optional; if missing, resolved via /locations/:id/customFields)

import fs from 'node:fs';
import path from 'node:path';

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

loadEnvFallback();

const HL_API_BASE = (process.env.HL_API_BASE || 'https://services.leadconnectorhq.com').trim();
const HL_PRIVATE_API_KEY = (process.env.HL_PRIVATE_API_KEY || '').trim() || undefined;
const HL_LOCATION_ID = (process.env.HL_LOCATION_ID || '').trim() || undefined;
const HL_UPLINE_PRODUCER_FIELD_ID = (process.env.HL_UPLINE_PRODUCER_FIELD_ID || '').trim() || undefined;

const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeDigits = (value) =>
  typeof value === 'string'
    ? value.replace(/\D+/g, '')
    : typeof value === 'number'
      ? String(value).replace(/\D+/g, '')
      : '';

const buildCors = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  );
};

const ensureConfig = () => {
  if (!HL_PRIVATE_API_KEY) throw new Error('HL_PRIVATE_API_KEY is not set');
  if (!HL_LOCATION_ID) throw new Error('HL_LOCATION_ID is not set');
};

async function fetchWithRetry(pathOrUrl, init = {}, attempt = 0) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${HL_API_BASE}${pathOrUrl}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${HL_PRIVATE_API_KEY}`,
      'Version': '2021-07-28',
      'Location-Id': HL_LOCATION_ID,
      'Accept': 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    await sleep(RATE_LIMIT_DELAY_MS * (attempt + 1));
    return fetchWithRetry(pathOrUrl, init, attempt + 1);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    const error = new Error(`HighLevel request failed: ${res.status} ${errorText}`);
    error.status = res.status;
    error.details = errorText;
    throw error;
  }

  return res.json();
}

async function resolveUplineProducerFieldId() {
  if (HL_UPLINE_PRODUCER_FIELD_ID) return HL_UPLINE_PRODUCER_FIELD_ID;
  const payload = await fetchWithRetry(`/locations/${encodeURIComponent(HL_LOCATION_ID)}/customFields`);
  const items = Array.isArray(payload?.customFields) ? payload.customFields : [];
  const match = items.find((field) => field?.model === 'contact' && field?.fieldKey === 'contact.upline_producer_id');
  if (!match?.id) {
    throw new Error('Unable to resolve custom field id for contact.upline_producer_id (set HL_UPLINE_PRODUCER_FIELD_ID).');
  }
  return match.id;
}

async function updateContactCustomFields(contactId, body) {
  try {
    // HighLevel accepts partial updates more reliably via PATCH than PUT.
    return await fetchWithRetry(`/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  } catch (error) {
    const status = error?.status;
    const details = typeof error?.details === 'string' ? error.details : '';
    // Some HighLevel deployments return 404 "Cannot PATCH /contacts/:id" instead of 405.
    const looksLikeMethodUnsupported =
      status === 405 ||
      (status === 404 && details.toLowerCase().includes('cannot patch /contacts/'));
    if (!looksLikeMethodUnsupported) throw error;
  }

  try {
    return await fetchWithRetry(`/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  } catch (error) {
    const status = error?.status;
    if (status === 405) {
      return await fetchWithRetry(`/contacts/${encodeURIComponent(contactId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    }
    throw error;
  }
}

export default async function handler(req, res) {
  buildCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    ensureConfig();

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const contactId = String(body.contactId || '').trim();
    const rawValue = body.uplineProducerId;

    if (!contactId) {
      res.status(400).json({ error: 'Missing contactId' });
      return;
    }
    if (contactId.startsWith('upline:')) {
      res.status(400).json({ error: 'Cannot update synthetic upline nodes' });
      return;
    }

    const normalized = normalizeDigits(Array.isArray(rawValue) ? rawValue[0] : rawValue);
    const valueToSet = normalized || '';
    const fieldId = await resolveUplineProducerFieldId();

    const updateBody = {
      customFields: [
        { id: fieldId, value: valueToSet },
      ],
    };

    const result = await updateContactCustomFields(contactId, updateBody);

    res.status(200).json({
      ok: true,
      contactId,
      fieldKey: 'contact.upline_producer_id',
      fieldId,
      value: valueToSet,
      result,
    });
  } catch (error) {
    console.error('Failed updating upline producer id', error);
    const status =
      typeof error?.status === 'number' && error.status >= 400 && error.status <= 599
        ? error.status
        : 500;
    res.status(status).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: typeof error?.details === 'string' ? error.details : undefined,
      status,
    });
  }
}
