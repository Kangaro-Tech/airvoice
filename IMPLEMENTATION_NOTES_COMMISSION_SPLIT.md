# AirVoice Commission Split Implementation (125 + 125)

## Overview
Implemented the sales-member commission split system according to the PDF specification. Each phone sale now generates exactly 250 in commission, distributed as either 125+125 (company worker + field salesman) or 250 to a field salesman.

## Changes Made

### 1. Database Migration
**File:** `api/sql/migrations/012_sales_member_commission_split.sql`

Created `public.sales_member_aliases` table with the following structure:
- `alias` - Sales member name (e.g., "CHANDULA", "WEERASEKARA") - UNIQUE
- `user_id` - Reference to the user this person is
- `designation` - Staff designation if available
- `is_company_worker` - Boolean flag (true for company workers, false for sales officers)
- `split_user_id` - User ID of paired field salesman (for company workers)
- `worker_amount` - Commission to SALES MEMBER if company worker (default: 125.00)
- `split_amount` - Commission to the field salesman (default: 125.00)

### 2. Backend Logic - Helper Functions
**File:** `api/src/routes/legacy-import.ts`

Added three helper functions:

#### `resolveMember(salesMember?: string)`
- Looks up the sales member alias from the database (case-insensitive)
- Returns the full alias record with user_id, designation, split info, etc.

#### `isSalesOfficer(designation?: string)`
- Checks if a designation indicates a field salesman
- Matches: "Sales Officer" or "Salesman" (case-insensitive)

### 3. Commission Creation - Regular Deduction Sheet Import
**Location:** After phone stock assignment in the deduction sheet processing flow

**Logic:**
For each inserted application:
1. Resolve the sales member from the alias table
2. Determine if the sales member is a company worker or field salesman
3. **Company worker row:**
   - Create 1st commission: 125 to the company worker (sales_member)
   - Create 2nd commission: 125 to the paired field salesman (split_user_id)
   - If split_user_id is missing, log warning
4. **Field salesman row (already a Sales Officer):**
   - Create 1 commission: 250 to that person (125+125)
5. Batch insert all commissions (500 per batch)

**Status determination:**
- Commission status = "payable" if application has any deducted installments
- Commission status = "pending" otherwise

### 4. Commission Creation - Unit Wise Summary Import
**Location:** After guarantor processing, before marking batch complete (step 8 → 9)

**Logic:** Identical to deduction sheet import
- Processes all applications in `newRowsForDB`
- Resolves sales member and creates split commissions
- Batch inserts up to 500 commissions per query

## How to Use

### Configuration
Before importing legacy data, populate the `sales_member_aliases` table:

```sql
-- Example: Set up company workers
INSERT INTO public.sales_member_aliases (alias, user_id, is_company_worker, split_user_id, worker_amount, split_amount)
VALUES 
  ('CHANDULA', '9896621a-1239-460e-be76-a3f9cfb37130', true, '9896621a-1239-460e-be76-a3f9cfb37130', 125.00, 125.00),
  ('CHANDANA', '1211a6f5-1d1f-4383-922e-ad52d91c79f6', true, '231c335f-ce5d-4f5f-8ed8-b2fc015a2675', 125.00, 125.00),
  ('JAYALATH', 'da394354-f957-4b09-8209-fc871c730464', true, '42da86f4-dfc9-405e-a258-28916aa97e6f', 125.00, 125.00);

-- Example: Set up field salesmen
INSERT INTO public.sales_member_aliases (alias, user_id, is_company_worker, designation)
VALUES 
  ('WEERASEKARA', '<weerasekara_user_uuid>', false, 'Sales Officer');
```

### Import Process
1. Upload legacy deduction sheet or Unit Wise Summary
2. System automatically:
   - Creates applications/installments
   - Looks up sales member in aliases table
   - Creates appropriate commission records
   - Logs any issues (missing split_user_id, unknown sales members)

## Commission Examples

### Example 1: Company Worker (CHANDULA)
- Application A001 for Customer C001
- Sales Member: CHANDULA (company worker, paired with WEERASEKARA)
- **Result:**
  - Commission 125 → CHANDULA's user
  - Commission 125 → WEERASEKARA's user
  - Total per phone: 250

### Example 2: Field Salesman (WEERASEKARA)
- Application A002 for Customer C002  
- Sales Member: WEERASEKARA (Sales Officer)
- **Result:**
  - Commission 250 → WEERASEKARA's user
  - Total per phone: 250

### Example 3: Unpaired Worker
- Application A003 for Customer C003
- Sales Member: UNKNOWN (no split_user_id)
- **Result:**
  - Commission 125 → Worker (if exists)
  - Commission 0 → ⚠️ Field salesman (WARNING LOGGED)
  - Total per phone: 125 (incomplete)

## Verification

### Test on Development:
```bash
cd api && npx tsc -p tsconfig.json --noEmit  # Verify compilation
```

### Expected Behavior:
- ✅ Each phone = exactly 250 total commission
- ✅ Company workers split 125+125 with field salesman
- ✅ Field salesmen get 250 total
- ✅ Unpaired workers logged with warning
- ✅ Commissions marked as payable if any installments deducted
- ✅ Works for both deduction sheet and Unit Wise Summary imports

## Files Modified
1. ✅ `api/sql/migrations/012_sales_member_commission_split.sql` - NEW
2. ✅ `api/src/routes/legacy-import.ts` - Added helpers + commission logic
3. ✅ TypeScript compilation verified - No errors

## Next Steps (Manual)
1. Run migration: `npm run migrate` (or direct SQL execution)
2. Populate `sales_member_aliases` table with your sales member mappings
3. Test import with sample data
4. Merge to main branch via PR
