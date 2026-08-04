import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import * as XLSX from 'xlsx';
import {
  DollarSign, Plus, Pencil, Trash2, TrendingUp, TrendingDown,
  Loader2, AlertCircle, X, Check, Wallet, Download
} from 'lucide-react';

interface PettyCashEntry {
  id: string;
  entry_date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  category?: string;
  reference_number?: string;
  created_at: string;
}

const CATEGORIES = ['Office Supplies', 'Transport', 'Meals', 'Repairs', 'Postage', 'Miscellaneous'];

const emptyForm = {
  entry_date: new Date().toISOString().split('T')[0],
  description: '',
  amount: '',
  type: 'debit' as 'credit' | 'debit',
  category: '',
  reference_number: '',
};

export default function PettyCashPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<PettyCashEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formErr, setFormErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['petty-cash', month],
    queryFn: () => api.get('/petty-cash', { params: { month } }).then(r => r.data),
  });

  const entries: PettyCashEntry[] = data?.data ?? [];
  const balance: number = data?.balance ?? 0;

  const createMutation = useMutation({
    mutationFn: (payload: object) => api.post('/petty-cash', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['petty-cash'] }); closeModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.error ?? 'Failed to save'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) => api.put(`/petty-cash/${id}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['petty-cash'] }); closeModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.error ?? 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/petty-cash/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['petty-cash'] }); setDeleteConfirm(null); },
  });

  function openCreate() {
    setEditEntry(null);
    setForm(emptyForm);
    setFormErr('');
    setShowModal(true);
  }

  function openEdit(entry: PettyCashEntry) {
    setEditEntry(entry);
    setForm({
      entry_date: entry.entry_date,
      description: entry.description,
      amount: String(entry.amount),
      type: entry.type,
      category: entry.category ?? '',
      reference_number: entry.reference_number ?? '',
    });
    setFormErr('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditEntry(null);
    setForm(emptyForm);
    setFormErr('');
  }

  function handleSubmit() {
    if (!form.description.trim()) return setFormErr('Description is required');
    if (!form.amount || Number(form.amount) <= 0) return setFormErr('Enter a valid amount');
    const payload = { ...form, amount: Number(form.amount) };
    if (editEntry) {
      updateMutation.mutate({ id: editEntry.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const totalCredits = entries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  const totalDebits = entries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0);

  function exportExcel() {
    const rows = entries.map(e => ({
      'Date': e.entry_date,
      'Description': e.description,
      'Category': e.category ?? '',
      'Reference': e.reference_number ?? '',
      'Type': e.type === 'credit' ? 'IN' : 'OUT',
      'Amount (LKR)': Number(e.amount ?? 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Petty Cash ${month}`);
    XLSX.writeFile(wb, `petty_cash_${month}.xlsx`);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet size={24} className="text-blue-600" /> Petty Cash
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Office petty cash income &amp; expense tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <Download size={15} /> Export
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            <TrendingUp size={14} className="text-green-500" /> Total Credits
          </div>
          <div className="text-2xl font-bold text-green-600">LKR {totalCredits.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            <TrendingDown size={14} className="text-red-500" /> Total Debits
          </div>
          <div className="text-2xl font-bold text-red-600">LKR {totalDebits.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            <DollarSign size={14} className="text-blue-600" /> Running Balance
          </div>
          <div className={`text-2xl font-bold ${balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
            LKR {balance.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="animate-spin inline" size={24} /></div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Wallet size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No petty cash entries for this month</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Date', 'Description', 'Category', 'Ref No.', 'Credit', 'Debit', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{entry.entry_date}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{entry.description}</td>
                  <td className="px-4 py-3 text-slate-500">{entry.category || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{entry.reference_number || '—'}</td>
                  <td className="px-4 py-3 text-green-600 font-mono font-semibold">
                    {entry.type === 'credit' ? `LKR ${Number(entry.amount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-red-600 font-mono font-semibold">
                    {entry.type === 'debit' ? `LKR ${Number(entry.amount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(entry)} className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-amber-50 transition">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteConfirm(entry.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editEntry ? 'Edit Entry' : 'New Petty Cash Entry'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                  <AlertCircle size={14} /> {formErr}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
                  <input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
                  <div className="flex gap-2">
                    {(['credit', 'debit'] as const).map(t => (
                      <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize border transition ${form.type === t
                          ? t === 'credit' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description *</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What is this for?"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (LKR) *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    min="0" step="0.01" placeholder="0.00"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <option value="">None</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Reference Number</label>
                <input type="text" value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
                  placeholder="Optional receipt/reference no."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button onClick={closeModal} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editEntry ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <Trash2 size={32} className="text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-slate-800 mb-1">Delete Entry?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm!)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition"
              >
                {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin inline" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
