// Smoke-test the Quility SureLC "deep link" login URL responds and resolves.
//
// Usage:
//   node scripts/test-surelc-quility-link.mjs
//   node scripts/test-surelc-quility-link.mjs --url "https://surelc.surancebay.com/sbweb/login.jsp?..."
//   node scripts/test-surelc-quility-link.mjs --maxRedirects 15 --debug
//   node scripts/test-surelc-quility-link.mjs --env .env
//
// Notes:
// - No credentials required; this checks the public redirect/login landing page.
// - Prints a compact JSON result for easy copy/paste into tickets.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_URL =
  'https://surelc.surancebay.com/sbweb/login.jsp?branch=Mohamad%20Raychouni&branchEditable=off&branchRequired=on&branchVisible=on&gaId=233&gaName=Quility%20Sales';

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

function safeUrl(raw) {
  try {
    return new URL(String(raw));
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
}

function normalizeLocation(baseUrl, location) {
  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractTitle(html) {
  if (!html) return null;
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, ' ').trim().slice(0, 200) || null;
}

async function fetchFollow(url, { maxRedirects, debug }) {
  const redirects = [];
  let current = safeUrl(url).toString();

  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'HierarchyManagementProject/1.0 (smoke-test)',
      },
    });

    const status = res.status;
    const location = res.headers.get('location');
    const isRedirect = status >= 300 && status < 400 && Boolean(location);

    if (isRedirect) {
      const next = normalizeLocation(current, location);
      redirects.push({ from: current, status, location, to: next });
      if (!next) break;
      current = next;
      continue;
    }

    const contentType = res.headers.get('content-type') || '';
    const bodyText = await res.text().catch(() => '');
    const title = extractTitle(bodyText);

    const checks = {
      isHtml: /text\/html/i.test(contentType) || bodyText.includes('<html') || bodyText.includes('<!DOCTYPE html'),
      mentionsSureLC: /surelc/i.test(bodyText) || /surancebay/i.test(bodyText),
      hasLoginKeywords: /password|username|sign in|login/i.test(bodyText),
      hasGaId233: /gaId=233/i.test(current) || /gaId["']?\s*[:=]\s*["']?233/i.test(bodyText),
    };

    return {
      ok: status >= 200 && status < 300,
      status,
      url: current,
      contentType,
      title,
      redirects,
      ...(debug ? { bodyPreview: bodyText.slice(0, 800) } : null),
      checks,
    };
  }

  return {
    ok: false,
    status: 0,
    url: current,
    contentType: '',
    title: null,
    redirects,
    error: `Too many redirects (>${maxRedirects}) or invalid redirect location.`,
    checks: {},
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.env && args.env !== true ? String(args.env) : undefined);

  const envUrl = (process.env.SURELC_QUILITY_PORTAL_URL || '').trim();
  const url = args.url && args.url !== true ? String(args.url) : envUrl || DEFAULT_URL;
  const maxRedirectsRaw = args.maxRedirects && args.maxRedirects !== true ? Number(args.maxRedirects) : 10;
  const maxRedirects = Number.isFinite(maxRedirectsRaw) && maxRedirectsRaw >= 0 ? maxRedirectsRaw : 10;
  const debug = Boolean(args.debug);

  const result = await fetchFollow(url, { maxRedirects, debug });

  const exitCode = result.ok ? 0 : 1;
  console.log(
    JSON.stringify(
      {
        inputUrl: url,
        ...result,
      },
      null,
      2,
    ),
  );
  process.exitCode = exitCode;
}

main().catch((err) => {
  console.log(
    JSON.stringify(
      {
        ok: false,
        status: 0,
        error: String(err?.message || err),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
