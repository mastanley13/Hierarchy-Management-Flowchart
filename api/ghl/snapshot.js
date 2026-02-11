import { createRequire } from 'module';

const require = createRequire(import.meta.url);



// Best-effort .env fallback in dev: if env vars are missing when Vite dev server

// invokes this handler directly, read .env manually to populate process.env.

function loadEnvFallback() {

  try {

    const fs = require('fs');

    const path = require('path');

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

  } catch (_) {

    // noop: only a dev convenience

  }

}



loadEnvFallback();



const HL_API_BASE = (process.env.HL_API_BASE || 'https://services.leadconnectorhq.com').trim();
const HL_PRIVATE_API_KEY = (process.env.HL_PRIVATE_API_KEY || '').trim() || undefined;
const HL_LOCATION_ID = (process.env.HL_LOCATION_ID || '').trim() || undefined;
const HL_ONBOARDING_PIPELINE_ID = (process.env.HL_ONBOARDING_PIPELINE_ID || '').trim() || undefined;
const HL_ONBOARDING_PIPELINE_NAME = (process.env.HL_ONBOARDING_PIPELINE_NAME || 'Onboarding — Agent').trim();
const RAW_PAGE_SIZE = Number.parseInt(process.env.HL_PAGE_SIZE || '100', 10);
const PAGE_SIZE = Number.isNaN(RAW_PAGE_SIZE)
  ? 100
  : Math.min(Math.max(RAW_PAGE_SIZE, 1), 100);
const MAX_CONTACTS = Number.parseInt(process.env.HL_MAX_CONTACTS || '2000', 10);
const MAX_OPPORTUNITIES = Number.parseInt(process.env.HL_MAX_OPPORTUNITIES || '5000', 10);

const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRIES = 5;
const SYNTHETIC_UPLINE_PREFIX = 'upline:';
const NPN_GROUP_PREFIX = 'npn-group:';


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));



const isTruthy = (value) => {

  if (Array.isArray(value)) {

    return value.some((entry) => isTruthy(entry));

  }

  if (typeof value === 'string') {

    const normalized = value.trim().toLowerCase();

    return ['yes', 'true', '1', 'on', 'checked'].includes(normalized);

  }

  if (typeof value === 'number') {

    return value !== 0;

  }

  if (typeof value === 'boolean') {

    return value;

  }

  return Boolean(value);

};

const EXCLUDE_TEST_UPLINE_CANDIDATES = isTruthy(process.env.HL_UPLINE_EXCLUDE_TEST_CANDIDATES || false);



const normalizeDigits = (value) =>
  typeof value === 'string'
    ? value.replace(/\D+/g, '')
    : typeof value === 'number'
      ? String(value).replace(/\D+/g, '')
      : '';

const normalizeText = (value) =>
  String(value || '')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ROOT_UPLINE_NPN = normalizeDigits(process.env.HL_ROOT_UPLINE_NPN || '18550335');
const ROOT_CONTACT_ID = (process.env.HL_ROOT_CONTACT_ID || '').trim();
const ROOT_CONTACT_EMAIL = (process.env.HL_ROOT_CONTACT_EMAIL || '').trim();


const normalizeEmail = (value) =>

  typeof value === 'string' ? value.trim().toLowerCase() : '';



const safeTrim = (value) =>

  typeof value === 'string' ? value.trim() : '';

const smartTitleCase = (value) => {
  const input = safeTrim(value);
  if (!input) return '';

  return input
    .split(/\s+/g)
    .filter(Boolean)
    .map((word, wordIndex) => {
      const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'’.-]*)([^A-Za-z0-9]*)$/);
      if (!match) return word;

      const [, prefix, coreRaw, suffix] = match;
      const dotMatch = coreRaw.match(/^(.*?)(\.+)$/);
      const core = dotMatch ? dotMatch[1] : coreRaw;
      const dots = dotMatch ? dotMatch[2] : '';

      if (!hasLetters(core)) {
        return `${prefix}${coreRaw}${suffix}`;
      }

      const isFirstWord = wordIndex === 0;

      const hyphenParts = core.split('-').map((hyPart, hyIndex) => {
        const apostropheParts = hyPart.split(/(['’])/);
        let rendered = '';
        for (let i = 0; i < apostropheParts.length; i += 1) {
          const part = apostropheParts[i];
          if (part === '\'' || part === '’') {
            rendered += part;
            continue;
          }
          if (!part) continue;
          rendered += titleCaseToken(part, isFirstWord && hyIndex === 0 && i === 0);
        }
        return rendered;
      });

      return `${prefix}${hyphenParts.join('-')}${dots}${suffix}`;
    })
    .join(' ');
};

const formatContactDisplayName = (value) => {
  const trimmed = safeTrim(value);
  if (!trimmed) return '';
  if (!looksLikeAutoCasedName(trimmed)) return trimmed;
  return smartTitleCase(trimmed);
};



const buildCors = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',

    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'

  );
};

const buildSyntheticUplineNode = (uplineProducerId) => {
  const label = `Upline ${uplineProducerId}`;
  return {
    id: `${SYNTHETIC_UPLINE_PREFIX}${uplineProducerId}`,
    contactId: null,
    firstName: 'Upline',
    lastName: uplineProducerId,
    name: label,
    companyName: null,
    email: null,
    emailDisplay: null,
    phone: null,
    source: null,
    npn: uplineProducerId,
    npnRaw: uplineProducerId,
    surelcId: null,
    surelcRaw: null,
    uplineProducerId: null,
    uplineProducerIdRaw: null,
    uplineEmail: null,
    uplineEmailRaw: null,
    uplineName: label,
    uplineNameRaw: label,
    uplineHighestStage: null,
    aggregator: {
      equita: false,
      quility: false,
    },
    flags: {
      licensed: false,
      xcelAccountCreated: false,
      xcelStarted: false,
      xcelPaid: false,
      equitaProfile: false,
      quilityProfile: false,
    },
    licensingState: '',
    compLevel: '',
    compLevelNotes: '',
    xcel: {
      username: '',
      tempPassword: '',
      enrollmentDate: '',
      dueDate: '',
      lastTouch: '',
    },
    parentId: null,
    uplineSource: 'synthetic',
    uplineConfidence: 1,
    children: [],
    customFields: {},
    opportunity: null,
    isSynthetic: true,
  };
};

const ensureConfig = () => {

  if (!HL_PRIVATE_API_KEY) {

    throw new Error('HL_PRIVATE_API_KEY is not set');

  }

  if (!HL_LOCATION_ID) {

    throw new Error('HL_LOCATION_ID is not set');

  }

};



async function fetchWithRetry(pathOrUrl, optionsOrAttempt = 0, maybeAttempt = 0) {
  const hasOptions = typeof optionsOrAttempt === 'object' && optionsOrAttempt !== null;
  const options = hasOptions ? optionsOrAttempt : {};
  const attempt = hasOptions ? maybeAttempt : optionsOrAttempt;

  const url = pathOrUrl.startsWith('http')

    ? pathOrUrl

    : `${HL_API_BASE}${pathOrUrl}`;

  const method = String(options?.method || 'GET').toUpperCase();
  const body = Object.prototype.hasOwnProperty.call(options, 'body')
    ? JSON.stringify(options.body)
    : undefined;

  const res = await fetch(url, {
    method,

    headers: {

      'Authorization': `Bearer ${HL_PRIVATE_API_KEY}`,

      'Version': '2021-07-28',

      'Location-Id': HL_LOCATION_ID,

      'Accept': 'application/json',

      'Content-Type': 'application/json',

    },
    body,

  });



  if (res.status === 429 && attempt < MAX_RETRIES) {

    await sleep(RATE_LIMIT_DELAY_MS * (attempt + 1));

    return hasOptions
      ? fetchWithRetry(pathOrUrl, options, attempt + 1)
      : fetchWithRetry(pathOrUrl, attempt + 1);

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

  const contactFields = items.filter((field) => field.model === 'contact');

  const opportunityFields = items.filter((field) => field.model === 'opportunity');

  const idMap = new Map();

  items.forEach((field) => {

    idMap.set(field.id, field);

  });

  return {

    items,

    contactItems: contactFields,

    opportunityItems: opportunityFields,

    byId: idMap,

  };

}


const extractPipelineItems = (payload) => {

  if (!payload) return [];

  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.pipelines)) return payload.pipelines;

  if (Array.isArray(payload?.items)) return payload.items;

  if (Array.isArray(payload?.data)) return payload.data;

  if (Array.isArray(payload?.pipelines?.pipelines)) return payload.pipelines.pipelines;

  return [];

};


