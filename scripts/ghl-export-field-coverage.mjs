import fs from 'node:fs';
import path from 'node:path';

function loadEnvFallback() {
  try {
    const root = process.cwd();
    const envPath = path.join(root, '.env');
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
    // ignore
  }
}

loadEnvFallback();

const HL_API_BASE = (process.env.HL_API_BASE || 'https://services.leadconnectorhq.com').trim();
const HL_PRIVATE_API_KEY = (process.env.HL_PRIVATE_API_KEY || '').trim() || undefined;
const HL_LOCATION_ID = (process.env.HL_LOCATION_ID || '').trim() || undefined;
const RAW_PAGE_SIZE = Number.parseInt(process.env.HL_PAGE_SIZE || '100', 10);
const PAGE_SIZE = Number.isNaN(RAW_PAGE_SIZE) ? 100 : Math.min(Math.max(RAW_PAGE_SIZE, 1), 100);
const MAX_CONTACTS = Number.parseInt(process.env.HL_MAX_CONTACTS || '2000', 10);
const MAX_OPPORTUNITIES = Number.parseInt(process.env.HL_MAX_OPPORTUNITIES || '5000', 10);

const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureConfig = () => {
  if (!HL_PRIVATE_API_KEY) throw new Error('HL_PRIVATE_API_KEY is not set');
  if (!HL_LOCATION_ID) throw new Error('HL_LOCATION_ID is not set');
};

