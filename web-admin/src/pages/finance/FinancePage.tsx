import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Download, TrendingUp, AlertCircle, CheckCircle, RefreshCw,
  DollarSign, X, Loader2, User, Clock, BadgeCheck, BarChart3
} from 'lucide-react';

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function formatLKR(v: number | string | undefined) {
  if (v == null) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `LKR ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `LKR ${(n / 1000).toFixed(0)}K`;
  return `LKR ${n}`;
}

function fmtDate(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Status badge for commissions
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    payable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    paid:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${map[status] ?? 'surface-2 text-base-muted'}`}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────
// Payment Reference Modal
// ─────────────────────────────────────────
interface PayModalProps {
  officerName: string;
  payableCount: number;
  totalAmount: number;
  onConfirm: (ref: string) => void;
  onClose: () => void;
  loading: boolean;
}
function PayModal({ officerName, payableCount, totalAmount, onConfirm, onClose, loading }: PayModalProps) {
  const [ref, setRef] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="surface dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-base-muted hover:text-gray-600">
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <BadgeCheck className="text-blue-600 dark:text-blue-400" size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Release Commission</h2>
            <p className="text-sm text-base-muted">Officer: <span className="font-semibold text-slate-700 dark:text-slate-300">{officerName}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{payableCount}</div>
            <div className="text-xs text-base-muted mt-1">Payable Commissions</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatLKR(totalAmount)}</div>
            <div className="text-xs text-base-muted mt-1">Total Amount</div>
          </div>
        </div>

        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          Payment Reference <span className="text-base-muted font-normal">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. BANK-TXN-20250714"
          value={ref}
          onChange={e => setRef(e.target.value)}
          className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm surface dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-5"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(ref)}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
            Confirm Release
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────
export default function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'pl' | 'arrears' | 'commissions' | 'forecast'>('overview');
  const currentYear = new Date().getFullYear();

  // Modal state for commission pay
  const [payModal, setPayModal] = useState<{
    officerName: string;
    ids: string[];           // commission IDs to mark paid
    totalAmount: number;
  } | null>(null);

  // ── Finance summary (overview / P&L / forecast)
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['finance-summary', currentYear],
    queryFn: () => api.get('/finance/summary', { params: { year: currentYear } }).then(r => r.data),
    refetchOnWindowFocus: true,
  });

  // ── Camp breakdown
  const { data: campResp } = useQuery({
    queryKey: ['finance-camps', currentYear],
    queryFn: () => api.get('/finance/camp-breakdown', { params: { year: currentYear } }).then(r => r.data.data),
    enabled: !!summary,
  });

  // ── Real commissions list from /commissions
  const { data: commResp, isLoading: loadingComm } = useQuery({
    queryKey: ['commissions-list'],
    queryFn: () => api.get('/commissions', { params: { page: '1' } }).then(r => r.data),
    enabled: tab === 'commissions',
    refetchOnWindowFocus: false,
  });

  // ── Real commissions summary counts
  const { data: commSummary } = useQuery({
    queryKey: ['commissions-summary'],
    queryFn: () => api.get('/commissions/summary').then(r => r.data),
    enabled: tab === 'commissions',
  });

  // ── Real arrears list from /reports/arrears
  const { data: arrearsResp, isLoading: loadingArrears } = useQuery({
    queryKey: ['finance-arrears'],
    queryFn: () => api.get('/reports/arrears').then(r => r.data),
    enabled: tab === 'arrears',
    refetchOnWindowFocus: false,
  });

  // ── Group commissions by officer
  const officerGroups = useMemo(() => {
    const list: any[] = commResp?.data ?? [];
    const map = new Map<string, { officerName: string; officerId: string; payable: any[]; paid: number; payableTotal: number }>();
    list.forEach((c: any) => {
      const oid = c.sales_officer_id ?? 'unknown';
      const name = c.officer?.phone_number ?? `Officer ${oid.slice(0, 6)}`;
      if (!map.has(oid)) map.set(oid, { officerName: name, officerId: oid, payable: [], paid: 0, payableTotal: 0 });
      const g = map.get(oid)!;
      if (c.status === 'payable') {
        g.payable.push(c);
        g.payableTotal += c.amount ?? 250;
      }
      if (c.status === 'paid') g.paid += c.amount ?? 250;
    });
    return Array.from(map.values());
  }, [commResp]);

  // ── Mark commissions as paid (batch per officer)
  const markPaidMutation = useMutation({
    mutationFn: async ({ ids, ref }: { ids: string[]; ref: string }) => {
      await Promise.all(
        ids.map(id => api.post(`/commissions/${id}/mark-paid`, { payment_reference: ref || undefined }))
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commissions-list'] });
      qc.invalidateQueries({ queryKey: ['commissions-summary'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      setPayModal(null);
      alert('✅ Commission released successfully!');
    },
    onError: (err: any) => {
      alert('❌ Failed to release: ' + (err?.response?.data?.error ?? err.message));
    }
  });

  // ── CSV export helper
  const exportCSV = (rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) { alert('No data to export.'); return; }
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => {
          const val = r[h] ?? '';
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        }).join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.parentNode?.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  // ── Server-side XLSX report download
  const downloadReport = async (path: string, filename: string, params?: Record<string, unknown>) => {
    try {
      const response = await api.get(path, { params: { ...params, format: 'xlsx' }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download error', err);
      alert('Export failed. Please ensure you are connected to the server and try again.');
    }
  };

  // ── Per-tab export handlers
  const handleExportOverview = () => downloadReport('/reports/monthly-deductions', `Finance_Overview_${currentYear}`, { year: currentYear });
  const handleExportPL = () => {
    const mLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const rows = (summary?.pl_rows ?? []).filter((r: any) => r.values?.length).map((r: any) => {
      const obj: Record<string, unknown> = { 'Statement Item': r.label };
      (r.values ?? []).forEach((v: number, i: number) => { obj[mLabels[i] ?? `M${i + 1}`] = v; });
      obj['Total'] = r.total ?? '';
      return obj;
    });
    exportCSV(rows, 'PL_Statement');
  };
  const handleExportArrears = () => downloadReport('/reports/arrears', 'Arrears_Report');
  const handleExportCommissions = () => downloadReport('/reports/commissions', 'Commissions_Report');
  const handleExportForecast = () => {
    const rows = (summary?.forecasts ?? []).map((f: any) => ({
      Month: f.month, Expected_LKR: f.expected, Confidence_Pct: f.confidence, Notes: f.notes,
    }));
    exportCSV(rows, 'Revenue_Forecast');
  };
if (loadingSummary) return <div className="p-6 text-base-primary text-sm">Loading finance dashboard…</div>;

  const months = (summary?.monthly_series || []) as { collections?: number; expenses?: number; label?: string }[];
  const camps = campResp ?? [];
  const plRows = summary?.pl_rows ?? [];
  const plMonths = summary?.pl_months ?? [];
  const arrearsAging = summary?.arrears_aging ?? [];
  const forecasts = summary?.forecasts ?? [];
  const arrearsRows: any[] = arrearsResp?.data ?? [];

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-[#2563ea]" />
          <div>
            <h1 className="text-2xl font-bold text-base-primary">Finance Dashboard</h1>
            <div className="text-sm text-base-muted">Collections, P&L, commissions, forecasts</div>
          </div>
        </div>
        <button onClick={handleExportOverview} className="btn btn-secondary text-sm flex items-center gap-1.5">
          <Download size={14} /> Export Report
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-base pb-px">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'pl', label: 'P&L Statement' },
          { id: 'arrears', label: 'Arrears' },
          { id: 'commissions', label: 'Commissions' },
          { id: 'forecast', label: 'Forecast' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-base-muted hover:text-[var(--text-secondary)] hover:border-[var(--border-color)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-5 surface rounded-xl border border-base shadow-sm relative overflow-hidden">
              <div className="text-xs font-bold text-base-muted uppercase tracking-wider mb-2">EXPECTED</div>
              <div className="text-2xl font-bold text-base-primary">{formatLKR(summary?.expected_collections)}</div>
              <div className="text-xs text-base-muted mt-2">{summary?.active_plans_count ?? ''} active plans</div>
              <DollarSign className="absolute top-4 right-4 text-[#2563ea] w-8 h-8 opacity-40" />
            </div>
            <div className="p-5 surface rounded-xl border border-base shadow-sm relative overflow-hidden">
              <div className="text-xs font-bold text-base-muted uppercase tracking-wider mb-2">COLLECTED</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatLKR(summary?.collected)}</div>
              <div className="text-xs text-base-muted mt-2">{summary?.confirmed_deductions_count ?? ''} confirmed</div>
              <CheckCircle className="absolute top-4 right-4 text-[#2563ea] w-8 h-8 opacity-40" />
            </div>
            <div className="p-5 surface rounded-xl border border-base shadow-sm relative overflow-hidden">
              <div className="text-xs font-bold text-base-muted uppercase tracking-wider mb-2">ARREARS</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{formatLKR(summary?.arrears_amount)}</div>
              <div className="text-xs text-base-muted mt-2">{summary?.arrears_count ?? ''} overdue</div>
              <AlertCircle className="absolute top-4 right-4 text-[#2563ea] w-8 h-8 opacity-40" />
            </div>
            <div className="p-5 surface rounded-xl border border-base shadow-sm relative overflow-hidden">
              <div className="text-xs font-bold text-base-muted uppercase tracking-wider mb-2">NET PROFIT</div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-500">{formatLKR(summary?.net_profit)}</div>
              <div className="text-xs text-base-muted mt-2">After {formatLKR(summary?.total_expenses)} expenses</div>
              <TrendingUp className="absolute top-4 right-4 text-[#2563ea] w-8 h-8 opacity-40" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="surface p-5 rounded-xl border border-base shadow-sm">
              <h3 className="font-semibold text-base-primary mb-4">Monthly Collections — {currentYear}</h3>
              <div className="h-56 flex items-end gap-3 px-2 border-b border-base pb-2">
                {months.map((m, i) => {
                  const max = Math.max(...months.map(x => Math.max(x.collections || 0, x.expenses || 0)), 1);
                  const hColl = Math.max(4, Math.round(((m.collections || 0) / max) * 100));
                  const hExp  = Math.max(2, Math.round(((m.expenses  || 0) / max) * 100));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex justify-center items-end h-44 gap-1">
                        <div style={{ height: `${hColl}%` }} className="bg-blue-600 dark:bg-blue-500 w-3 rounded-t" title={`Collections: ${formatLKR(m.collections)}`} />
                        <div style={{ height: `${hExp}%`  }} className="bg-red-400 dark:bg-red-500 w-3 rounded-t"   title={`Expenses: ${formatLKR(m.expenses)}`} />
                      </div>
                      <div className="text-xs text-base-muted mt-2">{m.label ?? `${i + 1}`}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-center gap-6 text-sm text-base-muted">
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 bg-blue-600 dark:bg-blue-500 rounded" /> Collections</span>
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 bg-red-400 dark:bg-red-500 rounded" /> Expenses</span>
              </div>
            </div>

            <div className="surface p-5 rounded-xl border border-base shadow-sm">
              <h3 className="font-semibold text-base-primary mb-4">Income by Camp</h3>
              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                {camps.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between border-b border-base pb-3 last:border-0 last:pb-0">
                    <div className="w-2/3">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm text-base-secondary">{c.name}</div>
                        {c.tag && <div className="text-[10px] font-bold text-white bg-slate-400 dark:bg-slate-600 rounded-full px-2 py-0.5">{c.tag}</div>}
                      </div>
                      <div className="w-full surface-2 h-2.5 rounded-full mt-2 overflow-hidden">
                        <div style={{ width: `${Math.min(100, c.deduction_rate ?? 0)}%` }} className="h-full bg-blue-600" />
                      </div>
                      <div className="text-xs text-base-muted mt-1">{Number(c.deduction_rate ?? 0).toFixed(1)}% rate · {c.customers_count} customers</div>
                    </div>
                    <div className="text-right w-1/3">
                      <div className="font-bold text-sm text-base-primary">{formatLKR(c.collections)}</div>
                      <div className="text-xs text-red-500 dark:text-red-400">-{formatLKR(c.loss || 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* P&L TAB */}
      {tab === 'pl' && (
        <div className="space-y-6">
          <div className="surface p-5 rounded-xl border border-base shadow-sm">
            <h3 className="font-semibold text-base-primary mb-4">Quarterly Revenue — {currentYear}</h3>
            <div className="h-32 flex items-end gap-16 border-b border-base pb-2 justify-center">
              {(() => {
                const qLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
                const qColors = ['bg-slate-800 dark:bg-slate-600', 'bg-sky-600 dark:bg-sky-500', 'bg-blue-600 dark:bg-blue-500', 'bg-indigo-600 dark:bg-indigo-500'];
                const ms = (summary?.monthly_series || []) as { collections?: number }[];
                const quarters = [0, 1, 2, 3].map(qi => ({
                  label: `${qLabels[qi]} ${currentYear}`,
                  val: ms.slice(qi * 3, qi * 3 + 3).reduce((s, m) => s + (m.collections || 0), 0),
                  color: qColors[qi],
                }));
                const maxQ = Math.max(...quarters.map(q => q.val), 1);
                return quarters.map((q, idx) => {
                  const h = Math.max(4, Math.round((q.val / maxQ) * 100));
                  return (
                    <div key={idx} className="w-24 flex flex-col items-center">
                      <div style={{ height: `${h}%` }} className={`${q.color} w-16 rounded-t`} title={formatLKR(q.val)} />
                      <div className="text-xs font-semibold text-base-muted mt-2">{q.label}</div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="surface rounded-xl border border-base shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-base">
              <h3 className="font-semibold text-base-primary">Profit &amp; Loss Statement</h3>
              <button onClick={handleExportPL} className="text-sm text-base-muted flex items-center gap-1.5 hover:text-[var(--text-primary)]">
                <Download size={14} /> Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="table-head text-xs text-left">
                    <th className="py-3 px-5">Statement Item</th>
                    {plMonths.map((m: any, idx: number) => <th key={idx} className="py-3 px-3 text-right">{m.label}</th>)}
                    <th className="py-3 px-5 text-right border-l border-[var(--border-color)]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {plRows.map((row: any, ri: number) => (
                    <tr key={ri} className={`${row.isTotal ? 'surface-3' : ''} hover:bg-[var(--bg-surface-2)]`}>
                      <td className={`py-3 px-5 text-base-secondary ${row.bold ? 'font-bold' : ''}`}>{row.label}</td>
                      {row.values.map((v: any, i: number) => (
                        <td key={i} className={`py-3 px-3 text-right font-mono text-xs ${row.bold ? 'font-bold' : ''}`}>{formatLKR(v)}</td>
                      ))}
                      <td className={`py-3 px-5 text-right font-mono text-xs font-bold border-l border-base ${row.color || ''}`}>{formatLKR(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ARREARS TAB */}
      {tab === 'arrears' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {arrearsAging.map((a: any, idx: number) => (
              <div key={idx} className="p-5 surface rounded-xl border border-base shadow-sm relative overflow-hidden">
                <div className="text-2xl font-bold text-base-primary">{a.count}</div>
                <div className="text-xs font-bold text-base-muted uppercase tracking-wider mt-1">{a.range}</div>
                <div className="text-sm font-semibold text-red-600 dark:text-red-400 mt-3">{formatLKR(a.amount)}</div>
                <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: a.color }} />
              </div>
            ))}
          </div>

          <div className="surface rounded-xl border border-base shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-base">
              <h3 className="font-semibold text-base-primary">Outstanding Arrears — Detailed</h3>
              <button onClick={handleExportArrears} className="text-sm text-base-muted flex items-center gap-1.5 hover:text-[var(--text-primary)]">
                <Download size={14} /> Export XLSX
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse text-left">
                <thead>
                  <tr className="surface-2 text-xs font-semibold text-base-secondary border-b border-base">
                    <th className="py-3 px-5">Customer</th>
                    <th className="py-3 px-5">Camp</th>
                    <th className="py-3 px-5">Application</th>
                    <th className="py-3 px-5">Overdue Month</th>
                    <th className="py-3 px-5 text-right">Amount</th>
                    <th className="py-3 px-5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {loadingArrears ? (
                    <tr><td colSpan={6} className="py-8 text-center text-base-muted text-sm"><Loader2 className="animate-spin inline mr-2" size={15} />Loading…</td></tr>
                  ) : arrearsRows.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-base-muted text-sm">No outstanding arrears found.</td></tr>
                  ) : (
                    arrearsRows.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-[var(--bg-surface-2)]">
                        <td className="py-3 px-5 font-semibold text-base-primary">{row.customer_name ?? row.customer?.full_name ?? '—'}</td>
                        <td className="py-3 px-5 text-base-muted">{row.camp_name ?? row.camp?.name ?? '—'}</td>
                        <td className="py-3 px-5 font-mono text-xs">{row.ref_number ?? row.application?.ref_number ?? '—'}</td>
                        <td className="py-3 px-5 text-base-muted">{fmtDate(row.deduction_month ?? row.month)}</td>
                        <td className="py-3 px-5 text-right font-mono font-semibold text-red-500">{formatLKR(row.amount)}</td>
                        <td className="py-3 px-5 text-base-muted">{row.reason ?? row.notes ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* COMMISSIONS TAB */}
      {tab === 'commissions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Pending', value: commSummary?.pending ?? '—', color: 'text-base-secondary', bg: 'surface-2', icon: <Clock size={20} className="text-[#2563ea]" /> },
              { label: 'Payable (Ready)', value: commSummary?.payable ?? '—', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20', icon: <BadgeCheck size={20} className="text-[#2563ea]" /> },
              { label: 'Paid', value: commSummary?.paid ?? '—', color: 'text-green-700 dark:text-[#2563ea]', bg: 'bg-green-50 dark:bg-green-950/20', icon: <CheckCircle size={20} className="text-[#2563ea]" /> },
            ].map((s, i) => (
              <div key={i} className={`${s.bg} rounded-xl p-5 flex items-center gap-4 border border-base`}>
                <div>{s.icon}</div>
                <div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-base-muted mt-0.5">{s.label} commissions · LKR {commSummary?.per_phone ?? 250}/sale</div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl text-sm text-base-secondary flex items-start gap-3">
            <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={18} />
            <div>
              <span className="font-bold text-blue-900 dark:text-blue-300">Commission Release Rule:</span> LKR {commSummary?.per_phone ?? 250} per sale is paid to sales officers. Release occurs only after the first monthly salary deduction is successfully confirmed by the camp officer. Pending commissions are locked until then.
            </div>
          </div>

          <div className="surface rounded-xl border border-base shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-base">
              <h3 className="font-semibold text-base-primary">Sales Officer Commission Ledger</h3>
              <button onClick={handleExportCommissions} className="text-sm text-base-muted flex items-center gap-1.5 hover:text-[var(--text-primary)]">
                <Download size={14} /> Export XLSX
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse text-left">
                <thead>
                  <tr className="surface-2 text-xs font-semibold text-base-secondary border-b border-base">
                    <th className="py-3 px-5">Sales Officer</th>
                    <th className="py-3 px-5 text-right">Payable (Ready)</th>
                    <th className="py-3 px-5 text-right">Total Released</th>
                    <th className="py-3 px-5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {loadingComm ? (
                    <tr><td colSpan={4} className="py-8 text-center text-base-muted text-sm"><Loader2 className="animate-spin inline mr-2" size={15} />Loading commissions…</td></tr>
                  ) : officerGroups.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-base-muted text-sm">No commission data found.</td></tr>
                  ) : (
                    officerGroups.map((g, i) => (
                      <tr key={i} className="hover:bg-[var(--bg-surface-2)]">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <User size={14} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <div className="font-semibold text-base-primary">{g.officerName}</div>
                              <div className="text-xs text-base-muted">{g.payable.length} payable · {g.paid > 0 ? `${formatLKR(g.paid)} released` : 'none released'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-5 text-right font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {g.payable.length > 0 ? formatLKR(g.payableTotal) : <span className="text-base-muted text-xs">Nothing due</span>}
                        </td>
                        <td className="py-3 px-5 text-right font-mono text-base-muted">
                          {formatLKR(g.paid)}
                        </td>
                        <td className="py-3 px-5 text-center">
                          {g.payable.length > 0 ? (
                            <button
                              onClick={() => setPayModal({
                                officerName: g.officerName,
                                ids: g.payable.map((c: any) => c.id),
                                totalAmount: g.payableTotal,
                              })}
                              disabled={markPaidMutation.isPending}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 mx-auto disabled:opacity-50 transition-colors"
                            >
                              <BadgeCheck size={13} /> Release All
                            </button>
                          ) : (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
                              <CheckCircle size={13} /> Up to date
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {(commResp?.data ?? []).length > 0 && (
            <div className="surface rounded-xl border border-base shadow-sm overflow-hidden">
              <div className="p-5 border-b border-base">
                <h3 className="font-semibold text-base-primary">Individual Commission Records</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse text-left">
                  <thead>
                    <tr className="surface-2 text-xs font-semibold text-base-secondary border-b border-base">
                      <th className="py-3 px-5">Officer</th>
                      <th className="py-3 px-5">Customer</th>
                      <th className="py-3 px-5">Application</th>
                      <th className="py-3 px-5 text-right">Amount</th>
                      <th className="py-3 px-5">Status</th>
                      <th className="py-3 px-5">Paid At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {(commResp?.data ?? []).map((c: any) => (
                      <tr key={c.id} className="hover:bg-[var(--bg-surface-2)]">
                        <td className="py-3 px-5 text-base-secondary text-xs font-mono">{c.officer?.phone_number ?? c.sales_officer_id?.slice(0, 8)}</td>
                        <td className="py-3 px-5 font-semibold text-base-primary">{c.customer?.full_name ?? '—'}</td>
                        <td className="py-3 px-5 font-mono text-xs text-base-muted">{c.application?.ref_number ?? '—'}</td>
                        <td className="py-3 px-5 text-right font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{formatLKR(c.amount ?? 250)}</td>
                        <td className="py-3 px-5"><StatusBadge status={c.status} /></td>
                        <td className="py-3 px-5 text-xs text-base-muted">{c.paid_at ? fmtDate(c.paid_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FORECAST TAB */}
      {tab === 'forecast' && (
        <div className="space-y-6">
          <div className="p-4 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl text-sm text-base-secondary flex items-start gap-3">
            <RefreshCw className="text-blue-600 shrink-0 mt-0.5 animate-spin" size={18} />
            <div>
              <span className="font-bold text-blue-900 dark:text-blue-300">AI-Generated Forecast Model:</span> Projections are computed based on active plans, client aging arrears, and historical camp deduction rates. Confidence levels scale according to proximity to retirement.
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleExportForecast} className="btn btn-secondary text-sm flex items-center gap-1.5">
              <Download size={14} /> Export Forecast CSV
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {forecasts.map((f: any, idx: number) => (
              <div key={idx} className="surface p-5 rounded-xl border border-base shadow-sm">
                <div className="text-sm font-semibold text-base-secondary mb-1">{f.month}</div>
                <div className="text-2xl font-bold text-base-primary mb-3">{formatLKR(f.expected)}</div>
                <div className="w-full surface-2 h-2 rounded-full overflow-hidden mb-1">
                  <div style={{ width: `${f.confidence}%` }} className="h-full bg-blue-600" />
                </div>
                <div className="flex justify-between text-xs text-base-muted mb-3">
                  <span>Confidence</span>
                  <span>{f.confidence}%</span>
                </div>
                <div className="text-xs text-base-muted leading-relaxed border-t border-base pt-2.5">{f.notes}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAYMENT REFERENCE MODAL */}
      {payModal && (
        <PayModal
          officerName={payModal.officerName}
          payableCount={payModal.ids.length}
          totalAmount={payModal.totalAmount}
          loading={markPaidMutation.isPending}
          onClose={() => setPayModal(null)}
          onConfirm={(ref) => markPaidMutation.mutate({ ids: payModal.ids, ref })}
        />
      )}
    </div>
  );
}
