const fs = require('fs');
const base = 'GHL_Custom_Fields_nEEiHT9n7OPxFnBZIycg';
const json = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
const csvLines = fs.readFileSync(base + '.csv', 'utf8').trim().split(/\r?\n/);
const csvKeys = new Set(csvLines.slice(1).map(line => {
  const parts = line.split(',');
  return parts[1].replace(/^\"|\"$/g, '');
}));
const jsonKeys = new Set(json.map(item => item.fieldKey));
const missing = [...csvKeys].filter(k => !jsonKeys.has(k));
console.log('missing', missing.length);
console.log(missing);
