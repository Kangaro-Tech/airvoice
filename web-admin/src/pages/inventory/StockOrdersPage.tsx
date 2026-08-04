import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Truck, Plus, CheckCircle2, XCircle, ClipboardList, Loader2,
  Package, AlertTriangle, Search, Download, Clock, RefreshCw
} from 'lucide-react';

interface StockOrder {
  id: string;
  quantity: number;
  unit_price: number | null;
  status: 'pending' | 'approved' | 'ordered' | 'received' | 'cancelled';
  notes: string | null;
  created_at: string;
  model: { brand: string; model: string; storage: string } | null;
  supplier: { name: string } | null;
  requested_by_user?: { phone_number: string } | null;
}

interface PhoneModel {
  id: string;
  brand: string;
  model: string;
  storage: string;
  in_stock: number;
  sale_price: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  approved:  'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  ordered:   'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300',
  received:  'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:   <Clock size={11} />,
  approved:  <CheckCircle2 size={11} />,
  ordered:   <Truck size={11} />,
  received:  <Package size={11} />,
  cancelled: <XCircle size={11} />,
};

export default function StockOrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ model_id: '', quantity: '1', unit_price: '', notes: '' });

  /* ── Data ── */
  const { data: ordersRes, isLoading } = useQuery({
    queryKey: ['stock-orders'],
    queryFn: () => api.get('/inventory/stock-orders').then(r => r.data),
  });
  const orders: StockOrder[] = ordersRes?.data ?? [];

  const { data: modelsRes } = useQuery({
    queryKey: ['inventory-models'],
    queryFn: () => api.get('/inventory/models').then(r => r.data),
  });
  const models: PhoneModel[] = modelsRes?.data ?? [];

  /* ── Mutations ── */
  const createOrder = useMutation({
    mutationFn: (payload: object) => api.post('/inventory/stock-orders', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-orders'] });
      setShowModal(false);
      setForm({ model_id: '', quantity: '1', unit_price: '', notes: '' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/inventory/stock-orders/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-orders'] }),
  });

  /* ── Derived ── */
  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      `${o.model?.brand} ${o.model?.model}`.toLowerCase().includes(search.toLowerCase()) ||
      o.supplier?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    pending:  orders.filter(o => o.status === 'pending').length,
    approved: orders.filter(o => o.status === 'approved').length,
    ordered:  orders.filter(o => o.status === 'ordered').length,
    received: orders.filter(o => o.status === 'received').length,
    totalValue: orders
      .filter(o => ['approved','ordered','received'].includes(o.status))
      .reduce((s, o) => s + (o.unit_price ?? 0) * o.quantity, 0),
  };

  const exportCsv = () => {
    const rows = orders.map(o => [
      o.id, `${o.model?.brand} ${o.model?.model}`, o.quantity,
      o.unit_price ?? '', o.status, o.supplier?.name ?? '', new Date(o.created_at).toLocaleDateString(),
    ]);
    const csv = [['ID','Model','Qty','Unit Price','Status','Supplier','Date'], ...rows]
      .map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'stock_orders.csv';
    a.click();
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Truck size={28} className="text-[#2563ea]" />
            Stock Orders
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            Request and manage phone stock replenishment from suppliers
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2 border border-base rounded-lg text-sm hover:bg-[var(--bg-surface-2)] transition-colors"
          >
            <Download size={14} /> Export
          </button>
          <button
            id="btn-new-order"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus size={16} /> New Order Request
          </button>
        </div>
      </div>



      {/* Stats */}
     <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Pending Approval', value: stats.pending,  color: 'text-sky-700 dark:text-sky-400',  bg: 'bg-sky-50 dark:bg-sky-500/10',  border: 'border-sky-200 dark:border-sky-500/30' },
          { label: 'Approved',         value: stats.approved, color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-500/10',   border: 'border-blue-200 dark:border-blue-500/30'  },
          { label: 'Ordered',          value: stats.ordered,  color: 'text-indigo-700 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-200 dark:border-indigo-500/30' },
          { label: 'Received',         value: stats.received, color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-500/10',  border: 'border-green-200 dark:border-green-500/30'  },
          { label: 'Total Order Value', value: `LKR ${(stats.totalValue / 1000).toFixed(0)}K`, color: 'text-base-secondary', bg: 'surface-2', border: 'border-base' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-base-muted mt-1 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
          <input
            className="w-full pl-9 pr-4 py-2.5 border border-base rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search model or supplier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {['all', 'pending', 'approved', 'ordered', 'received', 'cancelled'].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                statusFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="surface border border-base rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base">
          <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <ClipboardList size={15} className="text-slate-400" /> Order Requests
            <span className="text-slate-400 font-normal text-xs">({filtered.length})</span>
          </h2>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['stock-orders'] })}
            className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-base-muted">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading orders…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-base-muted">
            <Truck size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No stock orders found</p>
            <p className="text-xs mt-1">Click "New Order Request" to submit one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Order ID', 'Model', 'Qty', 'Unit Price', 'Total', 'Supplier', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{o.model?.brand} {o.model?.model}</div>
                      <div className="text-xs text-slate-400">{o.model?.storage}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-700">{o.quantity}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {o.unit_price ? `LKR ${o.unit_price.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      {o.unit_price
                        ? `LKR ${(o.unit_price * o.quantity).toLocaleString()}`
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{o.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[o.status]}`}>
                        {STATUS_ICONS[o.status]} {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(o.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3">
                      {o.status === 'pending' && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => updateStatus.mutate({ id: o.id, status: 'approved' })}
                            disabled={updateStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle2 size={11} /> Approve
                          </button>
                          <button
                            onClick={() => updateStatus.mutate({ id: o.id, status: 'cancelled' })}
                            disabled={updateStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                          >
                            <XCircle size={11} /> Reject
                          </button>
                        </div>
                      )}
                      {o.status === 'approved' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: o.id, status: 'ordered' })}
                          disabled={updateStatus.isPending}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          <Truck size={11} /> Mark Ordered
                        </button>
                      )}
                      {o.status === 'ordered' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: o.id, status: 'received' })}
                          disabled={updateStatus.isPending}
                          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                          <Package size={11} /> Mark Received
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Order Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-[28px] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-950 text-white">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] opacity-80">New Stock Order Request</div>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-full p-2 text-slate-300 hover:text-white hover:bg-white/10 transition">
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 surface">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Phone Model</label>
                <select
                  id="so-model"
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={form.model_id}
                  onChange={e => setForm(f => ({ ...f, model_id: e.target.value }))}
                >
                  <option value="">e.g. Samsung Galaxy A55 5G</option>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.brand} {m.model} {m.storage} — {m.in_stock} in stock
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Quantity</label>
                  <input
                    id="so-qty"
                    type="number"
                    min="1"
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Unit Price (LKR)</label>
                  <input
                    id="so-cost"
                    type="number"
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                    value={form.unit_price}
                    onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Notes / Justification</label>
                <textarea
                  id="so-notes"
                  rows={3}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Reason for stock request..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {!form.model_id && (
                <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300 rounded-2xl p-3">
                  <AlertTriangle size={14} /> Please select a phone model to continue.
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-full border border-slate-200 surface px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Close
              </button>
              <button
                onClick={() => createOrder.mutate({
                  model_id: form.model_id,
                  quantity: parseInt(form.quantity) || 1,
                  ...(form.unit_price ? { unit_price: parseFloat(form.unit_price) } : {}),
                  ...(form.notes ? { notes: form.notes } : {}),
                })}
                disabled={createOrder.isPending || !form.model_id}
                className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                {createOrder.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {createOrder.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
