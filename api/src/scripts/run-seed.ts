
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const IDS = {
  // camps
  CAMP_PANAGODA:    'c1000000-0000-0000-0000-000000000001',
  CAMP_SALIYAPURA:  'c1000000-0000-0000-0000-000000000002',
  CAMP_TRINCO:      'c1000000-0000-0000-0000-000000000003',
  CAMP_DIYATALAWA:  'c1000000-0000-0000-0000-000000000004',
  CAMP_MULLAITIVU:  'c1000000-0000-0000-0000-000000000005',
  // phone_models — replace 'pm' prefix with '1b' (valid hex)
  PM_LITE_S3:       '1b000000-0000-0000-0000-000000000001',
  PM_MODEL_X7:      '1b000000-0000-0000-0000-000000000002',
  PM_PRO_12:        '1b000000-0000-0000-0000-000000000003',
  PM_GALAXY_A25:    '1b000000-0000-0000-0000-000000000004',
  PM_REDMI_13:      '1b000000-0000-0000-0000-000000000005',
  // phones — use 'f1' prefix
  PH_1:             'f1000000-0000-0000-0000-000000000001',
  PH_2:             'f1000000-0000-0000-0000-000000000002',
  PH_3:             'f1000000-0000-0000-0000-000000000003',
  PH_4:             'f1000000-0000-0000-0000-000000000004',
  // users — 'u0' is valid
  U_SUPER_ADMIN:    'u0000000-0000-0000-0000-000000000001',  // 'u' is NOT hex — fix to 'a0'
  U_ADMIN:          'a0000000-0000-0000-0000-000000000002',
  U_FINANCE:        'a0000000-0000-0000-0000-000000000003',
  U_CAMP:           'a0000000-0000-0000-0000-000000000004',
  U_SALES:          'a0000000-0000-0000-0000-000000000005',
  U_ACCOUNTANT:     'a0000000-0000-0000-0000-000000000006',
  U_RECOVERY:       'a0000000-0000-0000-0000-000000000007',
  U_INVENTORY:      'a0000000-0000-0000-0000-000000000008',
  U_CUSTOMER:       'a0000000-0000-0000-0000-000000000010',
  U_GUARANTOR:      'a0000000-0000-0000-0000-000000000011',
  // customers
  CU_C001:          'c0100000-0000-0000-0000-000000000001',
  CU_C002:          'c0100000-0000-0000-0000-000000000002',
  CU_C003:          'c0100000-0000-0000-0000-000000000003',
  CU_C004:          'c0100000-0000-0000-0000-000000000004',
  CU_C005:          'c0100000-0000-0000-0000-000000000005',
  // applications
  AP_A001:          'a1000000-0000-0000-0000-000000000001',
  AP_A002:          'a1000000-0000-0000-0000-000000000002',
  AP_A003:          'a1000000-0000-0000-0000-000000000003',
  AP_A004:          'a1000000-0000-0000-0000-000000000004',
  // legacy batches
  LB_001:           '1b100000-0000-0000-0000-000000000001',
};


