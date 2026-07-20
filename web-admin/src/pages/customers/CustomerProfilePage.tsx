import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, documentsApi, customersApi } from '@/services/api';
import {
  ArrowLeft, Phone, Shield, AlertTriangle, FileText, Upload,
  CheckCircle, XCircle, Clock, Pencil, Loader2, Download,
  Plus, User, TrendingUp, Bell, ChevronRight, RefreshCw,
  Camera, Gift,
} from 'lucide-react';
import { EditDrawer } from '@/components/EditDrawer';
import CameraModal from '@/components/CameraModal';
import SpecialApprovalRequestModal from '@/components/SpecialApprovalRequestModal';

// ── Branch colours ────────────────────────────────────────────────────────────
const BRANCH_GRAD: Record<string, string> = {
  army:      'linear-gradient(135deg,#1a6b3c,#0d4a28)',
  navy:      'linear-gradient(135deg,#1a5ca0,#0d3d78)',
  air_force: 'linear-gradient(135deg,#6b3fa0,#4a1f80)',
};

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  active:        'bg-green-100 text-green-800',
  submitted:     'bg-blue-100 text-blue-800',
  rejected:      'bg-red-100 text-red-800',
  completed:     'surface-2 text-base-secondary',
  camp_review:   'bg-purple-100 text-purple-800',
  finance_review:'bg-indigo-100 text-indigo-800',
  approved:      'bg-teal-100 text-teal-800',
  docs_review:   'bg-amber-100 text-amber-800',
  pending:       'bg-amber-100 text-amber-700',
  not_deducted:  'bg-red-100 text-red-700',
  deducted:      'bg-green-100 text-green-700',
  arrears:       'bg-red-100 text-red-700',
  partial:       'bg-amber-100 text-amber-700',
};

// ── Document labels ───────────────────────────────────────────────────────────
const DOC_LABELS: Record<string, string> = {
  nic_front:   'NIC (Front)',
  nic_back:    'NIC (Back)',
  military_id: 'Military ID',
  selfie:      'Selfie / Photo',
  paysheet_1:  'Paysheet — 1',
  paysheet_2:  'Paysheet — 2',
  paysheet_3:  'Paysheet — 3',
};
const DOC_ICON: Record<string, string> = {
  nic_front:'🪪', nic_back:'🪪', military_id:'🎖', selfie:'📷',
  paysheet_1:'📄', paysheet_2:'📄', paysheet_3:'📄',
};
const DOC_TYPES = Object.keys(DOC_LABELS);

const VERIFY_ICON: Record<string, React.ReactNode> = {
  verified:      <CheckCircle size={13} className="text-green-600" />,
  rejected:      <XCircle size={13} className="text-red-500" />,
  pending:       <Clock size={13} className="text-amber-500" />,
  pending_review:<Clock size={13} className="text-blue-500" />,
};

type CustomerRec = Record<string, unknown>;

// ── Shared info row ───────────────────────────────────────────────────────────
function InfoRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-2 border-b border-base last:border-0 text-sm">
      <span className="text-base-muted shrink-0 mr-3">{label}</span>
      <span className={`font-medium text-base-secondary text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, color = '#1a5ca0' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 rounded-full surface-3 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%`, background: color }}
      />
    </div>
  );
}

