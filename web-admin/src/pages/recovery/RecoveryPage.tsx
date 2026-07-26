import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import {
  AlertTriangle, Phone, MessageCircle, Clock,
  Search, RefreshCw, Download, User, Shield,
  TrendingDown, CheckCircle, PlusCircle, Scale, Users,
  FileText, Mail, Check, X, Loader2, ChevronDown
} from 'lucide-react';

interface OverdueCustomer {
  id: string;
  full_name: string;
  service_number: string;
  phone_number: string;
  email: string;
  risk_level: 'low' | 'medium' | 'high';
  risk_score: number;
  camp: { name: string; branch: string } | null;
  guarantor: { name: string; phone: string } | null;
  arrears_amount: number;
  missed_months: number;
  last_contact_date: string;
  last_contact_outcome: string;
  applications: any[];
}

export default function RecoveryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<OverdueCustomer | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showWaModal, setShowWaModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  
  const [letterForm, setLetterForm] = useState({
    letter_type: 'reminder',
    notes: ''
  });
  
  // PDF viewer state
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfContent, setPdfContent] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  
  // After transfer, store the draft letter returned from server
  const [transferDraftLetter, setTransferDraftLetter] = useState('');
  const [transferDone, setTransferDone] = useState(false);
  const [legalNoticeLetter, setLegalNoticeLetter] = useState('');
  const [legalNoticeDone, setLegalNoticeDone] = useState(false);
  
  const [logForm, setLogForm] = useState({
    contact_method: 'phone_call',
    outcome: 'pending',
    notes: '',
    promise_to_pay_date: '',
    promise_amount: '',
  });

  const [waTemplate, setWaTemplate] = useState('overdue_notice');
  const [waCustomMessage, setWaCustomMessage] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const { data: overdueRes, isLoading } = useQuery({
    queryKey: ['recovery-overdue'],
    queryFn: () => api.get('/recovery/overdue').then(r => r.data),
    refetchOnWindowFocus: true,
  });

  const { data: pendingTransfersRes } = useQuery({
    queryKey: ['pending-transfers'],
    queryFn: () => api.get('/recovery/transfer-requests').then(r => r.data),
    enabled: isAdmin,
    refetchOnWindowFocus: true,
  });
  const pendingTransfers = pendingTransfersRes?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/recovery/transfer-requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-transfers'] });
      qc.invalidateQueries({ queryKey: ['recovery-overdue'] });
      alert('Transfer approved! Installments moved to guarantor.');
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/recovery/transfer-requests/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-transfers'] });
      alert('Transfer request rejected.');
    },
  });

  const { data: logsRes } = useQuery({
    queryKey: ['recovery-logs', selectedCustomer?.id],
    queryFn: () => api.get('/recovery/logs', { params: { customer_id: selectedCustomer?.id } }).then(r => r.data),
    enabled: !!selectedCustomer,
  });

  const addLogMutation = useMutation({
    mutationFn: (payload: object) => api.post('/recovery/logs', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recovery-logs'] });
      setShowLogModal(false);
      setLogForm({ contact_method: 'phone_call', outcome: 'pending', notes: '', promise_to_pay_date: '', promise_amount: '' });
      alert('Action logged successfully!');
    },
  });

  const transferGuarantorMutation = useMutation({
    mutationFn: (payload: { customer_id: string; reason: string }) => api.post('/recovery/transfer-guarantor', payload),
    onSuccess: (res) => {
      const data = res?.data;
      setTransferDraftLetter(data?.draft_letter ?? '');
      setTransferDone(true);
      qc.invalidateQueries({ queryKey: ['recovery-overdue'] });
      qc.invalidateQueries({ queryKey: ['guarantors'] });
      if (isAdmin) qc.invalidateQueries({ queryKey: ['pending-transfers'] });
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Failed to submit transfer request'),
  });

  const sendLegalNoticeMutation = useMutation({
    mutationFn: (payload: { customer_id: string; notes?: string }) => api.post('/recovery/legal-notice', payload),
    onSuccess: (res) => {
      const data = res?.data;
      setLegalNoticeLetter(data?.letter_body ?? '');
      setLegalNoticeDone(true);
      qc.invalidateQueries({ queryKey: ['recovery-overdue'] });
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Failed to issue legal notice'),
  });

  const sendLetterMutation = useMutation({
    mutationFn: (payload: { customer_id: string; letter_type: string; notes?: string }) => api.post('/recovery/letters', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recovery-logs'] });
      setShowLetterModal(false);
      setLetterForm({ letter_type: 'reminder', notes: '' });
      alert('Recovery letter drafted successfully!');
    }
  });

  const customers: OverdueCustomer[] = (overdueRes?.data ?? []).filter((c: OverdueCustomer) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.full_name?.toLowerCase().includes(q) || c.service_number?.toLowerCase().includes(q);
  });

  const stats = {
    total: overdueRes?.data?.length ?? 0,
    high: (overdueRes?.data ?? []).filter((c: OverdueCustomer) => c.risk_level === 'high').length,
    medium: (overdueRes?.data ?? []).filter((c: OverdueCustomer) => c.risk_level === 'medium').length,
  };

  const handleOpenWaComposer = (c: OverdueCustomer) => {
    setSelectedCustomer(c);
    const templateText = `Dear ${c.full_name}, your AIRVOICE installment (LKR ${c.arrears_amount}) is overdue. Please contact your camp salary officer or call us on +94 11 234 5678 immediately.`;
    setWaCustomMessage(templateText);
    setShowWaModal(true);
  };

  const handleSendWa = () => {
    if (!selectedCustomer) return;
    const encoded = encodeURIComponent(waCustomMessage);
    const url = `https://wa.me/${selectedCustomer.phone_number.replace(/[^0-9]/g, '')}?text=${encoded}`;
    window.open(url, '_blank');
    setShowWaModal(false);
  };

  const handleSendSms = (c: OverdueCustomer) => {
    alert(`SMS alert triggered to ${c.full_name} (${c.phone_number})`);
  };

  const handleLegalNotice = (c: OverdueCustomer) => {
    setSelectedCustomer(c);
    setLegalNoticeLetter('');
    setLegalNoticeDone(false);
    // Open a confirm then issue
    if (confirm(`Issue a Legal Notice to ${c.full_name}? This will generate a formal letter.`)) {
      sendLegalNoticeMutation.mutate({ customer_id: c.id });
    }
  };

  // PDF download helper using window.print on a styled div
  const downloadPDF = (content: string, title: string) => {
    setPdfContent(content);
    setPdfTitle(title);
    setShowPdfModal(true);
  };

  const handleLogAction = (c: OverdueCustomer) => {
    setSelectedCustomer(c);
    setShowLogModal(true);
  };

  const handleSubmitLog = () => {
    if (!selectedCustomer) return;
    const app = selectedCustomer.applications?.[0];
    addLogMutation.mutate({
      application_id: app?.id || '00000000-0000-0000-0000-000000000000',
      customer_id: selectedCustomer.id,
      contact_method: logForm.contact_method,
      contacted_at: new Date().toISOString(),
      outcome: logForm.outcome,
      notes: logForm.notes,
      ...(logForm.promise_to_pay_date ? { promise_to_pay_date: logForm.promise_to_pay_date } : {}),
      ...(logForm.promise_amount ? { promise_amount: parseFloat(logForm.promise_amount) } : {}),
    });
  };

  const handleExportCSV = () => {
    const rows = customers.map(c => [
      c.full_name, c.service_number, c.camp?.name ?? '—', c.risk_level.toUpperCase(), c.risk_score, c.arrears_amount
    ]);
    const csv = [['Name', 'Service No', 'Camp', 'Risk', 'Score', 'Arrears Amount'], ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'overdue_customers.csv';
    a.click();
  };

  if (isLoading) return <div className="p-6">Loading recovery data…</div>;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-base-primary">
            <RefreshCw size={28} className="text-[#2563ea]" /> Recovery Management
          </h1>
          <p className="text-sm text-base-muted">
            {stats.total} overdue accounts · {stats.high} high risk · {stats.medium} medium risk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="btn btn-secondary text-sm flex items-center gap-1.5">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Admin Pending Transfer Approvals */}
      {isAdmin && pendingTransfers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-amber-200 bg-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-amber-700" />
              <span className="font-bold text-amber-800 text-sm">Pending Guarantor Transfer Approvals ({pendingTransfers.length})</span>
            </div>
            <span className="text-xs text-amber-600">Action required by Admin</span>
          </div>
          <div className="divide-y divide-amber-100">
            {pendingTransfers.map((t: any) => (
              <div key={t.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{t.customer?.full_name} <span className="text-slate-400 font-normal">→ Guarantor: {t.meta?.guarantor_name ?? '—'}</span></div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.customer?.service_number} · {(t.customer?.camp as any)?.name ?? '—'} · App: {t.application?.ref_number ?? '—'}</div>
                    <div className="text-xs text-amber-700 mt-1 font-medium">Reason: {t.meta?.reason}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Requested: {new Date(t.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => downloadPDF(t.letter_text, `Transfer - ${t.customer?.full_name}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <FileText size={13} /> View Letter
                    </button>
                    <button
                      onClick={() => { if (confirm('Approve this guarantor transfer? Installments will be moved to guarantor.')) approveMutation.mutate(t.id); }}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                    >
                      <Check size={13} /> Approve
                    </button>
                    <button
                      onClick={() => { if (confirm('Reject this transfer request?')) rejectMutation.mutate(t.id); }}
                      disabled={rejectMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-5 surface border border-base rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-base-primary">{stats.total}</div>
            <div className="text-xs text-base-muted font-medium uppercase tracking-wider mt-1">Overdue Accounts</div>
          </div>
          <div><TrendingDown size={22} className="text-[#2563ea]" /></div>
        </div>

        <div className="p-5 surface border border-base rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.high}</div>
            <div className="text-xs text-base-muted font-medium uppercase tracking-wider mt-1">In Follow-up (High Risk)</div>
          </div>
          <div><AlertTriangle size={22} className="text-[#2563ea]" /></div>
        </div>

        <div className="p-5 surface border border-base rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.medium}</div>
            <div className="text-xs text-base-muted font-medium uppercase tracking-wider mt-1">Guarantor Escalated</div>
          </div>
          <div><Users size={22} className="text-[#2563ea]" /></div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="surface border border-base rounded-xl shadow-sm">
        {/* Filter bar */}
        <div className="p-4 border-b border-base flex items-center gap-3">
          <Search size={18} className="text-base-muted" />
          <input
            type="text"
            placeholder="Search overdue customers by name or service number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm border-none focus:outline-none focus:ring-0 text-base-primary"
          />
        </div>

        {/* Customer Cards List */}
        <div className="divide-y divide-[var(--border-color)]">
          {customers.map((c) => (
            <div key={c.id} className="p-5 hover:bg-[var(--bg-surface-2)] transition-all flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-base-primary">{c.full_name}</span>
                    <span className="text-xs text-base-muted font-mono">({c.service_number})</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.risk_level === 'high' 
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' 
                        : c.risk_level === 'medium'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                    }`}>
                      {c.risk_level.toUpperCase()} ({c.risk_score})
                    </span>
                  </div>
                  <div className="text-xs text-base-muted mt-1 flex items-center gap-2">
                    <span>{c.camp?.name}</span>
                    {c.camp?.branch && <span className="text-[10px] font-semibold surface-3 px-1.5 py-0.2 rounded">{c.camp.branch.toUpperCase()}</span>}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-extrabold text-red-600 dark:text-red-400">LKR {c.arrears_amount.toLocaleString()}</div>
                  <div className="text-xs text-base-muted mt-1">{c.missed_months} months missed</div>
                </div>
              </div>

              {/* Guarantor & History */}
              <div className="grid grid-cols-2 gap-4 text-xs surface-2 p-3 rounded-lg border border-base">
                <div>
                  <div className="font-semibold text-base-secondary">Guarantor Information:</div>
                  <div className="text-base-muted mt-1">{c.guarantor?.name || 'None'} ({c.guarantor?.phone || 'N/A'})</div>
                </div>
                <div>
                  <div className="font-semibold text-base-secondary">Last Contact History:</div>
                  <div className="text-base-muted mt-1">{c.last_contact_date}: {c.last_contact_outcome}</div>
                </div>
              </div>

              {/* Actions Bar */}
              <div className="flex items-center justify-between border-t border-base pt-3">
                <div className="flex gap-2">
                  <button onClick={() => handleLogAction(c)} className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1">
                    <PlusCircle size={13} /> Log Action
                  </button>
                  <button onClick={() => handleOpenWaComposer(c)} className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1">
                    <MessageCircle size={13} /> WA Composer
                  </button>
                  <button onClick={() => handleSendSms(c)} className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1">
                    <MessageCircle size={13} /> Send SMS
                  </button>
                  <button onClick={() => { setSelectedCustomer(c); setShowLetterModal(true); }} className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1">
                    <AlertTriangle size={13} /> Draft Letter
                  </button>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => { setSelectedCustomer(c); setShowTransferModal(true); }}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Users size={13} /> Guarantor Transfer
                  </button>
                  <button 
                    onClick={() => handleLegalNotice(c)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Scale size={13} /> Legal Notice
                  </button>
                </div>
              </div>
            </div>
          ))}
          {customers.length === 0 && <div className="p-8 text-center text-base-muted text-sm">No overdue customers found.</div>}
        </div>
      </div>

      {/* Log Action Modal */}
      {showLogModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="surface rounded-xl max-w-md w-full border border-base shadow-xl overflow-hidden">
            <div className="p-5 border-b border-base flex justify-between items-center">
              <h3 className="font-bold text-base-primary">Log Contact Action</h3>
              <button onClick={() => setShowLogModal(false)} className="text-base-muted hover:text-[var(--text-primary)] text-lg">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="form-label">Contact Method</label>
                <select
                  value={logForm.contact_method}
                  onChange={(e) => setLogForm({ ...logForm, contact_method: e.target.value })}
                  className="form-input"
                >
                  <option value="phone_call">Phone Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="visit">Visit</option>
                  <option value="letter">Official Letter</option>
                </select>
              </div>

              <div>
                <label className="form-label">Outcome Status</label>
                <select
                  value={logForm.outcome}
                  onChange={(e) => setLogForm({ ...logForm, outcome: e.target.value })}
                  className="form-input"
                >
                  <option value="pending">Pending</option>
                  <option value="kept">Promise Kept</option>
                  <option value="broken">Promise Broken</option>
                  <option value="partial">Partial Payment</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Promise Date</label>
                  <input
                    type="date"
                    value={logForm.promise_to_pay_date}
                    onChange={(e) => setLogForm({ ...logForm, promise_to_pay_date: e.target.value })}
                    className="form-input"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
                <div>
                  <label className="form-label">Promise Amount (LKR)</label>
                  <input
                    type="number"
                    value={logForm.promise_amount}
                    onChange={(e) => setLogForm({ ...logForm, promise_amount: e.target.value })}
                    className="form-input"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Notes & Details</label>
                <textarea
                  value={logForm.notes}
                  onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                  className="form-input h-20 resize-none"
                  placeholder="Record summary of contact conversation..."
                />
              </div>
            </div>
            <div className="p-4 surface-2 border-t border-base flex justify-end gap-2">
              <button onClick={() => setShowLogModal(false)} className="btn btn-secondary py-1.5 text-xs">Cancel</button>
              <button onClick={handleSubmitLog} className="px-4 py-1.5 bg-amber-500 text-slate-900 rounded-lg text-xs font-semibold hover:bg-amber-600">Save Log</button>
            </div>
          </div>
        </div>
      )}

      {/* WA Composer Modal */}
      {showWaModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="surface rounded-xl max-w-md w-full border border-base shadow-xl overflow-hidden">
            <div className="p-5 border-b border-base flex justify-between items-center">
              <h3 className="font-bold text-base-primary">WhatsApp / SMS Composer</h3>
              <button onClick={() => setShowWaModal(false)} className="text-base-muted hover:text-[var(--text-primary)] text-lg">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="form-label">Template</label>
                <select
                  value={waTemplate}
                  onChange={(e) => {
                    setWaTemplate(e.target.value);
                    if (e.target.value === 'overdue_notice') {
                      setWaCustomMessage(`Dear ${selectedCustomer.full_name}, your AIRVOICE installment (LKR ${selectedCustomer.arrears_amount}) is overdue. Please contact your camp salary officer or call us on +94 11 234 5678 immediately.`);
                    } else if (e.target.value === 'deduction_failed') {
                      setWaCustomMessage(`Dear ${selectedCustomer.full_name}, we were unable to process your AIRVOICE installment for this month. Please contact your camp payroll officer or call AIRVOICE on +94 11 234 5678.`);
                    }
                  }}
                  className="form-input"
                >
                  <option value="overdue_notice">⚠ Overdue Notice</option>
                  <option value="deduction_failed">✗ Deduction Failed</option>
                </select>
              </div>

              <div>
                <label className="form-label">Message Body</label>
                <textarea
                  value={waCustomMessage}
                  onChange={(e) => setWaCustomMessage(e.target.value)}
                  className="form-input h-28 resize-none"
                />
                <div className="text-[10px] text-base-muted mt-1 text-right">
                  {waCustomMessage.length} characters · {Math.ceil(waCustomMessage.length / 160)} SMS parts
                </div>
              </div>
            </div>
            <div className="p-4 surface-2 border-t border-base flex justify-end gap-2">
              <button onClick={() => setShowWaModal(false)} className="btn btn-secondary py-1.5 text-xs">Cancel</button>
              <button onClick={handleSendWa} className="px-4 py-1.5 bg-[#25D366] text-white rounded-lg text-xs font-semibold hover:opacity-90 flex items-center gap-1">
                <MessageCircle size={13} /> Send WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guarantor Transfer Modal */}
      {showTransferModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="surface rounded-xl max-w-lg w-full border border-base shadow-xl overflow-hidden">
            <div className="p-5 border-b border-base flex justify-between items-center">
              <h3 className="font-bold text-base-primary">Escalate to Guarantor</h3>
              <button onClick={() => { setShowTransferModal(false); setTransferDone(false); setTransferDraftLetter(''); setTransferReason(''); }} className="text-base-muted hover:text-[var(--text-primary)] text-lg">×</button>
            </div>
            {!transferDone ? (
              <div className="p-5 space-y-4">
                <p className="text-sm text-base-muted">
                  You are requesting to transfer payment deduction responsibility from <strong>{selectedCustomer.full_name}</strong> to their guarantor <strong>{selectedCustomer.guarantor?.name || 'N/A'}</strong>.
                </p>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  ⚠ This request will be sent to an Admin for approval before the transfer is executed.
                </p>
                <div>
                  <label className="form-label">Reason / Justification</label>
                  <textarea
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    className="form-input h-24 resize-none"
                    placeholder="Explain why client recovery is failing and guarantor deduction is required..."
                  />
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                  <CheckCircle size={16} />
                  <span className="text-sm font-semibold">Transfer request submitted! Awaiting admin approval.</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-base-muted uppercase tracking-wider mb-2">Generated Draft Letter</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{transferDraftLetter}</pre>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadPDF(transferDraftLetter, `Transfer Notice - ${selectedCustomer.full_name}`)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                  >
                    <Download size={13} /> Download PDF
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(transferDraftLetter); alert('Letter copied to clipboard!'); }}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <FileText size={13} /> Copy Text
                  </button>
                </div>
              </div>
            )}
            <div className="p-5 flex justify-end gap-3 border-t border-base">
              <button onClick={() => { setShowTransferModal(false); setTransferDone(false); setTransferDraftLetter(''); setTransferReason(''); }} className="px-4 py-2 text-sm font-semibold text-base-muted hover:text-base-primary">Close</button>
              {!transferDone && (
                <button
                  onClick={() => selectedCustomer && transferGuarantorMutation.mutate({ customer_id: selectedCustomer.id, reason: transferReason })}
                  disabled={transferGuarantorMutation.isPending || !transferReason || transferReason.length < 10}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {transferGuarantorMutation.isPending ? <Loader2 size={14} className="animate-spin inline" /> : null} {transferGuarantorMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Draft Letter Modal */}
      {showLetterModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="surface rounded-xl max-w-md w-full border border-base shadow-xl overflow-hidden">
            <div className="p-5 border-b border-base flex justify-between items-center">
              <h3 className="font-bold text-base-primary">Draft Recovery Letter</h3>
              <button onClick={() => { setShowLetterModal(false); setLegalNoticeDone(false); setLegalNoticeLetter(''); }} className="text-base-muted hover:text-[var(--text-primary)] text-lg">×</button>
            </div>
            {!legalNoticeDone ? (
              <div className="p-5 space-y-4">
                <div>
                  <label className="form-label">Letter Type</label>
                  <select
                    value={letterForm.letter_type}
                    onChange={(e) => setLetterForm({ ...letterForm, letter_type: e.target.value })}
                    className="form-input"
                  >
                    <option value="reminder">Reminder Letter</option>
                    <option value="warning">Warning Letter</option>
                    <option value="final_notice">Final Notice</option>
                    <option value="legal_notice">Legal Notice</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Additional Notes / Custom Message</label>
                  <textarea
                    value={letterForm.notes}
                    onChange={(e) => setLetterForm({ ...letterForm, notes: e.target.value })}
                    className="form-input h-24"
                    placeholder="Optional custom text to append to the letter..."
                  />
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                  <CheckCircle size={16} /><span className="text-sm font-semibold">Legal notice created successfully!</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-base-muted uppercase tracking-wider mb-2">Letter Content</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-52 overflow-y-auto">{legalNoticeLetter}</pre>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadPDF(legalNoticeLetter, `Legal Notice - ${selectedCustomer.full_name}`)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                  >
                    <Download size={13} /> Download PDF
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(legalNoticeLetter); alert('Letter copied!'); }}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <FileText size={13} /> Copy Text
                  </button>
                  <button
                    onClick={() => {
                      const subject = encodeURIComponent(`Legal Notice - ${selectedCustomer.full_name}`);
                      const body = encodeURIComponent(legalNoticeLetter);
                      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Mail size={13} /> Send Email
                  </button>
                </div>
              </div>
            )}
            <div className="p-5 flex justify-end gap-3 border-t border-base">
              <button onClick={() => { setShowLetterModal(false); setLegalNoticeDone(false); setLegalNoticeLetter(''); }} className="px-4 py-2 text-sm font-semibold text-base-muted hover:text-base-primary">Close</button>
              {!legalNoticeDone && (
                letterForm.letter_type === 'legal_notice' ? (
                  <button
                    onClick={() => sendLegalNoticeMutation.mutate({ customer_id: selectedCustomer.id, notes: letterForm.notes })}
                    disabled={sendLegalNoticeMutation.isPending}
                    className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                  >
                    {sendLegalNoticeMutation.isPending ? 'Generating...' : '⚖ Issue Legal Notice'}
                  </button>
                ) : (
                  <button
                    onClick={() => sendLetterMutation.mutate({ customer_id: selectedCustomer.id, letter_type: letterForm.letter_type === 'reminder' ? 'first_notice' : letterForm.letter_type === 'warning' ? 'second_notice' : 'final_notice', notes: `Recovery letter (${letterForm.letter_type})${letterForm.notes ? ': ' + letterForm.notes : ''}` })}
                    disabled={sendLetterMutation.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                  >
                    {sendLetterMutation.isPending ? 'Drafting...' : 'Draft Letter'}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Print Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800 text-white">
              <span className="font-bold text-sm">{pdfTitle}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`<html><head><title>${pdfTitle}</title><style>body{font-family:monospace;white-space:pre-wrap;padding:40px;font-size:13px;line-height:1.6;}</style></head><body>${pdfContent.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</body></html>`);
                    printWindow.document.close();
                    printWindow.print();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-xs font-semibold"
                >
                  <Download size={12} /> Print / Save PDF
                </button>
                <button onClick={() => setShowPdfModal(false)} className="p-1.5 hover:bg-slate-700 rounded-lg"><X size={16} /></button>
              </div>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap text-slate-800 leading-relaxed">{pdfContent}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}