const V = {
  // camps (c = valid hex)
  CAMP_PANAGODA:    'c1000000-0000-0000-0000-000000000001',
  CAMP_SALIYAPURA:  'c1000000-0000-0000-0000-000000000002',
  CAMP_TRINCO:      'c1000000-0000-0000-0000-000000000003',
  CAMP_DIYATALAWA:  'c1000000-0000-0000-0000-000000000004',
  CAMP_MULLAITIVU:  'c1000000-0000-0000-0000-000000000005',
  DIST_COLOMBO:     'd1000000-0000-0000-0000-000000000001',
  DIST_GAMPAHA:     'd1000000-0000-0000-0000-000000000002',
  DIST_KALUTARA:    'd1000000-0000-0000-0000-000000000003',
  DIST_KANDY:       'd1000000-0000-0000-0000-000000000004',
  DIST_MATALE:      'd1000000-0000-0000-0000-000000000005',
  DIST_NUWARA:      'd1000000-0000-0000-0000-000000000006',
  DIST_GALLE:       'd1000000-0000-0000-0000-000000000007',
  DIST_MATARA:      'd1000000-0000-0000-0000-000000000008',
  DIST_HAMBANTOTA:  'd1000000-0000-0000-0000-000000000009',
  DIST_RATNAPURA:   'd1000000-0000-0000-0000-00000000000a',
  DIST_KEGALLE:     'd1000000-0000-0000-0000-00000000000b',
  DIST_KURUNEGALA:  'd1000000-0000-0000-0000-00000000000c',
  DIST_PUTTALAM:    'd1000000-0000-0000-0000-00000000000d',
  DIST_ANURADHAPURA:'d1000000-0000-0000-0000-00000000000e',
  DIST_POLONNARUWA: 'd1000000-0000-0000-0000-00000000000f',
  DIST_BADULLA:     'd1000000-0000-0000-0000-000000000010',
  DIST_MONERAGALA:  'd1000000-0000-0000-0000-000000000011',
  DIST_JAFFNA:      'd1000000-0000-0000-0000-000000000012',
  DIST_KILINOCHCHI: 'd1000000-0000-0000-0000-000000000013',
  DIST_MANNAR:      'd1000000-0000-0000-0000-000000000014',
  DIST_VAVUNIYA:    'd1000000-0000-0000-0000-000000000015',
  DIST_MULLAITIVU:  'd1000000-0000-0000-0000-000000000016',
  DIST_TRINCOMALEE: 'd1000000-0000-0000-0000-000000000017',
  DIST_BATTICALOA:  'd1000000-0000-0000-0000-000000000018',
  DIST_AMPARA:      'd1000000-0000-0000-0000-000000000019',
  // phone_models
  PM_LITE_S3:       'bbbb0001-0000-0000-0000-000000000001',
  PM_MODEL_X7:      'bbbb0001-0000-0000-0000-000000000002',
  PM_PRO_12:        'bbbb0001-0000-0000-0000-000000000003',
  PM_GALAXY_A25:    'bbbb0001-0000-0000-0000-000000000004',
  PM_REDMI_13:      'bbbb0001-0000-0000-0000-000000000005',
  // phones
  PH_1:             'dddd0001-0000-0000-0000-000000000001',
  PH_2:             'dddd0001-0000-0000-0000-000000000002',
  PH_3:             'dddd0001-0000-0000-0000-000000000003',
  PH_4:             'dddd0001-0000-0000-0000-000000000004',
  // users
  U_SUPER_ADMIN:    'aaaa0001-0000-0000-0000-000000000001',
  U_ADMIN:          'aaaa0001-0000-0000-0000-000000000002',
  U_FINANCE:        'aaaa0001-0000-0000-0000-000000000003',
  U_CAMP:           'aaaa0001-0000-0000-0000-000000000004',
  U_SALES:          'aaaa0001-0000-0000-0000-000000000005',
  U_ACCOUNTANT:     'aaaa0001-0000-0000-0000-000000000006',
  U_RECOVERY:       'aaaa0001-0000-0000-0000-000000000007',
  U_INVENTORY:      'aaaa0001-0000-0000-0000-000000000008',
  U_CUSTOMER:       'aaaa0001-0000-0000-0000-000000000010',
  U_GUARANTOR:      'aaaa0001-0000-0000-0000-000000000011',
  // customers (c = valid)
  C001:             'c0010001-0000-0000-0000-000000000001',
  C002:             'c0010001-0000-0000-0000-000000000002',
  C003:             'c0010001-0000-0000-0000-000000000003',
  C004:             'c0010001-0000-0000-0000-000000000004',
  C005:             'c0010001-0000-0000-0000-000000000005',
  // applications (a = valid)
  A001:             'a0010001-0000-0000-0000-000000000001',
  A002:             'a0010001-0000-0000-0000-000000000002',
  A003:             'a0010001-0000-0000-0000-000000000003',
  A004:             'a0010001-0000-0000-0000-000000000004',
  // legacy batch (b = valid)
  LB001:            'b0010001-0000-0000-0000-000000000001',
};

async function upsert(table: string, rows: object[], conflictCols: string | string[] = 'id') {
  const onConflict = Array.isArray(conflictCols) ? conflictCols.join(',') : conflictCols;
  const { error } = await supabase.from(table).upsert(rows as any, { onConflict });
  if (error) console.warn(`  ⚠️  ${table}: ${error.message}`);
  else console.log(`  ✅  ${table}: ${rows.length} row(s)`);
}

