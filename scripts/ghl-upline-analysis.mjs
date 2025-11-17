import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from '../api/ghl/snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');

function normalizeDigits(value) {
  if (value == null) return '';
  const str = String(value);
  return str.replace(/\D+/g, '');
}

async function callSnapshot() {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'GET',
      query: {},
    };

    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, payload });
      },
      end() {
        resolve({ statusCode: this.statusCode, payload: null });
      },
    };

    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function flattenHierarchyWithParents(nodes) {
  const all = [];
  const stack = Array.isArray(nodes)
    ? nodes.map((node) => ({ node, parentId: null }))
    : [];

  while (stack.length) {
    const { node, parentId } = stack.pop();
    if (!node) continue;
    all.push({ node, parentId });
    if (Array.isArray(node.children) && node.children.length) {
      for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i];
        stack.push({ node: child, parentId: node.id });
      }
    }
  }

  return all;
}

function readMrfgReferenceCsv() {
  const csvPath = path.join(projectRoot, 'MRFG Upline Reference sheet.csv');
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim());

  const records = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];

    // Basic CSV parsing with quote handling suitable for this sheet.
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);

    const record = {};
    headers.forEach((h, idx) => {
      const value = cells[idx] != null ? String(cells[idx]).trim() : '';
      record[h] = value;
    });
    records.push(record);
  }

  return records;
}

function buildMrfgNpnIndex(records) {
  const index = new Map();
  records.forEach((row) => {
    const npn = normalizeDigits(row['Onboarding | NPN']);
    if (!npn) return;
    const existing = index.get(npn) || [];
    existing.push(row);
    index.set(npn, existing);
  });
  return index;
}

async function main() {
  console.log('Running GHL upline analysis...');

  const { statusCode, payload } = await callSnapshot();
  if (statusCode !== 200 || !payload || !Array.isArray(payload.hierarchy)) {
    console.error('Snapshot call failed or returned unexpected payload', statusCode);
    process.exit(1);
  }

  const allNodes = flattenHierarchyWithParents(payload.hierarchy);

  const contactsWithIds = allNodes
    .map(({ node, parentId }) => {
      const npn = normalizeDigits(node.npn || node.raw?.npn || '');
      const uplineProducerId = normalizeDigits(node.raw?.uplineProducerId || '');
      return {
        id: node.id,
        parentId,
        name: node.label || node.name || '',
        email: node.email || '',
        npn,
        uplineProducerId,
        compLevel: node.compLevel || '',
        status: node.status || '',
        uplineSource: node.uplineSource || '',
        uplineConfidence: typeof node.uplineConfidence === 'number'
          ? node.uplineConfidence
          : null,
      };
    })
    .filter((entry) => entry.npn && entry.uplineProducerId);

  const groups = new Map();
  contactsWithIds.forEach((contact) => {
    const key = contact.uplineProducerId;
    const arr = groups.get(key) || [];
    arr.push(contact);
    groups.set(key, arr);
  });

  const mrfgRecords = readMrfgReferenceCsv();
  const mrfgByNpn = buildMrfgNpnIndex(mrfgRecords);

  const summary = [];

  groups.forEach((contacts, uplineId) => {
    const npnsInGroup = new Set(contacts.map((c) => c.npn));
    const mrfgMatches = [];

    npnsInGroup.forEach((npn) => {
      const records = mrfgByNpn.get(npn);
      if (Array.isArray(records)) {
        records.forEach((r) => {
          mrfgMatches.push({
            name: r.Name,
            email: r.Email,
            npn,
            compLevelMrfg: r['Onboarding | Comp Level (MRFG)'],
            uplineProducerIdMrfg: r['Upline Producer ID'],
          });
        });
      }
    });

    summary.push({
      uplineProducerId: uplineId,
      ghlContactCount: contacts.length,
      ghlContacts: contacts,
      mrfgMatches,
    });
  });

  summary.sort((a, b) => b.ghlContactCount - a.ghlContactCount);

  const outDir = path.join(projectRoot, 'dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const jsonPath = path.join(outDir, 'ghl_upline_analysis.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalContactsWithIds: contactsWithIds.length,
    uplineGroupCount: summary.length,
    groups: summary,
  }, null, 2), 'utf8');

  const csvPath = path.join(outDir, 'ghl_upline_contacts.csv');
  const header = [
    'uplineProducerId',
    'npn',
    'name',
    'email',
    'compLevel',
    'status',
    'uplineSource',
    'uplineConfidence',
  ];

  const csvLines = [header.join(',')];
  contactsWithIds.forEach((c) => {
    const row = [
      c.uplineProducerId,
      c.npn,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      c.compLevel || '',
      c.status || '',
      c.uplineSource || '',
      c.uplineConfidence != null ? String(c.uplineConfidence) : '',
    ];
    csvLines.push(row.join(','));
  });
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');

  const summaryPath = path.join(outDir, 'ghl_upline_summary.txt');
  const topGroups = summary.slice(0, 25);
  const lines = [];
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Total GHL contacts with NPN + Upline Producer ID: ${contactsWithIds.length}`);
  lines.push(`Total distinct Upline Producer IDs: ${summary.length}`);
  lines.push('');
  lines.push('Top Upline Producer ID groups (by GHL contact count):');
  lines.push('');

  topGroups.forEach((group) => {
    lines.push(`Upline Producer ID ${group.uplineProducerId}:`);
    lines.push(`  GHL contacts: ${group.ghlContactCount}`);
    const mrfgCount = group.mrfgMatches.length;
    lines.push(`  MRFG reference matches by NPN: ${mrfgCount}`);
    const sampleContacts = group.ghlContacts.slice(0, 5).map((c) => `${c.name} (NPN ${c.npn})`);
    lines.push(`  Sample GHL contacts: ${sampleContacts.join('; ')}`);
    lines.push('');
  });

  fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');

  console.log('Analysis complete.');
  console.log(`JSON results: ${jsonPath}`);
  console.log(`Contact export CSV: ${csvPath}`);
  console.log(`Text summary: ${summaryPath}`);
}

main().catch((err) => {
  console.error('Upline analysis failed:', err);
  process.exit(1);
});
