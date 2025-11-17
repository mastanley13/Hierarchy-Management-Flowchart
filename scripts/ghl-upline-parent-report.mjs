import { fileURLToPath } from 'url';
import path from 'path';
import handler from '../api/ghl/snapshot.js';

const TARGET_UPLINE_IDS = [
  '18550335',
  '21114095',
  '19353253',
  '18787079',
  '21109246',
  '20593922',
  '19484969',
  '20765855',
  '18943751',
  '21242331',
  '19431648',
  '20862789',
  '20973644',
  '20803525',
  '20550731',
];

function normalizeDigits(value) {
  if (value == null) return '';
  return String(value).replace(/\D+/g, '');
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

function flattenHierarchy(nodes, parentId = null, acc = [], nodeMap = new Map()) {
  if (!Array.isArray(nodes)) return { entries: acc, map: nodeMap };
  nodes.forEach((node) => {
    const entry = { node, parentId };
    acc.push(entry);
    nodeMap.set(node.id, entry);
    if (Array.isArray(node.children) && node.children.length > 0) {
      flattenHierarchy(node.children, node.id, acc, nodeMap);
    }
  });
  return { entries: acc, map: nodeMap };
}

function describeParent(entry) {
  if (!entry) {
    return {
      id: null,
      name: 'Unassigned Root',
      npn: null,
      synthetic: false,
    };
  }
  const { node } = entry;
  const synthetic = node.uplineSource === 'synthetic' || (node.id || '').startsWith('upline:');
  return {
    id: node.id,
    name: node.label || node.name || `Node ${node.id.slice(-6)}`,
    npn: node.npn || null,
    synthetic,
  };
}

async function main() {
  const { statusCode, payload } = await callSnapshot();
  if (statusCode !== 200 || !payload || !Array.isArray(payload.hierarchy)) {
    console.error('Snapshot handler failed', statusCode);
    process.exit(1);
  }

  const { entries, map } = flattenHierarchy(payload.hierarchy);

  TARGET_UPLINE_IDS.forEach((uplineId) => {
    const normalizedTarget = normalizeDigits(uplineId);
    const contacts = entries.filter(({ node }) => {
      const nodeUpline = normalizeDigits(node.raw?.uplineProducerId || '');
      return nodeUpline && nodeUpline === normalizedTarget;
    });

    console.log(`\nUpline Producer ID ${uplineId} (${contacts.length} contacts):`);
    if (contacts.length === 0) {
      console.log('  No GHL contacts found with this Upline Producer ID.');
      return;
    }

    const parents = new Map();
    contacts.forEach((entry) => {
      const parentEntry = entry.parentId ? map.get(entry.parentId) : null;
      const parentKey = parentEntry?.node?.id || 'root';
      if (!parents.has(parentKey)) {
        parents.set(parentKey, {
          parent: describeParent(parentEntry),
          contacts: [],
        });
      }
      parents.get(parentKey).contacts.push(entry.node);
    });

    parents.forEach((group) => {
      const { parent } = group;
      const npnMatch = parent.npn ? (normalizeDigits(parent.npn) === normalizedTarget) : false;
      console.log(
        `  Parent: ${parent.name} [ID: ${parent.id ?? 'root'}, NPN: ${parent.npn ?? 'n/a'}, synthetic: ${
          parent.synthetic ? 'yes' : 'no'
        }, matches upline NPN: ${npnMatch ? 'yes' : 'no'}]`,
      );
      group.contacts
        .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
        .forEach((contact) => {
          console.log(
            `    - ${contact.label || contact.name} (NPN ${contact.npn || 'n/a'}, email ${contact.email || 'n/a'})`,
          );
        });
    });
  });
}

main().catch((err) => {
  console.error('Failed to build upline parent report:', err);
  process.exit(1);
});

