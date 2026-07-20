/**
 * repair-applications.js
 *
 * Reads all legacy_import_rows that have a valid customer_id but no application yet,
 * then creates the Applications + Installments rows correctly.
 *
 * Usage: node scripts/repair-applications.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE_SIZE = 500;
const CHUNK = 50;

async function fetchAll(table, columns, filterFn) {
  let results = [];
  let from = 0;
  while (true) {
    let q = sb.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} fetch error: ${error.message}`);
    if (!data || data.length === 0) break;
    results = results.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return results;
}

async function main() {
  console.log('🔧 Repair: applications + installments from legacy_import_rows');

  // 1. Ensure LEGACY phone model exists
  let legacyModelId = null;
  {
    // Try existing LEGACY model first
    const { data: existing } = await sb.from('phone_models')
      .select('id').eq('brand', 'LEGACY').eq('model', 'Legacy Plan').limit(1).maybeSingle();
    if (existing) {
      legacyModelId = existing.id;
      console.log('✅ Found existing LEGACY phone model:', legacyModelId);
    } else {
      // Create LEGACY model using actual schema (no base_price col)
      const { data: created, error } = await sb.from('phone_models').insert({
        brand: 'LEGACY',
        model: 'Legacy Plan',
        sale_price: 0,
        purchase_cost: 0,
        is_active: false,
        storage: null,
        color: null,
      }).select('id').single();
      if (error) throw new Error(`phone_models insert error: ${error.message}`);
      legacyModelId = created.id;
      console.log('✅ Created LEGACY phone model:', legacyModelId);
    }
  }

  // 2. Load all legacy import rows that have a customer
  console.log('📥 Loading legacy_import_rows...');
  const legacyRows = await fetchAll(
    'legacy_import_rows',
    'id, customer_id, service_number, item_count, monthly_amount, term_months, sale_date, deduction_history, is_settled',
    q => q.not('customer_id', 'is', null)
  );
  console.log(`   Found ${legacyRows.length} rows with customer_id`);

  // 3. Load existing applications (to skip already-done customers)
  console.log('📥 Loading existing applications...');
  const existingApps = await fetchAll('applications', 'id, customer_id', null);
  const appsByCustomer = new Map();
  existingApps.forEach(a => {
    if (!appsByCustomer.has(a.customer_id)) {
      appsByCustomer.set(a.customer_id, []);
    }
    appsByCustomer.get(a.customer_id).push(a.id);
  });
  console.log(`   Existing applications: ${existingApps.length}`);

  // 4. Load customers for camp_id lookup
  console.log('📥 Loading customers...');
  const customers = await fetchAll('customers', 'id, service_number, camp_id', null);
  const custById = new Map(customers.map(c => [c.id, c]));
  console.log(`   Loaded ${customers.length} customers`);

  // 5. Build applications to insert
  const applicationsToInsert = [];

  for (const row of legacyRows) {
    if (!row.customer_id) continue;
    if (appsByCustomer.has(row.customer_id)) continue; // already has app

    const itemCount = Number(row.item_count ?? 1) || 1;
    const monthlyAmt = Number(row.monthly_amount ?? 0);
    if (monthlyAmt <= 0) continue;

    const termMonths = Number(row.term_months ?? 24) || 24;
    const perItemAmt = monthlyAmt / itemCount;

    const histEntries = Object.entries(row.deduction_history || {});
    histEntries.sort(([a], [b]) => a.localeCompare(b));
    const paidCount = histEntries.filter(([, h]) => h.status === 'deducted').length;
    const remainingMonths = Math.max(0, termMonths - paidCount);

    let saleDate = null;
    if (row.sale_date) {
      try { saleDate = new Date(row.sale_date); if (isNaN(saleDate.getTime())) saleDate = null; } catch { saleDate = null; }
    }
    if (!saleDate) saleDate = histEntries.length > 0 ? new Date(histEntries[0][0] + '-01') : new Date();

    const cust = custById.get(row.customer_id);
    const campId = cust?.camp_id ?? null;

    for (let i = 0; i < itemCount; i++) {
      const planEndDate = new Date(saleDate);
      planEndDate.setMonth(planEndDate.getMonth() + termMonths);

      applicationsToInsert.push({
        _legacyRowId: row.id,
        _serviceNumber: row.service_number,
        _histEntries: histEntries,
        _termMonths: termMonths,
        _saleDate: saleDate,
        _itemCount: itemCount,
        _itemIndex: i,
        // DB fields
        customer_id: row.customer_id,
        phone_model_id: legacyModelId,
        sale_price: perItemAmt * termMonths,
        down_payment: 0,
        financed_amount: perItemAmt * termMonths,
        monthly_amount: perItemAmt,
        term_months: termMonths,
        status: remainingMonths > 0 ? 'active' : 'completed',
        sale_date: saleDate.toISOString().split('T')[0],
        plan_end_date: planEndDate.toISOString().split('T')[0],
        ref_number: `LGC-${row.service_number ?? row.customer_id.slice(0, 8)}${itemCount > 1 ? `-${i + 1}` : ''}`,
        notes: `Auto-generated from legacy import${itemCount > 1 ? ` (Item ${i + 1} of ${itemCount})` : ''}`,
      });
    }
  }

  console.log(`📝 Applications to create: ${applicationsToInsert.length}`);

  if (applicationsToInsert.length === 0) {
    console.log('✅ Nothing to do — all customers already have applications.');
    return;
  }

  // 6. Insert applications in chunks and collect inserted IDs
  const insertedApps = [];
  const dbFields = [
    'customer_id', 'phone_model_id', 'sale_price', 'down_payment', 'financed_amount',
    'monthly_amount', 'term_months', 'status', 'sale_date', 'plan_end_date',
    'ref_number', 'notes',
  ];

  for (let i = 0; i < applicationsToInsert.length; i += CHUNK) {
    const chunk = applicationsToInsert.slice(i, i + CHUNK);
    const dbChunk = chunk.map(a => {
      const obj = {};
      dbFields.forEach(f => { obj[f] = a[f]; });
      return obj;
    });

    const { data, error } = await sb.from('applications').insert(dbChunk)
      .select('id, customer_id, monthly_amount, term_months, sale_date');
    if (error) {
      console.error(`❌ Application insert error (chunk ${i}): ${error.message}`);
      continue;
    }

    // Stitch back the private fields from the original batch
    data.forEach((inserted, idx) => {
      const orig = chunk[idx];
      insertedApps.push({
        ...inserted,
        _histEntries: orig._histEntries,
        _termMonths: orig._termMonths,
        _saleDate: orig._saleDate,
      });
    });
  }

  console.log(`✅ Inserted ${insertedApps.length} applications`);

  // 7. Build installments
  const installmentsToInsert = [];
  const today = new Date();

  for (const app of insertedApps) {
    const histEntries = app._histEntries;
    const termMonths = Number(app._termMonths ?? 24);
    const monthlyAmt = Number(app.monthly_amount ?? 0);
    let saleDate = new Date(app._saleDate ?? app.sale_date ?? today);

    // --- Historical installments from deduction_history ---
    histEntries.forEach(([monthStr, h], idx) => {
      const [yrStr, moStr] = monthStr.split('-');
      const yr = parseInt(yrStr);
      const mo = parseInt(moStr);
      if (isNaN(yr) || isNaN(mo)) return;

      const deductedAmt = Number(h.amount ?? 0);
      const isDeducted = h.status === 'deducted';

      installmentsToInsert.push({
        application_id: app.id,
        customer_id: app.customer_id,
        due_date: `${yr}-${String(mo).padStart(2, '0')}-01`,
        due_year: yr,
        due_month: mo,
        month_number: idx + 1,
        expected_amount: monthlyAmt,
        deducted_amount: isDeducted ? deductedAmt : 0,
        arrears_amount: isDeducted ? Math.max(0, monthlyAmt - deductedAmt) : monthlyAmt,
        status: isDeducted
          ? (deductedAmt >= monthlyAmt ? 'deducted' : 'partial')
          : 'not_deducted',
      });
    });

    // --- Future/remaining installments as 'pending' ---
    const paidCount = histEntries.filter(([, h]) => h.status === 'deducted').length;
    const remainingMonths = Math.max(0, termMonths - paidCount);

    let lastDate = saleDate;
    if (histEntries.length > 0) {
      const lastKey = histEntries[histEntries.length - 1][0];
      const [y, m] = lastKey.split('-').map(Number);
      lastDate = new Date(y, m - 1, 1);
    }

    for (let n = 0; n < remainingMonths; n++) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + n + 1);
      const yr = d.getFullYear();
      const mo = d.getMonth() + 1;

      installmentsToInsert.push({
        application_id: app.id,
        customer_id: app.customer_id,
        due_date: `${yr}-${String(mo).padStart(2, '0')}-01`,
        due_year: yr,
        due_month: mo,
        month_number: histEntries.length + n + 1,
        expected_amount: monthlyAmt,
        deducted_amount: 0,
        arrears_amount: 0,
        status: 'pending',
      });
    }
  }

  console.log(`📝 Installments to create: ${installmentsToInsert.length}`);

  // 8. Insert installments in chunks
  let instInserted = 0;
  for (let i = 0; i < installmentsToInsert.length; i += CHUNK) {
    const chunk = installmentsToInsert.slice(i, i + CHUNK);
    const { error } = await sb.from('installments').insert(chunk);
    if (error) {
      console.error(`❌ Installment insert error (chunk ${i}): ${error.message}`);
    } else {
      instInserted += chunk.length;
    }
  }

  console.log(`✅ Inserted ${instInserted} installments`);
  console.log('\n🎉 Done! Customers page and Installments & Deductions page should now show data.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