const extractPipelineStages = (pipeline) => {

  if (!pipeline) return [];

  const candidates = [

    pipeline.stages,

    pipeline.pipelineStages,

    pipeline.pipeline_stages,

    pipeline.pipeline_stages?.stages,

    pipeline.stages?.stages,

    pipeline.stages?.items,

    pipeline.pipelineStages?.items,

  ];

  for (const candidate of candidates) {

    if (Array.isArray(candidate)) return candidate;

  }

  return [];

};


const buildStageNameById = (pipeline) => {

  const map = new Map();

  extractPipelineStages(pipeline).forEach((stage) => {

    const id = stage?.id ?? stage?._id ?? stage?.stageId ?? stage?.stage_id ?? null;

    const name = stage?.name ?? stage?.label ?? stage?.title ?? null;

    if (!id || !name) return;

    map.set(String(id), String(name));

  });

  return map;

};


const findOnboardingPipeline = (pipelines) => {

  if (!Array.isArray(pipelines) || pipelines.length === 0) return null;


  if (HL_ONBOARDING_PIPELINE_ID) {

    const direct = pipelines.find((p) => String(p?.id ?? p?._id ?? '') === String(HL_ONBOARDING_PIPELINE_ID));

    if (direct) return direct;

  }


  const desired = normalizeText(HL_ONBOARDING_PIPELINE_NAME);

  const byName = pipelines.find((p) => normalizeText(p?.name ?? p?.title ?? p?.label ?? '') === desired);

  if (byName) return byName;


  const fuzzy = pipelines.find((p) => {

    const name = normalizeText(p?.name ?? p?.title ?? p?.label ?? '');

    return name.includes('onboard') && name.includes('agent');

  });

  return fuzzy || null;

};


async function fetchOpportunityPipelines() {

  const initialUrls = [

    `/opportunities/pipelines?locationId=${encodeURIComponent(HL_LOCATION_ID)}`,

    `/opportunities/pipelines?location_id=${encodeURIComponent(HL_LOCATION_ID)}`,

    `/opportunities/pipelines/?locationId=${encodeURIComponent(HL_LOCATION_ID)}`,

    `/opportunities/pipelines/?location_id=${encodeURIComponent(HL_LOCATION_ID)}`,

    `/pipelines?locationId=${encodeURIComponent(HL_LOCATION_ID)}`,

    `/pipelines?location_id=${encodeURIComponent(HL_LOCATION_ID)}`,

    `/pipelines/?locationId=${encodeURIComponent(HL_LOCATION_ID)}`,

    `/pipelines/?location_id=${encodeURIComponent(HL_LOCATION_ID)}`,

  ];


  let lastError = null;

  for (const initialUrl of initialUrls) {

    try {

      const payload = await fetchWithRetry(initialUrl);

      const pipelines = extractPipelineItems(payload);

      return pipelines;

    } catch (error) {

      lastError = error;

      const status = error?.status;

      if (status === 400 || status === 404 || status === 422) continue;

      throw error;

    }

  }


  throw lastError || new Error('Failed to fetch opportunity pipelines');

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



        if (batch.length) {

          opportunities.push(...batch);

        }



        const nextPageUrl = payload?.meta?.nextPageUrl;

        nextUrl = nextPageUrl ? nextPageUrl : null;

      }



      return opportunities;

    } catch (error) {

      lastError = error;

      const status = error?.status;

      if (status === 400 || status === 404 || status === 422) {

        continue;

      }



      throw error;

    }

  }



  throw lastError || new Error('Failed to fetch opportunities');

}



const toEpochMs = (value) => {

  if (!value) return 0;

  const date = value instanceof Date ? value : new Date(value);

  const ms = date.getTime();

  return Number.isNaN(ms) ? 0 : ms;

};



