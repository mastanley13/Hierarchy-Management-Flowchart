// Serverless endpoint to update carrier-related contact custom fields in HighLevel (GHL).
//
// Body (JSON):
//   - contactId: string (required)
//   - carrierCompanyName?: string | null (optional; null/empty clears)
//   - carrierAgentNumber?: string | null (optional; null/empty clears)
//
// Env:
//   - HL_PRIVATE_API_KEY (required)
//   - HL_LOCATION_ID (required)
//   - HL_API_BASE (optional, default https://services.leadconnectorhq.com)
//   - HL_CARRIER_COMPANY_NAME_FIELD_ID (optional; if missing, resolved via /locations/:id/customFields)
//   - HL_CARRIER_AGENT_NUMBER_FIELD_ID (optional; if missing, resolved via /locations/:id/customFields)

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
const HL_CARRIER_COMPANY_NAME_FIELD_ID = (process.env.HL_CARRIER_COMPANY_NAME_FIELD_ID || '').trim() || undefined;
const HL_CARRIER_AGENT_NUMBER_FIELD_ID = (process.env.HL_CARRIER_AGENT_NUMBER_FIELD_ID || '').trim() || undefined;

const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeTrim = (value) => (typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim());

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

async function updateContactCustomFields(contactId, body) {
  try {
    return await fetchWithRetry(`/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  } catch (error) {
    const status = error?.status;
    const details = typeof error?.details === 'string' ? error.details : '';
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

async function resolveCarrierFieldIds() {
  const result = new Map();
  if (HL_CARRIER_COMPANY_NAME_FIELD_ID) {
    result.set('contact.carrier_company_name', HL_CARRIER_COMPANY_NAME_FIELD_ID);
  }
  if (HL_CARRIER_AGENT_NUMBER_FIELD_ID) {
    result.set('contact.carrier_agent_number', HL_CARRIER_AGENT_NUMBER_FIELD_ID);
  }

  const neededKeys = ['contact.carrier_company_name', 'contact.carrier_agent_number'].filter((key) => !result.has(key));
  if (neededKeys.length === 0) return result;

  const payload = await fetchWithRetry(`/locations/${encodeURIComponent(HL_LOCATION_ID)}/customFields`);
  const items = Array.isArray(payload?.customFields) ? payload.customFields : [];
  neededKeys.forEach((key) => {
    const match = items.find((field) => field?.model === 'contact' && field?.fieldKey === key);
    if (match?.id) result.set(key, match.id);
  });

  neededKeys.forEach((key) => {
    if (!result.has(key)) {
      throw new Error(`Unable to resolve custom field id for ${key} (set HL_CARRIER_COMPANY_NAME_FIELD_ID / HL_CARRIER_AGENT_NUMBER_FIELD_ID).`);
    }
  });

  return result;
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

    if (!contactId) {
      res.status(400).json({ error: 'Missing contactId' });
      return;
    }
    if (contactId.startsWith('upline:')) {
      res.status(400).json({ error: 'Cannot update synthetic upline nodes' });
      return;
    }

    const hasCarrierCompanyName = Object.prototype.hasOwnProperty.call(body, 'carrierCompanyName');
    const hasCarrierAgentNumber = Object.prototype.hasOwnProperty.call(body, 'carrierAgentNumber');
    if (!hasCarrierCompanyName && !hasCarrierAgentNumber) {
      res.status(400).json({ error: 'No carrier fields provided' });
      return;
    }

    const ids = await resolveCarrierFieldIds();
    const updates = [];

    if (hasCarrierCompanyName) {
      const valueToSet = safeTrim(Array.isArray(body.carrierCompanyName) ? body.carrierCompanyName[0] : body.carrierCompanyName) || '';
      updates.push({
        fieldKey: 'contact.carrier_company_name',
        fieldId: ids.get('contact.carrier_company_name'),
        value: valueToSet,
      });
    }

    if (hasCarrierAgentNumber) {
      const valueToSet = safeTrim(Array.isArray(body.carrierAgentNumber) ? body.carrierAgentNumber[0] : body.carrierAgentNumber) || '';
      updates.push({
        fieldKey: 'contact.carrier_agent_number',
        fieldId: ids.get('contact.carrier_agent_number'),
        value: valueToSet,
      });
    }

    const updateBody = {
      customFields: updates.map((entry) => ({ id: entry.fieldId, value: entry.value })),
    };

    const result = await updateContactCustomFields(contactId, updateBody);

    res.status(200).json({
      ok: true,
      contactId,
      fields: updates.map(({ fieldKey, fieldId, value }) => ({ fieldKey, fieldId, value })),
      result,
    });
  } catch (error) {
    console.error('Failed updating carrier fields', error);
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

