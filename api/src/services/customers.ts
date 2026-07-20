import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from './audit';

export interface CustomerCreateInput {
  user_id?: string;
  full_name: string;
  full_name_si?: string;
  full_name_ta?: string;
  nic_number?: string;
  date_of_birth?: string;
  branch: 'army' | 'navy' | 'air_force';
  service_number?: string;
  military_id_number?: string;
  rank: string;
  regiment_id?: string;
  camp_id?: string;
  retirement_date?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  created_by?: string;
}

export interface DuplicateCheckResult {
  has_duplicate: boolean;
  duplicates: {
    field: string;
    value: string;
    existing_customer_id: string;
    existing_customer_name: string;
  }[];
}

/**
 * Check for duplicate customer records across all unique fields.
 * This is called BEFORE creating a customer to prevent duplicates.
 */
export async function checkCustomerDuplicates(input: {
  nic_number?: string;
  service_number?: string;
  military_id_number?: string;
  phone_number?: string;
}): Promise<DuplicateCheckResult> {
  const supabase = getSupabase();
  const duplicates: DuplicateCheckResult['duplicates'] = [];

  const checks = [
    { field: 'nic_number', value: input.nic_number },
    { field: 'service_number', value: input.service_number },
    { field: 'military_id_number', value: input.military_id_number },
    { field: 'phone_number', value: input.phone_number },
  ];

  for (const check of checks) {
    if (!check.value) continue;

    const { data } = await supabase
      .from('customers')
      .select('id, full_name')
      .eq(check.field, check.value)
      .is('deleted_at', null)
      .single();

    if (data) {
      duplicates.push({
        field: check.field,
        value: check.value,
        existing_customer_id: data.id,
        existing_customer_name: data.full_name,
      });
    }
  }

  return {
    has_duplicate: duplicates.length > 0,
    duplicates,
  };
}

/**
 * Check how many active phone plans a customer currently has.
 * Used to enforce phone limit rules.
 */
export async function getActivePhoneCount(customerId: string): Promise<number> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .is('deleted_at', null);

  return count ?? 0;
}

/**
 * Determine if a customer can apply for a new phone.
 * Rules:
 *   - Without guarantor: max 2 active phones
 *   - With guarantor: max 4 active phones
 *   - 3rd phone always requires special approval
 */
export async function checkPhoneEligibility(customerId: string, hasGuarantor = false): Promise<{
  eligible: boolean;
  active_count: number;
  reason?: string;
  requires_special_approval?: boolean;
  rule_applied: string;
}> {
  const activeCount = await getActivePhoneCount(customerId);
  const hardLimit = hasGuarantor ? 4 : 2;

  if (activeCount === 0) {
    return {
      eligible: true,
      active_count: activeCount,
      rule_applied: 'RULE_1: 0 active phones — allow application',
    };
  }

  if (activeCount === 1) {
    return {
      eligible: true,
      active_count: activeCount,
      rule_applied: 'RULE_2: 1 active phone — allow second after checks',
    };
  }

  if (activeCount === 2) {
    // Without guarantor: hard block at 2
    if (!hasGuarantor) {
      return {
        eligible: false,
        active_count: activeCount,
        reason: 'Customer already has 2 active phone plans. A guarantor is required to apply for a 3rd phone.',
        requires_special_approval: true,
        rule_applied: 'RULE_3: 2 active phones, no guarantor — special approval required',
      };
    }
    // With guarantor: allow 3rd but flag for special approval
    return {
      eligible: false,
      active_count: activeCount,
      reason: 'Customer already has 2 active phone plans. A 3rd phone requires special admin approval.',
      requires_special_approval: true,
      rule_applied: 'RULE_3G: 2 active phones with guarantor — special approval required for 3rd',
    };
  }

  if (activeCount === 3 && hasGuarantor) {
    // With guarantor: allow 4th but flag for special approval
    return {
      eligible: false,
      active_count: activeCount,
      reason: 'Customer already has 3 active phone plans. A 4th phone requires special admin approval.',
      requires_special_approval: true,
      rule_applied: 'RULE_4G: 3 active phones with guarantor — special approval required for 4th',
    };
  }

  // At or beyond the hard limit
  return {
    eligible: false,
    active_count: activeCount,
    reason: hasGuarantor
      ? `Customer has reached the maximum of ${hardLimit} active phone plans (with guarantor). New application blocked.`
      : `Customer has reached the maximum of ${hardLimit} active phone plans. New application blocked.`,
    rule_applied: `RULE_LIMIT: ${activeCount} active phones (limit: ${hardLimit}) — hard block`,
  };
}

/**
 * Try to link a newly registered app user to their legacy import record.
 * Called during customer registration after OTP verification.
 */
export async function linkLegacyRecord(
  customerId: string,
  nic?: string,
  serviceNumber?: string,
  phoneNumber?: string,
  actingUserId?: string
): Promise<{ linked: boolean; legacy_row_id?: string; method?: string }> {
  const supabase = getSupabase();

  const conditions = [];
  if (nic) conditions.push({ nic });
  if (serviceNumber) conditions.push({ service_number: serviceNumber });

  for (const condition of conditions) {
    const field = Object.keys(condition)[0];
    const value = Object.values(condition)[0];

    const { data: legacyRow } = await supabase
      .from('legacy_import_rows')
      .select('id')
      .eq(field === 'nic' ? 'nic_number' : field, value)
      .is('customer_id', null)
      .single();

    if (legacyRow) {
      // Link this customer to the legacy row
      const method = field === 'nic' ? 'auto_nic' : 'auto_service_no';

      await supabase.from('legacy_customer_links').insert({
        customer_id: customerId,
        legacy_row_id: legacyRow.id,
        linked_by: method,
        confidence: 100,
      } as any);

      await supabase
        .from('legacy_import_rows')
        .update({ customer_id: customerId } as any)
        .eq('id', legacyRow.id);

      await supabase
        .from('customers')
        .update({
          legacy_record_id: legacyRow.id,
          legacy_imported_at: new Date().toISOString(),
        } as any)
        .eq('id', customerId);

      writeAuditLog({
        user_id: actingUserId,
        action: AuditActions.LEGACY_CUSTOMER_LINKED,
        entity_type: 'customers',
        entity_id: customerId,
        new_values: { legacy_row_id: legacyRow.id, method },
      });

      return { linked: true, legacy_row_id: legacyRow.id, method };
    }
  }

  return { linked: false };
}

/**
 * Calculate and update a customer's risk score.
 */
export async function refreshCustomerRisk(customerId: string): Promise<{
  risk_score: number;
  risk_level: string;
}> {
  const supabase = getSupabase();

  // Call the PostgreSQL function
  const { data } = await supabase
    .rpc('calculate_risk_score', { p_customer_id: customerId } as any);

  const riskScore = (data as any as number) ?? 0;
  const riskLevel =
    riskScore >= 70 ? 'critical'
    : riskScore >= 50 ? 'high'
    : riskScore >= 25 ? 'medium'
    : 'low';

  await supabase
    .from('customers')
    .update({
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_updated_at: new Date().toISOString(),
    } as any)
    .eq('id', customerId);

  return { risk_score: riskScore, risk_level: riskLevel };
}
