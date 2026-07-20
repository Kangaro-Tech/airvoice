import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/services/api';
import { Link } from 'react-router-dom';
import {
  Shield, Users, FileText, CheckCircle2, XCircle, Clock,
  Gift, AlertCircle, Loader2, ChevronRight, Smartphone
} from 'lucide-react';

const ROLES = ['customer', 'guarantor', 'sales_officer', 'camp_officer', 'finance_officer', 'recovery_officer', 'inventory_manager', 'accountant', 'admin', 'super_admin'];
const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-100 text-red-800',
  super_admin: 'bg-purple-100 text-purple-800',
  finance_officer: 'bg-blue-100 text-blue-800',
  camp_officer: 'bg-green-100 text-green-800',
  sales_officer: 'bg-amber-100 text-amber-800',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  approved: 'bg-green-100 text-green-700 border border-green-200',
  rejected: 'bg-red-100 text-red-700 border border-red-200',
  dispatched: 'bg-blue-100 text-blue-700 border border-blue-200',
};

const TABS = ['User Management', 'Special Approvals', 'Free Phone Rewards'] as const;
type Tab = typeof TABS[number];

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('User Management');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [freePhoneRejectingId, setFreePhoneRejectingId] = useState<string | null>(null);
  const [freePhoneRejectReason, setFreePhoneRejectReason] = useState('');
  const [saStatusFilter, setSaStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // ── USER MANAGEMENT ─────────────────────────────────────────
  const { data: usersData } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => api.get('/users', { params: { role: roleFilter || undefined, limit: 50 } }).then(r => r.data),
  });
  const users = ((usersData?.data || []) as Record<string, unknown>[]).filter(u =>
    !search || (u.phone_number as string)?.includes(search) || (u.role as string)?.includes(search)
  );

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  // ── SPECIAL APPROVALS ────────────────────────────────────────
  const { data: specialApprovalsRes, isLoading: saLoading } = useQuery({
    queryKey: ['special-approval-requests-admin'],
    queryFn: () => api.get('/applications/special-approval-requests').then(r => r.data.data || []),
    refetchInterval: 8000,
    enabled: tab === 'Special Approvals',
  });
  const specialApprovals: any[] = specialApprovalsRes || [];
  const pendingSACount = specialApprovals.filter(r => r.status === 'pending').length;

  const reviewSpecialApproval = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'approve' | 'reject'; reason?: string }) =>
      api.post(`/applications/special-approval-requests/${id}/review`, { action, note: reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special-approval-requests-admin'] });
      setRejectingId(null);
      setRejectReason('');
    },
  });

  // ── FREE PHONE REWARDS ───────────────────────────────────────
  const { data: freePhoneRes, isLoading: fpLoading } = useQuery({
    queryKey: ['free-phone-requests-admin'],
    queryFn: () => api.get('/sales/free-phone-requests').then(r => r.data),
    enabled: tab === 'Free Phone Rewards',
    refetchInterval: 8000,
  });
  const freeRequests: any[] = freePhoneRes?.data || [];
  const pendingFPCount = freeRequests.filter(r => r.status === 'pending').length;

  const reviewFreePhone = useMutation({
    mutationFn: ({ id, action, rejected_reason }: { id: string; action: 'approve' | 'reject'; rejected_reason?: string }) =>
      api.post(`/sales/free-phone-requests/${id}/review`, { action, rejected_reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['free-phone-requests-admin'] });
      setFreePhoneRejectingId(null);
      setFreePhoneRejectReason('');
    },
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-base-primary flex items-center gap-2">
            <Shield size={22} className="text-[#2563ea]" /> Admin Panel
          </h1>
          <p className="text-sm text-base-muted mt-0.5">Manage users, review special approvals, and handle free phone requests.</p>
        </div>
        <Link to="/admin/audit-logs" className="flex items-center gap-1.5 px-4 py-2 border border-base text-sm font-medium rounded-xl hover:bg-[var(--bg-surface-2)] text-base-secondary transition-colors">
          <FileText size={15} /> Audit Logs
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-base">
        <nav className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? 'border-purple-500 text-purple-700'
                  : 'border-transparent text-base-muted hover:text-[var(--text-secondary)]'
              }`}
            >
              {t}
              {t === 'Special Approvals' && pendingSACount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5 leading-none">
                  {pendingSACount}
                </span>
              )}
              {t === 'Free Phone Rewards' && pendingFPCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5 leading-none">
                  {pendingFPCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── USER MANAGEMENT TAB ─────────────────── */}
      {tab === 'User Management' && (
        <>
          <div className="card p-4 flex gap-3">
            <input
              className="form-input flex-1"
              placeholder="Search by phone or role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="form-input w-48" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="surface-2 border-b border-base">
                <tr>
                  {['Phone', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id as string} className="hover:bg-[var(--bg-surface-2)]">
                    <td className="px-4 py-3 font-medium">{u.phone_number as string}</td>
                    <td className="px-4 py-3">
                      <select
                        className={`text-xs rounded px-2 py-1 border ${ROLE_BADGE[(u.role as string)] || 'surface-2 text-base-secondary border-base'}`}
                        value={u.role as string}
                        onChange={e => roleMutation.mutate({ id: u.id as string, role: e.target.value })}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${!!u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {!!u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-base-muted text-xs">
                      {u.last_login_at ? new Date(u.last_login_at as string).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      {!!u.is_active && (
                        <button
                          onClick={() => deactivateMutation.mutate(u.id as string)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Special Approvals' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertCircle size={18} className="shrink-0 text-amber-600" />
            <div>
              <span className="font-bold">Special Approval Review</span> — When a customer already has exactly <strong>2 active phone plans</strong>, a sales officer can submit a special approval request for a 3rd phone. Approve or reject these requests below.
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-base-muted uppercase tracking-wide">Show:</span>
            {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSaStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${
                  saStatusFilter === s
                    ? s === 'pending' ? 'bg-amber-500 text-white shadow-sm'
                      : s === 'approved' ? 'bg-green-500 text-white shadow-sm'
                      : s === 'rejected' ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-slate-800 text-white shadow-sm'
                    : 'surface-2 text-base-muted hover:bg-[var(--bg-surface-3)]'
                }`}
              >
                {s}
                {s === 'pending' && pendingSACount > 0 && (
                  <span className="ml-1.5 bg-white/30 text-white text-[10px] font-black rounded-full px-1.5 py-0.5">
                    {pendingSACount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {(() => {
            const filtered = saStatusFilter === 'all'
              ? specialApprovals
              : specialApprovals.filter(r => r.status === saStatusFilter);

            if (saLoading) return (
              <div className="py-12 text-center text-base-muted"><Loader2 className="animate-spin inline mr-2" />Loading special approval requests…</div>
            );
            if (filtered.length === 0) return (
              <div className="py-16 text-center">
                <CheckCircle2 size={36} className="mx-auto text-[#2563ea] mb-3" />
                <p className="font-semibold text-gray-600">
                  {saStatusFilter === 'pending' ? 'No pending special approval requests right now.' : `No ${saStatusFilter} requests found.`}
                </p>
                <p className="text-sm text-base-muted mt-1">All caught up! ✓</p>
              </div>
            );
            return (
              <div className="space-y-3">
                {filtered.map((req: any) => (
                  <div key={req.id} className="card p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${STATUS_BADGE[req.status] || 'surface-2 text-base-secondary'}`}>
                            {req.status}
                          </span>
                          <span className="text-xs text-base-muted">{new Date(req.created_at).toLocaleString()}</span>
                        </div>
                        <div className="font-bold text-base-primary">
                          {req.customer?.full_name || 'Unknown Customer'}{' '}
                          <span className="font-normal text-base-muted text-sm">— {req.customer?.rank}</span>
                        </div>
                        <div className="text-xs text-base-muted space-x-3">
                          <span>NIC: <span className="font-mono">{req.customer?.nic_number || '—'}</span></span>
                          <span>Svc #: <span className="font-mono">{req.customer?.service_number || '—'}</span></span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-base-secondary">
                          <Smartphone size={15} className="text-amber-500" />
                          {req.phone_model?.brand} {req.phone_model?.model}
                        </div>
                        <div className="text-xs text-base-muted mt-0.5">
                          LKR {req.phone_model?.sale_price?.toLocaleString() || '—'} · {req.term_months} months
                        </div>
                      </div>
                    </div>

                    {/* Justification */}
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 border border-slate-100">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Justification from Sales Officer</div>
                      {req.reason || '(No justification provided)'}
                    </div>

                    {/* Requested by */}
                    <div className="text-xs text-base-muted">
                      Requested by: <span className="font-medium text-base-secondary">{req.requested_by_user?.full_name || req.requested_by_user?.phone_number || 'Unknown officer'}</span>
                      {req.application && (
                        <span className="ml-2 text-blue-500">· App: {req.application.ref_number}</span>
                      )}
                    </div>

                    {/* Action buttons — only for pending */}
                    {req.status === 'pending' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => reviewSpecialApproval.mutate({ id: req.id, action: 'approve' })}
                            disabled={reviewSpecialApproval.isPending}
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
                          >
                            {reviewSpecialApproval.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-sm border border-red-200 transition-colors"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                        {rejectingId === req.id && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Reason for rejection (optional)…"
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              className="flex-1 border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                            />
                            <button
                              onClick={() => reviewSpecialApproval.mutate({ id: req.id, action: 'reject', reason: rejectReason || undefined })}
                              disabled={reviewSpecialApproval.isPending}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              {reviewSpecialApproval.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Reject'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {req.status !== 'pending' && (
                      <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                        req.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {req.status === 'approved'
                          ? `✓ Approved${req.review_note ? ` — ${req.review_note}` : ''}`
                          : `✕ Rejected${req.review_note ? ` — ${req.review_note}` : ''}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── FREE PHONE REWARDS TAB ─────────────────── */}
      {tab === 'Free Phone Rewards' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-800">
            <Gift size={18} className="shrink-0 text-purple-500" />
            <div>
              <span className="font-bold">Free Phone Reward Requests</span> — Submitted by Sales Officers or Camp Officers to reward outstanding military officers. Review and approve or reject below.
            </div>
          </div>

          {fpLoading ? (
            <div className="py-12 text-center text-base-muted"><Loader2 className="animate-spin inline mr-2" />Loading free phone requests…</div>
          ) : freeRequests.length === 0 ? (
            <div className="py-16 text-center">
              <Gift size={36} className="mx-auto text-purple-300 mb-3" />
              <p className="font-semibold text-gray-600">No free phone reward requests yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {freeRequests.map((req: any) => (
                <div key={req.id} className="card p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${STATUS_BADGE[req.status] || 'surface-2 text-base-secondary'}`}>
                          {req.status}
                        </span>
                        <span className="text-xs text-base-muted">{new Date(req.created_at).toLocaleString()}</span>
                      </div>
                      <div className="font-bold text-base-primary">
                        {req.officer_name}
                        <span className="font-normal text-base-muted text-sm"> — {req.officer_rank}</span>
                      </div>
                      <div className="text-xs text-base-muted space-x-3">
                        <span>Service #: <span className="font-mono">{req.officer_service || '—'}</span></span>
                        {req.camp?.name && <span>Camp: {req.camp.name}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-base-secondary">
                        <Smartphone size={15} className="text-purple-500" />
                        {req.phone_model}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 border border-slate-100">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Reason / Achievement</div>
                    {req.reason}
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => reviewFreePhone.mutate({ id: req.id, action: 'approve' })}
                          disabled={reviewFreePhone.isPending}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          {reviewFreePhone.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Approve
                        </button>
                        <button
                          onClick={() => setFreePhoneRejectingId(freePhoneRejectingId === req.id ? null : req.id)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-sm border border-red-200 transition-colors"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                      {freePhoneRejectingId === req.id && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Reason for rejection (optional)…"
                            value={freePhoneRejectReason}
                            onChange={e => setFreePhoneRejectReason(e.target.value)}
                            className="flex-1 border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                          />
                          <button
                            onClick={() => reviewFreePhone.mutate({ id: req.id, action: 'reject', rejected_reason: freePhoneRejectReason || undefined })}
                            disabled={reviewFreePhone.isPending}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
                          >
                            {reviewFreePhone.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Reject'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {req.status !== 'pending' && (
                    <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${req.status === 'approved' ? 'bg-green-50 text-green-700' : req.status === 'dispatched' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                      {req.status === 'approved' && '✓ Approved'}
                      {req.status === 'dispatched' && '📦 Dispatched'}
                      {req.status === 'rejected' && `✕ Rejected${req.rejected_reason ? ` — ${req.rejected_reason}` : ''}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
