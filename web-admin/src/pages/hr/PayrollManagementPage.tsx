import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi, payrollApi } from '@/services/api';
import {
  BadgeDollarSign, Scissors, Plus, CheckCircle2, XCircle,
  Loader2, AlertCircle, Tag, Calendar
} from 'lucide-react';

interface StaffMember { id: string; full_name: string; designation: string; }
interface SalaryAdvance { id: string; staff_id: string; amount: number; request_date: string; deduction_month: string; status: string; }
interface SalaryDeduction { id: string; staff_id: string; deduction_type: string; amount: number; effective_date: string; is_active: boolean; notes?: string; }

const DEDUCTION_COLORS: Record<string, string> = { loan: '#2563eb', epf: '#1d4ed8', etf: '#0284c7', other: '#6b7280' };
const ADV_STATUS: Record<string, { bg: string; text: string }> = {
  pending:  { bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-700 dark:text-sky-300' },
  approved: { bg: 'bg-green-500/15',  text: 'text-green-500'  },
  rejected: { bg: 'bg-red-500/15',    text: 'text-red-500'    },
  deducted: { bg: 'bg-blue-500/15',   text: 'text-blue-500'   },
};

type Tab = 'advances' | 'deductions';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PayrollManagementPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('advances');
  const [showAdvForm, setShowAdvForm] = useState(false);
  const [showDedForm, setShowDedForm] = useState(false);
  const [advForm, setAdvForm] = useState({ staff_id: '', amount: '', request_date: todayStr(), deduction_month: currentMonth() });
  const [dedForm, setDedForm] = useState({ staff_id: '', deduction_type: 'loan', amount: '', effective_date: todayStr(), notes: '' });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { data: staffList } = useQuery({
    queryKey: ['payroll-staff'],
    queryFn: () => payrollApi.listStaff().then(r => r.data.data as StaffMember[]),
  });

  // For demo, we display recently submitted ones from the API
  // The real data would come from backend queries, but we use optimistic local state for now
  const [localAdvances, setLocalAdvances] = useState<SalaryAdvance[]>([]);
  const [localDeductions, setLocalDeductions] = useState<SalaryDeduction[]>([]);

  const advMutation = useMutation({
    mutationFn: (data: unknown) => hrApi.createAdvance(data),
    onSuccess: (res) => {
      const d = res.data.data;
      setLocalAdvances(prev => [d, ...prev]);
      setSuccess('Salary advance recorded!');
      setShowAdvForm(false);
      setAdvForm({ staff_id: '', amount: '', request_date: todayStr(), deduction_month: currentMonth() });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to create advance'),
  });

  const dedMutation = useMutation({
    mutationFn: (data: unknown) => hrApi.createDeduction(data),
    onSuccess: (res) => {
      const d = res.data.data;
      setLocalDeductions(prev => [d, ...prev]);
      setSuccess('Deduction entry added!');
      setShowDedForm(false);
      setDedForm({ staff_id: '', deduction_type: 'loan', amount: '', effective_date: todayStr(), notes: '' });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to add deduction'),
  });

  const staffName = (id: string) => (staffList ?? []).find(s => s.id === id)?.full_name ?? '—';

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-600">
          <BadgeDollarSign size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Payroll Adjustments</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Salary advances and deductions (Loan, EPF, ETF)</p>
        </div>
      </div>

      {success && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/15 text-green-500 text-sm"><CheckCircle2 size={16} />{success}</div>}
      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/15 text-red-500 text-sm"><XCircle size={16} />{error}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
        {[
          { key: 'advances', label: 'Salary Advances', icon: <BadgeDollarSign size={14} /> },
          { key: 'deductions', label: 'Deductions', icon: <Scissors size={14} /> },
        ].map(t => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            onClick={() => { setTab(t.key as Tab); setError(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: tab === t.key ? 'var(--accent-primary)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--text-muted)',
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ADVANCES TAB */}
      {tab === 'advances' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              id="add-advance-btn"
              onClick={() => { setShowAdvForm(true); setError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <Plus size={14} /> New Advance
            </button>
          </div>

          {showAdvForm && (
            <div className="rounded-xl border border-blue-600 p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Salary Advance</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Employee', type: 'select', id: 'adv-staff' },
                  { label: 'Amount (LKR)', type: 'number', id: 'adv-amount' },
                  { label: 'Request Date', type: 'date', id: 'adv-req-date' },
                  { label: 'Deduction Month (YYYY-MM)', type: 'month', id: 'adv-ded-month' },
                ].map(field => (
                  <div key={field.id}>
                    <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>{field.label}</label>
                    {field.type === 'select' ? (
                      <select
                        id={field.id}
                        value={advForm.staff_id}
                        onChange={e => setAdvForm(f => ({ ...f, staff_id: e.target.value }))}
                        className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="">Select employee...</option>
                        {(staffList ?? []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    ) : (
                      <input
                        id={field.id}
                        type={field.type}
                        value={field.id === 'adv-amount' ? advForm.amount : field.id === 'adv-req-date' ? advForm.request_date : advForm.deduction_month}
                        onChange={e => {
                          const val = e.target.value;
                          if (field.id === 'adv-amount') setAdvForm(f => ({ ...f, amount: val }));
                          else if (field.id === 'adv-req-date') setAdvForm(f => ({ ...f, request_date: val }));
                          else setAdvForm(f => ({ ...f, deduction_month: val }));
                        }}
                        className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  id="submit-advance-btn"
                  onClick={() => advMutation.mutate({ ...advForm, amount: Number(advForm.amount) })}
                  disabled={!advForm.staff_id || !advForm.amount || advMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ opacity: (!advForm.staff_id || !advForm.amount) ? 0.5 : 1 }}
                >
                  {advMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save
                </button>
                <button onClick={() => setShowAdvForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>Cancel</button>
              </div>
            </div>
          )}

          {localAdvances.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
              <BadgeDollarSign size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No advances recorded yet. Use "New Advance" to add one.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                    {['Employee', 'Amount', 'Request Date', 'Deduction Month', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {localAdvances.map(adv => (
                    <tr key={adv.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{staffName(adv.staff_id)}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: '#f59e0b' }}>LKR {Number(adv.amount).toLocaleString()}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{adv.request_date}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{adv.deduction_month}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${ADV_STATUS[adv.status]?.bg ?? ''} ${ADV_STATUS[adv.status]?.text ?? ''}`}>
                          {adv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DEDUCTIONS TAB */}
      {tab === 'deductions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              id="add-deduction-btn"
              onClick={() => { setShowDedForm(true); setError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <Plus size={14} /> New Deduction
            </button>
          </div>

          {showDedForm && (
            <div className="rounded-xl border border-blue-600 p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Salary Deduction</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Employee</label>
                  <select
                    id="ded-staff-select"
                    value={dedForm.staff_id}
                    onChange={e => setDedForm(f => ({ ...f, staff_id: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Select employee...</option>
                    {(staffList ?? []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Deduction Type</label>
                  <select
                    id="ded-type-select"
                    value={dedForm.deduction_type}
                    onChange={e => setDedForm(f => ({ ...f, deduction_type: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="loan">Loan</option>
                    <option value="epf">EPF</option>
                    <option value="etf">ETF</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Amount (LKR)</label>
                  <input
                    id="ded-amount"
                    type="number"
                    value={dedForm.amount}
                    onChange={e => setDedForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Effective Date</label>
                  <input
                    id="ded-effective-date"
                    type="date"
                    value={dedForm.effective_date}
                    onChange={e => setDedForm(f => ({ ...f, effective_date: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Notes</label>
                  <input
                    id="ded-notes"
                    type="text"
                    value={dedForm.notes}
                    onChange={e => setDedForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="e.g. Bank loan EMI"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  id="submit-deduction-btn"
                  onClick={() => dedMutation.mutate({ ...dedForm, amount: Number(dedForm.amount) })}
                  disabled={!dedForm.staff_id || !dedForm.amount || dedMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ opacity: (!dedForm.staff_id || !dedForm.amount) ? 0.5 : 1 }}
                >
                  {dedMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save
                </button>
                <button onClick={() => setShowDedForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>Cancel</button>
              </div>
            </div>
          )}

          {localDeductions.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
              <Scissors size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No deductions recorded yet. Use "New Deduction" to add one.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                    {['Employee', 'Type', 'Amount', 'Effective Date', 'Notes'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {localDeductions.map(ded => {
                    const color = DEDUCTION_COLORS[ded.deduction_type] ?? '#6b7280';
                    return (
                      <tr key={ded.id} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{staffName(ded.staff_id)}</td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>
                            {ded.deduction_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold" style={{ color }}>LKR {Number(ded.amount).toLocaleString()}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{ded.effective_date}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{ded.notes ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
