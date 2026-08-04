import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi, payrollApi } from '@/services/api';
import {
  ClipboardList, Plus, CheckCircle2, XCircle, Loader2, Calendar,
  AlertCircle, Info, Edit2, Save
} from 'lucide-react';
import { differenceInYears, differenceInDays, parseISO } from 'date-fns';

interface StaffMember { id: string; full_name: string; designation: string; joined_date?: string; }
interface LeaveBalance { id: string; staff_id: string; year: number; leave_type: string; allotted_days: number; used_days: number; }

// Leave entitlement rules based on years of service
function calcLeaveEntitlements(joinedDate: string, year: number) {
  const joined = parseISO(joinedDate);
  const yearStart = new Date(year, 0, 1);
  const yearsOfService = differenceInYears(yearStart, joined);
  
  // Standard Sri Lankan labour law entitlements (tweak per company policy)
  const annual = yearsOfService >= 5 ? 21 : yearsOfService >= 1 ? 14 : 7;
  const casual = 7;
  const medical = 7;
  return { annual, casual, medical };
}

const REQ_STATUS: Record<string, { bg: string; text: string }> = {
  pending:  { bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-700 dark:text-sky-300' },
  approved: { bg: 'bg-green-500/15',  text: 'text-green-500'  },
  rejected: { bg: 'bg-red-500/15',    text: 'text-red-500'    },
};

const LEAVE_TYPES = ['annual', 'casual', 'medical', 'no_pay'];
const LEAVE_TYPE_COLORS: Record<string, string> = {
  annual: '#2563eb',
  casual: '#1d4ed8',
  medical: '#0284c7',
  no_pay: '#ef4444',
};

export default function LeaveManagementPage() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState<'balances' | 'requests'>('balances');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showAddBalanceForm, setShowAddBalanceForm] = useState(false);
  const [reqForm, setReqForm] = useState({ staff_id: '', start_date: '', end_date: '', leave_type: 'annual', reason: '' });
  const [balanceForm, setBalanceForm] = useState({ staff_id: '', leave_type: 'annual', allotted_days: 0, year: currentYear });
  const [editingBalance, setEditingBalance] = useState<{ id: string, allotted: number, used: number } | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { data: staffList } = useQuery({
    queryKey: ['payroll-staff'],
    queryFn: () => payrollApi.listStaff().then(r => r.data.data as StaffMember[]),
  });

  const { data: balances, isLoading } = useQuery({
    queryKey: ['leave-balances', selectedStaff, selectedYear],
    queryFn: () => hrApi.listLeaveBalances({ ...(selectedStaff ? { staff_id: selectedStaff } : {}), year: selectedYear })
      .then(r => r.data.data as LeaveBalance[]),
    enabled: true,
  });

  const { data: requests, isLoading: loadingRequests } = useQuery({
    queryKey: ['leave-requests', selectedStaff],
    queryFn: () => hrApi.listLeaveRequests({ ...(selectedStaff ? { staff_id: selectedStaff } : {}) })
      .then(r => r.data.data as any[]),
    enabled: true,
  });

  const selectedStaffObj = useMemo(() => (staffList ?? []).find(s => s.id === selectedStaff), [staffList, selectedStaff]);

  // Auto-compute suggested entitlements if staff is selected
  const suggested = useMemo(() => {
    if (!selectedStaffObj?.joined_date) return null;
    return calcLeaveEntitlements(selectedStaffObj.joined_date, selectedYear);
  }, [selectedStaffObj, selectedYear]);

  const requestMutation = useMutation({
    mutationFn: (data: unknown) => hrApi.requestLeave(data),
    onSuccess: () => {
      setSuccess('Leave request submitted!');
      setShowRequestForm(false);
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to submit'),
  });

  const updateReqStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => hrApi.updateLeaveRequestStatus(id, { status }),
    onSuccess: () => {
      setSuccess('Leave request status updated!');
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to update status'),
  });

  const createBalanceMutation = useMutation({
    mutationFn: (data: unknown) => hrApi.createLeaveBalance(data),
    onSuccess: () => {
      setSuccess('Leave balance created successfully!');
      setShowAddBalanceForm(false);
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to create balance'),
  });

  const updateBalanceMutation = useMutation({
    mutationFn: (data: { id: string, allotted_days: number, used_days: number }) => hrApi.updateLeaveBalance(data.id, { allotted_days: data.allotted_days, used_days: data.used_days }),
    onSuccess: () => {
      setSuccess('Leave balance updated successfully!');
      setEditingBalance(null);
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to update balance'),
  });

  const staffBalances = (balances ?? []).filter(b => !selectedStaff || b.staff_id === selectedStaff);
  const pendingRequestsCount = (requests ?? []).filter(r => r.status === 'pending').length;

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-600">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Leave Management</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Manage leave balances based on employee join date</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAddBalanceForm(true); setShowRequestForm(false); setError(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
            style={{ color: 'var(--text-primary)' }}
          >
            <Plus size={14} /> Add Balance
          </button>
          <button
            id="new-leave-request-btn"
            onClick={() => { setShowRequestForm(true); setShowAddBalanceForm(false); setError(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            <Plus size={14} /> New Request
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
        <button
          onClick={() => { setTab('balances'); setError(''); setSuccess(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'balances' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          style={tab === 'balances' ? {} : { color: 'var(--text-muted)' }}
        >
          <ClipboardList size={14} /> Leave Balances
        </button>
        <button
          onClick={() => { setTab('requests'); setError(''); setSuccess(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'requests' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          style={tab === 'requests' ? {} : { color: 'var(--text-muted)' }}
        >
          <CheckCircle2 size={14} /> Leave Requests
          {pendingRequestsCount > 0 && (
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
              tab === 'requests' ? 'bg-white text-blue-600' : 'bg-orange-500 text-white'
            }`}>{pendingRequestsCount}</span>
          )}
        </button>
      </div>

      {success && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/15 text-green-500 text-sm"><CheckCircle2 size={16} />{success}</div>}
      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/15 text-red-500 text-sm"><XCircle size={16} />{error}</div>}

      {/* Leave Request Form */}
      {showRequestForm && (
        <div className="rounded-xl border border-blue-600 p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Submit Leave Request</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Employee</label>
              <select
                id="leave-staff-select"
                value={reqForm.staff_id}
                onChange={e => setReqForm(f => ({ ...f, staff_id: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="">Select employee...</option>
                {(staffList ?? []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Leave Type</label>
              <select
                id="leave-type-select"
                value={reqForm.leave_type}
                onChange={e => setReqForm(f => ({ ...f, leave_type: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none capitalize focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                {LEAVE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Start Date</label>
              <input
                id="leave-start-date"
                type="date"
                value={reqForm.start_date}
                onChange={e => setReqForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>End Date</label>
              <input
                id="leave-end-date"
                type="date"
                value={reqForm.end_date}
                onChange={e => setReqForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Reason</label>
              <textarea
                id="leave-reason"
                value={reqForm.reason}
                onChange={e => setReqForm(f => ({ ...f, reason: e.target.value }))}
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="Reason for leave..."
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              id="submit-leave-request"
              onClick={() => requestMutation.mutate(reqForm)}
              disabled={!reqForm.staff_id || !reqForm.start_date || !reqForm.end_date || requestMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ opacity: (!reqForm.staff_id || !reqForm.start_date || !reqForm.end_date) ? 0.5 : 1 }}
            >
              {requestMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Submit
            </button>
            <button onClick={() => setShowRequestForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Add Leave Balance Form */}
      {showAddBalanceForm && (
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Add Leave Balance</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Employee</label>
              <select
                value={balanceForm.staff_id}
                onChange={e => setBalanceForm(f => ({ ...f, staff_id: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="">Select employee...</option>
                {(staffList ?? []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Leave Type</label>
              <select
                value={balanceForm.leave_type}
                onChange={e => setBalanceForm(f => ({ ...f, leave_type: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none capitalize focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                {LEAVE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Allotted Days</label>
              <input
                type="number"
                min="0"
                value={balanceForm.allotted_days}
                onChange={e => setBalanceForm(f => ({ ...f, allotted_days: Number(e.target.value) }))}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createBalanceMutation.mutate(balanceForm)}
              disabled={!balanceForm.staff_id || createBalanceMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ opacity: (!balanceForm.staff_id) ? 0.5 : 1 }}
            >
              {createBalanceMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Save Balance
            </button>
            <button onClick={() => setShowAddBalanceForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      {tab === 'balances' && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Employee</label>
            <select
              id="balance-staff-filter"
              value={selectedStaff}
              onChange={e => setSelectedStaff(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="">All Staff</option>
              {(staffList ?? []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Year</label>
            <select
              id="balance-year-filter"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Suggested leave entitlements info box */}
      {tab === 'balances' && selectedStaffObj?.joined_date && suggested && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-900">
          <Info size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Suggested Leave Entitlements for {selectedStaffObj.full_name} ({selectedYear})
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Based on join date <strong>{selectedStaffObj.joined_date}</strong>:&nbsp;
              Annual: <strong>{suggested.annual} days</strong> · Casual: <strong>{suggested.casual} days</strong> · Medical: <strong>{suggested.medical} days</strong>
            </p>
          </div>
        </div>
      )}

      {/* Leave Balances Table */}
      {tab === 'balances' && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
          ) : staffBalances.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No leave balances found.</p>
              {!selectedStaff && <p className="text-xs mt-1">Select an employee to see their leave balances.</p>}
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Employee</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Leave Type</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Allotted</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Used</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Remaining</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {staffBalances.map(bal => {
                const remaining = bal.allotted_days - bal.used_days;
                const pct = bal.allotted_days > 0 ? (bal.used_days / bal.allotted_days) * 100 : 0;
                const color = LEAVE_TYPE_COLORS[bal.leave_type] ?? '#94a3b8';
                return (
                  <tr key={bal.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {(staffList ?? []).find(s => s.id === bal.staff_id)?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
                        style={{ backgroundColor: `${color}20`, color }}>
                        {bal.leave_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {editingBalance?.id === bal.id ? (
                        <input type="number" min="0" value={editingBalance.allotted} onChange={e => setEditingBalance({ ...editingBalance, allotted: Number(e.target.value) })} className="w-16 text-center text-sm px-1 py-1 rounded border outline-none" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                      ) : bal.allotted_days}
                    </td>
                    <td className="px-4 py-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {editingBalance?.id === bal.id ? (
                        <input type="number" min="0" value={editingBalance.used} onChange={e => setEditingBalance({ ...editingBalance, used: Number(e.target.value) })} className="w-16 text-center text-sm px-1 py-1 rounded border outline-none" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                      ) : bal.used_days}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold" style={{ color: remaining < 3 ? '#ef4444' : '#22c55e' }}>{remaining}</span>
                      <div className="mt-1 h-1 rounded-full w-16 mx-auto overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? '#ef4444' : color }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingBalance?.id === bal.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => updateBalanceMutation.mutate({ id: bal.id, allotted_days: editingBalance.allotted, used_days: editingBalance.used })} disabled={updateBalanceMutation.isPending} className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950/50">
                            {updateBalanceMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          </button>
                          <button onClick={() => setEditingBalance(null)} className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50">
                            <XCircle size={16} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingBalance({ id: bal.id, allotted: bal.allotted_days, used: bal.used_days })} className="p-1 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50">
                          <Edit2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* Leave Requests Table */}
      {tab === 'requests' && (
        <>
          {loadingRequests ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
          ) : !requests || requests.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No leave requests found.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Employee</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Leave Type</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Dates</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Reason</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {requests.map(req => {
                    const color = LEAVE_TYPE_COLORS[req.leave_type] ?? '#94a3b8';
                    return (
                      <tr key={req.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                          {req.staff?.full_name ?? '—'}
                        </td>
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
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${REQ_STATUS[req.status]?.bg ?? ''} ${REQ_STATUS[req.status]?.text ?? ''}`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {req.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => updateReqStatusMutation.mutate({ id: req.id, status: 'approved' })} disabled={updateReqStatusMutation.isPending} className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950/50" title="Approve">
                                <CheckCircle2 size={16} />
                              </button>
                              <button onClick={() => updateReqStatusMutation.mutate({ id: req.id, status: 'rejected' })} disabled={updateReqStatusMutation.isPending} className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50" title="Reject">
                                <XCircle size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
