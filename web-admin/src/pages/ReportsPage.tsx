import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  BarChart2, Download, FileText, AlertTriangle, Coins, Shield,
  CalendarOff, RefreshCw, Mail, ToggleLeft, ToggleRight, TrendingUp,
  LayoutGrid, Percent, UserX, Wallet, FileSpreadsheet, FileType, Send, Clock
} from 'lucide-react';

// ── Report definitions ─────────────────────────────────────────────────────
const REPORTS = [
  {
    id: 'monthly-deductions',
    label: 'Monthly Deduction Sheet',
    icon: Coins,
    color: '#1d4ed8',
    bg: '#eff6ff',
    desc: 'All installment deductions for a given month/camp. Filterable by year, month, and camp.',
    params: ['year', 'month'],
  },
  {
    id: 'arrears',
    label: 'Arrears Report',
    icon: AlertTriangle,
    color: '#dc2626',
    bg: '#fef2f2',
    desc: 'All customers with outstanding arrears, sorted by amount.',
    params: [],
  },
  {
    id: 'commissions',
    label: 'Sales Commissions',
    icon: TrendingUp,
    color: '#16a34a',
    bg: '#f0fdf4',
    desc: 'Sales officer commissions — payable, pending and paid.',
    params: ['status'],
  },
  {
    id: 'risk',
    label: 'Risk Report',
    icon: Shield,
    color: '#d97706',
    bg: '#fffbeb',
    desc: 'All customers by risk score. Filter by HIGH / MEDIUM / LOW.',
    params: ['level'],
  },
  {
    id: 'retirement-risk',
    label: 'Retirement Risk',
    icon: CalendarOff,
    color: '#7c3aed',
    bg: '#f5f3ff',
    desc: 'Customers retiring within 24 months with active phone plans.',
    params: [],
  },
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const GUIDE = [
  { icon: Coins,        color: '#1d4ed8', title: 'Deduction Sheet',    desc: 'Best for monthly camp reconciliation. Share with payroll officers.' },
  { icon: AlertTriangle,color: '#dc2626', title: 'Arrears Report',     desc: 'Use for recovery follow-up and guarantor notifications.' },
  { icon: TrendingUp,   color: '#16a34a', title: 'Commission Report',  desc: 'Verify payable commissions before running bank transfers.' },
  { icon: Shield,       color: '#d97706', title: 'Risk Report',        desc: 'Prioritise high-risk customers for monthly review meetings.' },
  { icon: CalendarOff,  color: '#7c3aed', title: 'Retirement Risk',    desc: 'Critical: check before approving new applications.' },
];

// ── KPI strip — icon + colors per metric ───────────────────────────────────
const KPI_META = [
  { key: 'active_plans',      label: 'Active Plans',      color: '#0d1f3c', bg: '#f1f5f9', icon: LayoutGrid },
  { key: 'collection_rate',   label: 'Collection Rate',   color: '#16a34a', bg: '#f0fdf4', icon: Percent },
  { key: 'overdue_customers', label: 'Overdue Customers', color: '#dc2626', bg: '#fef2f2', icon: UserX },
  { key: 'monthly_collected', label: 'Monthly Collected', color: '#1d4ed8', bg: '#eff6ff', icon: Wallet },
];

// ── Scheduled reports (UI-only, no backend yet) ───────────────────────────
const DEFAULT_SCHEDULES = [
  { id: 'RS1', report: 'Monthly Collection Report', freq: 'monthly', day: 1,        email: 'finance@airvoice.lk', active: true  },
  { id: 'RS2', report: 'Arrears Report',            freq: 'weekly',  day: 'Monday', email: 'admin@airvoice.lk',   active: true  },
  { id: 'RS3', report: 'Commission Report',         freq: 'monthly', day: 25,       email: 'finance@airvoice.lk', active: false },
  { id: 'RS4', report: 'Stock Report',              freq: 'daily',   day: null,     email: 'admin@airvoice.lk',   active: false },
];

export default function ReportsPage() {
  const now = new Date();
  const [year, setYear]             = useState(now.getFullYear());
  const [month, setMonth]           = useState(now.getMonth() + 1);
  const [commStatus, setCommStatus] = useState('');
  const [riskLevel, setRiskLevel]   = useState('');
  const [format, setFormat]         = useState<'xlsx' | 'csv'>('xlsx');
  const [schedules, setSchedules]   = useState(DEFAULT_SCHEDULES);
  const [activeTab, setActiveTab]   = useState<'export' | 'schedule'>('export');
  const [downloading, setDownloading] = useState<string | null>(null);

  // ── KPI stats via authenticated axios instance ──────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['reports-stats'],
    queryFn: () => api.get('/dashboard/kpis').then(r => r.data),
  });
  const kpis = statsData?.kpis ?? statsData ?? {};

  // ── Download handler ────────────────────────────────────────────────────
  async function handleDownload(reportId: string) {
    setDownloading(reportId);
    try {
      const params: Record<string, string> = { format };
      if (reportId === 'monthly-deductions') {
        params.year  = String(year);
        params.month = String(month);
      }
      if (reportId === 'commissions' && commStatus) params.status = commStatus;
      if (reportId === 'risk' && riskLevel) params.level = riskLevel;

      const res = await api.get(`/reports/${reportId}`, { params, responseType: 'blob' });

      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      const contentType = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';
      const blob = new Blob([res.data], { type: contentType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${reportId}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to download report. Please try again.');
    } finally {
      setDownloading(null);
    }
  }

  const toggleSchedule = (id: string) =>
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));

  return (
<div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <BarChart2 size={28} className="text-[#2563ea]" /> Reports &amp; Export Center
          </h1>
          <p className="text-sm text-base-muted mt-0.5">Download operational and financial reports in Excel or CSV format</p>
        </div>
      </div>

      {/* KPI strip — now with an icon in a soft-colored circle per card */}
      <div className="grid grid-cols-4 gap-4">
        {KPI_META.map(k => {
          const Icon = k.icon;
          const value = k.key === 'collection_rate'
            ? (kpis[k.key] != null ? `${kpis[k.key]}%` : '—')
            : k.key === 'monthly_collected'
              ? (kpis[k.key] != null ? `LKR ${Number(kpis[k.key]).toLocaleString()}` : '—')
              : kpis[k.key] ?? '—';
          return (
            <div key={k.label} className="surface rounded-2xl p-5 border border-base shadow-sm flex items-start justify-between" style={{ borderLeft: `4px solid ${k.color}` }}>
              <div>
                <div className="text-[10px] font-bold tracking-widest text-base-muted uppercase mb-2">{k.label}</div>
                <div className="text-2xl font-black" style={{ color: k.color }}>{value}</div>
              </div>
              <div>
                <Icon size={18} className="text-[#2563ea]" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs — icon added per tab */}
      <div className="flex gap-1 border-b border-base">
        {([
          { id: 'export' as const,   label: 'Export Reports',    icon: FileSpreadsheet },
          { id: 'schedule' as const, label: 'Scheduled Reports', icon: Clock },
        ]).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-base-muted hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── EXPORT TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-[1fr_300px] gap-6 items-start">
          {/* Report cards */}
          <div className="space-y-4">
            {/* Format picker — icon added to each format button */}
            <div className="surface rounded-2xl p-4 border border-base shadow-sm flex items-center gap-4">
                <FileText size={28} className="text-[#2563eb]" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-base-secondary">Export Format</div>
                <div className="text-xs text-base-muted">Excel recommended for analysis, CSV for raw data imports</div>
              </div>
              <div className="flex gap-2">
                {([
                  { id: 'xlsx' as const, icon: FileSpreadsheet },
                  { id: 'csv' as const,  icon: FileType },
                ]).map(f => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold border-2 transition-all flex items-center gap-1.5 ${
                        format === f.id
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-base text-base-muted hover:border-[var(--border-color)]'
                      }`}
                    >
                      <Icon size={13} />
                      .{f.id.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Report cards */}
            {REPORTS.map(report => {
              const Icon = report.icon;
              const isDownloading = downloading === report.id;
              return (
                <div key={report.id} className="surface rounded-2xl p-5 border border-base shadow-sm flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: report.bg }}>
                    <Icon size={22} style={{ color: report.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-base-primary text-sm mb-1">{report.label}</div>
                    <div className="text-xs text-base-muted leading-relaxed mb-3">{report.desc}</div>

                    {/* Param pickers */}
                    {report.params.includes('year') && (
                      <div className="flex gap-2 mb-3">
                        <select
                          value={year}
                          onChange={e => setYear(Number(e.target.value))}
                          className="border border-base rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                          style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--input-border)' }}
                        >
                          {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select
                          value={month}
                          onChange={e => setMonth(Number(e.target.value))}
                          className="border border-base rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                          style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--input-border)' }}
                        >
                          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                      </div>
                    )}
                    {report.params.includes('status') && (
                      <div className="mb-3">
                        <select
                          value={commStatus}
                          onChange={e => setCommStatus(e.target.value)}
                          className="border border-base rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                          style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--input-border)' }}
                        >
                          <option value="">All Statuses</option>
                          <option value="payable">Payable</option>
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                    )}
                    {report.params.includes('level') && (
                      <div className="mb-3">
                        <select
                          value={riskLevel}
                          onChange={e => setRiskLevel(e.target.value)}
                          className="border border-base rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                          style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--input-border)' }}
                        >
                          <option value="">All Risk Levels</option>
                          <option value="high">High Risk</option>
                          <option value="medium">Medium Risk</option>
                          <option value="low">Low Risk</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownload(report.id)}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl shrink-0 transition-all disabled:opacity-60"
                    style={{ background: isDownloading ? '#9ca3af' : report.color }}
                  >
                    <Download size={14} className="text-white" />
                    {isDownloading ? 'Generating…' : `Download .${format.toUpperCase()}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Guide panel */}
          <div className="surface rounded-2xl border border-base shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-base">
              <h3 className="font-bold text-sm text-base-secondary flex items-center gap-2">
                <RefreshCw size={14} className="text-blue-600" /> Report Guide
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {GUIDE.map(g => {
                const Icon = g.icon;
                return (
                  <div key={g.title} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: g.color + '18' }}>
                      <Icon size={14} style={{ color: g.color }} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-base-secondary">{g.title}</div>
                      <div className="text-xs text-base-muted leading-relaxed mt-0.5">{g.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        <div className="max-w-2xl space-y-4">
          {/* Notice */}
          <div className="flex gap-3 items-center bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
            <Mail size={18} className="text-blue-600 shrink-0" />
            <div>
              <div className="text-sm font-bold text-blue-800">Automated Report Delivery</div>
              <div className="text-xs text-blue-600 mt-0.5">Scheduled reports are generated and emailed automatically. Toggle each report to activate.</div>
            </div>
          </div>

          {schedules.map(s => (
            <div
              key={s.id}
              className={`surface rounded-2xl border border-base shadow-sm p-5 transition-opacity ${!s.active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="font-bold text-base-primary text-sm">{s.report}</div>
                    <div className="text-xs text-base-muted mt-0.5 capitalize flex items-center gap-1">
                      <Clock size={11} />
                      {s.freq} {s.day ? `· Day ${s.day}` : ''}
                    </div>
                  </div>
                </div>
                <button onClick={() => toggleSchedule(s.id)}>
                  {s.active
                    ? <ToggleRight size={28} className="text-green-500" />
                    : <ToggleLeft  size={28} className="text-gray-300" />}
                </button>
              </div>
              {s.active && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-base-muted uppercase tracking-widest mb-1">Delivery Email</label>
                    <div className="relative">
                      <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
                      <input
                        defaultValue={s.email}
                        className="w-full border border-base rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--input-border)' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-base-muted uppercase tracking-widest mb-1">Frequency</label>
                    <select
                      defaultValue={s.freq}
                      className="w-full border border-base rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--input-border)' }}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
              <Send size={14} className="text-white" /> Save Schedule Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}