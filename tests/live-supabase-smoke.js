const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(root, 'evisa-supabase-config.js'), 'utf8'),
  sandbox
);

const { url, anonKey } = sandbox.window.EvisaSupabaseConfig;
const base = `${url}/rest/v1`;
const synthetic = `CODEX-NONEXISTENT-${Date.now()}`;

async function postRpc(name, body) {
  return fetch(`${base}/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
}

async function expectEmptyLookup(name, body) {
  const response = await postRpc(name, body);
  const text = await response.text();
  assert.equal(response.status, 200, `${name} returned ${response.status}: ${text}`);
  const data = JSON.parse(text);
  assert.ok(Array.isArray(data), `${name} must return a row array`);
  assert.equal(data.length, 0, `${name} synthetic lookup unexpectedly matched a record`);
}

async function main() {
  await expectEmptyLookup('lookup_evisa_by_application_code', {
    p_application_code: synthetic
  });
  await expectEmptyLookup('lookup_evisa_by_passport_visa', {
    p_passport_number: `${synthetic}-P`,
    p_visa_number: `${synthetic}-V`
  });

  const pdfResponse = await postRpc('get_evisa_pdf_by_application_code', {
    p_application_code: synthetic
  });
  const pdfText = await pdfResponse.text();
  assert.equal(pdfResponse.status, 200, `PDF RPC returned ${pdfResponse.status}: ${pdfText}`);
  assert.equal(JSON.parse(pdfText), null, 'Synthetic PDF lookup unexpectedly returned data');

  const tableResponse = await fetch(`${base}/evisa_records?select=id&limit=0`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    signal: AbortSignal.timeout(15000)
  });
  assert.ok(
    tableResponse.status === 401 || tableResponse.status === 403,
    `Anonymous table access must be blocked; received ${tableResponse.status}`
  );

  console.log('Live Supabase RPC and anonymous-access checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