// ── Tabs list ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',     label: 'Overview',       icon: User },
  { key: 'applications', label: 'Applications',   icon: FileText },
  { key: 'payments',     label: 'Payment History',icon: TrendingUp },
  { key: 'risk',         label: 'Risk Analysis',  icon: Shield },
  { key: 'documents',    label: 'Documents',      icon: FileText },
  { key: 'notifications',label: 'Notifications',  icon: Bell },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab]               = useState('overview');
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [editForm, setEditForm]     = useState<Record<string, string | boolean>>({});
  // Camera state
  const [cameraDocType, setCameraDocType] = useState<string | null>(null);
  // Special approval state
  const [specialApprovalApp, setSpecialApprovalApp] = useState<CustomerRec | null>(null);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn:  () => api.get(`/customers/${id}`).then(r => r.data.data),
  });

  const { data: docsData } = useQuery({
    queryKey: ['customer-docs', id],
    queryFn:  () => documentsApi.list(id!).then(r => r.data),
    enabled:  !!id,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/customers/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer', id] }); setEditOpen(false); },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: string; file: File }) => documentsApi.upload(id!, type, file),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['customer-docs', id] }); setUploadingType(null); },
    onError:    (err: any) => { alert('Upload failed: ' + (err.response?.data?.message || err.message)); setUploadingType(null); },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ docId, status }: { docId: string; status: 'verified' | 'rejected' }) =>
      documentsApi.verify(id!, docId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer-docs', id] }),
  });

  const refreshRiskMutation = useMutation({
    mutationFn: () => customersApi.refreshRisk(id!),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['customer', id] }),
  });

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) return <div className="p-6 text-base-muted">Loading…</div>;
  if (!data) return <div className="p-6 text-red-600">Customer not found</div>;

  // ── Derived values ────────────────────────────────────────────────────────
  const c      = data as CustomerRec;
  const camp   = c.camp as { name: string; branch: string } | null;
  const apps   = (c.applications as CustomerRec[]) ?? [];
  const insts  = (c.installments as CustomerRec[]) ?? [];

  const legacyLink = c.legacy_link as CustomerRec[] | null;
  const legacyRow  = legacyLink?.[0]?.legacy_row as CustomerRec | null;

  const docs             = (docsData?.data ?? []) as CustomerRec[];
  const missingRequired  = (docsData?.missing_required ?? []) as string[];
  const isDocsComplete   = docsData?.is_complete === true;
  const docByType        = Object.fromEntries(docs.map(d => [d.document_type as string, d]));

  const activeApps   = apps.filter(a => a.status === 'active');
  const totalPaid    = insts.filter(i => i.status === 'deducted').reduce((s, i) => s + Number(i.deducted_amount ?? i.deducted ?? 0), 0);
  const totalOwed    = activeApps.reduce((s, a) => {
    const paid = insts.filter(i => i.application_id === a.id && i.status === 'deducted').reduce((ss, i) => ss + Number(i.deducted_amount ?? i.deducted ?? 0), 0);
    return s + (Number(a.monthly_amount ?? a.monthly ?? 0) * Number(a.term_months ?? a.installments ?? 0) - paid);
  }, 0);

  const retirementDate  = c.retirement_date as string | undefined;
  const monthsLeft      = retirementDate
    ? Math.round((new Date(retirementDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  const riskScore    = Number(c.risk_score ?? 0);
  const riskLevel    = c.risk_level as string ?? 'low';
  const riskColor    = riskScore > 50 ? '#c0392b' : riskScore > 25 ? '#c47c0e' : '#1a6b3c';
  const branch       = (c.branch as string) ?? '';

  const guarantors      = (c.guarantors as CustomerRec[]) ?? [];
  const guaranteeing    = (c.guaranteeing_for as CustomerRec[]) ?? [];

  // ── Export CSV ───────────────────────────────────────────────────────────
  function exportProfile() {
    const row = [
      c.full_name, c.nic_number, c.rank, camp?.name, c.phone_number,
      c.email, retirementDate, riskScore,
    ].join(',');
    const blob = new Blob(['Name,NIC,Rank,Camp,Phone,Email,Retirement,Risk\n' + row], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `customer_${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Risk factors ─────────────────────────────────────────────────────────
  const riskFactors = [
    { label: 'Missed Deductions',    score: insts.filter(i => ['not_deducted','arrears'].includes(i.status as string)).length * 5, max: 25, color: '#c0392b' },
    { label: 'Active Phones',        score: activeApps.length * 8,                                                                 max: 20, color: '#c47c0e' },
    { label: 'Retirement Proximity', score: monthsLeft !== null ? (monthsLeft < 12 ? 20 : monthsLeft < 24 ? 10 : monthsLeft < 36 ? 5 : 0) : 0, max: 20, color: '#c47c0e' },
    { label: 'Payment History',      score: insts.length > 0 ? Math.round((insts.filter(i => i.status !== 'deducted').length / insts.length) * 15) : 0, max: 15, color: '#1a6b3c' },
    { label: 'Balance Ratio',        score: totalOwed > 100000 ? 10 : totalOwed > 50000 ? 5 : 0,                                  max: 10, color: '#1a5ca0' },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* Back + action buttons */}
      <div className="flex items-center gap-3">
        <Link to="/customers" className="flex items-center gap-1.5 text-sm text-base-muted hover:text-[var(--text-secondary)] font-medium">
          <ArrowLeft size={16} /> Back to Customers
        </Link>
        <div className="flex-1" />
        <button onClick={exportProfile} className="btn-secondary text-sm flex items-center gap-1.5">
          <Download size={14} /> Export
        </button>
        <Link to="/applications/new" className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={14} /> New Application
        </Link>
      </div>

      {/* Retirement warning */}
      {retirementDate && new Date(retirementDate) < new Date(Date.now() + 24 * 30 * 24 * 60 * 60 * 1000) && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          <span>Customer retires on <strong>{retirementDate}</strong> — within 24 months. New applications will be blocked.</span>
        </div>
      )}

      {/* ── HERO ── */}
      <div
        className="rounded-xl p-6 text-white"
        style={{ background: BRANCH_GRAD[branch] ?? 'linear-gradient(135deg,#1a3a6b,#0d1f3c)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left */}
          <div>
            <div className="text-xs uppercase tracking-widest opacity-60 font-semibold mb-1">
              {branch.toUpperCase()} · {(c.service_number as string) ?? ''}
            </div>
            <h1 className="text-2xl font-black leading-tight">{(c.full_name_si as string) || (c.full_name as string)}</h1>
            {!!c.full_name_si && !!c.full_name && c.full_name_si !== c.full_name && (
              <div className="text-sm opacity-70 mt-0.5">{c.full_name as string}</div>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {!!c.rank && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15">{c.rank as string}</span>
              )}
              {camp && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15">{camp.name}</span>
              )}
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{ background: riskScore > 50 ? 'rgba(192,57,43,.4)' : riskScore > 25 ? 'rgba(196,124,14,.4)' : 'rgba(26,107,60,.4)' }}
              >
                Risk: {riskScore} {riskScore > 50 ? '⚠' : riskScore > 25 ? '●' : '✓'}
              </span>
              {!!c.is_blocked && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-600">BLOCKED</span>
              )}
            </div>
          </div>

          {/* Right – stats grid */}
          <div className="grid grid-cols-2 gap-3 shrink-0">
            {[
              { v: activeApps.length,                                                           l: 'Active Plans' },
              { v: `LKR ${(totalPaid / 1000).toFixed(0)}K`,                                    l: 'Total Paid' },
              { v: totalOwed > 0 ? `LKR ${(totalOwed / 1000).toFixed(0)}K` : 'Clear',          l: 'Balance' },
              { v: monthsLeft !== null ? `${monthsLeft}m` : '—',                               l: 'To Retirement' },
            ].map(({ v, l }) => (
              <div key={l} className="bg-white/12 rounded-xl px-4 py-3 text-center backdrop-blur-sm">
                <div className="text-xl font-black">{String(v)}</div>
                <div className="text-xs opacity-60 mt-1">{l}</div>
              </div>
            ))}
          </div>

          {/* Edit button */}
          <button
            onClick={() => {
              setEditForm({
                full_name:      String(c.full_name ?? ''),
                nic_number:     String(c.nic_number ?? ''),
                service_number: String(c.service_number ?? ''),
                rank:           String(c.rank ?? ''),
                phone_number:   String(c.phone_number ?? ''),
                email:          String(c.email ?? ''),
                address:        String(c.address ?? ''),
                retirement_date:String(c.retirement_date ?? ''),
                is_blocked:     Boolean(c.is_blocked),
              });
              setEditOpen(true);
            }}
            className="absolute top-5 right-5 hidden lg:flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ position: 'unset' }}
          >
            <Pencil size={13} /> Edit
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key
                ? 'bg-slate-900 text-white'
                : 'text-gray-600 hover:bg-[var(--bg-surface-2)]'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left column */}
          <div className="space-y-5">
            {/* Personal Details */}
            <div className="card">
              <div className="card-h">
                <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                  <User size={15} /> Personal Details
                </div>
              </div>
              <div className="px-4 py-2">
                <InfoRow label="Full Name"            value={c.full_name as string} />
                <InfoRow label="Name with Initials"   value={c.full_name_si as string} />
                <InfoRow label="NIC Number"           value={c.nic_number as string} mono />
                <InfoRow label="Date of Birth"        value={c.date_of_birth as string} />
                <InfoRow label="Gender"               value={c.gender as string} />
                <InfoRow label="Mobile Phone"         value={c.phone_number as string} />
                <InfoRow label="Email"                value={c.email as string} />
                <InfoRow label="Permanent Address"    value={c.address as string} />
              </div>
            </div>

            {/* Military Details */}
            <div className="card">
              <div className="card-h">
                <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                  <Shield size={15} /> Military Details
                </div>
              </div>
              <div className="px-4 py-2">
                <InfoRow label="Branch"         value={(c.branch as string)?.replace('_', ' ')} />
                <InfoRow label="Rank"           value={c.rank as string} />
                <InfoRow label="Service No"     value={c.service_number as string} mono />
                <InfoRow label="Military ID"    value={c.military_id_number ? String(c.military_id_number) : undefined} mono />
                <InfoRow label="Camp / Base"    value={camp?.name} />
                <InfoRow label="Joined Service" value={c.joined_service as string} />
                <InfoRow label="Retirement Date" value={retirementDate} />
                {/* App account */}
                <div className="flex justify-between items-center py-2 text-sm">
                  <span className="text-base-muted">App Account</span>
                  {c.has_app_account
                    ? <span className="flex items-center gap-1 text-green-700 font-medium text-xs"><CheckCircle size={13} /> Active</span>
                    : <span className="text-base-muted text-xs">Not registered</span>
                  }
                </div>
              </div>
            </div>

            {/* Guarantor */}
            {guarantors.length > 0 && (
              <div className="card">
                <div className="card-h">
                  <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                    <Shield size={15} /> Guarantor
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {guarantors.map((g: CustomerRec) => (
                    <div key={g.id as string} className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-xl">
                      <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center shrink-0">
                        <Shield size={18} className="text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-base-primary">{g.full_name as string}</div>
                        <div className="text-xs text-base-muted mt-0.5">{g.rank as string} · {(g.camp as { name: string } | null)?.name}</div>
                        <div className="text-xs text-base-muted font-mono mt-0.5">{g.phone_number as string} · {g.nic_number as string}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Active Phone Plans */}
            <div className="card">
              <div className="card-h">
                <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                  <Phone size={15} /> Active Phone Plans
                </div>
              </div>
              <div>
                {activeApps.length === 0 ? (
                  <div className="px-4 py-8 text-center text-base-muted text-sm">No active phone plans</div>
                ) : (
                  activeApps.map((app: CustomerRec) => {
                    const pm    = app.phone_model as { brand: string; model: string; storage: string } | null;
                    const paidCount = insts.filter(i => i.application_id === app.id && i.status === 'deducted').length;
                    const term  = Number(app.term_months ?? app.installments ?? 0);
                    const pct   = term > 0 ? Math.round((paidCount / term) * 100) : 0;
                    return (
                      <div key={app.id as string} className="px-4 py-4 border-b border-base last:border-0">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="font-semibold text-sm text-base-primary">
                              {pm ? `${pm.brand} ${pm.model} ${pm.storage}` : (app.phone_model_label as string ?? '—')}
                            </div>
                            {!!app.imei1 && (
                              <div className="text-xs text-base-muted font-mono mt-0.5">{app.imei1 as string}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-black text-base text-slate-800">
                              LKR {Number(app.monthly_amount ?? app.monthly ?? 0).toLocaleString()}/mo
                            </div>
                            <div className="text-xs text-base-muted mt-0.5">{term} months total</div>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs text-base-muted mb-1.5">
                          <span>{paidCount} / {term} paid</span>
                          <span>{pct}%</span>
                        </div>
                        <ProgressBar pct={pct} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Guaranteeing For */}
            {guaranteeing.length > 0 && (
              <div className="card">
                <div className="card-h">
                  <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                    <User size={15} /> Guaranteeing For
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {guaranteeing.map((g: CustomerRec) => (
                    <div key={g.id as string} className="px-4 py-3 flex justify-between items-center text-sm">
                      <span className="font-medium text-base-secondary">{g.full_name as string}</span>
                      <span className="text-base-muted text-xs">
                        {(g.applications as CustomerRec[] | undefined)?.filter(a => a.status === 'active').length ?? 0} active plan(s)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy data */}
            {legacyRow && (
              <div className="card">
                <div className="card-h">
                  <div className="font-semibold text-base-secondary text-sm">Legacy Import Data</div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  {[
                    ['Total Expected', `LKR ${Number(legacyRow.total_expected || 0).toLocaleString()}`],
                    ['Total Deducted', `LKR ${Number(legacyRow.total_deducted || 0).toLocaleString()}`],
                    ['Arrears',        `LKR ${Number(legacyRow.arrears || 0).toLocaleString()}`],
                    ['Status',          legacyRow.is_settled ? 'SETTLED' : 'Active'],
                  ].map(([l, v]) => (
                    <div key={l as string} className="p-3 surface-2 rounded-lg">
                      <div className="text-xs text-base-muted">{l}</div>
                      <div className="font-semibold text-sm mt-0.5 text-base-secondary">{v as string}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── APPLICATIONS TAB ── */}
      {tab === 'applications' && (
        <div className="card overflow-hidden">
          <div className="card-h">
            <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
              <FileText size={15} /> Application History
            </div>
          </div>
          {apps.length === 0 ? (
            <div className="px-4 py-10 text-center text-base-muted text-sm">No applications yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="surface-2 border-b border-base">
                  <tr>
                    {['App ID', 'Phone Model', 'Monthly', 'Term', 'Status', 'Applied', 'Handover', 'IMEI'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-base-muted font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {apps.map((app: CustomerRec) => {
                    const pm = app.phone_model as { brand: string; model: string; storage: string } | null;
                    return (
                      <tr key={app.id as string} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-base-muted">{app.ref_number as string}</td>
                        <td className="px-4 py-3 font-semibold text-base-secondary">
                          {pm ? `${pm.brand} ${pm.model} ${pm.storage}` : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-bold">
                          LKR {Number(app.monthly_amount ?? app.monthly ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {Number(app.term_months ?? app.installments ?? 0)}m
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[(app.status as string) ?? ''] ?? 'surface-2 text-base-secondary'}`}>
                            {app.status as string}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-base-muted font-mono">{(app.created_at as string)?.slice(0, 10) ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-base-muted font-mono">{(app.handover_date as string) ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-base-muted font-mono">{(app.imei1 as string) ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Special Approval Request button — appears at top of the tab if customer has rejected/blocked apps */}
          {apps.some((a: CustomerRec) => a.status === 'rejected') && (
            <div className="px-5 py-4 border-t border-base flex items-center justify-between gap-3">
              <div className="text-xs text-base-muted">
                This customer has one or more rejected applications. You can request special admin approval to proceed.
              </div>
              <button
                onClick={() => {
                  const firstRejected = apps.find((a: CustomerRec) => a.status === 'rejected');
                  if (firstRejected) setSpecialApprovalApp(firstRejected);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors whitespace-nowrap"
              >
                <Gift size={13} /> Request Special Approval
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PAYMENT HISTORY TAB ── */}
      {tab === 'payments' && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { l: 'Total Paid',        v: `LKR ${totalPaid.toLocaleString()}`, c: 'text-green-700' },
              { l: 'Balance Remaining', v: totalOwed > 0 ? `LKR ${totalOwed.toLocaleString()}` : 'Clear', c: totalOwed > 0 ? 'text-red-600' : 'text-green-700' },
              { l: 'Deductions Made',   v: String(insts.filter(i => i.status === 'deducted').length),   c: 'text-slate-800' },
            ].map(({ l, v, c: color }) => (
              <div key={l} className="card p-4">
                <div className={`text-xl font-black ${color}`}>{v}</div>
                <div className="text-xs text-base-muted font-medium mt-2">{l}</div>
              </div>
            ))}
          </div>

          {/* Installment table */}
          <div className="card overflow-hidden">
            <div className="card-h">
              <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                <TrendingUp size={15} /> Installment Payment History
              </div>
            </div>
            {insts.length === 0 ? (
              <div className="px-4 py-10 text-center text-base-muted text-sm">No payment history yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface-2 border-b border-base">
                    <tr>
                      {['Month', 'Application', 'Phone Model', 'Expected', 'Deducted', 'Status', 'Reason', 'Commission'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-base-muted font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {insts.map((inst: CustomerRec) => {
                      const app = apps.find(a => a.id === inst.application_id);
                      const pm  = app?.phone_model as { brand: string; model: string } | null;
                      const deducted = Number(inst.deducted_amount ?? inst.deducted ?? 0);
                      return (
                        <tr key={inst.id as string} className="hover:bg-[var(--bg-surface-2)]">
                          <td className="px-4 py-3 text-xs font-mono text-gray-600">{inst.month as string ?? `${inst.due_year}-${String(inst.due_month).padStart(2,'0')}`}</td>
                          <td className="px-4 py-3 text-xs font-mono text-base-muted">{app?.ref_number as string ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{pm ? `${pm.brand} ${pm.model}` : '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono font-semibold text-base-secondary">
                            LKR {Number(inst.expected_amount ?? inst.monthly ?? 0).toLocaleString()}
                          </td>
                          <td className={`px-4 py-3 text-xs font-mono font-bold ${
                            deducted > 0 ? 'text-green-700' : inst.status === 'arrears' ? 'text-red-600' : 'text-base-muted'
                          }`}>
                            {deducted > 0 ? `LKR ${deducted.toLocaleString()}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[(inst.status as string) ?? ''] ?? 'surface-2 text-gray-600'}`}>
                              {inst.status as string}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-base-muted">{(inst.reason as string) ?? '—'}</td>
                          <td className="px-4 py-3">
                            {inst.comm_released
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold"><CheckCircle size={11} /> Released</span>
                              : <span className="inline-block px-2 py-0.5 rounded text-xs surface-2 text-base-muted">Pending</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RISK ANALYSIS TAB ── */}
      {tab === 'risk' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Score breakdown */}
          <div className="card">
            <div className="card-h">
              <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                <Shield size={15} /> Risk Score Breakdown
              </div>
              <button
                onClick={() => refreshRiskMutation.mutate()}
                disabled={refreshRiskMutation.isPending}
                className="flex items-center gap-1 text-xs text-base-muted hover:text-[var(--text-secondary)]"
              >
                <RefreshCw size={13} className={refreshRiskMutation.isPending ? 'animate-spin' : ''} />
                Recalculate
              </button>
            </div>
            <div className="p-5">
              {/* Big score */}
              <div className="text-center mb-6">
                <div className="text-6xl font-black leading-none" style={{ color: riskColor }}>{riskScore}</div>
                <div className="text-xs text-base-muted mt-2">out of 100 · {riskLevel.replace('_',' ')} Risk</div>
              </div>

              {/* Factors */}
              <div className="text-xs font-semibold text-base-muted uppercase tracking-wider mb-3">Score Breakdown</div>
              <div className="space-y-4">
                {riskFactors.map(rf => (
                  <div key={rf.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium text-base-secondary">{rf.label}</span>
                      <span className="font-bold" style={{ color: rf.color }}>{rf.score}/{rf.max}</span>
                    </div>
                    <ProgressBar pct={(rf.score / rf.max) * 100} color={rf.color} />
                  </div>
                ))}
              </div>

              {riskScore > 50 && (
                <div className="flex items-start gap-2 mt-5 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold mb-0.5">High Risk — Action Required</div>
                    This customer requires enhanced monitoring. Review payment history and guarantor capacity before approving any new applications.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Retirement timeline */}
          <div className="card">
            <div className="card-h">
              <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                <Clock size={15} /> Retirement Timeline
              </div>
            </div>
            <div className="p-5">
              {monthsLeft !== null ? (
                <div
                  className="rounded-xl p-4 mb-5"
                  style={{ background: monthsLeft < 12 ? '#fdf0ee' : monthsLeft < 24 ? '#fff7e6' : '#eaf7f0' }}
                >
                  <div className="text-3xl font-black" style={{ color: monthsLeft < 12 ? '#c0392b' : monthsLeft < 24 ? '#c47c0e' : '#1a6b3c' }}>
                    {monthsLeft} months
                  </div>
                  <div className="text-sm text-base-muted mt-1">Until retirement · {retirementDate}</div>
                </div>
              ) : (
                <div className="p-4 rounded-xl surface-2 text-base-muted text-sm mb-5">No retirement date set</div>
              )}

              {/* Plan safety check */}
              <div className="space-y-2">
                {activeApps.length === 0 && (
                  <div className="text-sm text-base-muted">No active plans to check</div>
                )}
                {activeApps.map((app: CustomerRec) => {
                  const term = Number(app.term_months ?? app.installments ?? 0);
                  const endDate = new Date();
                  endDate.setMonth(endDate.getMonth() + term);
                  const safe = !retirementDate || endDate <= new Date(retirementDate);
                  return (
                    <div
                      key={app.id as string}
                      className="p-3 rounded-xl border text-sm"
                      style={{ background: safe ? '#eaf7f0' : '#fdf0ee', borderColor: safe ? 'rgba(26,107,60,.2)' : 'rgba(192,57,43,.2)' }}
                    >
                      <div className="font-semibold text-base-secondary mb-1">
                        {(() => {
                          const pm = app.phone_model as { brand: string; model: string } | null;
                          return pm ? `${pm.brand} ${pm.model}` : '—';
                        })()}
                      </div>
                      <div className="text-xs text-base-muted mb-1.5">
                        {term} months · Ends ~{endDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                      </div>
                      <div className="text-xs font-bold" style={{ color: safe ? '#1a6b3c' : '#c0392b' }}>
                        {safe ? '✓ Completes before retirement' : '⚠ Extends past retirement date'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {tab === 'documents' && (
        <div className="card">
          <div className="card-h">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
                <FileText size={15} /> Documents on File
              </div>
              {isDocsComplete
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-semibold"><CheckCircle size={11} /> Verified</span>
                : missingRequired.length > 0
                  ? <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-semibold">Missing: {missingRequired.map(t => DOC_LABELS[t]).join(', ')}</span>
                  : <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold">Pending Review</span>
              }
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {DOC_TYPES.map(type => {
              const doc    = docByType[type];
              const status = (doc?.verification_status as string) ?? 'missing';
              return (
                <div
                  key={type}
                  className="border rounded-xl p-3.5 flex flex-col gap-2.5"
                  style={{
                    background: status === 'verified' ? '#fff' : '#f8fafc',
                    borderColor: status === 'verified' ? '#d1fae5' : status === 'rejected' ? '#fecaca' : '#e5e7eb',
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: status === 'verified' ? '#eaf7f0' : status === 'rejected' ? '#fdf0ee' : '#fff7e6' }}
                  >
                    {DOC_ICON[type]}
                  </div>
                  {/* Label */}
                  <div>
                    <div className="text-xs font-semibold text-base-secondary">{DOC_LABELS[type]}</div>
                    {doc && (
                      <div className="text-xs text-base-muted mt-0.5 truncate">{doc.original_filename as string}</div>
                    )}
                  </div>
                  {/* Status */}
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    {VERIFY_ICON[status] ?? <XCircle size={12} className="text-gray-300" />}
                    <span className={
                      status === 'verified' ? 'text-green-700' :
                      status === 'rejected' ? 'text-red-600' :
                      status === 'missing'  ? 'text-base-muted' :
                      'text-amber-600'
                    }>
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                    </span>
                  </div>
                  {/* Rejection Reason */}
                  {status === 'rejected' && (doc as any)?.rejection_reason && (
                    <div className="text-[10px] text-red-500 font-medium leading-tight mt-1 bg-red-50 p-1.5 rounded border border-red-100">
                      {String((doc as any).rejection_reason)}
                    </div>
                  )}
                  {/* Actions */}
                  {doc ? (
                    <div className="flex flex-col gap-1.5">
                      {!!doc.signed_url && (
                        <a href={doc.signed_url as string} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline">
                          View document
                        </a>
                      )}
                      {status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => verifyMutation.mutate({ docId: doc.id as string, status: 'verified' })}
                            className="flex-1 text-xs py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium"
                          >Approve</button>
                          <button
                            onClick={() => verifyMutation.mutate({ docId: doc.id as string, status: 'rejected' })}
                            className="flex-1 text-xs py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                          >Reject</button>
                        </div>
                      )}
                      {/* Re-upload for rejected documents (file + camera) */}
                      {status === 'rejected' && (
                        <div className="flex flex-col gap-1">
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*,.pdf"
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) { setUploadingType(type); uploadMutation.mutate({ type, file: f }); }
                              }}
                            />
                            <span className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-semibold border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors">
                              <Upload size={11} />
                              {uploadingType === type ? 'Uploading…' : 'Re-upload File'}
                            </span>
                          </label>
                            <button
                              onClick={() => setCameraDocType(type)}
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors"
                            >
                              <Camera size={11} /> Scan via Camera
                            </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) { setUploadingType(type); uploadMutation.mutate({ type, file: f }); }
                          }}
                        />
                        <span className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium">
                          <Upload size={11} />
                          {uploadingType === type ? 'Uploading…' : 'Upload File'}
                        </span>
                      </label>
                        <button
                          onClick={() => setCameraDocType(type)}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          <Camera size={11} /> Use Camera
                        </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-5 pb-4">
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept="image/*,.pdf" multiple />
              <span className="btn-secondary text-xs inline-flex items-center gap-1.5">
                <Upload size={13} /> Request New Document Upload
              </span>
            </label>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ── */}
      {tab === 'notifications' && (
        <div className="card">
          <div className="card-h">
            <div className="flex items-center gap-2 font-semibold text-base-secondary text-sm">
              <Bell size={15} /> Notification History
            </div>
          </div>
          <div className="px-4 py-10 text-center text-base-muted text-sm">
            No notifications on record for this customer.
          </div>
        </div>
      )}

      {/* ── EDIT DRAWER ── */}
      <EditDrawer title="Edit Customer" subtitle={String(c.full_name ?? '')} isOpen={editOpen} onClose={() => setEditOpen(false)}>
        <div className="space-y-4">
          {[
            { label: 'Full Name',       key: 'full_name',       required: true },
            { label: 'NIC Number',      key: 'nic_number' },
            { label: 'Service Number',  key: 'service_number' },
            { label: 'Military ID',     key: 'military_id_number' },
            { label: 'Rank',            key: 'rank' },
            { label: 'Phone Number',    key: 'phone_number' },
            { label: 'Email',           key: 'email', type: 'email' },
            { label: 'Address',         key: 'address' },
            { label: 'Retirement Date', key: 'retirement_date', type: 'date' },
          ].map(f => (
            <div key={f.key}>
              <label className="form-label">{f.label}{f.required && ' *'}</label>
              <input
                type={f.type ?? 'text'}
                className="form-input"
                value={(editForm[f.key] as string) ?? ''}
                onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="is_blocked"
              checked={Boolean(editForm.is_blocked)}
              onChange={e => setEditForm(p => ({ ...p, is_blocked: e.target.checked }))}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="is_blocked" className="text-sm text-red-600 font-medium">Block this customer (prevent new applications)</label>
          </div>
          {editMutation.isError && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
              {((editMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error) ?? 'Save failed'}
            </div>
          )}
          <div className="flex gap-3 pt-3 border-t border-base">
            <button
              onClick={() => editMutation.mutate(editForm)}
              disabled={editMutation.isPending}
              className="btn-primary disabled:opacity-50 flex items-center gap-1.5"
            >
              {editMutation.isPending && <Loader2 size={15} className="animate-spin" />}
              Save Changes
            </button>
            <button onClick={() => setEditOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </EditDrawer>
      {/* ── CAMERA MODAL ── */}
      {cameraDocType && (
        <CameraModal
          label={DOC_LABELS[cameraDocType] ?? cameraDocType}
          facingMode={cameraDocType === 'selfie' ? 'user' : 'environment'}
          onClose={() => setCameraDocType(null)}
          onCapture={file => {
            setUploadingType(cameraDocType);
            uploadMutation.mutate({ type: cameraDocType, file });
            setCameraDocType(null);
          }}
        />
      )}

      {/* ── SPECIAL APPROVAL MODAL ── */}
      {specialApprovalApp && (
        <SpecialApprovalRequestModal
          isOpen={true}
          onClose={() => setSpecialApprovalApp(null)}
          customerId={id!}
          customerName={c.full_name as string ?? 'Customer'}
          phoneModelId={(specialApprovalApp.phone_model_id as string) ?? ''}
          termMonths={Number(specialApprovalApp.term_months ?? 12)}
          onSuccess={() => {
            setSpecialApprovalApp(null);
            qc.invalidateQueries({ queryKey: ['customer', id] });
          }}
        />
      )}
    </div>
  );
}