const extractOpportunityContactId = (opportunity) => {

  const direct = opportunity?.contactId || opportunity?.contact_id || opportunity?.contact || null;

  if (typeof direct === 'string') return direct;

  if (direct && typeof direct === 'object') {

    const nested = direct.id || direct.contactId || direct.contact_id;

    if (typeof nested === 'string') return nested;

  }

  return null;

};


const extractOpportunityPipelineId = (opportunity) => {

  const direct = opportunity?.pipelineId ?? opportunity?.pipeline_id ?? opportunity?.pipeline ?? null;

  if (typeof direct === 'string') return direct;

  if (typeof direct === 'number') return String(direct);

  if (direct && typeof direct === 'object') {

    const nested = direct.id ?? direct._id ?? direct.pipelineId ?? direct.pipeline_id ?? null;

    if (typeof nested === 'string') return nested;

    if (typeof nested === 'number') return String(nested);

  }

  return null;

};



const buildOpportunitySummary = (opportunity, customFieldsMap) => {

  const custom = {};



  (opportunity?.customFields || []).forEach((entry) => {

    const field = customFieldsMap.get(entry.id);

    const key = field?.fieldKey || entry.id;

    custom[key] = entry.value;

  });



  const pipelineId = opportunity?.pipelineId ?? opportunity?.pipeline_id ?? opportunity?.pipeline ?? null;

  const pipelineStageId = opportunity?.pipelineStageId ?? opportunity?.pipeline_stage_id ?? opportunity?.pipelineStage ?? null;

  const monetaryValue = opportunity?.monetaryValue ?? opportunity?.monetary_value ?? opportunity?.value ?? null;

  const assignedTo = opportunity?.assignedTo ?? opportunity?.assigned_to ?? opportunity?.assigned ?? null;



  return {

    pipelineId: typeof pipelineId === 'string' ? pipelineId : pipelineId ? String(pipelineId) : null,

    pipelineStageId: typeof pipelineStageId === 'string' ? pipelineStageId : pipelineStageId ? String(pipelineStageId) : null,

    monetaryValue,

    assignedTo: typeof assignedTo === 'string' ? assignedTo : assignedTo ? String(assignedTo) : null,

    customFields: custom,

  };

};



const buildOpportunityIndex = (rawOpportunities, customFieldsMap, options = {}) => {

  const pipelineFilter = options?.pipelineId ? String(options.pipelineId) : null;

  const byContactId = new Map();



  rawOpportunities.forEach((opportunity) => {

    const contactId = extractOpportunityContactId(opportunity);

    if (!contactId) return;

    if (pipelineFilter) {

      const pipelineId = extractOpportunityPipelineId(opportunity);

      if (!pipelineId || String(pipelineId) !== pipelineFilter) return;

    }



    const updatedAt = opportunity?.updatedAt ?? opportunity?.updated_at ?? opportunity?.dateUpdated ?? null;

    const createdAt = opportunity?.createdAt ?? opportunity?.created_at ?? opportunity?.dateAdded ?? null;

    const sortKey = Math.max(toEpochMs(updatedAt), toEpochMs(createdAt));



    const existing = byContactId.get(contactId);

    if (existing && existing.sortKey >= sortKey) return;



    byContactId.set(contactId, {

      sortKey,

      summary: buildOpportunitySummary(opportunity, customFieldsMap),

    });

  });



  const finalIndex = new Map();

  byContactId.forEach((value, key) => {

    finalIndex.set(key, value.summary);

  });



  return finalIndex;

};



