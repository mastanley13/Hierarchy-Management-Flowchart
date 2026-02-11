// Create simplified "views" of a SureLC access report CSV.
//
// Example:
//   node scripts/surelc-access-report-views.mjs --in reports/surelc-access-report-*.csv
//   node scripts/surelc-access-report-views.mjs --in reports/surelc-access-report-*.diagnosed.csv --outDir reports
//
// Outputs (by default, alongside the input file):
//   <inputBase>.equita-access.csv  (contactId,name,npn,equita_result,equita_status,success)
//   <inputBase>.quility-access.csv (contactId,name,npn,quility_result,quility_status)

import fs from 'node:fs';
import path from 'node:path';

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

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    // Skip trailing empty row at EOF.
    if (row.length === 1 && row[0] === '' && rows.length === 0) return;
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      pushField();
      continue;
    }

    if (ch === '\n') {
      pushField();
      pushRow();
      continue;
    }

    if (ch === '\r') continue;
    field += ch;
  }

  pushField();
  if (row.length > 1 || row[0] !== '' || rows.length > 0) pushRow();

  const header = rows.shift() || [];
  return { header, records: rows };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readCsvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { header, records } = parseCsv(text);
  const indexByKey = new Map(header.map((key, idx) => [key, idx]));
  return { header, records, indexByKey };
}

function getValue(indexByKey, record, key) {
  const idx = indexByKey.get(key);
  if (idx === undefined) return '';
  return record[idx] ?? '';
}

function toCsvLines(outHeader, outRecords) {
  const lines = [outHeader.map(csvEscape).join(',')];
  for (const record of outRecords) {
    lines.push(outHeader.map((key) => csvEscape(record[key] ?? '')).join(','));
  }
  return lines;
}

function deriveDefaultOutPaths(inPath, outDir) {
  const dir = outDir || path.dirname(inPath);
  const baseName = path.basename(inPath).replace(/\.diagnosed\.csv$/i, '').replace(/\.csv$/i, '');
  return {
    equita: path.join(dir, `${baseName}.equita-access.csv`),
    quility: path.join(dir, `${baseName}.quility-access.csv`),
  };
}

function pickLatestReport(defaultDir = 'reports') {
  if (!fs.existsSync(defaultDir)) return null;
  const entries = fs
    .readdirSync(defaultDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isFile() &&
        /^surelc-access-report-.*\.csv$/i.test(d.name) &&
        !/\.equita-access\.csv$/i.test(d.name) &&
        !/\.quility-access\.csv$/i.test(d.name),
    )
    .map((d) => path.join(defaultDir, d.name));
  if (entries.length === 0) return null;

  let best = null;
  let bestTime = -1;
  for (const entry of entries) {
    const stat = fs.statSync(entry);
    const mtime = stat.mtimeMs || 0;
    if (mtime > bestTime) {
      best = entry;
      bestTime = mtime;
    }
  }
  return best;
}

function buildSuccessValue(indexByKey, record) {
  const any = getValue(indexByKey, record, 'any_success');
  if (any) return any;

  const eq = getValue(indexByKey, record, 'equita_result');
  const qu = getValue(indexByKey, record, 'quility_result');
  if (eq || qu) return eq === 'success' || qu === 'success' ? 'true' : 'false';

  return '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (isTruthy(args.help)) {
    console.log('Usage: node scripts/surelc-access-report-views.mjs --in <report.csv> [--outDir <dir>] [--stdout]');
    console.log('  --in       Input surelc access report (.csv or .diagnosed.csv). Defaults to latest in /reports.');
    console.log('  --outDir   Output directory (defaults to input directory).');
    console.log('  --stdout   Print CSVs to stdout (no files).');
    process.exitCode = 0;
    return;
  }

  const inPath = String(args.in || pickLatestReport() || '');
  if (!inPath) throw new Error('Missing --in and no reports found under ./reports.');
  if (!fs.existsSync(inPath)) throw new Error(`Input not found: ${inPath}`);

  const { records, indexByKey } = readCsvFile(inPath);

  const required = ['contactId', 'name', 'npn', 'equita_result', 'equita_status', 'quility_result', 'quility_status'];
  const missing = required.filter((k) => !indexByKey.has(k));
  if (missing.length > 0) {
    throw new Error(`Input CSV missing required columns: ${missing.join(', ')}`);
  }

  const equitaHeader = ['contactId', 'name', 'npn', 'equita_result', 'equita_status', 'success'];
  const quilityHeader = ['contactId', 'name', 'npn', 'quility_result', 'quility_status'];

  const equitaRecords = records.map((rec) => ({
    contactId: getValue(indexByKey, rec, 'contactId'),
    name: getValue(indexByKey, rec, 'name'),
    npn: getValue(indexByKey, rec, 'npn'),
    equita_result: getValue(indexByKey, rec, 'equita_result'),
    equita_status: getValue(indexByKey, rec, 'equita_status'),
    success: buildSuccessValue(indexByKey, rec),
  }));

  const quilityRecords = records.map((rec) => ({
    contactId: getValue(indexByKey, rec, 'contactId'),
    name: getValue(indexByKey, rec, 'name'),
    npn: getValue(indexByKey, rec, 'npn'),
    quility_result: getValue(indexByKey, rec, 'quility_result'),
    quility_status: getValue(indexByKey, rec, 'quility_status'),
  }));

  const equitaLines = toCsvLines(equitaHeader, equitaRecords);
  const quilityLines = toCsvLines(quilityHeader, quilityRecords);

  if (isTruthy(args.stdout)) {
    console.log(`# Equita view (${equitaRecords.length} rows)`);
    console.log(equitaLines.join('\n'));
    console.log('');
    console.log(`# Quility view (${quilityRecords.length} rows)`);
    console.log(quilityLines.join('\n'));
    return;
  }

  const outDir = args.outDir ? String(args.outDir) : '';
  const outPaths = deriveDefaultOutPaths(inPath, outDir);

  ensureDir(path.dirname(outPaths.equita));
  ensureDir(path.dirname(outPaths.quility));

  fs.writeFileSync(outPaths.equita, `${equitaLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(outPaths.quility, `${quilityLines.join('\n')}\n`, 'utf8');

  console.log(`[surelc-report-views] Input: ${inPath}`);
  console.log(`[surelc-report-views] Wrote: ${outPaths.equita}`);
  console.log(`[surelc-report-views] Wrote: ${outPaths.quility}`);
}

main().catch((err) => {
  console.error(`[surelc-report-views] Failed: ${String(err?.message || err)}`);
  process.exitCode = 1;
});
