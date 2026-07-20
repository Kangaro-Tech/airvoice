require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_SETTINGS = [
  { key: 'max_phones_per_customer', value: 2, description: 'Maximum active phone plans a single customer can hold.' },
  { key: 'commission_per_sale', value: 250, description: 'Fixed LKR amount paid to sales officer per confirmed first deduction.' },
  { key: 'free_phone_milestone', value: 100, description: 'Number of camp sales needed for a sales officer to qualify for a free phone.' },
  { key: 'max_guarantors_per_person', value: 2, description: 'Max number of customers one guarantor can cover simultaneously.' },
  { key: 'risk_score_threshold_high', value: 50, description: 'Risk score above this value flags customer as HIGH risk.' },
  { key: 'risk_score_threshold_medium', value: 25, description: 'Risk score above this value flags customer as MEDIUM risk.' },
  { key: 'retirement_warning_months', value: 24, description: 'Customers retiring within this period are flagged for review.' },
  { key: 'ai_alerts_enabled', value: true, description: 'Enable AI-powered risk analysis and financial alerts on dashboard.' },
];

const DEFAULT_TEMPLATES = [
  { id: 'deduction_confirmed', name: 'Deduction Confirmed', channel: 'WhatsApp + SMS', template: 'Dear {name}, your AIRVOICE monthly installment of LKR {amount} has been deducted from your {month} salary at {camp}. Remaining: {remaining} months. Thank you. - AIRVOICE Finance' },
  { id: 'deduction_failed', name: 'Deduction Failed', channel: 'WhatsApp + SMS', template: 'Dear {name}, we were unable to process your AIRVOICE installment for {month}. Please contact your camp payroll officer or call AIRVOICE on +94 11 234 5678. Ref: {appId}.' },
  { id: 'application_approved', name: 'Application Approved', channel: 'WhatsApp + Email', template: 'Congratulations {name}! Your AIRVOICE phone application {appId} for {phone} has been approved. Your sales officer will contact you to arrange collection. Monthly installment: LKR {amount}.' },
  { id: 'guarantor_request', name: 'Guarantor Request', channel: 'WhatsApp + App', template: 'Dear Guarantor, {name} has listed you as guarantor for an AIRVOICE phone installment (LKR {amount}/month x {months} months). Please login to the AIRVOICE app to approve or decline. Ref: {appId}.' },
  { id: 'overdue_notice', name: 'Overdue Notice', channel: 'WhatsApp + SMS', template: 'Dear {name}, your AIRVOICE installment for {phone} (LKR {amount}) is overdue. Please contact your camp salary officer or call us on +94 11 234 5678 immediately to avoid further action.' },
];

async function run() {
  console.log('Seeding system_settings...');
  for (const s of DEFAULT_SETTINGS) {
    const { error } = await sb.from('system_settings').upsert(
      { key: s.key, value: s.value, description: s.description, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) console.error('  Error seeding', s.key, ':', error.message);
    else console.log('  OK:', s.key, '=', s.value);
  }

  console.log('\nSeeding message_templates...');
  for (const t of DEFAULT_TEMPLATES) {
    const { error } = await sb.from('message_templates').upsert(
      { id: t.id, name: t.name, channel: t.channel, template: t.template, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    if (error) console.error('  Error seeding', t.id, ':', error.message);
    else console.log('  OK:', t.id);
  }

  console.log('\nDone!');
}
run();
