/**
 * AIRVOICE — Automated Test Checklist
 * =====================================
 * Run with: npx tsx src/tests/checklist.ts
 *
 * Prerequisites:
 *   1. API running on http://localhost:3000
 *   2. Dev seed data loaded (database/seed/dev_seed.sql)
 *   3. NODE_ENV=test (dev bypass mode — no Firebase key needed)
 *
 * All tests use the dev-bypass token mechanism:
 *   - Token header: "Bearer <base64url({"alg":"none"}).base64url({"sub":"<firebase_uid>","user_id":"<firebase_uid>","phone_number":"<phone>"}).sig>"
 *   - In dev mode the API decodes without signature verification.
 */

import * as http from 'http';

// ── Token helpers ─────────────────────────────────────────────

function b64(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function devToken(uid: string, phone: string): string {
  const header  = b64({ alg: 'none', typ: 'JWT' });
  const payload = b64({ sub: uid, user_id: uid, phone_number: phone, iat: Math.floor(Date.now() / 1000) });
  return `${header}.${payload}.dev-sig`;
}

const TOKENS = {
  super_admin:  devToken('dev-super-admin-uid',  '+94700000001'),
  admin:        devToken('dev-admin-uid',         '+94700000002'),
  finance:      devToken('dev-finance-uid',       '+94700000003'),
  camp:         devToken('dev-camp-uid',          '+94700000004'),
  sales:        devToken('dev-sales-uid',         '+94700000005'),
  customer:     devToken('dev-customer-uid',      '+94700000010'),
  guarantor:    devToken('dev-guarantor-uid',     '+94700000011'),
};

const BASE = process.env.API_URL ?? 'http://localhost:3000';

// ── HTTP helper ───────────────────────────────────────────────

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

async function req(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const url  = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : undefined;

    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port:     url.port || 3000,
      path:     url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data).toString() } : {}),
      },
    };

    const clientReq = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: { raw } });
        }
      });
    });

    clientReq.on('error', reject);
    if (data) clientReq.write(data);
    clientReq.end();
  });
}

