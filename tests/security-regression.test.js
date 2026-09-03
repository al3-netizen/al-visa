const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('public code contains no hard-coded admin password', () => {
  const config = read('admin-config.js');
  assert.doesNotMatch(config, /password\s*:/i);
  assert.doesNotMatch(config, /demo@1101101|admin@1101101/i);
});

test('user authentication no longer stores passwords in browser storage', () => {
  for (const file of ['register.html', 'login.html', 'profile.html']) {
    const source = read(file);
    assert.doesNotMatch(source, /sessionStorage\.setItem/);
    assert.doesNotMatch(source, /localStorage\.setItem/);
  }
});

test('anonymous lookups use RPC instead of selecting all records', () => {
  const cloud = read('evisa-cloud.js');
  assert.doesNotMatch(cloud, /select\(['"]\*['"]\)/);
  assert.match(cloud, /rpc\('lookup_evisa_by_application_code'/);
  assert.match(cloud, /rpc\('lookup_evisa_by_passport_visa'/);
  assert.match(cloud, /rpc\('get_evisa_pdf_by_application_code'/);
});

test('tracking lookup calls the exact-match RPC and maps its result', async () => {
  const calls = [];
  const supabase = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({
        data: [{
          masked_passport_number: '****1234',
          masked_visa_number: '****5678',
          application_code: 'ROM-TEST-1234',
          status: 'Approved',
          has_pdf: true
        }],
        error: null
      });
    }
  };
  const context = {
    window: {
      EvisaSupabaseConfig: { url: 'https://example.supabase.co', anonKey: 'public-key' },
      EvisaSupabaseReady: Promise.resolve(supabase)
    },
    console,
    Promise,
    Error,
    String
  };
  vm.runInNewContext(read('evisa-cloud.js'), context);
  assert.equal(await context.window.EvisaCloudReady, true);
  const result = await context.window.findEvisaByApplicationCodeAsync(' ROM-TEST-1234 ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'lookup_evisa_by_application_code');
  assert.equal(calls[0].args.p_application_code, 'ROM-TEST-1234');
  assert.equal(result.passportNumber, '****1234');
  assert.equal(result.visaNumber, '****5678');
  assert.equal(result.hasPdf, true);
});

test('schema denies anonymous table reads and authorizes admin writes', () => {
  const schema = read('supabase-schema.sql');
  assert.match(schema, /revoke all on table public\.evisa_records from public, anon/i);
  assert.doesNotMatch(schema, /grant select on public\.evisa_records to anon/i);
  assert.match(schema, /with check \(\(select public\.is_evisa_admin\(\)\)\)/i);
  assert.match(schema, /set search_path = ''/i);
});

test('all pages using the auth navbar initialize Supabase first', () => {
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
    const source = read(file);
    if (!source.includes('<script src="auth-nav.js"></script>')) continue;
    const client = source.indexOf('<script src="evisa-supabase-client.js"></script>');
    const nav = source.indexOf('<script src="auth-nav.js"></script>');
    assert.ok(client >= 0 && client < nav, file + ' must load the Supabase client before auth-nav.js');
  }
});

test('all relative HTML links and script sources exist', () => {
  const files = new Set(fs.readdirSync(root));
  for (const file of [...files].filter((name) => name.endsWith('.html'))) {
    const source = read(file);
    for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (!value || /^(?:https?:|mailto:|tel:|data:|#)/.test(value)) continue;
      const target = value.split(/[?#]/)[0];
      if (!target) continue;
      assert.ok(files.has(target) || fs.existsSync(path.join(root, target)), file + ' -> ' + value);
    }
  }
});

test('all inline scripts parse successfully', () => {
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
    const source = read(file);
    const scripts = source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scripts) {
      assert.doesNotThrow(() => new Function(match[1]), file + ' contains invalid inline JavaScript');
    }
  }
});
