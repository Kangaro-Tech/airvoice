import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Shield, User, Phone, CheckCircle2, MessageCircle, AlertTriangle,
  Search, Download, Loader2, ChevronRight, XCircle, Share2, Eye, ArrowRightLeft, Coins, Plus, X, Copy
} from 'lucide-react';

interface CustomerSummary {
  id: string;
  full_name: string;
  service_number: string;
  risk_score: number;
}

interface ApplicationSummary {
  id: string;
  ref_number: string;
  status: string;
  customer: CustomerSummary;
}

interface GuarantorRequestSummary {
  id: string;
  status: string;
  application: ApplicationSummary;
}

interface GuarantorRow {
  id: string;
  customer_id: string;
  full_name: string;
  nic_number: string;
  service_number: string;
  phone_number: string;
  branch: 'army' | 'navy' | 'air_force';
  monthly_salary: number;
  total_liability: number;
  affordability_ok: boolean;
  is_active: boolean;
  camp?: {
    id: string;
    name: string;
  };
  guarantor_requests?: GuarantorRequestSummary[];
}

interface OverdueCase {
  id: string;
  full_name: string;
  service_number: string;
  phone_number: string;
  email: string;
  risk_score: number;
  camp: { name: string; branch: string };
  guarantor: { name: string; phone: string };
  arrears_amount: number;
  missed_months: number;
}