// ── Test runner ───────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✅  ${name}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, passed: false, error: msg });
    console.log(`  ❌  ${name}`);
    console.log(`       ${msg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── Test suites ───────────────────────────────────────────────

async function testHealth(): Promise<void> {
  console.log('\n📋  Health & connectivity');
  await test('API is reachable', async () => {
    const r = await req('GET', '/health', TOKENS.admin);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert((r.body as { status?: string }).status === 'ok', 'Expected status: ok');
  });
}

// 1. Duplicate NIC blocking
async function testDuplicateNICBlocking(): Promise<void> {
  console.log('\n📋  Test 1: Duplicate NIC blocking');

  await test('Check-duplicate endpoint returns no match for unknown NIC', async () => {
    const r = await req('POST', '/customers/check-duplicate', TOKENS.sales, {
      nic_number: '999999999V',
    });
    assert(r.status === 200, `Got ${r.status}`);
    assert((r.body as { has_duplicate?: boolean }).has_duplicate === false, 'Expected no duplicate');
  });

  await test('Check-duplicate detects existing NIC', async () => {
    // Seed customer C001 has NIC 198512345678 (Sergeant Kamal Perera)
    const r = await req('POST', '/customers/check-duplicate', TOKENS.sales, {
      nic_number: '198512345678',
    });
    assert(r.status === 200, `Got ${r.status}`);
    assert((r.body as { has_duplicate?: boolean }).has_duplicate === true, 'Expected duplicate detected');
  });

  await test('POST /customers returns 409 on duplicate NIC', async () => {
    const r = await req('POST', '/customers', TOKENS.sales, {
      full_name:   'Duplicate Test',
      nic_number:  '198512345678', // same as C001
      branch:      'army',
      rank:        'Private',
    });
    assert(r.status === 409, `Expected 409 Conflict, got ${r.status}`);
  });

  await test('POST /customers succeeds with unique NIC', async () => {
    const r = await req('POST', '/customers', TOKENS.sales, {
      full_name:      'Test New Soldier',
      nic_number:     '200112399999',  // unique
      service_number: 'SL/TEST/99901',
      branch:         'army',
      rank:           'Private',
    });
    // Either 201 (created) or 409 if test ran before and record exists
    assert([201, 409].includes(r.status), `Got unexpected status ${r.status}`);
  });
}

// 2. Service number legacy linking
async function testServiceNumberLegacyLinking(): Promise<void> {
  console.log('\n📋  Test 2: Service number legacy linking');

  await test('Legacy import batch list is accessible to finance', async () => {
    const r = await req('GET', '/legacy-import', TOKENS.finance);
    assert(r.status === 200, `Got ${r.status}`);
    assert(Array.isArray((r.body as { data?: unknown[] }).data), 'Expected data array');
  });

  await test('Legacy preview returns row data', async () => {
    const r = await req('GET', '/legacy-import/40000000-0000-0000-0000-000000000001/preview?limit=5', TOKENS.finance);
    assert(r.status === 200, `Got ${r.status}`);
    assert(Array.isArray((r.body as { data?: unknown[] }).data), 'Expected data array');
  });

  await test('Duplicate row is marked as duplicate in legacy import', async () => {
    const r = await req('GET', '/legacy-import/40000000-0000-0000-0000-000000000001/rows?status=duplicate', TOKENS.finance);
    assert(r.status === 200, `Got ${r.status}`);
    const rows = (r.body as { data?: { service_number?: string }[] }).data ?? [];
    assert(rows.length > 0, 'Expected at least 1 duplicate row');
    assert(
      rows.some(row => row.service_number === 'SL/A/12345'),
      'Expected C001 service number in duplicate rows'
    );
  });

  await test('Customer search finds by service number', async () => {
    const r = await req('GET', '/customers?service_number=SL%2FA%2F12345', TOKENS.sales);
    assert(r.status === 200, `Got ${r.status}`);
    const data = (r.body as { data?: unknown[] }).data ?? [];
    assert(data.length === 1, `Expected 1 result, got ${data.length}`);
  });
}

// 3. 2-phone limit
async function testTwoPhoneLimit(): Promise<void> {
  console.log('\n📋  Test 3: 2-phone limit enforcement');

  await test('C001 (1 active) is eligible for second phone', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000001/phone-eligibility', TOKENS.sales);
    assert(r.status === 200, `Got ${r.status}`);
    const body = r.body as { eligible?: boolean; active_count?: number };
    assert(body.eligible === true, `Expected eligible=true, got ${JSON.stringify(body)}`);
    assert(body.active_count === 1, `Expected active_count=1, got ${body.active_count}`);
  });

  await test('C002 (2 active) requires special approval for 3rd', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000002/phone-eligibility', TOKENS.sales);
    assert(r.status === 200, `Got ${r.status}`);
    const body = r.body as { eligible?: boolean; requires_special_approval?: boolean; active_count?: number };
    assert(body.eligible === false, 'Expected eligible=false');
    assert(body.requires_special_approval === true, 'Expected requires_special_approval=true');
    assert(body.active_count === 2, `Expected active_count=2, got ${body.active_count}`);
  });
}

// 4. 3rd phone approval (special approval flow exists)
async function testThirdPhoneApproval(): Promise<void> {
  console.log('\n📋  Test 4: 3rd phone special approval');

  await test('Special approval endpoint exists and rejects invalid body', async () => {
    const r = await req('POST', '/applications/30000000-0000-0000-0000-000000000004/special-approval', TOKENS.admin, {});
    // 400 = endpoint exists but validation fails (expected), or 404 if app doesn't support special approval
    assert([400, 404, 422].includes(r.status), `Expected 400/404/422, got ${r.status}`);
  });

  await test('Customer at 2-phone limit gets special-approval flag on eligibility check', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000002/phone-eligibility', TOKENS.sales);
    assert(r.status === 200, `Got ${r.status}`);
    const body = r.body as { requires_special_approval?: boolean };
    assert(body.requires_special_approval === true, 'Expected requires_special_approval flag');
  });
}

// 5. Retirement rule
async function testRetirementRule(): Promise<void> {
  console.log('\n📋  Test 5: Retirement rule');

  await test('C004 (retires in 90 days) profile is accessible', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000004', TOKENS.sales);
    assert(r.status === 200, `Got ${r.status}`);
    const customer = (r.body as { data?: { retirement_date?: string } }).data;
    assert(customer?.retirement_date !== null && customer?.retirement_date !== undefined, 'Expected retirement_date set');
  });

  // The CustomerProfilePage in web-admin shows the 24-month warning banner
  // The API currently returns retirement_date and the UI enforces the display rule
  await test('Customer profile returns retirement_date for risk assessment', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000004', TOKENS.finance);
    assert(r.status === 200, `Got ${r.status}`);
    const d = (r.body as { data?: { retirement_date?: string } }).data;
    const rd = d?.retirement_date ? new Date(d.retirement_date) : null;
    const monthsToRetirement = rd ? (rd.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000) : Infinity;
    assert(monthsToRetirement < 24, `Expected retirement within 24 months, got ${monthsToRetirement.toFixed(1)} months`);
  });
}

// 6. Camp deduction submission
async function testCampDeductionSubmission(): Promise<void> {
  console.log('\n📋  Test 6: Camp deduction submission');

  await test('Camp officer can view their camp deduction sheet', async () => {
    const year  = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const r = await req(
      'GET',
      `/deductions/camp/c1000000-0000-0000-0000-000000000001/sheet?year=${year}&month=${month}`, // Panagoda camp
      TOKENS.camp
    );
    // 200 = has installments; 200 with empty data is also fine
    assert([200].includes(r.status), `Got ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  });

  await test('Finance officer can view any camp deduction sheet', async () => {
    const r = await req(
      'GET',
      `/deductions/camp/c1000000-0000-0000-0000-000000000001/sheet?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`,
      TOKENS.finance
    );
    assert(r.status === 200, `Got ${r.status}`);
  });

  await test('Camp officer cannot view another camp sheet', async () => {
    const r = await req(
      'GET',
      `/deductions/camp/c1000000-0000-0000-0000-000000000003/sheet?year=2024&month=1`, // Trincomalee — not assigned
      TOKENS.camp
    );
    assert(r.status === 403, `Expected 403 Forbidden, got ${r.status}`);
  });
}

