import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Building2, Plus, Loader2, AlertCircle, X, Check,
  RefreshCw, User, ChevronDown
} from 'lucide-react';

interface CompanyPayment {
  id: string;
  customer_id: string;
  application_id: string;
  amount: number;
  recovered_amount: number;
  status: 'outstanding' | 'partially_recovered' | 'fully_recovered';
  paid_at: string;
  notes?: string;
  customer?: { id: string; full_name: string; service_number: string; phone_number: string };
  application?: { id: string; ref_number: string; monthly_amount: number };
}

const STATUS_STYLES: Record<string, string> = {
  outstanding: 'bg-red-100 text-red-700',
  partially_recovered: 'bg-amber-100 text-amber-700',
  fully_recovered: 'bg-green-100 text-green-700',
};

const STATUS_LABELS: Record<string, string> = {
  outstanding: 'Outstanding',
  partially_recovered: 'Partially Recovered',
  fully_recovered: 'Fully Recovered',
};

export default function CompanyPaymentsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [recoverModal, setRecoverModal] = useState<CompanyPayment | null>(null);
  const [formErr, setFormErr] = useState('');

  // Autocomplete customers
  const [custSearch, setCustSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [recoverAmt, setRecoverAmt] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['company-payments', statusFilter],
    queryFn: () => api.get('/company-payments', { params: statusFilter ? { status: statusFilter } : {} }).then(r => r.data),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['company-payments-summary'],
    queryFn: () => api.get('/company-payments/summary').then(r => r.data),
  });

  const { data: custResults } = useQuery({
    queryKey: ['customer-search-cp', custSearch],
    queryFn: () => custSearch.length > 2 ? api.get('/customers', { params: { q: custSearch, limit: 5 } }).then(r => r.data.data ?? []) : [],
    enabled: custSearch.length > 2,
  });

  const { data: appsData } = useQuery({
    queryKey: ['customer-apps-cp', selectedCust?.id],
    queryFn: () => api.get('/applications', { params: { customer_id: selectedCust.id } }).then(r => r.data.data ?? []),
    enabled: !!selectedCust?.id,
  });

  const createMutation = useMutation({
    mutationFn: (payload: object) => api.post('/company-payments', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-payments'] });
      qc.invalidateQueries({ queryKey: ['company-payments-summary'] });
      closeModal();
    },
    onError: (e: any) => setFormErr(e?.response?.data?.error ?? 'Failed to create'),
  });

  const recoverMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post(`/company-payments/${id}/recover`, { recover_amount: amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-payments'] });
      qc.invalidateQueries({ queryKey: ['company-payments-summary'] });
      setRecoverModal(null);
      setRecoverAmt('');
    },
  });

  function closeModal() {
    setShowModal(false);
    setFormErr('');
    setCustSearch('');
    setSelectedCust(null);
    setSelectedApp(null);
    setAmount('');
    setNotes('');
  }

  const payments: CompanyPayment[] = data?.data ?? [];
  const summary = summaryData?.data ?? [];
  const totalOutstanding = summary.reduce((s: number, c: any) => s + c.outstanding, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 size={24} className="text-blue-500" /> AirVoice Payments
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track payments made by AirVoice on behalf of customers — recovered when customer pays
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          <Plus size={16} /> Record Payment
        </button>
      </div>

      {/* Outstanding Summary */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-75 mb-1">Total Outstanding</div>
        <div className="text-3xl font-bold">LKR {totalOutstanding.toLocaleString()}</div>
        <div className="text-sm opacity-75 mt-1">Across {summary.filter((c: any) => c.outstanding > 0).length} customers</div>
      </div>

      {/* Filter + Table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">All Statuses</option>
            <option value="outstanding">Outstanding</option>
            <option value="partially_recovered">Partially Recovered</option>
            <option value="fully_recovered">Fully Recovered</option>
          </select>
          <span className="text-sm text-slate-400">{payments.length} records</span>
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="animate-spin inline" size={24} /></div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Building2 size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No company payments recorded yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Customer', 'Application', 'Amount Paid', 'Recovered', 'Outstanding', 'Status', 'Date', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payments.map((p: CompanyPayment) => {
                const outstanding = Number(p.amount) - Number(p.recovered_amount);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{p.customer?.full_name ?? '—'}</div>
                      <div className="text-xs text-slate-400">{p.customer?.service_number}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.application?.ref_number ?? '—'}</td>
                    <td className="px-4 py-3 text-blue-700 font-mono font-bold">LKR {Number(p.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-green-600 font-mono">LKR {Number(p.recovered_amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-600 font-mono font-semibold">LKR {Math.max(0, outstanding).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{p.paid_at?.split('T')[0]}</td>
                    <td className="px-4 py-3">
                      {p.status !== 'fully_recovered' && (
                        <button
                          onClick={() => { setRecoverModal(p); setRecoverAmt(''); }}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg font-semibold transition"
                        >
                          <RefreshCw size={12} /> Recover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Record AirVoice Payment</h2>
              <button onClick={closeModal}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                  <AlertCircle size={14} /> {formErr}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Search Customer</label>
                {selectedCust ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-blue-800">{selectedCust.full_name}</div>
                      <div className="text-xs text-blue-500">{selectedCust.service_number}</div>
                    </div>
                    <button onClick={() => { setSelectedCust(null); setSelectedApp(null); setCustSearch(''); }} className="text-blue-400 hover:text-blue-700">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={custSearch}
                      onChange={e => setCustSearch(e.target.value)}
                      placeholder="Type name or service number..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    {(custResults as any[])?.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                        {(custResults as any[]).map((c: any) => (
                          <button key={c.id} onClick={() => { setSelectedCust(c); setCustSearch(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                            <span className="font-semibold">{c.full_name}</span>
                            <span className="text-slate-400 ml-2 text-xs">{c.service_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {selectedCust && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Application</label>
                  <select value={selectedApp?.id ?? ''} onChange={e => setSelectedApp((appsData as any[])?.find((a: any) => a.id === e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">Select application</option>
                    {(appsData as any[])?.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.ref_number} — LKR {Number(a.monthly_amount).toLocaleString()}/mo</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Amount Paid (LKR) *</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Reason for AirVoice paying on behalf..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button onClick={closeModal} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => {
                  if (!selectedCust) return setFormErr('Select a customer');
                  if (!selectedApp) return setFormErr('Select an application');
                  if (!amount || Number(amount) <= 0) return setFormErr('Enter a valid amount');
                  createMutation.mutate({
                    customer_id: selectedCust.id,
                    application_id: selectedApp.id,
                    amount: Number(amount),
                    notes,
                  });
                }}
                disabled={createMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
              >
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recover Modal */}
      {recoverModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Record Recovery</h2>
              <button onClick={() => setRecoverModal(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <div className="font-semibold text-slate-700">{recoverModal.customer?.full_name}</div>
                <div className="text-slate-400 text-xs mt-0.5">
                  Outstanding: LKR {(Number(recoverModal.amount) - Number(recoverModal.recovered_amount)).toLocaleString()}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Recovery Amount (LKR)</label>
                <input type="number" value={recoverAmt} onChange={e => setRecoverAmt(e.target.value)} min="0"
                  placeholder="Amount received from customer"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button onClick={() => setRecoverModal(null)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => recoverMutation.mutate({ id: recoverModal.id, amount: Number(recoverAmt) })}
                disabled={recoverMutation.isPending || !recoverAmt || Number(recoverAmt) <= 0}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
              >
                {recoverMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirm Recovery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
