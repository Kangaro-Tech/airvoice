import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import {
  CheckCircle, XCircle, Minus, Download, AlertTriangle,
  FileText, Clock, ChevronDown, Send, TrendingUp, Eye,
  Building2, Lock, Users, Percent, PauseCircle, History, CalendarClock, MapPin, Trash2, Loader2, Plus, X, Heart,
} from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const REASONS_LABELS: Record<string, string> = {
  salary_insufficient: 'Salary Insufficient',
  absent_authorised: 'Absent (Authorised)',
  absent_unauthorised: 'Absent (Unauthorised)',
  retired: 'Retired',
  transferred: 'Transferred',
  deceased: 'Deceased',
  left_service: 'Left Service',
  wrong_details: 'Wrong Details',
  other: 'Other',
};
const REASONS = Object.keys(REASONS_LABELS);

const BRANCH_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  army:      { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Sri Lanka Army' },
  navy:      { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Sri Lanka Navy' },
  air_force: { bg: 'bg-sky-100',    text: 'text-sky-800',    label: 'Sri Lanka Air Force' },
};

const TABS = ['Deduction Entry', 'Past Submissions', 'Retirement Watch', 'Approvals'] as const;
type Tab = typeof TABS[number];

// icon per tab
const TAB_ICONS: Record<Tab, React.ElementType> = {
  'Deduction Entry':   FileText,
  'Past Submissions':  History,
  'Retirement Watch':  CalendarClock,
  'Approvals':         Eye,
};

// icon + color per summary stat
const STAT_META: Record<string, { icon: React.ElementType; color: string }> = {
  'Total Plans':  { icon: Users,        color: 'text-base-primary' },
  'Deducted':     { icon: CheckCircle,  color: 'text-green-700' },
  'Partial':      { icon: PauseCircle,  color: 'text-amber-700' },
  'Not Deducted': { icon: XCircle,      color: 'text-red-700' },
  'Success Rate': { icon: Percent,      color: 'text-blue-700' },
};

/* ─── Small trend bar chart ─────────────────────────────────── */
function TrendBar({ data }: { data: { label: string; rate: number; total: number }[] }) {
  const max = Math.max(...data.map(d => d.rate), 1);
  return (
    <div className="flex items-end gap-2 h-20">
      {data.map(({ label, rate, total }) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-base-muted">{rate}%</span>
          <div className="w-full surface-2 rounded-t-sm overflow-hidden" style={{ height: '48px' }}>
            <div
              className="w-full rounded-t-sm transition-all duration-700"
              style={{
                height: `${(rate / max) * 100}%`,
                background: rate >= 80 ? '#22c55e' : rate >= 60 ? '#f59e0b' : '#ef4444',
                minHeight: total > 0 ? '4px' : '0',
              }}
            />
          </div>
          <span className="text-[10px] text-base-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Status badge ──────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    deducted:    'bg-green-100 text-green-800',
    partial:     'bg-amber-100 text-amber-800',
    not_deducted:'bg-red-100 text-red-700',
    pending:     'surface-2 text-gray-600',
  };
  const labels: Record<string, string> = {
    deducted:    'Deducted in Full',
    partial:     'Partial',
    not_deducted:'Not Deducted',
    pending:     'Pending',
  };
  const icons: Record<string, React.ReactNode> = {
    deducted:     <CheckCircle size={11} />,
    partial:      <PauseCircle size={11} />,
    not_deducted: <XCircle size={11} />,
    pending:      <Clock size={11} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'surface-2 text-gray-600'}`}>
      {icons[status] ?? <Minus size={11} />}
      {labels[status] ?? status}
    </span>
  );
}

/* ─── Deduction row ─────────────────────────────────────────── */
function InstRow({
  inst, isLocked, isPending, onUpdate,
}: {
  inst: Record<string, unknown>;
  isLocked: boolean;
  isPending: boolean;
  onUpdate: (status: string, amount?: number, reason?: string, notes?: string) => void;
}) {
  const app   = inst.application as Record<string, unknown> | null;
  const cust  = app?.customer   as Record<string, unknown> | null;
  
  const [localStatus, setLocalStatus] = useState(inst.status as string);
  const [localReason, setLocalReason] = useState((inst.not_deducted_reason as string) || '');
  const [localAmount, setLocalAmount] = useState(inst.deducted_amount ? Number(inst.deducted_amount) : Number(inst.expected_amount || 0));

  useEffect(() => {
    setLocalStatus(inst.status as string);
    setLocalReason((inst.not_deducted_reason as string) || '');
    setLocalAmount(inst.deducted_amount ? Number(inst.deducted_amount) : Number(inst.expected_amount || 0));
  }, [inst.status, inst.not_deducted_reason, inst.deducted_amount, inst.expected_amount]);

  const handleStatusChange = (newStatus: string) => {
    setLocalStatus(newStatus);
    let amount: number | undefined;
    if (newStatus === 'deducted') {
      amount = Number(inst.expected_amount || 0);
      setLocalAmount(amount);
      onUpdate(newStatus, amount);
    } else if (newStatus === 'pending') {
      onUpdate(newStatus, 0);
    } else if (newStatus === 'partial') {
      onUpdate(newStatus, localAmount);
    } else if (newStatus === 'not_deducted') {
      amount = 0;
      setLocalAmount(amount);
      // Wait for reason to be selected before hitting API
      if (localReason) {
        onUpdate(newStatus, amount, localReason);
      }
    }
  };

  const handleReasonChange = (newReason: string) => {
    setLocalReason(newReason);
    onUpdate('not_deducted', 0, newReason);
  };

  return (
    <tr
      className="transition-colors"
      style={{ backgroundColor: 'var(--bg-surface)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
    >
      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {(cust?.service_number as string) || '—'}
      </td>
      <td className="px-4 py-3 capitalize" style={{ color: 'var(--text-secondary)' }}>
        {(cust?.rank as string) || '—'}
      </td>
      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
        {(cust?.full_name as string) || '—'}
      </td>
      <td className="px-4 py-3 font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
        LKR {Number(inst.expected_amount || 0).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <select
          className="form-input text-xs py-1.5 px-2 min-w-[130px]"
          value={localStatus}
          disabled={isLocked || isPending}
          onChange={e => handleStatusChange(e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="deducted">Deducted</option>
          <option value="partial">Partial</option>
          <option value="not_deducted">Not Deducted</option>
        </select>
      </td>
      <td className="px-4 py-3">
        {localStatus === 'not_deducted' && (
          <select
            className="form-input text-xs py-1.5 px-2 min-w-[180px]"
            value={localReason}
            disabled={isLocked || isPending}
            onChange={e => handleReasonChange(e.target.value)}
          >
            <option value="">Select reason…</option>
            {REASONS.map(r => <option key={r} value={r}>{REASONS_LABELS[r]}</option>)}
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        {localStatus === 'partial' ? (
          <input
            type="number"
            className="form-input text-xs py-1.5 px-2 w-24"
            value={localAmount || ''}
            disabled={isLocked || isPending}
            onChange={e => {
              const val = Number(e.target.value);
              setLocalAmount(val);
            }}
            onBlur={() => {
              if (localAmount !== inst.deducted_amount || localStatus !== inst.status) {
                onUpdate('partial', localAmount);
              }
            }}
          />
        ) : localStatus === 'deducted' ? (
          <span className="text-xs font-semibold text-green-600">LKR {Number(inst.expected_amount || 0).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-base-muted">—</span>
        )}
      </td>
    </tr>
  );
}


/* ─── Main page ─────────────────────────────────────────────── */
export default function CampPortalPage() {
  const navigate = useNavigate();
  const now = new Date();
  const { user } = useAuthStore();
  const [tab, setTab]     = useState<Tab>('Deduction Entry');
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [campId, setCampId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showAddCamp, setShowAddCamp] = useState(false);
  const [addCampForm, setAddCampForm] = useState({
    name: '', name_si: '', branch: 'army' as 'army' | 'navy' | 'air_force',
    district: '', province: '', address: '',
  });
  const [addCampError, setAddCampError] = useState('');
  const [addCampSubmitting, setAddCampSubmitting] = useState(false);
  const qc = useQueryClient();

  const hasAccess = ['super_admin', 'admin', 'finance_officer', 'accountant'].includes(user?.role || '');
  const isLocked = now.getDate() > 25 && !hasAccess;

  // Camps list
  const { data: campsRes, isLoading: campsLoading, isError: campsError } = useQuery({
    queryKey: ['camps'],
    queryFn: () => api.get('/camps').then(r => (r.data.data || []) as Record<string, unknown>[]),
  });
  const activeCamp = campId || (campsRes?.[0]?.id as string) || '';
  const campInfo   = campsRes?.find(c => c.id === activeCamp);
  const branch     = campInfo?.branch as string | undefined;
  const branchStyle = BRANCH_COLORS[branch ?? ''] ?? { bg: 'surface-2', text: 'text-gray-600', label: 'Unknown Branch' };

  // Monthly deduction sheet
  const { data: sheet, isLoading, isError: sheetError } = useQuery({
    queryKey: ['camp-sheet', activeCamp, year, month],
    queryFn: () => activeCamp
      ? api.get(`/deductions/camp/${activeCamp}/sheet`, { params: { year, month } }).then(r => r.data)
      : null,
    enabled: !!activeCamp,
  });

  // 6-month trend
  const { data: trendRes } = useQuery({
    queryKey: ['camp-trend', activeCamp],
    queryFn: () => activeCamp
      ? api.get(`/deductions/camp/${activeCamp}/trend`).then(r => r.data)
      : null,
    enabled: !!activeCamp,
  });

  // Past submissions
  const { data: pastRes } = useQuery({
    queryKey: ['camp-past', activeCamp],
    queryFn: () => activeCamp
      ? api.get(`/deductions/camp/${activeCamp}/past-submissions`).then(r => r.data)
      : null,
    enabled: !!activeCamp && tab === 'Past Submissions',
  });

  // Retirement watch
  const { data: retirementRes } = useQuery({
    queryKey: ['camp-retirement', activeCamp],
    queryFn: () => activeCamp
      ? api.get(`/deductions/camp/${activeCamp}/retirement-watch`).then(r => r.data)
      : null,
    enabled: !!activeCamp && tab === 'Retirement Watch',
  });

  const installments: Record<string, unknown>[] = sheet?.data ?? [];
  const summary: Record<string, unknown> | null  = sheet?.summary ?? null;
  const trend: { label: string; rate: number; total: number }[] = trendRes?.data ?? [];
  const pastBatches: Record<string, unknown>[] = pastRes?.data ?? [];
  const retirees: Record<string, unknown>[]    = retirementRes?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ instId, status, amount, reason, notes }: {
      instId: string; status: string; amount?: number; reason?: string; notes?: string;
    }) => {
      // Build payload — only include fields that have real values
      const payload: Record<string, unknown> = { status };
      if (amount !== undefined) payload.deducted_amount = amount;
      if (reason) payload.not_deducted_reason = reason;
      if (notes) payload.not_deducted_notes = notes;
      return api.patch(`/deductions/${instId}`, payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-sheet', activeCamp, year, month] }),
    onError: (err: any) => {
      const msg = err?.response?.data?.details?.fieldErrors
        ? JSON.stringify(err.response.data.details.fieldErrors)
        : err?.response?.data?.error ?? err?.message ?? 'Unknown error';
      alert(`Save failed: ${msg}`);
    },
  });

  const bulkSubmitMutation = useMutation({
    mutationFn: () => {
      // Submitting the sheet implies that all pending items are fully deducted
      // while preserving any explicitly updated statuses (partial or not_deducted).
      return api.post('/deductions/bulk-submit', {
        camp_id: activeCamp,
        year,
        month,
        deductions: installments.map((i: any) => ({
          installment_id: i.id,
          status: i.status === 'pending' ? 'deducted' : i.status,
          deducted_amount: i.status === 'pending' ? i.expected_amount : i.deducted_amount,
          not_deducted_reason: i.not_deducted_reason || undefined,
          not_deducted_notes: i.not_deducted_notes || undefined,
        })),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camp-sheet', activeCamp, year, month] }),
  });

  const deleteCamp = useMutation({
    mutationFn: () => api.delete(`/camps/${activeCamp}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['camps'] });
      setDeleteConfirm(false);
      setDeleteError('');
      setCampId(''); // Reset selection
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.error ?? 'Failed to delete camp');
    }
  });

  const submitAddCamp = async () => {
    if (!addCampForm.name.trim()) { setAddCampError('Camp name is required.'); return; }
    setAddCampError(''); setAddCampSubmitting(true);
    try {
      const res = await api.post('/camps', {
        name:     addCampForm.name.trim(),
        ...(addCampForm.name_si.trim()  ? { name_si:  addCampForm.name_si.trim()  } : {}),
        branch:   addCampForm.branch,
        ...(addCampForm.district.trim() ? { district: addCampForm.district.trim() } : {}),
        ...(addCampForm.province.trim() ? { province: addCampForm.province.trim() } : {}),
        ...(addCampForm.address.trim()  ? { address:  addCampForm.address.trim()  } : {}),
      });
      qc.invalidateQueries({ queryKey: ['camps'] });
      setCampId(res.data.data.id); // Auto-select new camp
      setShowAddCamp(false);
      setAddCampForm({ name: '', name_si: '', branch: 'army', district: '', province: '', address: '' });
    } catch (e: any) {
      setAddCampError(e?.response?.data?.error ?? 'Failed to create camp');
    } finally { setAddCampSubmitting(false); }
  };


  const handleExport = async () => {
    try {
      const res = await api.get('/reports/monthly-deductions', {
        params: { year, month, camp_id: activeCamp, format: 'xlsx' },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `Deductions_${campInfo?.name ?? activeCamp}_${year}_${MONTHS[month - 1]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.parentNode?.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { alert('Export failed. Please try again.'); }
  };

  const handleCsvExport = () => {
    const headers = ['Service No', 'Rank', 'Name', 'Expected', 'Status', 'Reason', 'Collected'];
    const rows = installments.map((i: any) => {
      const cust = i.application?.customer ?? {};
      return [
        cust.service_number ?? '',
        cust.rank ?? '',
        cust.full_name ?? '',
        i.expected_amount ?? 0,
        i.status ?? '',
        i.not_deducted_reason ?? '',
        i.deducted_amount ?? 0,
      ];
    });
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `Deductions_${year}_${MONTHS[month - 1]}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-5">
      {/* Guard: show spinner while camps are loading or handle errors */}
      {campsLoading && !campsRes && (
        <div className="flex items-center justify-center py-24 text-base-muted text-sm gap-2">
          <svg className="animate-spin h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Loading camp data…
        </div>
      )}
      {campsError && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Failed to load camps</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>You may not have access, or the server is unreachable.</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-4 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      {campsRes && campsRes.length === 0 && (
        <div className="flex items-center justify-center py-24 text-base-muted text-sm">
          No camps found.
        </div>
      )}
      {campsRes && campsRes.length > 0 && <>

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <MapPin size={28} className="text-[#2563ea] shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-black text-base-primary">
                {campInfo ? String(campInfo.name) : 'Camp Deduction Portal'}
              </h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${branchStyle.bg} ${branchStyle.text}`}>
                {branchStyle.label}
              </span>
              {isLocked && (
                <span className="text-xs font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Lock size={11} /> Amounts Locked
                </span>
              )}
            </div>
            <p className="text-sm text-base-muted">
              Deduction Officer: <span className="font-semibold text-base-secondary">
                {user?.full_name ?? user?.phone_number ?? '—'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleCsvExport} className="flex items-center gap-1.5 text-xs px-3 py-2 border border-base rounded-lg hover:bg-[var(--bg-surface-2)] font-medium">
            <FileText size={14} /> Export CSV
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 text-xs px-3 py-2 border border-base rounded-lg hover:bg-[var(--bg-surface-2)] font-medium">
            <Download size={14} /> Download Excel
          </button>
          <button
            onClick={() => navigate('/donations')}
            className="flex items-center gap-1.5 text-xs px-3 py-2 border border-base rounded-lg hover:bg-[var(--bg-surface-2)] font-medium"
          >
            <Heart size={14} className="text-red-500" /> View Donations
          </button>
          <button
            onClick={() => bulkSubmitMutation.mutate()}
            disabled={bulkSubmitMutation.isPending || isLocked}
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Send size={14} className="text-white" />
            {bulkSubmitMutation.isPending ? 'Submitting…' : 'Submit Sheet'}
          </button>
          {(user?.role === 'super_admin' || user?.role === 'admin') && (
            <button
              onClick={() => { setShowAddCamp(true); setAddCampError(''); }}
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-[#2563ea] text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} className="text-white" />
              Camp Entry
            </button>
          )}
          {user?.role === 'super_admin' && (
            <button
              onClick={() => { setDeleteConfirm(true); setDeleteError(''); }}
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              <Trash2 size={14} className="text-white" />
              Delete Camp
            </button>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="form-label">Camp</label>
          <select
            className="form-input w-56"
            value={campId || activeCamp}
            onChange={e => setCampId(e.target.value)}
          >
            {(campsRes ?? []).map((c: Record<string, unknown>) => (
              <option key={c.id as string} value={c.id as string}>{c.name as string}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Year</label>
          <select className="form-input w-28" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Month</label>
          <select className="form-input w-36" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* ── Summary stats + Trend ── */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Plans',   value: String(summary.total_records ?? 0) },
              { label: 'Deducted',      value: String(summary.deducted_count ?? 0) },
              { label: 'Partial',       value: String(summary.partial_count ?? 0) },
              { label: 'Not Deducted',  value: String(summary.not_deducted_count ?? 0) },
              { label: 'Success Rate',  value: `${summary.success_rate ?? 0}%` },
            ].map(({ label, value }) => {
              const meta = STAT_META[label];
              const Icon = meta.icon;
              return (
                <div key={label} className="card p-4 flex items-start justify-between">
                  <div>
                    <div className={`text-2xl font-black ${meta.color}`}>{value}</div>
                    <div className="text-xs text-base-muted mt-0.5">{label}</div>
                  </div>
                  <Icon size={16} className={`${meta.color} opacity-70 mt-0.5`} />
                </div>
              );
            })}
          </div>
          {trend.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold text-base-muted uppercase mb-3 flex items-center gap-1.5">
                <TrendingUp size={13} /> 6-Month Deduction Rate
              </div>
              <TrendBar data={trend} />
            </div>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="border-b border-base">
        <nav className="flex gap-1">
          {TABS.map(t => {
            const Icon = TAB_ICONS[t];
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === t
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-base-muted hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon size={14} />
                {t}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab: Deduction Entry ── */}
      {tab === 'Deduction Entry' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: 'var(--bg-sidebar)', color: '#e6edf3' }} className="text-xs uppercase tracking-wider">
                <tr>
                  {['Service No', 'Rank', 'Customer', 'Expected (LKR)', 'Deduction Status', 'Reason (if not deducted)', 'Amount Deducted'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {isLoading ? (
                  <tr><td colSpan={7} className="py-12 text-center text-base-muted text-sm">Loading…</td></tr>
                ) : installments.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-base-muted text-sm">No records for this period</td></tr>
                ) : (
                  installments.map((inst, i) => (
                    <InstRow
                      key={inst.id as string}
                      inst={inst}
                      isLocked={isLocked}
                      isPending={updateMutation.isPending}
                      onUpdate={(status, amount, reason) =>
                        updateMutation.mutate({ instId: inst.id as string, status, amount, reason })
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Past Submissions ── */}
      {tab === 'Past Submissions' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-base">
            <h3 className="font-semibold text-sm text-base-secondary flex items-center gap-2">
              <Clock size={15} /> Submission History
            </h3>
          </div>
          {pastBatches.length === 0 ? (
            <div className="py-12 text-center text-base-muted text-sm">No past submissions found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="surface-2 border-b border-base">
                <tr>
                  {['Period', 'Records', 'Deducted', 'Expected', 'Total Collected', 'Rate', 'Submitted At'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pastBatches.map((b: any) => (
                  <tr key={b.id} className="hover:bg-[var(--bg-surface-2)]">
                    <td className="px-4 py-3 font-semibold text-base-primary">
                      {MONTHS[(b.submission_month ?? 1) - 1]} {b.submission_year}
                    </td>
                    <td className="px-4 py-3 text-base-secondary">{b.records_count ?? 0}</td>
                    <td className="px-4 py-3 text-green-700 font-semibold">{b.deducted_count ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">LKR {Number(b.total_expected ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-base-secondary font-semibold">LKR {Number(b.total_deducted ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        (b.deducted_count / b.records_count) * 100 >= 80
                          ? 'bg-green-100 text-green-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {b.records_count > 0 ? Math.round((b.deducted_count / b.records_count) * 100) : 0}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-base-muted">
                      {b.submitted_at ? new Date(b.submitted_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Retirement Watch ── */}
      {tab === 'Retirement Watch' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-base flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <h3 className="font-semibold text-sm text-base-secondary">Retiring Within 6 Months</h3>
          </div>
          {retirees.length === 0 ? (
            <div className="py-12 text-center text-base-muted text-sm">No customers retiring in the next 6 months</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="surface-2 border-b border-base">
                <tr>
                  {['Service No', 'Rank', 'Name', 'Retirement Date', 'Days Left', 'Active Plans'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {retirees.map((r: any) => {
                  const retDate  = new Date(r.retirement_date);
                  const daysLeft = Math.ceil((retDate.getTime() - Date.now()) / 86400000);
                  const active   = (r.applications ?? []).filter((a: any) => a.status === 'active').length;
                  return (
                    <tr key={r.id} className="hover:bg-amber-50/40">
                      <td className="px-4 py-3 font-mono text-xs text-base-secondary">{r.service_number}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs surface-2 text-gray-600 px-1.5 py-0.5 rounded">{r.rank}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-base-primary">{r.full_name}</td>
                      <td className="px-4 py-3 text-gray-600 flex items-center gap-1.5">
                        <CalendarClock size={12} className="text-base-muted" />
                        {retDate.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          daysLeft <= 60 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {daysLeft}d
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${active > 0 ? 'text-red-600' : 'text-base-muted'}`}>
                          {active} active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Approvals ── */}
      {tab === 'Approvals' && (
        <div className="card p-8 text-center text-base-muted">
          <Eye size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Applications awaiting camp officer approval are shown in the main Applications queue.</p>
          <p className="text-xs mt-1 text-gray-300">Filter by status = "camp_review" to see pending items.</p>
        </div>
      )}
      </>}

      {/* ── Add Camp Modal ── */}
      {showAddCamp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">

            {/* Header */}
            <div className="bg-[#0f172a] text-white flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <Building2 size={20} className="text-blue-400" />
                <h3 className="font-bold text-lg tracking-tight">Camp Entry</h3>
              </div>
              <button onClick={() => setShowAddCamp(false)} className="text-base-muted hover:text-white transition bg-[#1e293b] p-1.5 rounded-lg border border-slate-700">
                <X size={16} />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto max-h-[80vh]">
              {/* Info banner */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <MapPin size={18} className="text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Register a new camp</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Once created, the camp will appear in the portal selector and can be assigned to deduction officers and customers.</p>
                </div>
              </div>

              {addCampError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addCampError}</div>
              )}

              {/* Form grid */}
              <div className="grid grid-cols-12 gap-x-6 gap-y-5">

                {/* Camp Name */}
                <div className="col-span-8">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Camp Name <span className="text-red-500">*</span></label>
                  <input
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                    placeholder="e.g. Panagoda Cantonment"
                    value={addCampForm.name}
                    onChange={e => setAddCampForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>

                {/* Branch */}
                <div className="col-span-4">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Branch <span className="text-red-500">*</span></label>
                  <select
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                    value={addCampForm.branch}
                    onChange={e => setAddCampForm(f => ({ ...f, branch: e.target.value as 'army' | 'navy' | 'air_force' }))}
                  >
                    <option value="army">Sri Lanka Army</option>
                    <option value="navy">Sri Lanka Navy</option>
                    <option value="air_force">Sri Lanka Air Force</option>
                  </select>
                </div>

                {/* Sinhala Name */}
                <div className="col-span-12">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Sinhala Name (Optional)</label>
                  <input
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                    placeholder="සිංහල නාමය"
                    value={addCampForm.name_si}
                    onChange={e => setAddCampForm(f => ({ ...f, name_si: e.target.value }))}
                  />
                </div>

                {/* District */}
                <div className="col-span-6">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">District</label>
                  <input
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                    placeholder="e.g. Colombo"
                    value={addCampForm.district}
                    onChange={e => setAddCampForm(f => ({ ...f, district: e.target.value }))}
                  />
                </div>

                {/* Province */}
                <div className="col-span-6">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Province</label>
                  <select
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                    value={addCampForm.province}
                    onChange={e => setAddCampForm(f => ({ ...f, province: e.target.value }))}
                  >
                    <option value="">Select province…</option>
                    {['Western','Central','Southern','Northern','Eastern','North Western','North Central','Uva','Sabaragamuwa'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Address */}
                <div className="col-span-12">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Address</label>
                  <textarea
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 resize-none text-slate-700 transition"
                    rows={2}
                    placeholder="Full postal address…"
                    value={addCampForm.address}
                    onChange={e => setAddCampForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t border-base surface-2 flex justify-end gap-3">
              <button
                onClick={() => { setShowAddCamp(false); setAddCampError(''); }}
                className="px-5 py-2.5 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitAddCamp}
                disabled={addCampSubmitting}
                className="px-5 py-2.5 text-sm font-semibold bg-[#2563ea] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition"
              >
                {addCampSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {addCampSubmitting ? 'Creating…' : 'Create Camp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Camp Modal */}
      {deleteConfirm && campInfo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <div className="font-bold text-base-primary">Delete Camp?</div>
                <div className="text-xs text-base-muted mt-0.5">{campInfo.name as string}</div>
              </div>
            </div>
            <p className="text-sm text-base-secondary mb-4">This will deactivate the camp. It cannot be undone easily. Ensure no active customers are assigned before proceeding.</p>
            {deleteError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{deleteError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setDeleteConfirm(false); setDeleteError(''); }} className="flex-1 py-2 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => deleteCamp.mutate()}
                disabled={deleteCamp.isPending}
                className="flex-1 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleteCamp.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}