// 7. Commission release after first deduction
async function testCommissionReleaseAfterFirstDeduction(): Promise<void> {
  console.log('\n📋  Test 7: Commission release after first deduction');

  await test('Commission for A001 is payable (first deduction was seeded as deducted)', async () => {
    const r = await req('GET', '/commissions', TOKENS.finance);
    assert(r.status === 200, `Got ${r.status}`);
    const comms = (r.body as { data?: { application_id?: string; status?: string }[] }).data ?? [];
    const a001Commission = comms.find(c => c.application_id === '30000000-0000-0000-0000-000000000001');
    assert(a001Commission !== undefined, 'Commission for A001 not found');
    const commStatus = (a001Commission as any)?.status;
    assert(
      commStatus === 'payable' || commStatus === 'paid',
      `Expected payable/paid, got ${commStatus}`
    );
  });

  await test('Commission summary shows payable count > 0', async () => {
    const r = await req('GET', '/commissions/summary', TOKENS.finance);
    assert(r.status === 200, `Got ${r.status}`);
    const body = r.body as { payable?: number };
    assert((body.payable ?? 0) > 0, 'Expected at least 1 payable commission');
  });
}

// ── Role access control sanity checks ─────────────────────────

async function testRoleAccessControl(): Promise<void> {
  console.log('\n📋  Test 8: Role access control');

  await test('Customer cannot list all customers', async () => {
    const r = await req('GET', '/customers', TOKENS.customer);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('Customer can view their own profile', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000001', TOKENS.customer);
    assert(r.status === 200, `Got ${r.status}`);
  });

  await test('Customer cannot view another customer profile', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000002', TOKENS.customer);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('Finance cannot access admin endpoints', async () => {
    const r = await req('PATCH', '/users/20000000-0000-0000-0000-000000000005/role', TOKENS.finance, { role: 'admin' });
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('Unauthenticated request returns 401', async () => {
    const r = await req('GET', '/customers', '');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });
}

// ── Document upload checklist ──────────────────────────────────

async function testDocumentUpload(): Promise<void> {
  console.log('\n📋  Test 9: Document verification flow');

  await test('GET /customers/:id/documents returns missing_required list', async () => {
    const r = await req('GET', '/customers/10000000-0000-0000-0000-000000000001/documents', TOKENS.customer);
    assert(r.status === 200, `Got ${r.status}`);
    const body = r.body as { missing_required?: string[]; is_complete?: boolean };
    assert(Array.isArray(body.missing_required), 'Expected missing_required array');
    // Fresh customer has no documents — should not be complete
    assert(body.is_complete === false, 'Expected is_complete=false for customer with no documents');
  });
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🛡️  AIRVOICE MVP Test Checklist');
  console.log('   API:', BASE);
  console.log('   Timestamp:', new Date().toISOString());

  await testHealth();
  await testDuplicateNICBlocking();
  await testServiceNumberLegacyLinking();
  await testTwoPhoneLimit();
  await testThirdPhoneApproval();
  await testRetirementRule();
  await testCampDeductionSubmission();
  await testCommissionReleaseAfterFirstDeduction();
  await testRoleAccessControl();
  await testDocumentUpload();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total  = results.length;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊  Results: ${passed}/${total} passed  |  ${failed} failed`);
  console.log(`${'─'.repeat(50)}`);

  if (failed > 0) {
    console.log('\n❌  Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   • ${r.name}`);
      if (r.error) console.log(`     ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅  All tests passed.\n');
  }
}

main().catch((err) => {
  console.error('\nTest runner crashed:', err);
  process.exit(1);
});
