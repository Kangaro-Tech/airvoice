import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import {
  Bell, CheckCheck, FileText, Users, AlertTriangle, RefreshCw,
  Loader2, Trash2, X, Filter, Megaphone, CreditCard, Shield,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  entity_type: string | null;
  read_at: string | null;
  created_at: string;
  fcm_sent: boolean;
  sms_sent: boolean;
}

// ── Type meta ──────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  application_status: { label: 'Application',     icon: FileText,       color: '#2563eb', bg: '#eff6ff' },
  payment_due:        { label: 'Payment',          icon: CreditCard,     color: '#d97706', bg: '#fffbeb' },
  guarantor_request:  { label: 'Guarantor',        icon: Users,          color: '#7c3aed', bg: '#f5f3ff' },
  guarantor_response: { label: 'Guarantor',        icon: Shield,         color: '#7c3aed', bg: '#f5f3ff' },
  recovery_alert:     { label: 'Recovery',         icon: AlertTriangle,  color: '#dc2626', bg: '#fef2f2' },
  stock_alert:        { label: 'Stock',            icon: RefreshCw,      color: '#16a34a', bg: '#f0fdf4' },
  system:             { label: 'System',           icon: Megaphone,      color: '#475569', bg: '#f8fafc' },
};

function getMeta(type: string) {
  return TYPE_META[type] ?? { label: 'Alert', icon: Bell, color: '#6b7280', bg: '#f9fafb' };
}

// ── Date grouping ──────────────────────────────────────────────────────────

function groupByDate(notifications: Notification[]) {
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Today',     items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Older',     items: [] },
  ];

  for (const n of notifications) {
    const d = new Date(n.created_at); d.setHours(0,0,0,0);
    if (d >= today)      groups[0].items.push(n);
    else if (d >= yesterday) groups[1].items.push(n);
    else if (d >= weekAgo)   groups[2].items.push(n);
    else                     groups[3].items.push(n);
  }
  return groups.filter(g => g.items.length > 0);
}

// ── Relative time ──────────────────────────────────────────────────────────

function relTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Filter options ─────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { key: 'all',               label: 'All' },
  { key: 'unread',            label: 'Unread' },
  { key: 'application_status',label: 'Applications' },
  { key: 'payment_due',       label: 'Payments' },
  { key: 'guarantor_request', label: 'Guarantors' },
  { key: 'recovery_alert',    label: 'Recovery' },
];

