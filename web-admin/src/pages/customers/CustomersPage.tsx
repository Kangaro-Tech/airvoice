import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/services/api';
import {
  Search, Plus, Download, Eye, FileText,
  Shield, AlertTriangle, CheckCircle, ChevronRight, X,
  Users, Anchor, Plane, Smartphone, Wallet, Phone, Mail, Calendar, Building2,
  Pencil, Trash2, Loader2, Check,
} from 'lucide-react';

// ── Branch badge ─────────────────────────────────────────────────────────────
const BRANCH_STYLE: Record<string, string> = {
  army: 'bg-green-100 text-green-800 border-green-200',
  navy: 'bg-blue-100  text-blue-800  border-blue-200',
  air_force: 'bg-purple-100 text-purple-800 border-purple-200',
};
const BRANCH_LABEL: Record<string, string> = {
  army: 'Army', navy: 'Navy', air_force: 'Air Force',
};
const BRANCH_ICON: Record<string, any> = {
  army: Shield, navy: Anchor, air_force: Plane,
};

function BranchTag({ branch }: { branch: string }) {
  const Icon = BRANCH_ICON[branch];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${BRANCH_STYLE[branch] ?? 'surface-2 text-base-secondary border-base'}`}>
      {Icon && <Icon size={11} />}
      {BRANCH_LABEL[branch] ?? branch}
    </span>
  );
}

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ score }: { score: number }) {
  const color =
    score > 60 ? 'text-red-700 bg-red-100 border-red-200' :
      score > 35 ? 'text-amber-700 bg-amber-100 border-amber-200' :
        'text-green-700 bg-green-100 border-green-200';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-700',
  inactive: 'surface-2 text-gray-600',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type Customer = Record<string, unknown>;

// ── Quick-view panel ──────────────────────────────────────────────────────────
function QuickPanel({ customer, onClose, onProfile }: {
  customer: Customer;
  onClose: () => void;
  onProfile: () => void;
}) {
  const c = customer;
  const camp = c.camp as { name: string } | null;
  const apps = (c.applications as Customer[] | null) ?? [];

  const totalPaid = apps.reduce((s, a) => s + Number(a.total_paid ?? 0), 0);
  const totalOwed = apps.reduce((s, a) => s + Number(a.total_owed ?? 0), 0);
  const activeCount = apps.filter(a => a.status === 'active').length;

  return (
    <div className="flex-1 surface border border-base rounded-xl p-5 overflow-y-auto max-h-[680px] shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-base font-bold text-base-primary">{(c.full_name_si as string) || (c.full_name as string)}</div>
          {!!c.full_name_si && !!c.full_name && c.full_name_si !== c.full_name && (
            <div className="text-sm text-base-muted mt-0.5">{c.full_name as string}</div>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {!!c.branch && <BranchTag branch={c.branch as string} />}
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[(c.status as string) ?? ''] ?? 'surface-2 text-base-secondary'}`}>
              {c.status as string}
            </span>
            <RiskBadge score={Number(c.risk_score ?? 0)} />
          </div>
        </div>
        <button onClick={onClose} className="text-base-muted hover:text-gray-600 ml-2">
          <X size={18} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Active Phones', value: activeCount, color: 'text-slate-800', icon: Smartphone },
          { label: 'Total Paid', value: `LKR ${(totalPaid / 1000).toFixed(0)}K`, color: 'text-green-700', icon: Wallet },
          { label: 'Balance', value: totalOwed > 0 ? `LKR ${(totalOwed / 1000).toFixed(0)}K` : 'Clear', color: totalOwed > 0 ? 'text-red-600' : 'text-green-700', icon: totalOwed > 0 ? AlertTriangle : CheckCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-slate-50 rounded-lg p-3 border border-base">
            <Icon size={14} className={`${color} opacity-70 mb-1`} />
            <div className={`text-base font-bold ${color}`}>{String(value)}</div>
            <div className="text-xs text-base-muted mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Detail rows */}
      <div className="text-xs font-semibold text-base-muted uppercase tracking-wider mb-2">Service Details</div>
      <div className="divide-y divide-gray-100 mb-4">
        {([
          ['Service No', c.service_number, FileText],
          ['NIC', c.nic_number, FileText],
          ['Rank', c.rank, Shield],
          ['Camp', camp?.name, Building2],
          ['Phone', c.phone_number, Phone],
          ['Email', c.email, Mail],
          ['Retirement', c.retirement_date, Calendar],
        ] as [string, unknown, any][]).map(([l, v, Icon]) => !!v && (
          <div key={l} className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-base-muted flex items-center gap-1.5"><Icon size={13} className="opacity-60" /> {l}</span>
            <span className="font-medium text-base-secondary text-right max-w-[60%] truncate">{String(v)}</span>
          </div>
        ))}
      </div>

      {/* Risk warning */}
      {Number(c.risk_score ?? 0) > 50 && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 mb-4">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>High risk customer (score {c.risk_score as number}/100). Missed deductions or retirement proximity detected. Review before approving new applications.</span>
        </div>
      )}

      <button
        onClick={onProfile}
        className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
      >
        <Eye size={15} /> Open Full Profile
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState(params.get('q') || '');
  const [branch, setBranch] = useState(params.get('branch') || 'all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, branch, params.get('page')],
    queryFn: () => api.get('/customers', {
      params: {
        q: search || undefined,
        branch: branch === 'all' ? undefined : branch,
        page: params.get('page') || 1,
        limit: 30,
      },
    }).then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setDeleteConfirm(null);
      setDeleteError('');
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.error ?? 'Failed to delete customer');
    },
  });

  const openEdit = (c: Customer) => {
    setEditCustomer(c);
    setEditForm({
      full_name:      (c.full_name as string) || '',
      service_number: (c.service_number as string) || '',
      nic_number:     (c.nic_number as string) || '',
      rank:           (c.rank as string) || '',
      phone_number:   (c.phone_number as string) || '',
    });
    setEditError('');
  };

  const submitEdit = async () => {
    if (!editCustomer) return;
    setEditError(''); setEditSubmitting(true);
    try {
      await api.patch(`/customers/${editCustomer.id}`, {
        full_name:      editForm.full_name || undefined,
        service_number: editForm.service_number || undefined,
        nic_number:     editForm.nic_number || undefined,
        rank:           editForm.rank || undefined,
        phone_number:   editForm.phone_number || undefined,
      });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditCustomer(null);
    } catch (e: any) {
      setEditError(e?.response?.data?.error ?? 'Failed to update customer');
    } finally { setEditSubmitting(false); }
  };

  const customers = (data?.data ?? []) as Customer[];
  const meta = data?.meta as { total: number; page: number; pages: number } | undefined;

  const activeWithPlans = customers.filter(c => (c.applications as Customer[] | null)?.some(a => a.status === 'active')).length;
  const highRisk = customers.filter(c => Number(c.risk_score ?? 0) > 50).length;

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function selectAll() {
    setSelected(new Set(customers.map(c => c.id as string)));
  }
  function clearSelect() {
    setSelected(new Set());
  }

  function exportCSV() {
    const rows = customers.map(c => {
      const camp = c.camp as { name: string } | null;
      const apps = (c.applications as Customer[] | null) ?? [];
      return [
        c.id, c.full_name, c.nic_number, c.rank, c.branch,
        camp?.name, c.phone_number, c.email,
        c.retirement_date, c.risk_score,
        apps.filter(a => a.status === 'active').length, c.status,
      ].join(',');
    });
    const header = 'ID,Name,NIC,Rank,Branch,Camp,Phone,Email,Retirement,Risk,Phones,Status\n';
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-base-primary flex items-center gap-2">
            <Users size={28} className="text-[#2563ea]" /> Customers
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            {meta?.total ?? customers.length} registered
            {activeWithPlans > 0 && ` · ${activeWithPlans} with active plans`}
            {highRisk > 0 && ` · `}
            {highRisk > 0 && <span className="text-red-600 font-medium">{highRisk} high risk</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Download size={14} /> Export
          </button>
          <Link to="/customers/new" className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={14} /> Add Customer
          </Link>
        </div>
      </div>

      {/* Search + Branch chips */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
          <input
            className="form-input pl-9 text-sm"
            placeholder="Search name, NIC, service number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setParams(p => { p.set('q', search); p.set('page', '1'); return p; });
              }
            }}
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'army', 'navy', 'air_force'] as const).map(b => (
            <button
              key={b}
              onClick={() => { setBranch(b); setParams(p => { p.set('branch', b); p.set('page', '1'); return p; }); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${branch === b ? 'tab-pill-active' : 'tab-pill'
                }`}
            >
              {b === 'all' ? 'All' : BRANCH_LABEL[b]}
            </button>
          ))}
        </div>
        <button
          className="btn-primary text-sm px-4"
          onClick={() => setParams(p => { p.set('q', search); p.set('page', '1'); return p; })}
        >
          Search
        </button>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 panel-header rounded-xl">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-medium"
          >
            <Download size={12} /> Export
          </button>
          <button
            onClick={clearSelect}
            className="ml-auto flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-2 py-1.5 rounded-lg"
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* Main content */}
      <div className={`flex gap-4 ${quickView ? 'items-start' : ''}`}>
        {/* Table */}
        <div className="card overflow-hidden flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="surface-2 border-b border-base">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 cursor-pointer rounded border border-base bg-[var(--input-bg)] accent-amber-500"
                      checked={selected.size === customers.length && customers.length > 0}
                      onChange={e => e.target.checked ? selectAll() : clearSelect()}
                    />
                  </th>
                  {['Customer', 'NIC / Service No', 'Branch & Camp', 'Phones', 'Paid / Balance', 'Retirement', 'Risk', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-base-muted">Loading…</td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-base-muted">No customers found</td>
                  </tr>
                ) : customers.map(c => {
                  const cid = c.id as string;
                  const camp = c.camp as { name: string } | null;
                  const apps = (c.applications as Customer[] | null) ?? [];
                  const activePhones = apps.filter(a => a.status === 'active').length;
                  const totalPaid = apps.reduce((s, a) => s + Number(a.total_paid ?? 0), 0);
                  const totalOwed = apps.reduce((s, a) => s + Number(a.total_owed ?? 0), 0);
                  const riskScore = Number(c.risk_score ?? 0);
                  const isSelected = selected.has(cid);
                  const isViewing = quickView?.id === c.id;

                  return (
                    <tr
                      key={cid}
                      onClick={() => setQuickView(isViewing ? null : c)}
                      className={`cursor-pointer transition-colors ${isViewing ? 'bg-blue-50' : 'hover:bg-[var(--bg-surface-2)]'}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 cursor-pointer rounded border border-base bg-[var(--input-bg)] accent-amber-500"
                          checked={isSelected}
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleSelect(cid)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-base-primary">{(c.full_name_si as string) || (c.full_name as string)}</div>
                        {!!c.full_name_si && !!c.full_name && c.full_name_si !== c.full_name && (
                          <div className="text-[10px] text-base-muted mt-0.5">{c.full_name as string}</div>
                        )}
                        <div className="text-xs text-base-muted mt-0.5 capitalize">{c.rank as string}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="text-base-secondary">{(c.nic_number as string) || '—'}</div>
                        <div className="text-base-muted mt-0.5">{(c.service_number as string) || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        {!!c.branch && <BranchTag branch={c.branch as string} />}
                        {camp && <div className="text-xs text-base-muted mt-1 flex items-center gap-1"><Building2 size={11} className="opacity-60" /> {camp.name}</div>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg font-bold ${activePhones === 0 ? 'text-base-muted' :
                            activePhones === 1 ? 'text-slate-800' : 'text-amber-600'
                          }`}>
                          {activePhones}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-green-700">
                          LKR {(totalPaid / 1000).toFixed(0)}K
                        </div>
                        {totalOwed > 0 && (
                          <div className="text-xs font-semibold text-red-600 mt-0.5">
                            LKR {(totalOwed / 1000).toFixed(0)}K
                          </div>
                        )}
                        {totalOwed === 0 && totalPaid > 0 && (
                          <div className="text-xs text-green-600 font-medium mt-0.5">Clear</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-base-muted font-mono">
                        {(c.retirement_date as string) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge score={riskScore} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[(c.status as string) ?? ''] ?? 'surface-2 text-gray-600'
                          }`}>
                          {c.status as string}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            title="Quick view"
                            onClick={e => { e.stopPropagation(); setQuickView(isViewing ? null : c); }}
                            className="p-1.5 rounded-lg text-base-muted hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                          <Link
                            to={`/customers/${cid}`}
                            title="Full profile"
                            onClick={e => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-base-muted hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <FileText size={15} />
                          </Link>
                          <button
                            title="Edit customer"
                            onClick={e => { e.stopPropagation(); openEdit(c); }}
                            className="p-1.5 rounded-lg text-base-muted hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            title="Delete customer"
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(c); setDeleteError(''); }}
                            className="p-1.5 rounded-lg text-base-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.pages > 1 && (
            <div className="px-4 py-3 border-t border-base flex items-center justify-between text-sm text-gray-600">
              <span>Page {meta.page} of {meta.pages} ({meta.total} total)</span>
              <div className="flex gap-2">
                <button
                  disabled={meta.page <= 1}
                  onClick={() => setParams(p => { p.set('page', String(meta.page - 1)); return p; })}
                  className="btn-secondary disabled:opacity-40"
                >Prev</button>
                <button
                  disabled={meta.page >= meta.pages}
                  onClick={() => setParams(p => { p.set('page', String(meta.page + 1)); return p; })}
                  className="btn-secondary disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Quick panel */}
        {quickView && (
          <div className="w-72 shrink-0">
            <QuickPanel
              customer={quickView}
              onClose={() => setQuickView(null)}
              onProfile={() => window.location.href = `/customers/${quickView.id}`}
            />
          </div>
        )}
      </div>

      {/* Edit Customer Modal */}
      {editCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-[#0f172a] text-white flex items-center justify-between px-6 py-4">
              <h3 className="font-bold text-lg">Edit Customer</h3>
              <button onClick={() => setEditCustomer(null)} className="text-slate-400 hover:text-white p-1.5 rounded-lg border border-slate-700 bg-[#1e293b]"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              {editError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</div>}
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Full Name', 'full_name', 'text'],
                  ['Service No', 'service_number', 'text'],
                  ['NIC Number', 'nic_number', 'text'],
                  ['Rank', 'rank', 'text'],
                  ['Phone Number', 'phone_number', 'text'],
                ].map(([label, key, type]) => (
                  <div key={key} className={key === 'full_name' ? 'col-span-2' : ''}>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{label}</label>
                    <input type={type} className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300"
                      value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditCustomer(null)} className="px-4 py-2 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50">Cancel</button>
                <button onClick={submitEdit} disabled={editSubmitting} className="px-4 py-2 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5">
                  {editSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Customer Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <div className="font-bold text-base-primary">Delete Customer?</div>
                <div className="text-xs text-base-muted mt-0.5">{deleteConfirm.full_name as string}</div>
              </div>
            </div>
            <p className="text-sm text-base-secondary mb-4">This customer will be soft-deleted and removed from active lists. This cannot be undone easily.</p>
            {deleteError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{deleteError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setDeleteConfirm(null); setDeleteError(''); }} className="flex-1 py-2 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => deleteCustomer.mutate(deleteConfirm.id as string)}
                disabled={deleteCustomer.isPending}
                className="flex-1 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleteCustomer.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}