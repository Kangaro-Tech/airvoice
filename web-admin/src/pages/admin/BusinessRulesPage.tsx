import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Smartphone,
  Coins,
  Trophy,
  Users2,
  AlertTriangle,
  AlertCircle,
  CalendarClock,
  Bot,
  Save,
  CircleCheck
} from 'lucide-react';

const BUSINESS_RULES = [
  { key: 'max_phones_per_customer', label: 'Max Phones Per Customer', type: 'number', defaultVal: 2, desc: 'Maximum active phone plans a single customer can hold.', Icon: Smartphone },
  { key: 'commission_per_sale', label: 'Commission Per Sale (LKR)', type: 'number', defaultVal: 250, desc: 'Fixed LKR amount paid to sales officer per confirmed first deduction.', Icon: Coins },
  { key: 'free_phone_milestone', label: 'Free Phone Milestone (Sales)', type: 'number', defaultVal: 100, desc: 'Number of camp sales needed for a sales officer to qualify for a free phone.', Icon: Trophy },
  { key: 'max_guarantors_per_person', label: 'Max Guarantor Obligations', type: 'number', defaultVal: 2, desc: 'Max number of customers one guarantor can cover simultaneously.', Icon: Users2 },
  { key: 'risk_score_threshold_high', label: 'High Risk Score Threshold', type: 'number', defaultVal: 50, desc: 'Risk score above this value flags customer as HIGH risk.', Icon: AlertTriangle },
  { key: 'risk_score_threshold_medium', label: 'Medium Risk Score Threshold', type: 'number', defaultVal: 25, desc: 'Risk score above this value flags customer as MEDIUM risk.', Icon: AlertCircle },
  { key: 'retirement_warning_months', label: 'Retirement Warning Window (months)', type: 'number', defaultVal: 24, desc: 'Customers retiring within this period are flagged for review.', Icon: CalendarClock },
  { key: 'ai_alerts_enabled', label: 'AI Risk Alerts Enabled', type: 'toggle', defaultVal: true, desc: 'Enable AI-powered risk analysis and financial alerts on dashboard.', Icon: Bot },
];

export default function BusinessRulesPage() {
  const [ruleValues, setRuleValues] = useState<Record<string, any>>(
    Object.fromEntries(BUSINESS_RULES.map(r => [r.key, r.defaultVal]))
  );
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  return (
    <div style={{ padding: 24, backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100%' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#0d1f3c', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CircleCheck size={16} color="#4ade80" />{toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlidersHorizontal size={28} color="#2563ea" />
          Business Rules
        </h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Core rules that govern eligibility, risk, and commissions
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Business Configuration</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Update the system-wide business rules</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => showToast('Business rules saved ✓')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                <Save size={14} /> Save Changes
              </button>
            </div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {BUSINESS_RULES.map(rule => (
              <div key={rule.key} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <rule.Icon size={17} color="#1d4ed8" />
                </div>
                <div style={{ flex: 1, marginRight: 24 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{rule.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rule.desc}</div>
                </div>
                {rule.type === 'toggle' ? (
                  <button
                    onClick={() => setRuleValues(p => ({ ...p, [rule.key]: !p[rule.key] }))}
                    style={{ width: 44, height: 24, borderRadius: 12, background: ruleValues[rule.key] ? '#2563eb' : 'var(--bg-surface-3)', position: 'relative', cursor: 'pointer', border: 'none', flexShrink: 0 }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: ruleValues[rule.key] ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                ) : (
                  <input
                    type="number"
                    value={ruleValues[rule.key]}
                    onChange={e => setRuleValues(p => ({ ...p, [rule.key]: Number(e.target.value) }))}
                    style={{ width: 90, padding: '7px 10px', border: '1.5px solid var(--input-border)', borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center', color: 'var(--text-primary)', backgroundColor: 'var(--input-bg)', fontFamily: 'JetBrains Mono, monospace' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