async function fetchWithRetry(pathOrUrl, attempt = 0) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${HL_API_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${HL_PRIVATE_API_KEY}`,
      Version: '2021-07-28',
      'Location-Id': HL_LOCATION_ID,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    await sleep(RATE_LIMIT_DELAY_MS * (attempt + 1));
    return fetchWithRetry(pathOrUrl, attempt + 1);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    const error = new Error(`HighLevel request failed: ${res.status} ${errorText}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

async function fetchCustomFields() {
  const data = await fetchWithRetry(`/locations/${HL_LOCATION_ID}/customFields`);
  const items = Array.isArray(data?.customFields) ? data.customFields : [];
  const idMap = new Map();
  items.forEach((field) => idMap.set(field.id, field));
  return { items, byId: idMap };
}

async function fetchAllContacts() {
  const contacts = [];
  let nextUrl = `/contacts/?locationId=${encodeURIComponent(HL_LOCATION_ID)}&limit=${PAGE_SIZE}`;
  while (nextUrl && contacts.length < MAX_CONTACTS) {
    const payload = await fetchWithRetry(nextUrl);
    if (Array.isArray(payload?.contacts)) contacts.push(...payload.contacts);
    const nextPageUrl = payload?.meta?.nextPageUrl;
    nextUrl = nextPageUrl ? nextPageUrl : null;
  }
  return contacts;
}

async function fetchAllOpportunities() {
  const initialUrls = [
    `/opportunities/?locationId=${encodeURIComponent(HL_LOCATION_ID)}&limit=${PAGE_SIZE}`,
    `/opportunities/?location_id=${encodeURIComponent(HL_LOCATION_ID)}&limit=${PAGE_SIZE}`,
    `/opportunities/search?locationId=${encodeURIComponent(HL_LOCATION_ID)}&limit=${PAGE_SIZE}`,
    `/opportunities/search?location_id=${encodeURIComponent(HL_LOCATION_ID)}&limit=${PAGE_SIZE}`,
  ];

  let lastError = null;
  for (const initialUrl of initialUrls) {
    try {
      const opportunities = [];
      let nextUrl = initialUrl;
      while (nextUrl && opportunities.length < MAX_OPPORTUNITIES) {
        const payload = await fetchWithRetry(nextUrl);
        const batch = Array.isArray(payload?.opportunities)
          ? payload.opportunities
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
        if (batch.length) opportunities.push(...batch);
        const nextPageUrl = payload?.meta?.nextPageUrl;
        nextUrl = nextPageUrl ? nextPageUrl : null;
      }
      return opportunities;
    } catch (error) {
      lastError = error;
      const status = error?.status;
      if (status === 400 || status === 404 || status === 422) continue;
      throw error;
    }
  }

  throw lastError || new Error('Failed to fetch opportunities');
}

const isPresent = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((entry) => isPresent(entry));
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

const labelForKey = (key, labelMap) => labelMap.get(key) || key;

const contactKeys = [
  'contact.source',
  'contact.upline_highest_stage',
  'contact.comp_level_link',
  'contact.custom_comp_level_notes',
  'contact.phone_number',
  'contact.onboarding__licensed',
  'contact.onboarding__npn',
  'contact.onboarding__licensing_state',
  'contact.onboarding__upline_email',
  'contact.onboarding__cluster_applies',
  'contact.onboarding__equita_profile_created',
  'contact.onboarding__quility_profile_created',
  'contact.onboarding__xcel_account_created',
  'contact.onboarding__xcel_username_email',
  'contact.onboarding__xcel_temp_password',
  'contact.xcel_enrollment_date',
  'contact.xcel_due_date',
  'contact.xcel_last_touch',
  'contact.onboarding__xcel_started',
  'contact.onboarding__xcel_paid',
  'contact.onboarding__producer_number',
  'contact.upline_code_equita',
  'contact.upline_code_quility',
  'contact.phone_numer',
];

const opportunityKeys = [
  'opportunity.pipeline_id',
  'opportunity.pipeline_stage_id',
  'opportunity.monetary_value',
  'opportunity.assigned_to',
  'opportunity.carrier_app__carrier_name',
  'opportunity.carrier_app__cluster',
  'opportunity.carrier_app__eligible',
  'opportunity.carrier_app__upline_code_received',
  'opportunity.carrier_app__current_disposition',
];

const getOpportunityValue = (opportunity, custom, key) => {
  if (key === 'opportunity.pipeline_id') return opportunity?.pipelineId ?? opportunity?.pipeline_id ?? opportunity?.pipeline ?? null;
  if (key === 'opportunity.pipeline_stage_id') return opportunity?.pipelineStageId ?? opportunity?.pipeline_stage_id ?? opportunity?.pipelineStage ?? null;
  if (key === 'opportunity.monetary_value') return opportunity?.monetaryValue ?? opportunity?.monetary_value ?? opportunity?.value ?? null;
  if (key === 'opportunity.assigned_to') return opportunity?.assignedTo ?? opportunity?.assigned_to ?? opportunity?.assigned ?? null;
  return custom[key];
};

const main = async () => {
  ensureConfig();

  const customFields = await fetchCustomFields();
  const labelMap = new Map();
  customFields.items.forEach((field) => {
    if (field?.fieldKey && field?.name) labelMap.set(field.fieldKey, field.name);
  });

  const contacts = await fetchAllContacts();
  const contactCounts = new Map(contactKeys.map((key) => [key, 0]));
  for (const contact of contacts) {
    const custom = {};
    (contact.customFields || []).forEach((entry) => {
      const field = customFields.byId.get(entry.id);
      const fieldKey = field?.fieldKey || entry.id;
      custom[fieldKey] = entry.value;
    });

    for (const key of contactKeys) {
      let value;
      if (key === 'contact.source') value = contact.source;
      else if (key === 'contact.phone_number' || key === 'contact.phone_numer') value = contact.phone;
      else value = custom[key];
      if (isPresent(value)) contactCounts.set(key, (contactCounts.get(key) || 0) + 1);
    }
  }

  let opportunities = [];
  let opportunityError = null;
  try {
    opportunities = await fetchAllOpportunities();
  } catch (error) {
    opportunityError = error;
  }

  const opportunityCounts = new Map(opportunityKeys.map((key) => [key, 0]));
  if (!opportunityError) {
    for (const opportunity of opportunities) {
      const custom = {};
      (opportunity?.customFields || []).forEach((entry) => {
        const field = customFields.byId.get(entry.id);
        const fieldKey = field?.fieldKey || entry.id;
        custom[fieldKey] = entry.value;
      });
      for (const key of opportunityKeys) {
        const value = getOpportunityValue(opportunity, custom, key);
        if (isPresent(value)) opportunityCounts.set(key, (opportunityCounts.get(key) || 0) + 1);
      }
    }
  }

  console.log(`Contacts fetched: ${contacts.length}`);
  console.log('Contact field coverage (non-empty values):');
  contactKeys.forEach((key) => {
    const label = labelForKey(key, labelMap);
    const count = contactCounts.get(key) || 0;
    console.log(`- ${label} (${key}): ${count}/${contacts.length}`);
  });

  console.log('');
  if (opportunityError) {
    console.log('Opportunities: FAILED to fetch');
    console.log(String(opportunityError?.message || opportunityError));
    process.exitCode = 2;
    return;
  }

  console.log(`Opportunities fetched: ${opportunities.length}`);
  console.log('Opportunity field coverage (non-empty values):');
  opportunityKeys.forEach((key) => {
    const label = labelForKey(key, labelMap);
    const count = opportunityCounts.get(key) || 0;
    console.log(`- ${label} (${key}): ${count}/${opportunities.length}`);
  });
};

main().catch((error) => {
  console.error('Coverage script failed:', error?.message || error);
  process.exitCode = 1;
});
