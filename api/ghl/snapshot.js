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
const RAW_PAGE_SIZE = Number.parseInt(process.env.HL_PAGE_SIZE || '100', 10);
const PAGE_SIZE = Number.isNaN(RAW_PAGE_SIZE)
  ? 100
  : Math.min(Math.max(RAW_PAGE_SIZE, 1), 100);
const MAX_CONTACTS = Number.parseInt(process.env.HL_MAX_CONTACTS || '2000', 10);

const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRIES = 5;
const SYNTHETIC_UPLINE_PREFIX = 'upline:';

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

const normalizeDigits = (value) =>
  typeof value === 'string'
    ? value.replace(/\D+/g, '')
    : typeof value === 'number'
      ? String(value).replace(/\D+/g, '')
      : '';

const normalizeEmail = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const safeTrim = (value) =>
  typeof value === 'string' ? value.trim() : '';

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

async function fetchWithRetry(pathOrUrl, attempt = 0) {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${HL_API_BASE}${pathOrUrl}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${HL_PRIVATE_API_KEY}`,
      'Version': '2021-07-28',
      'Location-Id': HL_LOCATION_ID,
      'Accept': 'application/json',
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
  const contactFields = items.filter((field) => field.model === 'contact');
  const idMap = new Map();
  contactFields.forEach((field) => {
    idMap.set(field.id, field);
  });
  return {
    items: contactFields,
    byId: idMap,
  };
}

async function fetchAllContacts() {
  const contacts = [];
  let nextUrl = `/contacts/?locationId=${encodeURIComponent(HL_LOCATION_ID)}&limit=${PAGE_SIZE}`;

  while (nextUrl && contacts.length < MAX_CONTACTS) {
    const payload = await fetchWithRetry(nextUrl);
    if (Array.isArray(payload?.contacts)) {
      contacts.push(...payload.contacts);
    }
    const nextPageUrl = payload?.meta?.nextPageUrl;
    nextUrl = nextPageUrl ? nextPageUrl : null;
  }

  return contacts;
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

    const node = {
      id: contact.id,
      contactId: contact.id,
      firstName: contact.firstNameRaw || contact.firstName || '',
      lastName: contact.lastNameRaw || contact.lastName || '',
      name: contact.contactName
        || [contact.firstNameRaw || contact.firstName, contact.lastNameRaw || contact.lastName].filter(Boolean).join(' ')
        || contact.email
        || `Contact ${contact.id.slice(-6)}`,
      companyName: contact.companyName || null,
      email: normalizeEmail(contact.email),
      emailDisplay: contact.email || null,
      phone: contact.phone || null,
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
    if (!Array.isArray(ids)) return null;
    for (const id of ids) {
      if (id !== selfId) {
        return id;
      }
    }
    return null;
  };

  nodes.forEach((node) => {
    let parentId = null;
    let source = 'unknown';
    let confidence = 0;

    if (node.uplineProducerId) {
      const candidateByNpn = findCandidate(npnIndex.get(node.uplineProducerId), node.id);
      if (candidateByNpn && !wouldIntroduceCycle(node.id, candidateByNpn)) {
        parentId = candidateByNpn;
        source = 'npn';
        confidence = 0.95;
      } else if (candidateByNpn && wouldIntroduceCycle(node.id, candidateByNpn)) {
        cycleBreakSet.add(node.id);
      }

      if (!parentId) {
        const candidateBySurelc = findCandidate(surelcIndex.get(node.uplineProducerId), node.id);
        if (candidateBySurelc && !wouldIntroduceCycle(node.id, candidateBySurelc)) {
          parentId = candidateBySurelc;
          source = 'surelc';
          confidence = 0.85;
        } else if (candidateBySurelc && wouldIntroduceCycle(node.id, candidateBySurelc)) {
          cycleBreakSet.add(node.id);
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

    if (!parentId && (node.uplineProducerIdRaw || node.uplineEmailRaw)) {
      uplineNotFoundSet.add(node.id);
    }

    node.parentId = parentId;
    node.uplineSource = source;
    node.uplineConfidence = confidence;
  });

  const roots = [];
  nodes.forEach((node) => {
    if (node.parentId && nodesById.has(node.parentId) && !cycleBreakSet.has(node.id)) {
      nodesById.get(node.parentId).children.push(node.id);
    } else {
      roots.push(node.id);
    }
  });

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

    const [customFields, contacts] = await Promise.all([
      fetchCustomFields(),
      fetchAllContacts(),
    ]);

    // Debug mode: return raw contact data
    const query = req.query || {};
    
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

    const snapshot = buildSnapshot(contacts, customFields.byId, {
      customFieldItems: customFields.items,
    });

    res.status(200).json(snapshot);
  } catch (error) {
    console.error('Snapshot generation failed:', error);
    res.status(error.status || 500).json({
      error: 'Failed to build HighLevel snapshot',
      details: error.message,
    });
  }
}
