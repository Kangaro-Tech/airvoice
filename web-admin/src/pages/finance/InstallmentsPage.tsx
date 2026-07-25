import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, deductionsApi } from '@/services/api';
import {
  Download, FileText, CheckCircle, Clock, AlertTriangle,
  X, Building, Check, RefreshCw, ChevronDown, Send, Loader2, Upload, FileSpreadsheet, CreditCard
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const REASONS = [
  { v: 'salary_insufficient', l: 'Salary insufficient' },
  { v: 'absent_authorised', l: 'Absent (authorised)' },
  { v: 'absent_unauthorised', l: 'Absent (unauthorised)' },
  { v: 'retired', l: 'Retired' },
  { v: 'transferred', l: 'Transferred' },
  { v: 'deceased', l: 'Deceased' },
  { v: 'left_service', l: 'Left service' },
  { v: 'wrong_details', l: 'Wrong bank details' },
  { v: 'other', l: 'Other' },
];

const STATUS_BADGES: Record<string, string> = {
  deducted: 'bg-green-500/20 text-green-400 border-green-500/30',
  pending: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  not_deducted: 'bg-red-500/20 text-red-400 border-red-500/30',
  partial: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  arrears: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  deducted: 'Deducted', pending: 'Pending', not_deducted: 'Not Deducted',
  partial: 'Partial', arrears: 'Arrears',
};

// small icon per status, shown inside the badge
const STATUS_ICONS: Record<string, React.ReactNode> = {
  deducted: <CheckCircle size={11} className="text-green-400" />,
  pending: <Clock size={11} className="text-slate-400" />,
  not_deducted: <AlertTriangle size={11} className="text-red-400" />,
  partial: <RefreshCw size={11} className="text-amber-400" />,
  arrears: <AlertTriangle size={11} className="text-red-400" />,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Installment = {
  id: string;
  status: string;
  expected_amount: number;
  deducted_amount: number | null;
  arrears_amount: number | null;
  not_deducted_reason: string | null;
  not_deducted_notes: string | null;
  due_year: number;
  due_month: number;
  month_number: number;
  application?: {
    ref_number: string;
    monthly_amount: number;
    customer?: {
      id: string;
      full_name: string;
      service_number: string;
      rank: string;
      nic_number: string;
      camp_id: string;
    };
  };
};

type CampSheetSummary = {
  year: number;
  month: number;
  camp_id: string;
  total_records: number;
  deducted_count: number;
  partial_count: number;
  not_deducted_count: number;
  pending_count: number;
  total_expected: number;
  total_deducted: number;
  success_rate: number;
};

type Camp = { id: string; name: string; branch: string; };

// ─── Local row edits (before submit) ─────────────────────────────────────────
type RowEdit = {
  status: string;
  deducted_amount: number | null;
  not_deducted_reason: string;
};

// ─────────────────────────────────────────────────────────────────────────────
export default function InstallmentsPage() {
  const qc = useQueryClient();
  const now = new Date();

  // ── View state ─────────────────────────────────────────────────────────────
  const [view, setView] = useState<'dashboard' | 'camp_entry'>('dashboard');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [campId, setCampId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // ── Local edits map (campId-keyed row changes not yet submitted) ────────────
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});

  // ── Submit result ────────────────────────────────────────────────────────────
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // ── Excel Import ─────────────────────────────────────────────────────────────
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [excelImportResult, setExcelImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  const excelImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(
        `/deductions/camp/${campId}/excel-import?year=${year}&month=${month}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      ).then(r => r.data);
    },
    onSuccess: (res) => {
      setExcelImportResult({ success: true, message: res.message ?? 'Import successful!' });
      qc.invalidateQueries({ queryKey: ['camp-sheet', campId, year, month] });
      qc.invalidateQueries({ queryKey: ['installments-dash', year, month] });
      if (excelFileRef.current) excelFileRef.current.value = '';
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Import failed';
      setExcelImportResult({ success: false, message: msg });
    },
  });

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && campId) {
      setExcelImportResult(null);
      excelImportMutation.mutate(file);
    }
  };

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: campsRes } = useQuery({
    queryKey: ['camps'],
    queryFn: () => api.get('/camps').then(r => r.data),
  });
  const camps = (campsRes?.data ?? []) as Camp[];

  const { data: installmentsRes, isLoading: dashLoading } = useQuery({
    queryKey: ['installments-dash', year, month],
    queryFn: () => api.get('/installments', { params: { year, month } }).then(r => r.data),
    enabled: view === 'dashboard',
  });
  const allInstallments = (installmentsRes?.data ?? []) as Installment[];

  const { data: campSheetRes, isLoading: sheetLoading, refetch: refetchSheet } = useQuery({
    queryKey: ['camp-sheet', campId, year, month],
    queryFn: () => deductionsApi.getCampSheet(campId, year, month).then(r => r.data),
    enabled: view === 'camp_entry' && !!campId,
  });
  const sheetRows = (campSheetRes?.data ?? []) as Installment[];
  const summary = campSheetRes?.summary as CampSheetSummary | undefined;

  const resetEdits = useCallback(() => setRowEdits({}), []);

  // ── Metrics (dashboard) ─────────────────────────────────────────────────────
  const deductedCount = allInstallments.filter(i => i.status === 'deducted').length;
  const pendingCount = allInstallments.filter(i => i.status === 'pending').length;
  const missedCount = allInstallments.filter(i => i.status === 'not_deducted').length;
  const partialCount = allInstallments.filter(i => i.status === 'partial').length;
  const deductedSum = allInstallments.filter(i => i.status === 'deducted').reduce((s, i) => s + Number(i.deducted_amount ?? 0), 0);
  const pendingSum = allInstallments.filter(i => i.status === 'pending').reduce((s, i) => s + Number(i.expected_amount ?? 0), 0);
  const missedSum = allInstallments.filter(i => i.status === 'not_deducted').reduce((s, i) => s + Number(i.expected_amount ?? 0), 0);

  const tabFiltered = statusFilter === 'all'
    ? allInstallments
    : allInstallments.filter(i => i.status === statusFilter);

  const resolvedRows = sheetRows.map(row => {
    const edit = rowEdits[row.id];
    return edit ? { ...row, ...edit } : row;
  });

  const effectiveSummary = {
    deducted: resolvedRows.filter(r => r.status === 'deducted').length,
    pending: resolvedRows.filter(r => r.status === 'pending').length,
    not_deducted: resolvedRows.filter(r => r.status === 'not_deducted').length,
    partial: resolvedRows.filter(r => r.status === 'partial').length,
  };

  const submitableRows = resolvedRows.filter(r => ['deducted', 'partial', 'not_deducted'].includes(r.status));
  const submitableExpected = submitableRows.reduce((sum, r) => sum + Number(r.expected_amount ?? 0), 0);
  const submitableCollected = submitableRows.reduce((sum, r) => {
    if (r.status === 'deducted' || r.status === 'partial') {
      return sum + Number(r.deducted_amount ?? r.expected_amount ?? 0);
    }
    return sum;
  }, 0);

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      deductionsApi.updateInstallment(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['camp-sheet', campId, year, month] });
      qc.invalidateQueries({ queryKey: ['installments-dash', year, month] });
    },
  });

  const bulkSubmitMutation = useMutation({
    mutationFn: (payload: unknown) => deductionsApi.bulkSubmit(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['camp-sheet', campId, year, month] });
      qc.invalidateQueries({ queryKey: ['installments-dash', year, month] });
      setRowEdits({});
      setSubmitResult({
        success: true,
        message: `Sheet submitted! ${res.data.summary?.deducted_count ?? 0} deducted · LKR ${(res.data.summary?.total_deducted ?? 0).toLocaleString()} collected.`
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Submission failed. Please try again.';
      setSubmitResult({ success: false, message: `Error: ${msg}` });
    },
  });

  const handleRowEdit = (id: string, field: keyof RowEdit, value: any) => {
    setRowEdits(prev => {
      const current = prev[id] || { status: 'pending', deducted_amount: null, not_deducted_reason: '' };
      return {
        ...prev,
        [id]: { ...current, [field]: value }
      };
    });
  };

  const handleStatusChange = (row: Installment, newStatus: string) => {
    handleRowEdit(row.id, 'status', newStatus);
    const payload: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'deducted') {
      payload.deducted_amount = row.expected_amount;
      payload.not_deducted_reason = null;
    } else if (newStatus === 'partial') {
      payload.not_deducted_reason = null;
    } else if (newStatus === 'pending') {
      payload.deducted_amount = 0;
      payload.not_deducted_reason = null;
    }
    updateMutation.mutate({ id: row.id, payload });
  };

  const handleReasonChange = (row: Installment, reason: string) => {
    const finalReason = reason || null;
    handleRowEdit(row.id, 'not_deducted_reason', finalReason);
    updateMutation.mutate({ id: row.id, payload: { status: 'not_deducted', not_deducted_reason: finalReason } });
  };

  const handleAmountChange = (row: Installment, amount: number) => {
    handleRowEdit(row.id, 'deducted_amount', amount);
  };

  const handleAmountBlur = (row: Installment) => {
    const edit = rowEdits[row.id];
    if (!edit) return;
    updateMutation.mutate({ id: row.id, payload: { status: edit.status, deducted_amount: edit.deducted_amount } });
  };

  const handleSubmitSheet = () => {
    if (!campId) return;
    setShowBulkModal(false);
    setSubmitResult(null);
    const deductions = resolvedRows
      .map(r => {
        const edit = rowEdits[r.id];
        const status = edit?.status ?? r.status;
        const not_deducted_reason = status === 'not_deducted'
          ? (edit?.not_deducted_reason ?? r.not_deducted_reason ?? undefined)
          : undefined;

        return {
          installment_id: r.id,
          status,
          deducted_amount: edit?.deducted_amount ?? r.deducted_amount ?? r.expected_amount,
          not_deducted_reason: not_deducted_reason || undefined,
        };
      })
      .filter(d => ['deducted', 'partial', 'not_deducted'].includes(d.status));

    if (deductions.length === 0) {
      setSubmitResult({ success: false, message: 'No updated rows to submit. Please update at least one deduction status.' });
      return;
    }

    bulkSubmitMutation.mutate({ camp_id: campId, year, month, deductions });
  };

  const exportCSV = () => {
    const rows = view === 'camp_entry' ? resolvedRows : allInstallments;
    const headers = ['Service No', 'Rank', 'Customer', 'App ID', 'Expected (LKR)', 'Deducted (LKR)', 'Status', 'Reason'];
    const csvRows = rows.map(i => {
      const c = i.application?.customer;
      return [
        c?.service_number ?? '—', c?.rank ?? '—', c?.full_name ?? '—',
        i.application?.ref_number ?? '—',
        i.expected_amount, i.deducted_amount ?? 0,
        i.status, i.not_deducted_reason ?? '—'
      ].join(',');
    });
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deductions_${MONTHS[month - 1]}_${year}${campId ? '_' + (camps.find(c => c.id === campId)?.name ?? campId) : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCamp = camps.find(c => c.id === campId);

  // small helper for metric-card icon circles
  const iconCircle = (bg: string, children: React.ReactNode) => (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
      style={{ backgroundColor: bg }}
    >
      {children}
    </div>
  );

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <CreditCard size={28} className="text-[#2563ea]" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Installments &amp; Deductions
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Monthly salary deduction tracking and camp submission portal
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setView('dashboard'); setSubmitResult(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border flex items-center gap-1.5 transition-colors ${view === 'dashboard' ? 'bg-slate-900 text-white border-slate-900' : 'btn-secondary'
              }`}
          >
            <FileText size={14} className={view === 'dashboard' ? 'text-white' : ''} /> Dashboard
          </button>
          <button
            onClick={() => { setView('camp_entry'); setSubmitResult(null); resetEdits(); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border flex items-center gap-1.5 transition-colors ${view === 'camp_entry' ? 'bg-amber-500 text-slate-900 border-amber-500' : 'btn-secondary'
              }`}
          >
            <Building size={14} className={view === 'camp_entry' ? 'text-slate-900' : ''} /> Camp Entry
          </button>
          <button onClick={exportCSV} className="btn-secondary text-sm px-4 py-2 flex items-center gap-1.5">
            <Download size={14} /> Export Sheet
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          CAMP ENTRY VIEW
      ════════════════════════════════════════════════ */}
      {view === 'camp_entry' && (
        <div className="space-y-5">

          {/* Filters bar */}
          <div className="card p-4 flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Camp / Base</label>
              <select
                className="form-input text-sm min-w-[220px]"
                value={campId}
                onChange={e => { setCampId(e.target.value); resetEdits(); setSubmitResult(null); }}
              >
                <option value="">— Select Camp —</option>
                {camps.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.branch.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Month</label>
              <select className="form-input text-sm w-28" value={month} onChange={e => { setMonth(Number(e.target.value)); resetEdits(); }}>
                {MONTHS.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Year</label>
              <select className="form-input text-sm w-28" value={year} onChange={e => { setYear(Number(e.target.value)); resetEdits(); }}>
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {campId && (
              <button
                onClick={() => { refetchSheet(); resetEdits(); }}
                className="btn-secondary text-sm flex items-center gap-1.5 self-end"
              >
                <RefreshCw size={13} /> Refresh
              </button>
            )}
            {campId && (
              <button
                onClick={() => { setShowExcelImport(true); setExcelImportResult(null); }}
                className="text-sm flex items-center gap-1.5 self-end px-4 py-2 rounded-lg font-semibold border transition-colors"
                style={{ background: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.4)', color: '#f59e0b' }}
              >
                <Upload size={13} /> Import from Excel
              </button>
            )}
          </div>

          {/* Camp header banner */}
          {campId && (
            <div
              className="rounded-xl p-5 text-white"
              style={{ background: 'linear-gradient(135deg, #0d3d78 0%, #08111f 100%)' }}
            >
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="text-lg font-black">
                    {selectedCamp?.name ?? 'Camp'} — {MONTHS_FULL[month - 1]} {year} Deduction Sheet
                  </div>
                  <div className="text-xs opacity-70 mt-0.5 capitalize">
                    {selectedCamp?.branch?.replace('_', ' ')} · Submitted by camp salary officer
                  </div>
                </div>
                {summary && (
                  <div className="text-xs opacity-70 font-mono">
                    Success rate: <span className="font-black text-amber-400 text-base">{summary.success_rate}%</span>
                  </div>
                )}
              </div>
              <div className="flex gap-8 mt-4 flex-wrap">
                {[
                  { label: 'Deducted', count: effectiveSummary.deducted, color: 'text-[#2563ea]', icon: <CheckCircle size={14} className="text-[#2563ea]" /> },
                  { label: 'Pending', count: effectiveSummary.pending, color: 'text-[#2563ea]', icon: <Clock size={14} className="text-[#2563ea]" /> },
                  { label: 'Not Deducted', count: effectiveSummary.not_deducted, color: 'text-[#2563ea]', icon: <AlertTriangle size={14} className="text-[#2563ea]" /> },
                  { label: 'Partial', count: effectiveSummary.partial, color: 'text-[#2563ea]', icon: <RefreshCw size={14} className="text-[#2563ea]" /> },
                ].map(st => (
                  <div key={st.label}>
                    <div className={`flex items-center gap-1.5 text-2xl font-bold ${st.color}`}>
                      {st.icon}
                      {st.count}
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">{st.label}</div>
                  </div>
                ))}
                {summary && (
                  <div className="ml-auto text-right">
                    <div className="text-xs opacity-50">Total Expected</div>
                    <div className="font-black text-lg">LKR {summary.total_expected.toLocaleString()}</div>
                    <div className="text-xs opacity-50 mt-1">Total Deducted</div>
                    <div className="font-bold text-green-400">LKR {summary.total_deducted.toLocaleString()}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit result toast */}
          {submitResult && (
            <div
              className="rounded-lg p-4 flex items-center gap-3 border"
              style={submitResult.success ? {
                background: 'rgba(34,197,94,0.12)',
                borderColor: 'rgba(34,197,94,0.35)',
                color: 'var(--text-primary)',
              } : {
                background: 'rgba(239,68,68,0.12)',
                borderColor: 'rgba(239,68,68,0.35)',
                color: 'var(--text-primary)',
              }}
            >
              {submitResult.success
                ? <CheckCircle size={16} className="text-green-400 shrink-0" />
                : <AlertTriangle size={16} className="text-red-400 shrink-0" />
              }
              <span className="text-sm font-semibold">{submitResult.message}</span>
              <button onClick={() => setSubmitResult(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          )}

          {showBulkModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
              <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-[var(--bg-surface)] shadow-2xl">
                <div className="flex items-center justify-between rounded-t-3xl bg-slate-900 px-6 py-4 text-white">
                  <div className="flex items-center gap-2">
                    <Send size={16} className="text-white" />
                    <div className="text-sm uppercase tracking-[0.18em] opacity-80">Bulk Deduction Submit</div>
                  </div>
                  <button onClick={() => setShowBulkModal(false)} className="rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-800/70" aria-label="Close modal">
                    <X size={18} />
                  </button>
                </div>

                <div className="px-6 py-6 space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Month</label>
                    <select
                      className="form-input text-sm w-full"
                      value={`${month}-${year}`}
                      onChange={e => {
                        const [newMonth, newYear] = e.target.value.split('-').map(Number);
                        setMonth(newMonth);
                        setYear(newYear);
                      }}
                    >
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={`${idx + 1}-${year}`}>{`${m} ${String(year).slice(-2)}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-100 flex items-center gap-3">
                    <CheckCircle size={18} className="text-amber-400 shrink-0" />
                    <div className="font-semibold">{submitableRows.length} updated rows · LKR {submitableCollected.toLocaleString()}</div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setShowBulkModal(false)}
                      className="rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleSubmitSheet}
                      disabled={bulkSubmitMutation.isPending || submitableRows.length === 0}
                      className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {bulkSubmitMutation.isPending
                        ? <><Loader2 size={14} className="animate-spin text-slate-900" /> Submitting…</>
                        : <><Send size={14} className="text-slate-900" /> {`Submit All for ${MONTHS_FULL[month - 1].slice(0, 3)} ${String(year).slice(-2)}`}</>
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No camp selected */}
          {!campId && (
            <div className="card p-12 text-center" style={{ color: 'var(--text-muted)' }}>
              <Building size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Select a camp above to load the deduction sheet</p>
              <p className="text-xs mt-1">The sheet shows all active installments for that camp and month</p>
            </div>
          )}

          {/* Camp entry table */}
          {campId && (
            <>
              {sheetLoading ? (
                <div className="card p-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  <Loader2 size={28} className="mx-auto mb-3 animate-spin opacity-50" />
                  <p>Loading deduction sheet…</p>
                </div>
              ) : sheetRows.length === 0 ? (
                <div className="card p-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  <FileText size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">No installments found for {MONTHS_FULL[month - 1]} {year}</p>
                  <p className="text-xs mt-1">Make sure applications have active installments for this period</p>
                </div>
              ) : (
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
                        {resolvedRows.map(row => {
                          const cust = row.application?.customer;
                          const rowStatus = row.status;
                          return (
                            <tr
                              key={row.id}
                              className="transition-colors"
                              style={{ backgroundColor: 'var(--bg-surface)' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                            >
                              <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                {cust?.service_number ?? '—'}
                              </td>
                              <td className="px-4 py-3 capitalize" style={{ color: 'var(--text-secondary)' }}>
                                {cust?.rank ?? '—'}
                              </td>
                              <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {cust?.full_name ?? '—'}
                              </td>
                              <td className="px-4 py-3 font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                                LKR {row.expected_amount.toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  className="form-input text-xs py-1.5 px-2 min-w-[130px]"
                                  value={rowStatus}
                                  onChange={e => handleStatusChange(row, e.target.value)}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="deducted">Deducted</option>
                                  <option value="partial">Partial</option>
                                  <option value="not_deducted">Not Deducted</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                {rowStatus === 'not_deducted' && (
                                  <select
                                    className="form-input text-xs py-1.5 px-2 min-w-[180px]"
                                    value={row.not_deducted_reason ?? ''}
                                    onChange={e => handleReasonChange(row, e.target.value)}
                                  >
                                    <option value="">Select reason…</option>
                                    {REASONS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                                  </select>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {(rowStatus === 'deducted' || rowStatus === 'partial') && (
                                  <input
                                    type="number"
                                    className="form-input text-xs py-1.5 px-2 w-28 font-mono"
                                    value={row.deducted_amount ?? row.expected_amount}
                                    onChange={e => handleAmountChange(row, Number(e.target.value))}
                                    onBlur={() => handleAmountBlur(row)}
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action bar */}
              {sheetRows.length > 0 && (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {resolvedRows.filter(r => r.status !== 'pending').length} of {resolvedRows.length} rows updated
                  </div>
                  <div className="flex gap-2">
                    <button onClick={exportCSV} className="btn-secondary text-sm flex items-center gap-1.5">
                      <Download size={13} /> Download PDF
                    </button>
                    <button
                      onClick={() => {
                        if (resolvedRows.filter(r => r.status !== 'pending').length === 0) {
                          setSubmitResult({ success: false, message: 'No updated rows to submit. Please update at least one deduction status.' });
                          return;
                        }
                        setShowBulkModal(true);
                      }}
                      disabled={bulkSubmitMutation.isPending || resolvedRows.filter(r => r.status !== 'pending').length === 0}
                      className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {bulkSubmitMutation.isPending
                        ? <><Loader2 size={14} className="animate-spin text-white" /> Submitting…</>
                        : <><Send size={14} className="text-white" /> Bulk Submit</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          DASHBOARD VIEW
      ════════════════════════════════════════════════ */}
      {view === 'dashboard' && (
        <div className="space-y-5">

          {/* Month/Year filter */}
          <div className="card p-4 flex gap-4 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Month</label>
              <select className="form-input text-sm w-28" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Year</label>
              <select className="form-input text-sm w-28" value={year} onChange={e => setYear(Number(e.target.value))}>
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Metric cards — icons now sit in soft colored circles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Deducted', value: deductedCount, amount: deductedSum, border: 'border-l-[#2563ea]', icon: <CheckCircle size={18} className="text-[#2563ea]" /> },
              { label: 'Pending', value: pendingCount, amount: pendingSum, border: 'border-l-[#2563ea]', icon: <Clock size={18} className="text-[#2563ea]" /> },
              { label: 'Not Deducted', value: missedCount, amount: missedSum, border: 'border-l-[#2563ea]', icon: <AlertTriangle size={18} className="text-[#2563ea]" /> },
              { label: 'Partial', value: partialCount, amount: 0, border: 'border-l-[#2563ea]', icon: <RefreshCw size={18} className="text-[#2563ea]" /> },
            ].map(m => (
              <div key={m.label} className={`card p-4 border-l-4 ${m.border}`}>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{m.value}</div>
                  {m.icon}
                </div>
                <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text-secondary)' }}>{m.label}</div>
                {m.amount > 0 && <div className="text-xs mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>LKR {m.amount.toLocaleString()}</div>}
              </div>
            ))}
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {['all', 'deducted', 'pending', 'not_deducted', 'partial', 'arrears'].map(t => (
              <button
                key={t}
                onClick={() => setStatusFilter(t)}
                className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5"
                style={statusFilter === t
                  ? { backgroundColor: '#f59e0b', color: '#0f172a' }
                  : { backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }
                }
              >
                {t !== 'all' && STATUS_ICONS[t]}
                {t === 'all' ? 'All' : STATUS_LABELS[t] || t}
              </button>
            ))}
          </div>

          {/* Dashboard table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: 'var(--bg-sidebar)', color: '#e6edf3' }} className="text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {['App ID', 'Customer', 'Camp', 'Month', 'Expected', 'Deducted', 'Status', 'Reason'].map(h => (
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {dashLoading ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-muted)' }}>Loading deduction records…</td></tr>
                  ) : tabFiltered.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-muted)' }}>No installments found.</td></tr>
                  ) : (
                    tabFiltered.map(i => {
                      const cust = i.application?.customer;
                      return (
                        <tr key={i.id} className="transition-colors"
                          style={{ backgroundColor: 'var(--bg-surface)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-500">{i.application?.ref_number ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{cust?.full_name ?? '—'}</div>
                            <div className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{cust?.rank ?? '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {cust?.service_number ?? '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                            {MONTHS[i.due_month - 1]} {i.due_year}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                            LKR {i.expected_amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {i.deducted_amount ? `LKR ${Number(i.deducted_amount).toLocaleString()}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGES[i.status] ?? ''}`}>
                              {STATUS_ICONS[i.status]}
                              {STATUS_LABELS[i.status] || i.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {i.not_deducted_reason ? REASONS.find(r => r.v === i.not_deducted_reason)?.l ?? i.not_deducted_reason : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Excel Import Modal ── */}
      {showExcelImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <FileSpreadsheet size={20} className="text-amber-400" />
                </div>
                <div>
                  <div className="font-bold" style={{ color: 'var(--text-primary)' }}>Import from Excel</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {MONTHS_FULL[month - 1]} {year} — {camps.find(c => c.id === campId)?.name ?? 'Selected Camp'}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowExcelImport(false)} className="p-1.5 rounded-lg hover:bg-slate-100/10 transition-colors">
                <X size={16} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            {/* Instructions */}
            <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <div className="font-semibold text-amber-400 flex items-center gap-1.5"><FileSpreadsheet size={14} /> How it works</div>
              <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <li>• Upload the MIR Excel file (e.g. <em>MIR ALL IN ONE SALES SUMMARY 2024.xlsx</em>)</li>
                <li>• The system reads the <strong>{MONTHS_FULL[month - 1]} {year}</strong> column from the sheet</li>
                <li>• Matches customers by Service No or Name to this camp</li>
                <li>• Updates installment statuses: Deducted / Partial / Not Deducted</li>
              </ul>
            </div>

            {/* Upload area */}
            <div
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 p-8 cursor-pointer transition-colors"
              style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.05)' }}
              onClick={() => excelFileRef.current?.click()}
            >
              {excelImportMutation.isPending ? (
                <>
                  <Loader2 size={28} className="text-amber-400 animate-spin" />
                  <div className="text-sm font-medium text-amber-400">Processing Excel file…</div>
                </>
              ) : (
                <>
                  <Upload size={28} className="text-amber-400" />
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Click to select Excel file</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>.xlsx or .xls files accepted</div>
                </>
              )}
              <input
                ref={excelFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleExcelFile}
                disabled={excelImportMutation.isPending}
              />
            </div>

            {/* Result */}
            {excelImportResult && (
              <div
                className="rounded-xl p-4 text-sm flex items-start gap-3"
                style={excelImportResult.success
                  ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--text-primary)' }
                  : { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--text-primary)' }}
              >
                {excelImportResult.success
                  ? <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
                  : <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />}
                <span>{excelImportResult.message}</span>
              </div>
            )}

            {/* Close button */}
            <button
              onClick={() => setShowExcelImport(false)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold btn-secondary"
            >
              {excelImportResult?.success ? 'Done' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}