export default function GuarantorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [campFilter, setCampFilter] = useState('all');
  const [selectedGuarantor, setSelectedGuarantor] = useState<GuarantorRow | null>(null);

  // ── Add Guarantor Modal state ──────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addSearchTouched, setAddSearchTouched] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    full_name: string;
    service_number: string;
    nic_number?: string;
    phone_number?: string;
    branch?: string;
    camp?: { name: string };
  } | null>(null);
  const [monthlySalary, setMonthlySalary] = useState('');

  // ── Pay Guarantor Modal state ─────────────────────────────────────────
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // 1. Fetch guarantors list
  const { data: guarantorsRes, isLoading: guarantorsLoading } = useQuery({
    queryKey: ['guarantors'],
    queryFn: () => api.get('/guarantors').then(r => r.data),
  });
  const guarantors: GuarantorRow[] = guarantorsRes?.data ?? [];

  // 2. Fetch overdue/transfer cases
  const { data: overdueRes } = useQuery({
    queryKey: ['recovery-overdue'],
    queryFn: () => api.get('/recovery/overdue').then(r => r.data),
  });
  const overdueCases: OverdueCase[] = overdueRes?.data ?? [];

  // 3. Customer search for Add Guarantor modal
  const { data: customerSearchRes, isLoading: customerSearchLoading } = useQuery({
    queryKey: ['customer-search-guarantor', addSearch],
    queryFn: () =>
      api.post('/guarantors/search', { value: addSearch }).then(r => r.data),
    enabled: addSearch.trim().length >= 3 && addSearchTouched,
    retry: false,
  });

  // 4. Mutation: register as guarantor
  const addGuarantorMutation = useMutation({
    mutationFn: (payload: { customer_id: string; monthly_salary?: number }) =>
      api.post('/guarantors', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guarantors'] });
      setShowAddModal(false);
      setAddSearch('');
      setAddSearchTouched(false);
      setSelectedCustomer(null);
      setMonthlySalary('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to register guarantor');
    },
  });

  // 5. Mutation for transfer to guarantor
  const transferMutation = useMutation({
    mutationFn: (payload: { customerId: string; split: number }) =>
      api.post('/recovery/transfer-guarantor', {
        customer_id: payload.customerId,
        reason: 'Deduction default transferred to guarantor',
        split_percentage: payload.split,
      }),
    onSuccess: () => {
      alert('Deduction successfully transferred to guarantor.');
      qc.invalidateQueries({ queryKey: ['guarantors'] });
      qc.invalidateQueries({ queryKey: ['recovery-overdue'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to perform transfer');
    },
  });

  // 5.5 Mutation for revert transfer
  const revertMutation = useMutation({
    mutationFn: (payload: { application_id: string; guarantor_customer_id: string; original_customer_id: string }) =>
      api.post('/recovery/transfer-revert', payload),
    onSuccess: () => {
      alert('Liability successfully reverted back to original customer.');
      qc.invalidateQueries({ queryKey: ['guarantors'] });
      qc.invalidateQueries({ queryKey: ['recovery-overdue'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to revert transfer');
    },
  });

  // 6. Mutation for guarantor payment
  const payMutation = useMutation({
    mutationFn: (payload: { customer_id: string; application_id: string; guarantor_id: string; amount: number; notes?: string }) =>
      api.post('/guarantors/pay', payload),
    onSuccess: () => {
      alert('Guarantor payment recorded successfully.');
      qc.invalidateQueries({ queryKey: ['guarantors'] });
      setShowPayModal(false);
      setPayAmount('');
      setPayNotes('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to record payment');
    },
  });

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddSearch('');
    setAddSearchTouched(false);
    setSelectedCustomer(null);
    setMonthlySalary('');
  };

  // Calculate dynamic stats
  const activeCount = guarantors.filter(g => g.is_active).length;
  const transferCasesCount = overdueCases.length;
  const totalLiabilityValue = guarantors.reduce((s, g) => s + Number(g.total_liability ?? 0), 0);

  // Branch filter counts
  const counts = useMemo(() => {
    const res = { army: 0, navy: 0, air_force: 0 };
    guarantors.forEach(g => {
      if (g.branch === 'army') res.army++;
      if (g.branch === 'navy') res.navy++;
      if (g.branch === 'air_force') res.air_force++;
    });
    return res;
  }, [guarantors]);

  // Camp filter options
  const campsList = useMemo(() => {
    const list = new Set<string>();
    guarantors.forEach(g => {
      if (g.camp?.name) list.add(g.camp.name);
    });
    return Array.from(list);
  }, [guarantors]);

  // Filter main list
  const filteredGuarantors = useMemo(() => {
    return guarantors.filter(g => {
      // Branch filter
      if (branchFilter !== 'all' && g.branch !== branchFilter) return false;
      // Camp filter
      if (campFilter !== 'all' && g.camp?.name !== campFilter) return false;
      // Search query
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        g.full_name?.toLowerCase().includes(q) ||
        g.service_number?.toLowerCase().includes(q) ||
        g.nic_number?.toLowerCase().includes(q) ||
        g.guarantor_requests?.some(req =>
          req.application?.customer?.full_name?.toLowerCase().includes(q)
        )
      );
    });
  }, [guarantors, branchFilter, campFilter, search]);

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Shield size={28} className="text-[#2563ea]" /> Guarantor Management
          </h1>
          <p className="text-sm text-base-muted mt-1">
            {activeCount} active guarantors · {filteredGuarantors.length} shown · LKR {totalLiabilityValue.toLocaleString()} total liability
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus size={15} /> Add Guarantor
          </button>
          <button
          onClick={() => {
            const headers = ['Guarantor Name', 'Service No', 'Branch', 'Camp', 'Guaranteed Customer', 'Liability'];
            const rows = filteredGuarantors.map(g => {
              const activeReq = g.guarantor_requests?.find(r => r.status === 'accepted');
              return [
                g.full_name,
                g.service_number,
                g.branch?.toUpperCase(),
                g.camp?.name ?? '',
                activeReq?.application?.customer?.full_name ?? '—',
                g.total_liability
              ];
            });
            const csvContent = "data:text/csv;charset=utf-8,"
              + [headers.join(','), ...rows.map(e => e.map(val => `"${val ?? ''}"`).join(","))].join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `guarantors_report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          className="flex items-center gap-2 px-4 py-2 surface border border-base rounded-lg text-sm font-semibold text-base-secondary hover:bg-[var(--bg-surface-2)] transition-colors shadow-sm"
        >
          <Download size={15} /> Export
        </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-3 gap-5">
        {[
          {
            label: 'ACTIVE GUARANTORS',
            value: activeCount,
            accent: 'border-l-[4px] border-blue-600',
            icon: Shield,
            iconColor: 'text-[#2563ea]'
          },
          {
            label: 'TRANSFER CASES',
            value: transferCasesCount,
            accent: 'border-l-[4px] border-red-500',
            icon: ArrowRightLeft,
            iconColor: 'text-[#2563ea]'
          },
          {
            label: 'TOTAL LIABILITY',
            value: `LKR ${totalLiabilityValue.toLocaleString()}`,
            accent: 'border-l-[4px] border-amber-500',
            icon: Coins,
            iconColor: 'text-[#2563ea]'
          }
        ].map(({ label, value, accent, icon: Icon, iconColor }) => (
          <div key={label} className={`surface rounded-2xl p-5 shadow-sm bg-white dark:bg-transparent flex items-center justify-between border-2 ${accent.replace('border-l-[4px] ', '')}`}>
            <div>
              <div className="text-[10px] font-bold tracking-widest text-base-muted uppercase">{label}</div>
              <div className="text-2xl font-black text-base-primary mt-2 font-mono">{value}</div>
            </div>
            <div className="p-3 rounded-full opacity-70">
              <Icon size={32} className={`${iconColor}`} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Search & Filter Row ── */}
      <div className="surface rounded-2xl p-4 shadow-sm border border-base flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[280px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base-muted" />
          <input
            className="w-full pl-10 pr-4 py-2.5 border border-base rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 surface-2"
            placeholder="Search guarantor name, NIC, service no, customer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Branch Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBranchFilter('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              branchFilter === 'all'
                ? 'bg-[#0f1c2e] text-white shadow-sm'
                : 'surface-2 text-base-secondary hover:bg-[var(--bg-surface-3)]'
            }`}
          >
            All Branches
          </button>
          {[
            { key: 'army', label: 'Army', count: counts.army },
            { key: 'navy', label: 'Navy', count: counts.navy },
            { key: 'air_force', label: 'Air Force', count: counts.air_force }
          ].map(b => (
            <button
              key={b.key}
              onClick={() => setBranchFilter(b.key)}
              className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                branchFilter === b.key
                  ? 'bg-[#0f1c2e] text-white shadow-sm'
                  : 'surface-2 text-base-secondary hover:bg-[var(--bg-surface-3)]'
              }`}
            >
              <span>{b.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${branchFilter === b.key ? 'bg-white/20 text-white' : 'surface-3 text-base-muted'}`}>
                {b.count}
              </span>
            </button>
          ))}
        </div>

        {/* Camp dropdown */}
        <div className="w-56">
          <select
            value={campFilter}
            onChange={e => setCampFilter(e.target.value)}
            className="w-full border border-base rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 surface"
          >
            <option value="all">All Camps</option>
            {campsList.map(camp => (
              <option key={camp} value={camp}>{camp}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Pending Deduction Transfer Alert ── */}
      {overdueCases.length > 0 && (
        <div className="bg-red-50/40 border border-red-100/70 rounded-2xl p-5 shadow-sm border-l-[4px] border-l-red-500">
          <div className="text-[10px] font-bold tracking-widest text-red-600 uppercase flex items-center gap-2 mb-3">
            <ArrowRightLeft size={12} /> {overdueCases.length} PENDING DEDUCTION TRANSFER CASE{overdueCases.length > 1 ? 'S' : ''}
          </div>
          <div className="divide-y divide-red-100/50">
            {overdueCases.map(c => (
              <div key={c.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                <div>
                  <div className="font-bold text-base-primary text-sm">
                    {c.full_name} <span className="text-base-muted font-medium mx-1">→</span> {c.guarantor?.name || 'Unknown Guarantor'}
                  </div>
                  <div className="text-xs text-base-muted mt-1">
                    Overdue: <span className="font-semibold text-red-600">{c.missed_months} months</span> · <span className="font-semibold text-base-secondary">LKR {c.arrears_amount.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.phone_number && (
                    <a
                      href={`https://wa.me/${c.phone_number.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => {
                      const splitStr = prompt(`Enter percentage of liability to transfer from ${c.full_name} to guarantor ${c.guarantor?.name || 'Unknown'} (e.g. 50 for 50%):`, "50");
                      if (!splitStr) return;
                      const split = parseInt(splitStr);
                      if (isNaN(split) || split <= 0 || split > 100) return alert('Invalid percentage');
                      if (confirm(`Are you sure you want to transfer ${split}% of liability from ${c.full_name} to guarantor ${c.guarantor?.name}?`)) {
                        transferMutation.mutate({ customerId: c.id, split });
                      }
                    }}
                    disabled={transferMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    <ArrowRightLeft size={14} /> {transferMutation.isPending ? 'Transferring...' : 'Transfer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main List & Details Side-by-side ── */}
      <div className="flex gap-6 items-start">
        {/* Active Guarantors Table */}
        <div className="flex-1 card overflow-hidden surface shadow-sm border border-base rounded-2xl">
          <div className="px-5 py-4 border-b border-base">
            <h3 className="font-bold text-base-primary text-sm flex items-center gap-2">
              <Shield size={16} className="text-blue-600" /> Active Guarantors ({filteredGuarantors.length})
            </h3>
          </div>
          {guarantorsLoading ? (
            <div className="flex items-center justify-center py-20 text-base-muted">
              <Loader2 size={24} className="animate-spin mr-2" /> Loading guarantors...
            </div>
          ) : filteredGuarantors.length === 0 ? (
            <div className="py-20 text-center text-base-muted">
              <Shield size={40} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm">No active guarantors match criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0e1f33] text-white uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    <th className="px-5 py-3.5">Guarantor</th>
                    <th className="px-5 py-3.5">Branch / Camp</th>
                    <th className="px-5 py-3.5">Guaranteed Customer</th>
                    <th className="px-5 py-3.5">App ID</th>
                    <th className="px-5 py-3.5">Monthly</th>
                    <th className="px-5 py-3.5">Liability</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Risk</th>
                    <th className="px-5 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {filteredGuarantors.map(g => {
                    const activeReq = g.guarantor_requests?.find(r => r.status === 'accepted');
                    const hasApp = activeReq?.application;
                    const custName = activeReq?.application?.customer?.full_name ?? '—';
                    const custService = activeReq?.application?.customer?.service_number ?? '';
                    const riskScore = activeReq?.application?.customer?.risk_score ?? null;

                    return (
                      <tr
                        key={g.id}
                        onClick={() => setSelectedGuarantor(g)}
                        className={`hover:bg-[var(--bg-surface-2)] cursor-pointer transition-colors ${
                          selectedGuarantor?.id === g.id ? 'bg-[var(--bg-surface-2)]' : ''
                        }`}
                      >
                        {/* Guarantor Name & Rank */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-base-primary">{g.full_name}</div>
                          <div className="text-[10px] text-base-muted font-mono mt-0.5">{g.service_number}</div>
                        </td>

                        {/* Branch / Camp */}
                        <td className="px-5 py-4">
                          <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                            g.branch === 'navy' ? 'bg-blue-50 text-blue-700' :
                            g.branch === 'army' ? 'bg-green-50 text-green-700' :
                            'bg-purple-50 text-purple-700'
                          }`}>
                            {g.branch}
                          </span>
                          <div className="text-[10px] text-base-muted mt-1 truncate max-w-[150px]">{g.camp?.name || '—'}</div>
                        </td>

                        {/* Guaranteed Customer */}
                        <td className="px-5 py-4">
                          {custName !== '—' ? (
                            <>
                              <div className="font-semibold text-base-secondary">{custName}</div>
                              <div className="text-[10px] text-base-muted font-mono mt-0.5">{custService}</div>
                            </>
                          ) : (
                            <span className="text-base-muted">—</span>
                          )}
                        </td>

                        {/* App ID */}
                        <td className="px-5 py-4 text-base-muted font-mono">
                          {hasApp?.ref_number || '—'}
                        </td>

                        {/* Monthly Salary */}
                        <td className="px-5 py-4 font-mono text-base-secondary">
                          {g.monthly_salary ? `LKR ${Number(g.monthly_salary).toLocaleString()}` : '—'}
                        </td>

                        {/* Liability */}
                        <td className="px-5 py-4">
                          {g.total_liability > 0 ? (
                            <span className="font-bold text-amber-600 font-mono">LKR {Number(g.total_liability).toLocaleString()}</span>
                          ) : (
                            <span className="font-bold text-emerald-600">Clear</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${hasApp ? 'bg-emerald-500' : 'bg-base-muted'}`} />
                            <span className="font-semibold text-base-secondary">
                              {hasApp ? 'Active Guarantee' : 'No Active App'}
                            </span>
                          </div>
                        </td>

                        {/* Risk Score */}
                        <td className="px-5 py-4">
                          {riskScore !== null ? (
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold ${
                              riskScore > 12 ? 'bg-red-50 text-red-700' :
                              riskScore > 6 ? 'bg-amber-50 text-amber-700' :
                              'bg-green-50 text-green-700'
                            }`}>
                              {riskScore}
                            </span>
                          ) : (
                            <span className="text-base-muted">—</span>
                          )}
                        </td>

                        {/* Eye icon action */}
                        <td className="px-5 py-4 text-right">
                          <button className="w-8 h-8 rounded-lg surface-2 flex items-center justify-center text-base-muted hover:bg-[var(--bg-surface-2)] hover:text-base-secondary transition-colors">
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Guarantor detail sidebar */}
        {selectedGuarantor && (
          <div className="w-80 shrink-0 space-y-4">
            <div className="surface rounded-2xl shadow-sm border border-base overflow-hidden">
              <div className="px-5 py-4 border-b border-base flex items-center justify-between">
                <h3 className="font-bold text-base-primary text-sm flex items-center gap-2">
                  <User size={15} className="text-blue-600" /> Guarantor Profile
                </h3>
                <button
                  onClick={() => setSelectedGuarantor(null)}
                  className="text-base-muted hover:text-base-secondary p-1 hover:bg-[var(--bg-surface-2)] rounded-lg transition-colors"
                >
                  <XCircle size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {[
                  ['Name', selectedGuarantor.full_name],
                  ['Service No', selectedGuarantor.service_number],
                  ['NIC', selectedGuarantor.nic_number],
                  ['Branch', selectedGuarantor.branch?.toUpperCase()],
                  ['Camp', selectedGuarantor.camp?.name || '—'],
                  ['Guaranteed Owed', `LKR ${selectedGuarantor.total_liability.toLocaleString()}`],
                  ['Salary', selectedGuarantor.monthly_salary ? `LKR ${selectedGuarantor.monthly_salary.toLocaleString()}` : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-start text-xs border-b border-base pb-2">
                    <span className="text-base-muted font-semibold">{label}</span>
                    <span className="font-bold text-base-secondary text-right max-w-[160px]">{value}</span>
                  </div>
                ))}
              </div>

              <div className="px-5 pb-5 flex gap-2">
                {selectedGuarantor.phone_number && (
                  <a
                    href={`https://wa.me/${selectedGuarantor.phone_number.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                )}
                <button
                  onClick={() => {
                    const activeReq = selectedGuarantor.guarantor_requests?.find(r => r.status === 'accepted');
                    const shareText = `AIRVOICE Guarantor Status:\nName: ${selectedGuarantor.full_name}\nService No: ${selectedGuarantor.service_number}\nTotal Guaranteed: LKR ${selectedGuarantor.total_liability}\nGuaranteed Customer: ${activeReq?.application?.customer?.full_name ?? 'None'}`;
                    navigator.clipboard.writeText(shareText);
                    alert('Profile summary copied to clipboard!');
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 surface-2 hover:bg-[var(--bg-surface-3)] text-base-secondary rounded-xl text-xs font-semibold transition-colors"
                >
                  <Copy size={14} /> Copy Summary
                </button>
              </div>

              {selectedGuarantor.total_liability > 0 && selectedGuarantor.guarantor_requests?.find((r: any) => r.status === 'accepted')?.application && (
                <div className="px-5 pb-5">
                  <button
                    onClick={() => {
                      const activeReq = selectedGuarantor.guarantor_requests?.find((r: any) => r.status === 'accepted');
                      if (!activeReq || !activeReq.application) return;
                      if (confirm(`Are you sure you want to revert liability back to ${activeReq.application.customer?.full_name}?`)) {
                        revertMutation.mutate({
                          application_id: activeReq.application.id,
                          guarantor_customer_id: selectedGuarantor.id,
                          original_customer_id: activeReq.application.customer?.id
                        });
                      }
                    }}
                    disabled={revertMutation.isPending}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    <ArrowRightLeft size={14} /> {revertMutation.isPending ? 'Reverting...' : 'Revert Liability'}
                  </button>
                </div>
              )}

              <div className="px-5 pb-5">
                <button
                  onClick={() => setShowPayModal(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  <Coins size={14} /> Record Payment
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Guarantor Modal ──────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ background: '#0f1c2e' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Shield size={16} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Register New Guarantor</h3>
                  <p className="text-blue-300 text-xs">Search customer by NIC, service no, or phone</p>
                </div>
              </div>
              <button onClick={closeAddModal} className="text-white/50 hover:text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Search */}
              {!selectedCustomer ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-base-muted uppercase tracking-widest mb-1.5">SEARCH CUSTOMER</label>
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
                      <input
                        type="text"
                        value={addSearch}
                        onChange={e => { setAddSearch(e.target.value); setAddSearchTouched(true); }}
                        placeholder="Enter NIC / Service No / Phone number…"
                        className="w-full pl-9 pr-4 py-2.5 border border-base rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        autoFocus
                      />
                      {customerSearchLoading && (
                        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-base-muted animate-spin" />
                      )}
                    </div>
                  </div>

                  {/* Search result */}
                  {addSearchTouched && addSearch.trim().length >= 3 && !customerSearchLoading && (
                    customerSearchRes?.found ? (
                      <div
                        onClick={() => setSelectedCustomer(customerSearchRes.customer)}
                        className="border border-blue-200 rounded-xl p-4 cursor-pointer hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                            {customerSearchRes.customer.full_name?.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-base-primary">{customerSearchRes.customer.full_name}</div>
                            <div className="text-xs text-base-muted font-mono">
                              {customerSearchRes.customer.service_number} · {customerSearchRes.customer.branch?.toUpperCase()} · {customerSearchRes.customer.camp?.name ?? '—'}
                            </div>
                          </div>
                          <div className="ml-auto">
                            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-1 rounded-lg">Select →</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-base-muted">
                        <AlertTriangle size={28} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No customer found with that NIC / service number / phone</p>
                      </div>
                    )
                  )}
                </div>
              ) : (
                /* Selected customer + salary */
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
                      {selectedCustomer.full_name?.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-base-primary text-sm">{selectedCustomer.full_name}</div>
                      <div className="text-xs text-base-muted font-mono">
                        {selectedCustomer.service_number} · {selectedCustomer.branch?.toUpperCase()}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedCustomer(null); setAddSearch(''); setAddSearchTouched(false); }}
                      className="text-base-muted hover:text-base-secondary p-1"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-base-muted uppercase tracking-widest mb-1.5">MONTHLY SALARY (LKR)</label>
                    <input
                      type="number"
                      value={monthlySalary}
                      onChange={e => setMonthlySalary(e.target.value)}
                      placeholder="e.g. 85000"
                      min={0}
                      className="w-full border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <p className="text-xs text-base-muted mt-1">Used to assess affordability. Optional but recommended.</p>
                  </div>

                  {/* Info note */}
                  <div className="flex gap-2.5 items-start bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Registering a guarantor makes them eligible to be selected as guarantor for future applications. A legal consent is required from them when accepting a guarantor request.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                onClick={closeAddModal}
                className="px-4 py-2.5 border border-base rounded-xl text-sm font-medium hover:bg-[var(--bg-surface-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!selectedCustomer) return;
                  addGuarantorMutation.mutate({
                    customer_id: selectedCustomer.id,
                    monthly_salary: monthlySalary ? parseFloat(monthlySalary) : undefined,
                  });
                }}
                disabled={!selectedCustomer || addGuarantorMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {addGuarantorMutation.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Registering…</>
                ) : (
                  <><Shield size={14} /> Register Guarantor</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pay Guarantor Modal ──────────────────────────────────────────── */}
      {showPayModal && selectedGuarantor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-base">
              <h3 className="font-bold text-base-primary text-sm flex items-center gap-2">
                <Coins size={16} className="text-blue-600" /> Record Payment
              </h3>
              <button onClick={() => setShowPayModal(false)} className="text-base-muted hover:text-base-secondary p-1">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm">
                <div className="font-semibold text-blue-900">{selectedGuarantor.full_name}</div>
                <div className="text-blue-700 text-xs mt-0.5">Paying on behalf of customer</div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-base-muted uppercase tracking-widest mb-1.5">Amount (LKR)</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  min={1}
                  className="w-full border border-base rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-base-muted uppercase tracking-widest mb-1.5">Notes</label>
                <textarea
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-base rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-2 justify-end">
              <button onClick={() => setShowPayModal(false)} className="px-4 py-2 border border-base rounded-xl text-sm font-medium">Cancel</button>
              <button
                onClick={() => {
                  const activeReq = selectedGuarantor.guarantor_requests?.find(r => r.status === 'accepted');
                  if (!activeReq) return alert('No active guaranteed application found.');
                  if (!payAmount || Number(payAmount) <= 0) return alert('Enter a valid amount.');
                  
                  payMutation.mutate({
                    customer_id: activeReq.application.customer.id,
                    application_id: activeReq.application.id,
                    guarantor_id: selectedGuarantor.id,
                    amount: Number(payAmount),
                    notes: payNotes
                  });
                }}
                disabled={payMutation.isPending || !payAmount}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {payMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}