// ── Main Page ──────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch with 15s real-time polling ──────────────────────────────────
  const { data: res, isLoading, isFetching } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const all: Notification[] = res?.data ?? [];
  const unread = all.filter(n => !n.read_at).length;

  // ── Filtered list ──────────────────────────────────────────────────────
  const filtered = all.filter(n => {
    if (typeFilter === 'all')    return true;
    if (typeFilter === 'unread') return !n.read_at;
    return n.type === typeFilter || n.type.startsWith(typeFilter.replace('_request', ''));
  });

  const groups = groupByDate(filtered);

  // ── Mutations ──────────────────────────────────────────────────────────
  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['badge-counts'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['badge-counts'] });
    },
  });

  const deleteNotif = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onMutate: (id) => setDeletingId(id),
    onSettled: () => {
      setDeletingId(null);
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['badge-counts'] });
    },
  });

  // ── Request browser notification permission ───────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #0f1c2e 0%, #1a3a5c 100%)' }} className="px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Bell size={28} className="text-[#2563ea]" />
                <h1 className="text-2xl font-black text-white tracking-tight">Notifications</h1>
                {isFetching && !isLoading && (
                  <Loader2 size={14} className="text-blue-300 animate-spin" />
                )}
              </div>
              <p className="text-blue-300 text-sm">
                {all.length} total &nbsp;·&nbsp;
                <span className="text-amber-400 font-semibold">{unread} unread</span>
                &nbsp;·&nbsp; auto-refreshes every 15s
              </p>
            </div>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all bg-white/10 hover:bg-white/20 text-white border border-white/15 disabled:opacity-50"
              >
                {markAllRead.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCheck size={15} />}
                Mark All Read
              </button>
            )}
          </div>

          {/* Unread big badge */}
          {unread > 0 && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/30 px-4 py-2 rounded-full">
                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                <span className="text-red-300 text-xs font-semibold">{unread} unread notification{unread !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter pills ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 surface border-b border-base shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-2 overflow-x-auto">
          <Filter size={14} className="text-base-muted shrink-0" />
          {FILTER_OPTIONS.map(opt => {
            const count = opt.key === 'all'    ? all.length
                        : opt.key === 'unread' ? unread
                        : all.filter(n => n.type === opt.key || n.type.startsWith(opt.key.replace('_request',''))).length;
            return (
              <button
                key={opt.key}
                onClick={() => setTypeFilter(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  typeFilter === opt.key
                    ? 'bg-[#0f1c2e] text-white shadow-sm'
                    : 'surface-2 text-gray-600 hover:bg-[var(--bg-surface-3)]'
                }`}
              >
                {opt.label}
                {count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    typeFilter === opt.key ? 'bg-white/20 text-white' : 'surface-3 text-base-muted'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-base-muted">
            <Loader2 size={32} className="animate-spin mb-4 text-amber-400" />
            <p className="text-sm font-medium">Loading notifications…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-base-muted">
            <div className="w-16 h-16 rounded-2xl surface-2 flex items-center justify-center mb-4">
              <Bell size={28} className="opacity-30" />
            </div>
            <p className="font-semibold text-gray-600">No notifications</p>
            <p className="text-sm mt-1">
              {typeFilter !== 'all' ? 'Try changing the filter above' : "You'll receive alerts for applications, payments, and more"}
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              {/* Group label */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-black tracking-widest text-base-muted uppercase">{group.label}</span>
                <div className="flex-1 h-px surface-3" />
                <span className="text-[10px] font-bold text-base-muted">{group.items.length}</span>
              </div>

              {/* Notification cards */}
              <div className="space-y-2">
                {group.items.map(n => {
                  const meta = getMeta(n.type);
                  const Icon = meta.icon;
                  const isUnread = !n.read_at;
                  const isDeleting = deletingId === n.id;

                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (isUnread) {
                          markRead.mutate(n.id);
                        }
                        if (n.action_url) {
                          navigate(n.action_url);
                        }
                      }}
                      className={`group relative flex gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                        isUnread
                          ? 'surface border-amber-100 shadow-sm hover:border-amber-200 hover:shadow-md'
                          : 'bg-white/70 border-base hover:bg-[var(--bg-surface)] hover:border-[var(--border-color)]'
                      } ${isDeleting ? 'opacity-40 scale-95' : ''}`}
                    >
                      {/* Unread left accent */}
                      {isUnread && (
                        <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-amber-400" />
                      )}

                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: meta.bg }}
                      >
                        <Icon size={18} style={{ color: meta.color }} />
                      </div>

                      {/* Body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-sm font-bold truncate ${isUnread ? 'text-base-primary' : 'text-gray-600'}`}>
                              {n.title}
                            </span>
                            {isUnread && (
                              <span className="shrink-0 w-2 h-2 bg-amber-500 rounded-full" />
                            )}
                          </div>
                          <span className="text-[11px] text-base-muted shrink-0">{relTime(n.created_at)}</span>
                        </div>

                        <p className={`text-xs leading-relaxed mt-0.5 ${isUnread ? 'text-gray-600' : 'text-base-muted'}`}>
                          {n.body}
                        </p>

                        {/* Footer tags */}
                        <div className="flex items-center gap-3 mt-2">
                          <span
                            className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          {n.fcm_sent && <span className="text-[10px] text-base-muted">📱 FCM</span>}
                          {n.sms_sent && <span className="text-[10px] text-base-muted">💬 SMS</span>}
                          {n.action_url && (
                            <span className="text-[11px] text-amber-600 font-semibold hover:text-amber-800 transition-colors">
                              View →
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete button (appears on hover) */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteNotif.mutate(n.id); }}
                        disabled={isDeleting}
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete notification"
                      >
                        {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Total count footer */}
        {!isLoading && all.length > 0 && (
          <p className="text-center text-xs text-base-muted pb-4">
            Showing {filtered.length} of {all.length} notifications · refreshes every 15s
          </p>
        )}
      </div>
    </div>
  );
}