async function main() {
  console.log('\n🌱  AIRVOICE Dev Seed Runner (valid UUIDs)');
  console.log('   Target:', SUPABASE_URL, '\n');

  // Districts
  await upsert('districts', [
    { id: V.DIST_COLOMBO,     name: 'Colombo',       province: 'Western' },
    { id: V.DIST_GAMPAHA,     name: 'Gampaha',       province: 'Western' },
    { id: V.DIST_KALUTARA,    name: 'Kalutara',      province: 'Western' },
    { id: V.DIST_KANDY,       name: 'Kandy',         province: 'Central' },
    { id: V.DIST_MATALE,      name: 'Matale',        province: 'Central' },
    { id: V.DIST_NUWARA,      name: 'Nuwara Eliya',  province: 'Central' },
    { id: V.DIST_GALLE,       name: 'Galle',         province: 'Southern' },
    { id: V.DIST_MATARA,      name: 'Matara',        province: 'Southern' },
    { id: V.DIST_HAMBANTOTA,  name: 'Hambantota',    province: 'Southern' },
    { id: V.DIST_RATNAPURA,   name: 'Ratnapura',     province: 'Sabaragamuwa' },
    { id: V.DIST_KEGALLE,     name: 'Kegalle',       province: 'Sabaragamuwa' },
    { id: V.DIST_KURUNEGALA,  name: 'Kurunegala',    province: 'North Western' },
    { id: V.DIST_PUTTALAM,    name: 'Puttalam',      province: 'North Western' },
    { id: V.DIST_ANURADHAPURA, name: 'Anuradhapura', province: 'North Central' },
    { id: V.DIST_POLONNARUWA, name: 'Polonnaruwa',   province: 'North Central' },
    { id: V.DIST_BADULLA,     name: 'Badulla',       province: 'Uva' },
    { id: V.DIST_MONERAGALA,  name: 'Moneragala',    province: 'Uva' },
    { id: V.DIST_JAFFNA,      name: 'Jaffna',        province: 'Northern' },
    { id: V.DIST_KILINOCHCHI, name: 'Kilinochchi',   province: 'Northern' },
    { id: V.DIST_MANNAR,      name: 'Mannar',        province: 'Northern' },
    { id: V.DIST_VAVUNIYA,    name: 'Vavuniya',      province: 'Northern' },
    { id: V.DIST_MULLAITIVU,  name: 'Mullaitivu',    province: 'Northern' },
    { id: V.DIST_TRINCOMALEE, name: 'Trincomalee',   province: 'Eastern' },
    { id: V.DIST_BATTICALOA,  name: 'Batticaloa',    province: 'Eastern' },
    { id: V.DIST_AMPARA,      name: 'Ampara',        province: 'Eastern' },
  ]);

  // Camps
  await upsert('camps', [
    { id: V.CAMP_PANAGODA,   name: 'Panagoda Army Camp',       name_si: 'පනාගොඩ හමුදා කඳවුර',              branch: 'army',      district: 'Colombo',      province: 'Western'       },
    { id: V.CAMP_SALIYAPURA, name: 'Saliyapura Air Force Base', name_si: 'සාලියාපුර ගුවන් හමුදා කඳවුර', branch: 'air_force', district: 'Anuradhapura', province: 'North Central' },
    { id: V.CAMP_TRINCO,     name: 'Trincomalee Naval Base',    name_si: 'ත්‍රිකුණාමළය නාවික කඳවුර',      branch: 'navy',      district: 'Trincomalee',  province: 'Eastern'       },
    { id: V.CAMP_DIYATALAWA, name: 'Diyatalawa Army Camp',      name_si: 'දියතලාව හමුදා කඳවුර',            branch: 'army',      district: 'Badulla',      province: 'Uva'           },
    { id: V.CAMP_MULLAITIVU, name: 'Mullaitivu Camp',           name_si: 'මුලතිව් කඳවුර',                  branch: 'army',      district: 'Mullaitivu',   province: 'Northern'      },
  ]);

  // Phone models
  await upsert('phone_models', [
    { id: V.PM_LITE_S3,    brand: 'AIRVOICE', model: 'Lite S3',    storage: '64GB',  color: 'Black',      sale_price: 72000  },
    { id: V.PM_MODEL_X7,   brand: 'AIRVOICE', model: 'Model X7',   storage: '128GB', color: 'Navy Blue',  sale_price: 89900  },
    { id: V.PM_PRO_12,     brand: 'AIRVOICE', model: 'Pro 12',     storage: '256GB', color: 'Space Grey', sale_price: 125000 },
    { id: V.PM_GALAXY_A25, brand: 'Samsung',  model: 'Galaxy A25', storage: '128GB', color: 'Blue',       sale_price: 95000  },
    { id: V.PM_REDMI_13,   brand: 'Redmi',    model: 'Note 13',    storage: '128GB', color: 'Black',      sale_price: 78000  },
  ]);

  // Phones (inventory)
  await upsert('phones', [
    { id: V.PH_1, model_id: V.PM_MODEL_X7, imei_1: '111111111111111', imei_2: '111111111111112', status: 'in_stock' },
    { id: V.PH_2, model_id: V.PM_MODEL_X7, imei_1: '222222222222221', imei_2: '222222222222222', status: 'in_stock' },
    { id: V.PH_3, model_id: V.PM_LITE_S3,  imei_1: '333333333333331', imei_2: null,              status: 'in_stock' },
    { id: V.PH_4, model_id: V.PM_PRO_12,   imei_1: '444444444444441', imei_2: '444444444444442', status: 'in_stock' },
  ]);

  // Users
  await upsert('users', [
    { id: V.U_SUPER_ADMIN, firebase_uid: 'dev-super-admin-uid',  phone_number: '+94700000001', role: 'super_admin',       is_active: true, is_verified: true },
    { id: V.U_ADMIN,       firebase_uid: 'dev-admin-uid',        phone_number: '+94700000002', role: 'admin',             is_active: true, is_verified: true },
    { id: V.U_FINANCE,     firebase_uid: 'dev-finance-uid',      phone_number: '+94700000003', role: 'finance_officer',   is_active: true, is_verified: true },
    { id: V.U_CAMP,        firebase_uid: 'dev-camp-uid',         phone_number: '+94700000004', role: 'camp_officer',      is_active: true, is_verified: true },
    { id: V.U_SALES,       firebase_uid: 'dev-sales-uid',        phone_number: '+94700000005', role: 'sales_officer',     is_active: true, is_verified: true },
    { id: V.U_ACCOUNTANT,  firebase_uid: 'dev-accountant-uid',   phone_number: '+94700000006', role: 'accountant',        is_active: true, is_verified: true },
    { id: V.U_RECOVERY,    firebase_uid: 'dev-recovery-uid',     phone_number: '+94700000007', role: 'recovery_officer',  is_active: true, is_verified: true },
    { id: V.U_INVENTORY,   firebase_uid: 'dev-inventory-uid',    phone_number: '+94700000008', role: 'inventory_manager', is_active: true, is_verified: true },
    { id: V.U_CUSTOMER,    firebase_uid: 'dev-customer-uid',     phone_number: '+94700000010', role: 'customer',          is_active: true, is_verified: true },
    { id: V.U_GUARANTOR,   firebase_uid: 'dev-guarantor-uid',    phone_number: '+94700000011', role: 'guarantor',         is_active: true, is_verified: true },
    // Staff users matching screenshots
    { id: 'aaaa0001-0000-0000-0000-000000000101', firebase_uid: 'dev-nimal-uid',   phone_number: '+94700000101', role: 'sales_officer',     is_active: true, is_verified: true },
    { id: 'aaaa0001-0000-0000-0000-000000000102', firebase_uid: 'dev-kamal-uid',   phone_number: '+94700000102', role: 'sales_officer',     is_active: true, is_verified: true },
    { id: 'aaaa0001-0000-0000-0000-000000000103', firebase_uid: 'dev-lasith-uid',  phone_number: '+94700000103', role: 'sales_officer',     is_active: true, is_verified: true },
    { id: 'aaaa0001-0000-0000-0000-000000000104', firebase_uid: 'dev-admin-off-uid', phone_number: '+94700000104', role: 'admin',             is_active: true, is_verified: true },
    { id: 'aaaa0001-0000-0000-0000-000000000105', firebase_uid: 'dev-finance-off-uid', phone_number: '+94700000105', role: 'finance_officer',   is_active: true, is_verified: true },
  ], 'firebase_uid');

  // Staff Registry
  await upsert('staff_registry', [
    { id: 'eeee0001-0000-0000-0000-000000000001', user_id: 'aaaa0001-0000-0000-0000-000000000101', full_name: 'Nimal Silva', designation: 'Sales Officer' },
    { id: 'eeee0001-0000-0000-0000-000000000002', user_id: 'aaaa0001-0000-0000-0000-000000000102', full_name: 'Kamal Jayawardena', designation: 'Sales Officer' },
    { id: 'eeee0001-0000-0000-0000-000000000003', user_id: 'aaaa0001-0000-0000-0000-000000000103', full_name: 'Lasith Mendis', designation: 'Sales Officer' },
    { id: 'eeee0001-0000-0000-0000-000000000004', user_id: 'aaaa0001-0000-0000-0000-000000000104', full_name: 'Office Admin', designation: 'Administrator' },
    { id: 'eeee0001-0000-0000-0000-000000000005', user_id: 'aaaa0001-0000-0000-0000-000000000105', full_name: 'Finance', designation: 'Finance Manager' },
  ]);

  // Expense Categories
  await upsert('expense_categories', [
    { id: 'c0110000-0000-0000-0000-000000000001', name: 'Fuel', type: 'expense' },
    { id: 'c0110000-0000-0000-0000-000000000002', name: 'Office', type: 'expense' },
    { id: 'c0110000-0000-0000-0000-000000000003', name: 'Salary', type: 'expense' },
    { id: 'c0110000-0000-0000-0000-000000000004', name: 'Commission', type: 'expense' },
    { id: 'c0110000-0000-0000-0000-000000000005', name: 'Import', type: 'expense' },
    { id: 'c0110000-0000-0000-0000-000000000006', name: 'Petty Cash', type: 'expense' },
  ], 'name');

  // Expense Budgets (June 2025)
  await upsert('expense_budgets', [
    { id: 'b0110000-0000-0000-0000-000000000001', category_id: 'c0110000-0000-0000-0000-000000000001', budget_month: '2025-06-01', budgeted_amount: 30000, created_by: V.U_ADMIN },
    { id: 'b0110000-0000-0000-0000-000000000002', category_id: 'c0110000-0000-0000-0000-000000000002', budget_month: '2025-06-01', budgeted_amount: 60000, created_by: V.U_ADMIN },
    { id: 'b0110000-0000-0000-0000-000000000003', category_id: 'c0110000-0000-0000-0000-000000000003', budget_month: '2025-06-01', budgeted_amount: 200000, created_by: V.U_ADMIN },
    { id: 'b0110000-0000-0000-0000-000000000004', category_id: 'c0110000-0000-0000-0000-000000000004', budget_month: '2025-06-01', budgeted_amount: 15000, created_by: V.U_ADMIN },
    { id: 'b0110000-0000-0000-0000-000000000005', category_id: 'c0110000-0000-0000-0000-000000000005', budget_month: '2025-06-01', budgeted_amount: 700000, created_by: V.U_ADMIN },
    { id: 'b0110000-0000-0000-0000-000000000006', category_id: 'c0110000-0000-0000-0000-000000000006', budget_month: '2025-06-01', budgeted_amount: 10000, created_by: V.U_ADMIN },
  ], ['category_id', 'budget_month']);

  // Expenses
  await upsert('expenses', [
    {
      id: 'e0110000-0000-0000-0000-000000000001',
      category_id: 'c0110000-0000-0000-0000-000000000001',
      amount: 12500,
      description: 'Sales officer fuel — Nimal Silva Jun W1',
      expense_date: '2025-06-07',
      submitted_by: 'aaaa0001-0000-0000-0000-000000000101',
      status: 'approved',
      payment_method: 'Cash',
      receipt_reference: 'REF-FUEL-001',
      is_suspicious: false,
    },
    {
      id: 'e0110000-0000-0000-0000-000000000002',
      category_id: 'c0110000-0000-0000-0000-000000000002',
      amount: 45000,
      description: 'Printer cartridges and stationery',
      expense_date: '2025-06-10',
      submitted_by: 'aaaa0001-0000-0000-0000-000000000104',
      status: 'approved',
      payment_method: 'Card',
      receipt_reference: 'REF-OFFICE-002',
      is_suspicious: false,
    },
    {
      id: 'e0110000-0000-0000-0000-000000000003',
      category_id: 'c0110000-0000-0000-0000-000000000001',
      amount: 28000,
      description: 'Sales officer fuel — Kamal Jayawardena Jun',
      expense_date: '2025-06-12',
      submitted_by: 'aaaa0001-0000-0000-0000-000000000102',
      status: 'pending',
      payment_method: 'Cash',
      receipt_reference: 'REF-FUEL-003',
      is_suspicious: true,
      flagged_reason: '240% above personal monthly average (avg LKR 8,200)',
    },
    {
      id: 'e0110000-0000-0000-0000-000000000004',
      category_id: 'c0110000-0000-0000-0000-000000000006',
      amount: 5500,
      description: 'Team lunch — client visit Panagoda Camp',
      expense_date: '2025-06-14',
      submitted_by: 'aaaa0001-0000-0000-0000-000000000103',
      status: 'approved',
      payment_method: 'Cash',
      receipt_reference: null,
      is_suspicious: false,
    },
    {
      id: 'e0110000-0000-0000-0000-000000000005',
      category_id: 'c0110000-0000-0000-0000-000000000003',
      amount: 185000,
      description: 'Staff salary — June 2025',
      expense_date: '2025-06-25',
      submitted_by: 'aaaa0001-0000-0000-0000-000000000105',
      status: 'approved',
      payment_method: 'Bank Transfer',
      receipt_reference: 'REF-SAL-005',
      is_suspicious: false,
    },
    {
      id: 'e0110000-0000-0000-0000-000000000006',
      category_id: 'c0110000-0000-0000-0000-000000000005',
      amount: 620000,
      description: 'Import batch 2025-06 — 10x AIRVOICE Model X7',
      expense_date: '2025-06-18',
      submitted_by: 'aaaa0001-0000-0000-0000-000000000105',
      status: 'approved',
      payment_method: 'Bank Transfer',
      receipt_reference: 'REF-IMP-006',
      is_suspicious: false,
    },
    {
      id: 'e0110000-0000-0000-0000-000000000007',
      category_id: 'c0110000-0000-0000-0000-000000000004',
      amount: 11000,
      description: 'Sales commissions paid — May 2025 (44 units)',
      expense_date: '2025-06-01',
      submitted_by: 'aaaa0001-0000-0000-0000-000000000105',
      status: 'approved',
      payment_method: 'Bank Transfer',
      receipt_reference: 'REF-COMM-007',
      is_suspicious: false,
    },
  ]);

  // Camp officer assignment
  await upsert('camp_officer_assignments', [
    { user_id: V.U_CAMP, camp_id: V.CAMP_PANAGODA, is_active: true },
  ], ['user_id', 'camp_id']);

  // Customers
  const retireIn90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  await upsert('customers', [
    { id: V.C001, user_id: V.U_CUSTOMER,  full_name: 'Sergeant Kamal Perera',          nic_number: '198512345678', service_number: 'SL/A/12345', branch: 'army', rank: 'Sergeant',      camp_id: V.CAMP_PANAGODA, phone_number: '+94700000010', has_app_account: true,  app_linked_at: new Date().toISOString(), risk_level: 'low',    risk_score: 5  },
    { id: V.C002, user_id: null,           full_name: 'Corporal Nimal Silva',            nic_number: '199012345678', service_number: 'SL/A/67890', branch: 'army', rank: 'Corporal',     camp_id: V.CAMP_PANAGODA, phone_number: '+94711111111', has_app_account: false,                                  risk_level: 'medium', risk_score: 35 },
    { id: V.C003, user_id: null,           full_name: 'Private Roshan Fernando',         nic_number: '198712345679', service_number: 'SL/A/11111', branch: 'army', rank: 'Private',      camp_id: V.CAMP_PANAGODA, phone_number: '+94722222222', has_app_account: false,                                  risk_level: 'high',   risk_score: 65 },
    { id: V.C004, user_id: null,           full_name: 'Lance Corporal Amal Bandara',     nic_number: '197012345678', service_number: 'SL/A/99999', branch: 'army', rank: 'Lance Corporal', camp_id: V.CAMP_PANAGODA, phone_number: '+94733333333', has_app_account: false,                                  risk_level: 'low',    risk_score: 10, retirement_date: retireIn90 },
    { id: V.C005, user_id: V.U_GUARANTOR, full_name: 'Sergeant Major Priya Kumara',     nic_number: '198812345678', service_number: 'SL/A/55555', branch: 'army', rank: 'Sergeant Major', camp_id: V.CAMP_PANAGODA, phone_number: '+94700000011', has_app_account: true,  app_linked_at: new Date().toISOString(), risk_level: 'low',    risk_score: 2  },
  ]);

  // Applications (no camp_id column — stored via customer relation)
  const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  await upsert('applications', [
    { id: V.A001, ref_number: 'AV-2024-0001', customer_id: V.C001, phone_model_id: V.PM_MODEL_X7, sale_price: 89900,  down_payment: 9900,  financed_amount: 80000,  monthly_amount: 6667, term_months: 12, status: 'active',     sales_officer_id: V.U_SALES, plan_end_date: futureDate(180), sale_date: new Date().toISOString().split('T')[0] },
    { id: V.A002, ref_number: 'AV-2024-0002', customer_id: V.C002, phone_model_id: V.PM_LITE_S3,  sale_price: 72000,  down_payment: 7200,  financed_amount: 64800,  monthly_amount: 5400, term_months: 12, status: 'active',     sales_officer_id: V.U_SALES, plan_end_date: futureDate(240), sale_date: new Date().toISOString().split('T')[0] },
    { id: V.A003, ref_number: 'AV-2024-0003', customer_id: V.C002, phone_model_id: V.PM_PRO_12,   sale_price: 125000, down_payment: 12500, financed_amount: 112500, monthly_amount: 9375, term_months: 12, status: 'active',     sales_officer_id: V.U_SALES, plan_end_date: futureDate(120), sale_date: new Date().toISOString().split('T')[0] },
    { id: V.A004, ref_number: 'AV-2024-0004', customer_id: V.C003, phone_model_id: V.PM_GALAXY_A25, sale_price: 95000, down_payment: 9500, financed_amount: 85500,  monthly_amount: 7125, term_months: 12, status: 'submitted',  sales_officer_id: V.U_SALES, plan_end_date: futureDate(360), sale_date: new Date().toISOString().split('T')[0] },
  ]);

  // Installments for A001 (6 paid, 6 pending)
  console.log('  ⏳  Generating installments for A001...');
  const installments: object[] = [];
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  for (let i = 1; i <= 12; i++) {
    const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i - 1, 1);
    installments.push({
      application_id: V.A001,
      customer_id: V.C001,
      due_date:    d.toISOString().split('T')[0],
      due_year:    d.getFullYear(),
      due_month:   d.getMonth() + 1,
      month_number: i,
      expected_amount: 6667,
      status:          i <= 6 ? 'deducted' : 'pending',
      deducted_amount: i <= 6 ? 6667 : 0,
      arrears_amount:  0,
      confirmed_at:    i <= 6 ? new Date().toISOString() : null,
    });
  }
  const { error: instErr } = await supabase.from('installments').upsert(installments as any, { onConflict: 'application_id,month_number' });
  if (instErr) console.warn(`  ⚠️  installments: ${instErr.message}`);
  else console.log(`  ✅  installments: 12 row(s)`);

  // Commission for A001
  await upsert('commissions', [
    { application_id: V.A001, sales_officer_id: V.U_SALES, customer_id: V.C001, amount: 250, status: 'payable', became_payable_at: new Date().toISOString() },
  ], 'application_id');

  // Legacy import batch
  await upsert('legacy_import_batches', [
    {
      id: V.LB001,
      file_name: '7ESR_deductions_2024.xlsx',
      file_path: '/tmp/dev-legacy-placeholder.xlsx',
      file_type: 'xlsx',
      file_size_bytes: 24500,
      uploaded_by: V.U_FINANCE,
      status: 'completed',
      total_rows: 5, imported_rows: 3, duplicate_rows: 1, invalid_rows: 1,
      column_mapping: { service_number: 'S.No', customer_name: 'Name', guarantor_service_number: 'GU/No', guarantor_name: 'GU/Name', unit: 'Unit', monthly_amount: 'Rental', term_months: 'Term' },
      sheet_regiment: '7 Engineer Service Regiment',
      sheet_period: '2024-Q3',
    },
  ]);

  // Legacy import rows (batch_id + row_number must be unique)
  const { error: lrErr } = await supabase.from('legacy_import_rows').upsert([
    {
      batch_id: V.LB001, row_number: 2,
      raw_data: { 'S.No': 'SL/A/12345', Name: 'Kamal Perera', Rental: 6667, Term: 12 },
      service_number: 'SL/A/12345', customer_name: 'Kamal Perera',
      monthly_amount: 6667, term_months: 12,
      deduction_history: { '2024-01': { status: 'deducted', amount: 6667 }, '2024-02': { status: 'deducted', amount: 6667 }, '2024-03': { status: 'deducted', amount: 6667 } },
      total_expected: 80004, total_deducted: 20001, arrears: 0, missed_months: 0, remaining_months: 9,
      is_settled: false, status: 'duplicate', risk_level: 'low', risk_score: 5,
    },
    {
      batch_id: V.LB001, row_number: 3,
      raw_data: { 'S.No': 'SL/A/77777', Name: 'Thilak Jayawardena', Rental: 5400, Term: 12 },
      service_number: 'SL/A/77777', customer_name: 'Thilak Jayawardena',
      monthly_amount: 5400, term_months: 12,
      deduction_history: { '2024-01': { status: 'deducted', amount: 5400 }, '2024-02': { status: 'not_deducted', amount: 0 }, '2024-03': { status: 'partial', amount: 2700 } },
      total_expected: 64800, total_deducted: 8100, arrears: 2700, missed_months: 1, remaining_months: 9,
      is_settled: false, status: 'imported', risk_level: 'medium', risk_score: 25,
    },
    {
      batch_id: V.LB001, row_number: 4,
      raw_data: { 'S.No': 'SL/A/88888', Name: 'Chaminda Rathnayake', Rental: 7125, Term: 12 },
      service_number: 'SL/A/88888', customer_name: 'Chaminda Rathnayake',
      monthly_amount: 7125, term_months: 12,
      deduction_history: { '2024-01': { status: 'not_deducted', amount: 0 }, '2024-02': { status: 'not_deducted', amount: 0 }, '2024-03': { status: 'not_deducted', amount: 0 } },
      total_expected: 85500, total_deducted: 0, arrears: 21375, missed_months: 3, remaining_months: 9,
      is_settled: false, status: 'imported', risk_level: 'critical', risk_score: 85,
    },
    {
      batch_id: V.LB001, row_number: 5,
      raw_data: { 'S.No': '', Name: 'Unknown Soldier', Rental: '', Term: 12 },
      service_number: null, customer_name: 'Unknown Soldier',
      monthly_amount: null, term_months: 12,
      deduction_history: {}, total_expected: 0, total_deducted: 0, arrears: 0, missed_months: 0, remaining_months: 0,
      is_settled: false, status: 'invalid', risk_level: null, risk_score: null,
    },
    {
      batch_id: V.LB001, row_number: 6,
      raw_data: { 'S.No': 'SL/A/44444', Name: 'Gamini Dissanayake', Rental: 6250, Term: 12 },
      service_number: 'SL/A/44444', customer_name: 'Gamini Dissanayake',
      monthly_amount: 6250, term_months: 12,
      deduction_history: { '2024-01': { status: 'deducted', amount: 6250 }, '2024-02': { status: 'deducted', amount: 6250 }, '2024-03': { status: 'deducted', raw: 'SETTLED', amount: 6250 } },
      total_expected: 75000, total_deducted: 75000, arrears: 0, missed_months: 0, remaining_months: 0,
      is_settled: true, status: 'imported', risk_level: 'low', risk_score: 0,
    },
  ] as any);
  if (lrErr) console.warn(`  ⚠️  legacy_import_rows: ${lrErr.message}`);
  else console.log(`  ✅  legacy_import_rows: 5 row(s)`);

  // Print the ID mapping for checklist.ts update
  console.log('\n📋  Update checklist.ts with these IDs:');
  console.log(`  C001 customer:   ${V.C001}`);
  console.log(`  C002 customer:   ${V.C002}`);
  console.log(`  C004 customer:   ${V.C004}`);
  console.log(`  A001 app:        ${V.A001}`);
  console.log(`  A004 app:        ${V.A004}`);
  console.log(`  LB001 batch:     ${V.LB001}`);
  console.log(`  Panagoda camp:   ${V.CAMP_PANAGODA}`);
  console.log('');
  console.log('✅  Seed complete!\n');
}

main().catch((err) => {
  console.error('\n❌  Seed failed:', err);
  process.exit(1);
});
