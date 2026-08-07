import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import {
  BadgeDollarSign, ClipboardList, Plus, CheckCircle2, XCircle,
  Loader2, AlertCircle
} from 'lucide-react';

const REQ_STATUS: Record<string, { bg: string; text: string }> = {
  pending:  { bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-700 dark:text-sky-300' },
  approved: { bg: 'bg-green-500/15',  text: 'text-green-500'  },
  rejected: { bg: 'bg-red-500/15',    text: 'text-red-500'    },
  deducted: { bg: 'bg-blue-500/15',   text: 'text-blue-500'   },
};

const ADV_STATUS: Record<string, { bg: string; text: string }> = {
  pending:  { bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-700 dark:text-sky-300' },
  approved: { bg: 'bg-green-500/15',  text: 'text-green-500'  },
  rejected: { bg: 'bg-red-500/15',    text: 'text-red-500'    },
  deducted: { bg: 'bg-blue-500/15',   text: 'text-blue-500'   },
};

const LEAVE_TYPES = ['annual', 'casual', 'medical', 'no_pay'];
const LEAVE_TYPE_COLORS: Record<string, string> = {
  annual: '#2563eb',
  casual: '#1d4ed8',
  medical: '#0284c7',
  no_pay: '#ef4444',
};

function todayStr() { return new Date().toISOString().split('T')[0]; }
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MyRequestsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'advances' | 'leaves'>('advances');
  
  const [showAdvForm, setShowAdvForm] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  
  const [advForm, setAdvForm] = useState({ amount: '', request_date: todayStr(), deduction_month: currentMonth() });
  const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
  
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Validate if date is >= 21
  const isAfterCutoff = new Date().getDate() >= 21;

  // Queries
  const { data: advances, isLoading: loadingAdvances } = useQuery({
    queryKey: ['my-advances', user?.id],
    // Do NOT pass staff_id — backend auto-resolves it from the authenticated user
    // via staff_registry.user_id lookup. Passing user?.id (auth id) would be wrong.
    queryFn: () => hrApi.listSalaryAdvances().then(r => r.data.data),
    enabled: !!user?.id && tab === 'advances',
  });

  const { data: leaveRequests, isLoading: loadingLeaves } = useQuery({
    queryKey: ['my-leaves', user?.id],
    // Same reason — let backend resolve staff_id from req.user.id
    queryFn: () => hrApi.listLeaveRequests().then(r => r.data.data),
    enabled: !!user?.id && tab === 'leaves',
  });

  // Mutations
  const advMutation = useMutation({
    mutationFn: (data: unknown) => hrApi.createAdvance(data),
    onSuccess: () => {
      setSuccess('Salary advance request submitted successfully!');
      setShowAdvForm(false);
      setAdvForm({ amount: '', request_date: todayStr(), deduction_month: currentMonth() });
      queryClient.invalidateQueries({ queryKey: ['my-advances'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to submit advance request'),
  });

  const leaveMutation = useMutation({
    mutationFn: (data: unknown) => hrApi.requestLeave(data),
    onSuccess: () => {
      setSuccess('Leave request submitted successfully!');
      setShowLeaveForm(false);
      setLeaveForm({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['my-leaves'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to submit leave request'),
  });

  if (!user) {
    return <div className="p-6 text-center">User not found</div>;
  }

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-600">
          <BadgeDollarSign size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>My Requests</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Manage your personal salary advance and leave requests</p>
        </div>
      </div>

      {success && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/15 text-green-500 text-sm"><CheckCircle2 size={16} />{success}</div>}
      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/15 text-red-500 text-sm"><XCircle size={16} />{error}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
        <button
          onClick={() => { setTab('advances'); setError(''); setSuccess(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'advances' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          style={tab === 'advances' ? {} : { color: 'var(--text-muted)' }}
        >
          <BadgeDollarSign size={14} /> My Salary Advances
        </button>
        <button
          onClick={() => { setTab('leaves'); setError(''); setSuccess(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'leaves' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          style={tab === 'leaves' ? {} : { color: 'var(--text-muted)' }}
        >
          <ClipboardList size={14} /> My Leave Requests
        </button>
      </div>

      {/* ADVANCES TAB */}
      {tab === 'advances' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowAdvForm(true); setError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <Plus size={14} /> New Advance Request
            </button>
          </div>

          {showAdvForm && (
            <div className="rounded-xl border border-blue-600 p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Salary Advance</h3>
              
              {isAfterCutoff && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/15 text-red-500 text-sm mb-4">
                  <AlertCircle size={16} /> Salary advance requests cannot be made on or after the 21st of the month.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Amount (LKR)</label>
                  <input
                    type="number"
                    value={advForm.amount}
                    onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="Enter amount"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Request Date</label>
                  <input
                    type="date"
                    value={advForm.request_date}
                    readOnly
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none opacity-70"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Deduction Month (YYYY-MM)</label>
                  <input
                    type="month"
                    value={advForm.deduction_month}
                    onChange={e => setAdvForm(f => ({ ...f, deduction_month: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  id="submit-advance-btn"
                  onClick={() => advMutation.mutate({ amount: Number(advForm.amount), request_date: advForm.request_date, deduction_month: advForm.deduction_month })}
                  disabled={!advForm.amount || advMutation.isPending || isAfterCutoff}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ opacity: (!advForm.amount || isAfterCutoff) ? 0.5 : 1 }}
                >
                  {advMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Submit Request
                </button>
                <button onClick={() => setShowAdvForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>Cancel</button>
              </div>
            </div>
          )}

          {loadingAdvances ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={24} style={{ color: 'var(--text-muted)' }} /></div>
          ) : !advances || advances.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
              <BadgeDollarSign size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No advances requested yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                    {['Amount', 'Request Date', 'Deduction Month', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {(advances || []).map((adv: any) => (
                    <tr key={adv.id} className="hover:bg-white/5 transition-colors">
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

      {/* LEAVES TAB */}
      {tab === 'leaves' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowLeaveForm(true); setError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <Plus size={14} /> New Leave Request
            </button>
          </div>

          {showLeaveForm && (
            <div className="rounded-xl border border-blue-600 p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Submit Leave Request</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Leave Type</label>
                  <select
                    value={leaveForm.leave_type}
                    onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none capitalize focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    {LEAVE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div></div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Start Date</label>
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>End Date</label>
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Reason</label>
                  <textarea
                    value={leaveForm.reason}
                    onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                    rows={2}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="Reason for leave..."
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => leaveMutation.mutate({ ...leaveForm })}
                  disabled={!leaveForm.start_date || !leaveForm.end_date || leaveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ opacity: (!leaveForm.start_date || !leaveForm.end_date) ? 0.5 : 1 }}
                >
                  {leaveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Submit Request
                </button>
                <button onClick={() => setShowLeaveForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>Cancel</button>
              </div>
            </div>
          )}

          {loadingLeaves ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
          ) : !leaveRequests || leaveRequests.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No leave requests found.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                    {['Leave Type', 'Dates', 'Reason', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {leaveRequests.map((req: any) => {
                    const color = LEAVE_TYPE_COLORS[req.leave_type] ?? '#94a3b8';
                    return (
                      <tr key={req.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
                            style={{ backgroundColor: `${color}20`, color }}>
                            {req.leave_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                          {req.start_date} to {req.end_date}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                          {req.reason || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${REQ_STATUS[req.status]?.bg ?? ''} ${REQ_STATUS[req.status]?.text ?? ''}`}>
                            {req.status}
                          </span>
                        </td>
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