async function fetchAllContacts() {

  const contacts = [];

  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (contacts.length < MAX_CONTACTS && page < 10_000) {
    const payload = await fetchWithRetry('/contacts/search', {
      method: 'POST',
      body: {
        locationId: HL_LOCATION_ID,
        page,
        pageLimit: PAGE_SIZE,
      },
    });

    const chunk = Array.isArray(payload?.contacts) ? payload.contacts : [];
    contacts.push(...chunk);

    if (Number.isFinite(payload?.total)) {
      total = payload.total;
    }

    if (chunk.length === 0 || contacts.length >= total) {
      break;
    }

    page += 1;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return contacts.slice(0, MAX_CONTACTS);

}



const summarizeContact = (node) => ({

  id: node.id,

  name: node.name,

  npn: node.npn || null,

  uplineProducerId: node.uplineProducerIdRaw || null,

  uplineEmail: node.uplineEmail || null,

});



const deriveStatus = (node) => {

  if (node.flags.licensed) {

    return 'ACTIVE';

  }

  if (node.flags.xcelStarted || node.flags.xcelPaid) {

    return 'PENDING';

  }

  return 'INACTIVE';

};



function buildSnapshot(rawContacts, customFieldsMap, options = {}) {
  const nodes = [];
  const nodesById = new Map();
  const npnIndex = new Map();
  const surelcIndex = new Map();
  const emailIndex = new Map();
  const uplineGroups = new Map();
  const opportunitiesByContactId = options?.opportunitiesByContactId || new Map();


  rawContacts.forEach((contact) => {
    const custom = {};

    (contact.customFields || []).forEach((entry) => {

      const field = customFieldsMap.get(entry.id);

      const key = field?.fieldKey || entry.id;

      custom[key] = entry.value;

    });



    const npnRaw = custom['contact.onboarding__npn'];

    const npn = normalizeDigits(Array.isArray(npnRaw) ? npnRaw[0] : npnRaw);

    const surelcRaw = custom['contact.onboarding__producer_number'];

    const surelcId = normalizeDigits(Array.isArray(surelcRaw) ? surelcRaw[0] : surelcRaw);

    

    // Fetch all upline-related fields

    const uplineProducerRaw = custom['contact.upline_producer_id'] ?? custom['contact.onboarding__upline_npn'];

    const uplineProducerId = normalizeDigits(Array.isArray(uplineProducerRaw) ? uplineProducerRaw[0] : uplineProducerRaw);

    const uplineEmailRaw = custom['contact.onboarding__upline_email'];

    const uplineEmail = normalizeEmail(Array.isArray(uplineEmailRaw) ? uplineEmailRaw[0] : uplineEmailRaw);

    const uplineNameRaw = custom['contact.upline_name'];

    const uplineName = safeTrim(Array.isArray(uplineNameRaw) ? uplineNameRaw[0] : uplineNameRaw);

    const uplineHighestStageRaw = custom['contact.upline_highest_stage'];

    const uplineHighestStage = safeTrim(Array.isArray(uplineHighestStageRaw) ? uplineHighestStageRaw[0] : uplineHighestStageRaw);

    

    // Fetch upline code flags (checkbox fields)

    const uplineCodeEquita = isTruthy(custom['contact.upline_code_equita']);

    const uplineCodeQuility = isTruthy(custom['contact.upline_code_quility']);

    const displayName = [contact.firstNameRaw || contact.firstName, contact.lastNameRaw || contact.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const node = {
      id: contact.id,
      contactId: contact.id,
      firstName: contact.firstNameRaw || contact.firstName || '',
      lastName: contact.lastNameRaw || contact.lastName || '',
      name: displayName || contact.contactName || contact.email || `Contact ${contact.id.slice(-6)}`,

      companyName: contact.companyName || null,

      email: normalizeEmail(contact.email),

      emailDisplay: contact.email || null,

      phone: contact.phone || null,

      source: contact.source || null,

      npn,

      npnRaw,

      surelcId,

      surelcRaw,

      uplineProducerId,

      uplineProducerIdRaw: Array.isArray(uplineProducerRaw) ? uplineProducerRaw[0] : uplineProducerRaw || '',

      uplineEmail,

      uplineEmailRaw: Array.isArray(uplineEmailRaw) ? uplineEmailRaw[0] : uplineEmailRaw || '',

      uplineName,

      uplineNameRaw: Array.isArray(uplineNameRaw) ? uplineNameRaw[0] : uplineNameRaw || '',

      uplineHighestStage: uplineHighestStage || null,

      aggregator: {

        equita: uplineCodeEquita,

        quility: uplineCodeQuility,

      },

      flags: {

        licensed: isTruthy(custom['contact.onboarding__licensed']),

        xcelAccountCreated: isTruthy(custom['contact.onboarding__xcel_account_created']),

        xcelStarted: isTruthy(custom['contact.onboarding__xcel_started']),

        xcelPaid: isTruthy(custom['contact.onboarding__xcel_paid']),

        equitaProfile: isTruthy(custom['contact.onboarding__equita_profile_created']),

        quilityProfile: isTruthy(custom['contact.onboarding__quility_profile_created']),

      },

      licensingState: safeTrim(custom['contact.onboarding__licensing_state'] || ''),

      compLevel: safeTrim(custom['contact.onboarding__comp_level_mrfg'] || ''),

      compLevelNotes: safeTrim(custom['contact.custom_comp_level_notes'] || ''),

      xcel: {
        username: safeTrim(custom['contact.onboarding__xcel_username_email'] || ''),
        tempPassword: safeTrim(custom['contact.onboarding__xcel_temp_password'] || ''),
        enrollmentDate: safeTrim(custom['contact.xcel_enrollment_date'] || ''),
        dueDate: safeTrim(custom['contact.xcel_due_date'] || ''),
        lastTouch: safeTrim(custom['contact.xcel_last_touch'] || ''),
      },
      parentId: null,
      uplineSource: 'unknown',
      uplineConfidence: 0,
      children: [],
      customFields: custom,
      opportunity: opportunitiesByContactId.get(contact.id) || null,
      isSynthetic: false,
    };


    nodes.push(node);
    nodesById.set(node.id, node);

    if (node.uplineProducerId) {
      const group = uplineGroups.get(node.uplineProducerId) || [];
      group.push(node.id);
      uplineGroups.set(node.uplineProducerId, group);
    }

    if (npn) {
      const entry = npnIndex.get(npn) || [];
      entry.push(node.id);
      npnIndex.set(npn, entry);
    }


    if (surelcId) {

      const entry = surelcIndex.get(surelcId) || [];

      entry.push(node.id);

      surelcIndex.set(surelcId, entry);

    }



    if (node.email) {

      const entry = emailIndex.get(node.email) || [];

      entry.push(node.id);

      emailIndex.set(node.email, entry);

    }

  });

  uplineGroups.forEach((_, uplineId) => {
    if (!uplineId) return;
    const hasNpn = npnIndex.has(uplineId);
    const hasSurelc = surelcIndex.has(uplineId);
    if (!hasNpn && !hasSurelc) {
      const syntheticNode = buildSyntheticUplineNode(uplineId);
      nodes.push(syntheticNode);
      nodesById.set(syntheticNode.id, syntheticNode);
      const entry = npnIndex.get(uplineId) || [];
      entry.push(syntheticNode.id);
      npnIndex.set(uplineId, entry);
    }
  });

  const scoreNodeForIndex = (nodeId) => {
    const node = nodesById.get(nodeId);
    if (!node) return -1_000_000;

    let score = 0;
    if (!node.isSynthetic) score += 10_000;

    if (node.email) score += 200;
    if (node.emailDisplay) score += 50;
    if (node.phone) score += 50;
    if (node.companyName) score += 25;

    if (node.uplineProducerIdRaw) score += 400;
    if (node.uplineEmailRaw) score += 100;
    if (node.uplineNameRaw) score += 25;

    if (node.flags?.licensed) score += 15;
    if (node.flags?.xcelStarted) score += 5;
    if (node.flags?.xcelPaid) score += 5;

    return score;
  };

  const sortIndexIds = (ids) =>
    ids
      .slice()
      .sort((a, b) => {
        const scoreDiff = scoreNodeForIndex(b) - scoreNodeForIndex(a);
        if (scoreDiff !== 0) return scoreDiff;

        const nameA = nodesById.get(a)?.name || '';
        const nameB = nodesById.get(b)?.name || '';
        const nameDiff = nameA.localeCompare(nameB);
        if (nameDiff !== 0) return nameDiff;

        return String(a).localeCompare(String(b));
      });

  npnIndex.forEach((ids, key) => {
    if (ids.length <= 1) return;
    npnIndex.set(key, sortIndexIds(ids));
  });

  surelcIndex.forEach((ids, key) => {
    if (ids.length <= 1) return;
    surelcIndex.set(key, sortIndexIds(ids));
  });

  emailIndex.forEach((ids, key) => {
    if (ids.length <= 1) return;
    emailIndex.set(key, sortIndexIds(ids));
  });

  const isLikelyTestContact = (candidateNode) => {
    if (!candidateNode || candidateNode.isSynthetic) return false;
    const normalizedName = normalizeText(candidateNode.name || '');
    const normalizedFirstName = normalizeText(candidateNode.firstName || '');
    const normalizedLastName = normalizeText(candidateNode.lastName || '');
    const normalizedLicensingState = normalizeText(candidateNode.licensingState || '');
    const normalizedSource = normalizeText(candidateNode.source || '');
    const normalizedEmail = normalizeEmail(candidateNode.email || candidateNode.emailDisplay || '');

    return normalizedName.includes('test')
      || normalizedFirstName.includes('test')
      || normalizedLastName.includes('test')
      || normalizedLicensingState === 'test'
      || normalizedSource === 'test'
      || normalizedEmail.includes('test')
      || normalizedEmail.endsWith('@example.com');
  };

  const isLikelyTestRootCandidate = (candidateNode) => isLikelyTestContact(candidateNode);

  const fallbackRootCandidates = npnIndex.get(ROOT_UPLINE_NPN);
  const normalizedRootEmail = normalizeEmail(ROOT_CONTACT_EMAIL);
  let fallbackRootId = null;

  if (ROOT_CONTACT_ID && nodesById.has(ROOT_CONTACT_ID)) {
    const candidateNode = nodesById.get(ROOT_CONTACT_ID);
    if (candidateNode && !candidateNode.isSynthetic) {
      fallbackRootId = ROOT_CONTACT_ID;
    }
  }

  if (!fallbackRootId && normalizedRootEmail) {
    const emailCandidates = emailIndex.get(normalizedRootEmail);
    if (Array.isArray(emailCandidates)) {
      for (const id of emailCandidates) {
        const candidateNode = nodesById.get(id);
        if (candidateNode && !candidateNode.isSynthetic) {
          fallbackRootId = id;
          break;
        }
      }
    }
  }

  if (!fallbackRootId && Array.isArray(fallbackRootCandidates)) {
    const nonSyntheticCandidates = fallbackRootCandidates.filter((id) => {
      const candidateNode = nodesById.get(id);
      return candidateNode && !candidateNode.isSynthetic;
    });

    const nonTestCandidates = nonSyntheticCandidates.filter((id) => !isLikelyTestRootCandidate(nodesById.get(id)));

    fallbackRootId = nonTestCandidates[0] || nonSyntheticCandidates[0] || fallbackRootCandidates[0] || null;
  }

  const duplicateNpnSet = new Set();
  npnIndex.forEach((ids) => {

    if (ids.length > 1) {

      ids.forEach((id) => duplicateNpnSet.add(id));

    }

  });



  const missingNpnSet = new Set(

    nodes.filter((node) => !node.npn).map((node) => node.id)

  );



  const uplineNotFoundSet = new Set();

  const cycleBreakSet = new Set();

  const filterCandidateIds = (ids, selfId) => {
    if (!Array.isArray(ids)) return [];
    return ids.filter((id) => {
      if (id === selfId) return false;
      if (!EXCLUDE_TEST_UPLINE_CANDIDATES) return true;

      const candidateNode = nodesById.get(id);
      if (!candidateNode || candidateNode.isSynthetic) return true;

      return !isLikelyTestContact(candidateNode);
    });
  };

  const getUniqueCandidate = (ids, selfId) => {
    const candidates = filterCandidateIds(ids, selfId);
    if (candidates.length === 1) return { candidate: candidates[0], ambiguous: false };
    if (candidates.length > 1) return { candidate: null, ambiguous: true };
    return { candidate: null, ambiguous: false };
  };

  const npnGroupNodes = new Map();

  const buildSyntheticNpnGroupNode = (npnValue, count) => {
    const label = `NPN ${npnValue} (${count} record${count === 1 ? '' : 's'})`;
    return {
      id: `${NPN_GROUP_PREFIX}${npnValue}`,
      contactId: null,
      firstName: 'NPN',
      lastName: String(npnValue),
      nameRaw: label,
      name: label,
      companyName: null,
      email: '',
      emailDisplay: null,
      phone: null,
      source: 'synthetic',
      npn: String(npnValue),
      npnRaw: String(npnValue),
      surelcId: '',
      surelcRaw: '',
      uplineProducerId: null,
      uplineProducerIdRaw: null,
      uplineEmail: null,
      uplineEmailRaw: null,
      uplineName: null,
      uplineNameRaw: null,
      uplineHighestStage: null,
      aggregator: {
        equita: false,
        quility: false,
      },
      flags: {
        licensed: false,
        xcelAccountCreated: false,
        xcelStarted: false,
        xcelPaid: false,
        equitaProfile: false,
        quilityProfile: false,
      },
      licensingState: null,
      compLevel: null,
      compLevelNotes: null,
      xcel: {
        username: '',
        tempPassword: '',
        enrollmentDate: '',
        dueDate: '',
        lastTouch: '',
      },
      parentId: null,
      uplineSource: 'synthetic',
      uplineConfidence: 1,
      children: [],
      customFields: {},
      opportunity: null,
      isSynthetic: true,
      syntheticKind: 'npn-group',
    };
  };

  const ensureNpnGroupNode = (npnValue) => {
    const key = String(npnValue || '');
    if (!key) return null;
    const existingId = npnGroupNodes.get(key);
    if (existingId && nodesById.has(existingId)) return existingId;

    const ids = npnIndex.get(key) || [];
    if (!Array.isArray(ids) || ids.length <= 1) return null;

    const realIds = ids.filter((id) => {
      const node = nodesById.get(id);
      return node && !node.isSynthetic;
    });
    if (realIds.length <= 1) return null;

    const syntheticNode = buildSyntheticNpnGroupNode(key, realIds.length);
    nodes.push(syntheticNode);
    nodesById.set(syntheticNode.id, syntheticNode);
    npnGroupNodes.set(key, syntheticNode.id);
    return syntheticNode.id;
  };

  // Pre-create group nodes for duplicated NPNs so we can place them consistently.
  npnIndex.forEach((ids, npnValue) => {
    if (!Array.isArray(ids) || ids.length <= 1) return;
    ensureNpnGroupNode(npnValue);
  });



  const wouldIntroduceCycle = (childId, parentId) => {

    let current = parentId;

    while (current) {

      if (current === childId) {

        return true;

      }

      const parent = nodesById.get(current)?.parentId;

      if (!parent) break;

      current = parent;

    }

    return false;

  };



  const findCandidate = (ids, selfId) => {
    const candidates = filterCandidateIds(ids, selfId);
    for (const id of candidates) {
      return id;

    }

    return null;

  };



  nodes.forEach((node) => {

    let parentId = null;

    let source = 'unknown';

    let confidence = 0;



    if (node.uplineProducerId) {

      const { candidate: candidateByNpn, ambiguous: ambiguousByNpn } = getUniqueCandidate(
        npnIndex.get(node.uplineProducerId),
        node.id,
      );

      if (candidateByNpn && !wouldIntroduceCycle(node.id, candidateByNpn)) {

        parentId = candidateByNpn;

        source = 'npn';

        confidence = 0.95;

      } else if (candidateByNpn && wouldIntroduceCycle(node.id, candidateByNpn)) {

        cycleBreakSet.add(node.id);

      }

      if (!parentId && ambiguousByNpn) {
        if (
          fallbackRootId
          && String(node.uplineProducerId) === String(ROOT_UPLINE_NPN)
          && !wouldIntroduceCycle(node.id, fallbackRootId)
        ) {
          // Special-case: the configured root contact is the canonical target for the root NPN.
          parentId = fallbackRootId;
          source = 'npn';
          confidence = 0.9;
        } else {
          const groupId = ensureNpnGroupNode(node.uplineProducerId);
          if (groupId && !wouldIntroduceCycle(node.id, groupId)) {
            parentId = groupId;
            source = 'synthetic';
            confidence = 0.8;
          }
        }
      }



      if (!parentId) {

        const { candidate: candidateBySurelc, ambiguous: ambiguousBySurelc } = getUniqueCandidate(
          surelcIndex.get(node.uplineProducerId),
          node.id,
        );

        if (candidateBySurelc && !wouldIntroduceCycle(node.id, candidateBySurelc)) {

          parentId = candidateBySurelc;

          source = 'surelc';

          confidence = 0.85;

        } else if (candidateBySurelc && wouldIntroduceCycle(node.id, candidateBySurelc)) {

          cycleBreakSet.add(node.id);

        }

        if (!parentId && ambiguousBySurelc) {
          if (
            fallbackRootId
            && String(node.uplineProducerId) === String(ROOT_UPLINE_NPN)
            && !wouldIntroduceCycle(node.id, fallbackRootId)
          ) {
            parentId = fallbackRootId;
            source = 'npn';
            confidence = 0.9;
          } else {
            const groupId = ensureNpnGroupNode(node.uplineProducerId);
            if (groupId && !wouldIntroduceCycle(node.id, groupId)) {
              parentId = groupId;
              source = 'synthetic';
              confidence = 0.8;
            }
          }
        }

      }

    }



    if (!parentId && !node.uplineProducerId && node.uplineEmail) {
      const candidateByEmail = findCandidate(emailIndex.get(node.uplineEmail), node.id);
      if (candidateByEmail && !wouldIntroduceCycle(node.id, candidateByEmail)) {
        parentId = candidateByEmail;
        source = 'email';
        confidence = 0.6;
      } else if (candidateByEmail && wouldIntroduceCycle(node.id, candidateByEmail)) {

        cycleBreakSet.add(node.id);

      }

    }



    if (!parentId && node.uplineProducerId && fallbackRootId && node.id !== fallbackRootId) {
      if (!wouldIntroduceCycle(node.id, fallbackRootId)) {
        parentId = fallbackRootId;
        source = 'fallback';
        confidence = 0.4;
      }
    }



    if (!parentId && (node.uplineProducerIdRaw || node.uplineEmailRaw)) {

      uplineNotFoundSet.add(node.id);

    }



    node.parentId = parentId;

    node.uplineSource = source;

    node.uplineConfidence = confidence;

  });



  // Place duplicated NPN contacts under a shared "NPN group" node when possible so they appear at the
  // correct upline location without selecting a "best" record.
  npnIndex.forEach((ids, npnValue) => {
    if (!Array.isArray(ids) || ids.length <= 1) return;
    const groupId = ensureNpnGroupNode(npnValue);
    if (!groupId) return;

    const groupNode = nodesById.get(groupId);
    if (!groupNode) return;

    const memberIds = ids.filter((id) => {
      const member = nodesById.get(id);
      return member && !member.isSynthetic && id !== groupId;
    });

    if (memberIds.length <= 1) return;

    if (fallbackRootId && String(npnValue) === String(ROOT_UPLINE_NPN) && memberIds.includes(fallbackRootId)) {
      // Moe stays as the top root contact; other duplicate records for Moe's NPN group under Moe.
      groupNode.parentId = fallbackRootId;
      memberIds.forEach((id) => {
        if (id === fallbackRootId) return;
        const member = nodesById.get(id);
        if (!member) return;
        if (!member.parentId || member.parentId === fallbackRootId) {
          member.parentId = groupId;
        }
      });
      return;
    }

    const parentSet = new Set(
      memberIds
        .map((id) => nodesById.get(id)?.parentId || null)
        .filter((pid) => pid !== null),
    );

    if (parentSet.size > 1) {
      // Inconsistent duplicate records (different uplines) - keep as-is.
      return;
    }

    const sharedParentId = parentSet.size === 1 ? Array.from(parentSet)[0] : null;
    groupNode.parentId = sharedParentId;
    memberIds.forEach((id) => {
      const member = nodesById.get(id);
      if (!member) return;
      member.parentId = groupId;
    });
  });

  if (fallbackRootId) {
    nodes.forEach((node) => {
      if (!node.parentId && node.id !== fallbackRootId) {
        if (!wouldIntroduceCycle(node.id, fallbackRootId)) {
          node.parentId = fallbackRootId;
          if (node.isSynthetic) {
            node.uplineSource = 'synthetic';
            node.uplineConfidence = 1;
          } else {
            node.uplineSource = 'fallback';
            node.uplineConfidence = Math.max(node.uplineConfidence || 0, 0.4);
          }
        }
      }
    });
  }



  const roots = [];

  nodes.forEach((node) => {

    if (node.parentId && nodesById.has(node.parentId) && !cycleBreakSet.has(node.id)) {

      nodesById.get(node.parentId).children.push(node.id);

    } else {

      roots.push(node.id);

    }

  });

  if (fallbackRootId && roots.length > 1) {
    roots.sort((a, b) => {
      if (a === fallbackRootId) return -1;
      if (b === fallbackRootId) return 1;
      const nameA = nodesById.get(a)?.name || '';
      const nameB = nodesById.get(b)?.name || '';
      const nameDiff = nameA.localeCompare(nameB);
      if (nameDiff !== 0) return nameDiff;
      return String(a).localeCompare(String(b));
    });
  }


  const stageNameById = options?.stageNameById || null;
  if (stageNameById && stageNameById.size > 0) {
    nodes.forEach((node) => {
      const stageId = node?.opportunity?.pipelineStageId || null;
      const stageName = stageId ? (stageNameById.get(String(stageId)) || null) : null;
      if (stageName) {
        node.uplineHighestStage = stageName;
      }
    });
  }



  const buildTree = (nodeId, level = 1) => {

    const node = nodesById.get(nodeId);

    if (!node) return null;

    const children = node.children

      .map((cid) => buildTree(cid, level + 1))

      .filter(Boolean);



    const descendantCount = children.reduce(

      (sum, child) => sum + child.metrics.descendantCount + 1,

      0

    );



    const tags = [];

    if (node.isSynthetic && node.syntheticKind === 'npn-group') {
      tags.push('Duplicate NPN');
      tags.push('Needs Review');
    }

    if (node.aggregator.equita) tags.push('Equita');

    if (node.aggregator.quility) tags.push('Quility');

    if (node.flags.licensed) tags.push('Licensed');

    if (node.flags.equitaProfile) tags.push('Equita Profile');

    if (node.flags.quilityProfile) tags.push('Quility Profile');

    if (node.licensingState) tags.push(node.licensingState);

    if (node.compLevel) tags.push(`Comp ${node.compLevel}`);



    const issues = {

      missingNpn: missingNpnSet.has(node.id),

      duplicateNpn: duplicateNpnSet.has(node.id),

      uplineNotFound: uplineNotFoundSet.has(node.id),

      cycleBreak: cycleBreakSet.has(node.id),

    };



    if (issues.missingNpn || issues.duplicateNpn || issues.uplineNotFound || issues.cycleBreak) {

      tags.push('Needs Review');

    }



    const vendorGroup = node.aggregator.equita && node.aggregator.quility

      ? 'combined'

      : node.aggregator.equita

        ? 'equita'

        : node.aggregator.quility

          ? 'quility'

          : 'combined';



    const nodeType = children.length === 0 ? 'leaf' : (node.parentId ? 'intermediate' : 'root');



    return {

      id: node.id,

      label: node.name,

      npn: node.npn || null,

      surelcId: node.surelcId || null,

      customFields: node.customFields || {},

      email: node.emailDisplay,

      phone: node.phone || null,

      source: node.source || null,

      companyName: node.companyName || null,

      vendorFlags: node.aggregator,

      vendorGroup,

      level,

      nodeType,

      licensingState: node.licensingState || null,

      compLevel: node.compLevel || null,

      compLevelNotes: node.compLevelNotes || null,

      xcel: node.xcel,

      status: deriveStatus(node),

      tags,

      uplineSource: node.uplineSource,

      uplineConfidence: node.uplineConfidence,

      metrics: {

        directReports: node.children.length,

        descendantCount,

      },

      flags: node.flags,

      issues,

      opportunity: node.opportunity || null,

      raw: {

        uplineProducerId: node.uplineProducerIdRaw || null,

        uplineEmail: node.uplineEmailRaw || null,

        uplineName: node.uplineNameRaw || null,

        uplineHighestStage: node.uplineHighestStage || null,

        surelcId: node.surelcRaw || null,

      },

      children,

    };

  };



  const hierarchy = roots

    .map((rid) => buildTree(rid, 1))

    .filter(Boolean);



  const stats = {
    branches: hierarchy.length,
    producers: nodes.filter((node) => !!node.npn && !node.isSynthetic).length,
    enhanced: nodes.filter((node) => node.aggregator.equita || node.aggregator.quility).length,
  };


  const buildIssueGroup = (setOrList) => {

    if (!setOrList || setOrList.size === 0) {

      return { count: 0, contacts: [] };

    }

    const ids = Array.from(setOrList);

    return {

      count: ids.length,

      contacts: ids.slice(0, 25).map((id) => summarizeContact(nodesById.get(id))),

    };

  };



  const duplicateGroups = [];

  npnIndex.forEach((ids, npnValue) => {

    if (ids.length > 1) {

      duplicateGroups.push({

        npn: npnValue,

        contacts: ids.map((id) => summarizeContact(nodesById.get(id))),

      });

    }

  });



  const issues = {

    missingNpn: buildIssueGroup(missingNpnSet),

    uplineNotFound: buildIssueGroup(uplineNotFoundSet),

    cycleBreaks: buildIssueGroup(cycleBreakSet),

    duplicateNpn: {

      count: duplicateGroups.length,

      groups: duplicateGroups.slice(0, 25),

    },

  };



  return {

    generatedAt: new Date().toISOString(),

    customFieldDefs: Array.isArray(options?.customFieldItems)

      ? options.customFieldItems

      : [],

    opportunityCustomFieldDefs: Array.isArray(options?.opportunityCustomFieldItems)

      ? options.opportunityCustomFieldItems

      : [],

    stats,

    issues,

    hierarchy,

  };

}





export default async function handler(req, res) {

  buildCors(res);



  if (req.method === 'OPTIONS') {

    res.status(200).end();

    return;

  }



  if (req.method !== 'GET' && req.method !== 'POST') {

    res.status(405).json({ error: 'Method Not Allowed' });

    return;

  }



  try {

    ensureConfig();

    const query = req.query || {};

    const body = req.body || {};

    const includeOpportunities = isTruthy(

      query.includeOpportunities ?? query.include_opportunities ?? body.includeOpportunities ?? body.include_opportunities,

    );


    const [customFields, contacts, opportunities, opportunityPipelines] = await Promise.all([

      fetchCustomFields(),

      fetchAllContacts(),

      includeOpportunities
        ? fetchAllOpportunities().catch((error) => {
          console.warn('Snapshot: opportunity fetch failed, continuing without opportunities', error?.message || error);
          return [];
        })
        : Promise.resolve([]),

      includeOpportunities
        ? fetchOpportunityPipelines().catch((error) => {
          console.warn('Snapshot: pipeline fetch failed, continuing without pipeline metadata', error?.message || error);
          return [];
        })
        : Promise.resolve([]),

    ]);



    // Debug mode: return raw contact data

    

    if (query.debug === 'raw') {

      const samples = contacts.slice(0, 20).map(contact => {

        const custom = {};

        (contact.customFields || []).forEach((entry) => {

          const field = customFields.byId.get(entry.id);

          const key = field?.fieldKey || entry.id;

          custom[key] = entry.value;

        });



        return {

          id: contact.id,

          name: contact.contactName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),

          npn: custom['contact.onboarding__npn'],

          uplineProducerId: custom['contact.upline_producer_id'] || custom['contact.onboarding__upline_npn'],

          uplineEmail: custom['contact.onboarding__upline_email'],

          uplineName: custom['contact.upline_name'],

          allCustomFields: Object.keys(custom).filter(k => k.includes('upline') || k.includes('npn')).reduce((acc, k) => {

            acc[k] = custom[k];

            return acc;

          }, {}),

        };

      });



      const uplineFieldStats = {

        contactsWithUplineProducerId: samples.filter(c => c.uplineProducerId).length,

        contactsWithUplineEmail: samples.filter(c => c.uplineEmail).length,

        contactsWithUplineName: samples.filter(c => c.uplineName).length,

        contactsWithNpn: samples.filter(c => c.npn).length,

      };



      return res.status(200).json({

        totalContacts: contacts.length,

        samples,

        uplineFieldStats,

        allUplineFields: Array.from(new Set(

          contacts.flatMap(c => 

            (c.customFields || []).map(entry => {

              const field = customFields.byId.get(entry.id);

              const key = field?.fieldKey || entry.id;

              return key;

            }).filter(k => k && (k.includes('upline') || k.includes('npn')))

          )

        )).sort(),

      });

    }



    if (query.debug === 'coverage') {

      const isPresent = (value) => {

        if (value === null || value === undefined) return false;

        if (typeof value === 'string') return value.trim().length > 0;

        if (Array.isArray(value)) return value.some((entry) => isPresent(entry));

        if (typeof value === 'object') return Object.keys(value).length > 0;

        return true;

      };



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

      const labelByKey = new Map();
      customFields.items.forEach((field) => {
        if (field?.fieldKey && field?.name) labelByKey.set(field.fieldKey, field.name);
      });

      const contactCounts = Object.fromEntries(contactKeys.map((key) => [key, 0]));
      contacts.forEach((contact) => {
        const custom = {};
        (contact.customFields || []).forEach((entry) => {
          const field = customFields.byId.get(entry.id);
          const fieldKey = field?.fieldKey || entry.id;
          custom[fieldKey] = entry.value;
        });

        contactKeys.forEach((key) => {
          let value;
          if (key === 'contact.source') value = contact.source;
          else if (key === 'contact.phone_number' || key === 'contact.phone_numer') value = contact.phone;
          else value = custom[key];
          if (isPresent(value)) contactCounts[key] += 1;
        });
      });

      const opportunityCounts = Object.fromEntries(opportunityKeys.map((key) => [key, 0]));
      opportunities.forEach((opportunity) => {
        const custom = {};
        (opportunity?.customFields || []).forEach((entry) => {
          const field = customFields.byId.get(entry.id);
          const fieldKey = field?.fieldKey || entry.id;
          custom[fieldKey] = entry.value;
        });

        opportunityKeys.forEach((key) => {
          let value;
          if (key === 'opportunity.pipeline_id') value = opportunity?.pipelineId ?? opportunity?.pipeline_id ?? opportunity?.pipeline ?? null;
          else if (key === 'opportunity.pipeline_stage_id') value = opportunity?.pipelineStageId ?? opportunity?.pipeline_stage_id ?? opportunity?.pipelineStage ?? null;
          else if (key === 'opportunity.monetary_value') value = opportunity?.monetaryValue ?? opportunity?.monetary_value ?? opportunity?.value ?? null;
          else if (key === 'opportunity.assigned_to') value = opportunity?.assignedTo ?? opportunity?.assigned_to ?? opportunity?.assigned ?? null;
          else value = custom[key];
          if (isPresent(value)) opportunityCounts[key] += 1;
        });
      });

      return res.status(200).json({
        totals: {
          contacts: contacts.length,
          opportunities: opportunities.length,
        },
        labels: Object.fromEntries(Array.from(labelByKey.entries())),
        coverage: {
          contact: contactCounts,
          opportunity: opportunityCounts,
        },
      });

    }



    let onboardingPipelineId = HL_ONBOARDING_PIPELINE_ID ? String(HL_ONBOARDING_PIPELINE_ID) : null;
    let stageNameById = new Map();

    if (includeOpportunities && Array.isArray(opportunityPipelines) && opportunityPipelines.length > 0) {
      const onboardingPipeline = findOnboardingPipeline(opportunityPipelines);
      if (onboardingPipeline) {
        const resolvedId = onboardingPipeline?.id ?? onboardingPipeline?._id ?? null;
        if (resolvedId) onboardingPipelineId = String(resolvedId);
        stageNameById = buildStageNameById(onboardingPipeline);
      }
    }


    const snapshot = buildSnapshot(contacts, customFields.byId, {

      customFieldItems: customFields.contactItems,

      opportunityCustomFieldItems: customFields.opportunityItems,

      opportunitiesByContactId: includeOpportunities
        ? buildOpportunityIndex(opportunities, customFields.byId, { pipelineId: onboardingPipelineId || undefined })
        : new Map(),

      stageNameById,

    });



    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json(snapshot);

  } catch (error) {

    console.error('Snapshot generation failed:', error);

    res.status(error.status || 500).json({

      error: 'Failed to build HighLevel snapshot',

      details: error.message,

    });

  }

}

