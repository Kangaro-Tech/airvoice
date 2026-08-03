import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Receipt, TrendingDown, TrendingUp, Plus, CheckCircle2, XCircle,
  AlertTriangle, Download, Search, Loader2, ChevronDown, AlertCircle,
  Upload, Send, Bot, User, Sparkles, FileText, DollarSign, X,
  Paperclip, RefreshCw, Eye, BookOpen,
} from 'lucide-react';

/* ─── Types ───────────────────────────────────────────────── */
interface ExpenseCategory { id: string; name: string; type: 'income' | 'expense'; }

interface Expense {
  id: string; amount: number; description: string; expense_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid'; is_suspicious: boolean;
  flagged_reason: string | null; category: ExpenseCategory;
  submitter?: { full_name: string; designation: string };
  submitted_by?: { phone_number: string };
  notes: string | null; approved_at: string | null;
  payment_method?: string; receipt_reference?: string | null;
}

interface BudgetSummary {
  category_id: string; category_name: string;
  budgeted: number; actual: number; variance: number; variance_pct: number;
}

interface ChatMessage { role: 'user' | 'ai'; text: string; ts: string; }

/* ─── Helpers ─────────────────────────────────────────────── */
const fmt = (n: number) => `LKR ${n.toLocaleString('en-LK')}`;

const STATUS_META: Record<string,{bg:string;text:string;dot:string}> = {
  pending:  { bg:'bg-amber-100',  text:'text-amber-700',  dot:'bg-amber-400'  },
  approved: { bg:'bg-emerald-100',text:'text-emerald-700',dot:'bg-emerald-500' },
  rejected: { bg:'bg-red-100',    text:'text-red-700',    dot:'bg-red-500'     },
  paid:     { bg:'bg-blue-100',   text:'text-blue-700',   dot:'bg-blue-500'    },
};

const CATEGORY_COLORS: Record<string,string> = {
  Fuel:        'from-orange-500 to-amber-400',
  Office:      'from-blue-500 to-cyan-400',
  Salary:      'from-violet-500 to-purple-400',
  Commission:  'from-green-500 to-emerald-400',
  Import:      'from-red-500 to-rose-400',
  'Petty Cash':'from-yellow-500 to-lime-400',
};

const SUGGESTION_CHIPS = [
  'Show flagged expenses',
  'Which category is over budget?',
  'Summarise June spending',
  'List pending approvals',
];

/* ─── Main Page ───────────────────────────────────────────── */
export default function ExpensesPage() {
  const qc = useQueryClient();
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [showAddModal, setShowAddModal]   = useState(false);
  const [currentMonth, setCurrentMonth]   = useState(new Date().toISOString().split('T')[0].slice(0,7));
  const [uploadingId, setUploadingId]     = useState<string|null>(null);
  const [receiptView, setReceiptView]     = useState<{url:string;name:string}|null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<string|null>(null);
  const [chatMessages, setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]         = useState('');
  const [chatLoading, setChatLoading]     = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    category_id:'', amount:'', description:'',
    expense_date: new Date().toISOString().split('T')[0],
    notes:'', payment_method:'Cash', receipt_reference:'',
    receipt_file: null as File|null,
  });
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:'smooth'}); }, [chatMessages]);

  /* ─── Queries ─────────────────────────────────────────── */
  const { data: categoriesRes } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expenses/categories').then(r => r.data),
  });
  const categories: ExpenseCategory[] = categoriesRes?.data ?? [];

  const { data: expensesRes, isLoading } = useQuery({
    queryKey: ['expenses', statusFilter],
    queryFn: () => api.get('/expenses', { params: statusFilter !== 'all' ? {status:statusFilter} : {} }).then(r => r.data),
  });
  const expenses: Expense[] = expensesRes?.data ?? [];

  const { data: budgetRes } = useQuery({
    queryKey: ['budget-summary', currentMonth],
    queryFn: () => api.get('/expenses/budget/summary', { params:{month:`${currentMonth}-01`} }).then(r => r.data),
  });
  const budgets: BudgetSummary[] = budgetRes?.data ?? [];

  const { data: alertRes } = useQuery({
    queryKey: ['expense-alerts'],
    queryFn: () => api.get('/expenses/alerts/flagged').then(r => r.data),
  });
  const flaggedAlert = alertRes?.data;

  /* ─── Computed KPIs ──────────────────────────────────── */
  const totalExpense    = expenses.filter(e => e.category?.type==='expense' && e.status==='approved').reduce((s,e) => s+e.amount, 0);
  const totalIncome     = expenses.filter(e => e.category?.type==='income'  && e.status==='approved').reduce((s,e) => s+e.amount, 0);
  const suspiciousCount = expenses.filter(e => e.is_suspicious).length;

  /* From budget data we can derive a more accurate net figure */
  const totalBudgeted = budgets.reduce((s,b) => s+b.budgeted, 0);

  const filtered = expenses.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.description?.toLowerCase().includes(q) ||
      e.category?.name?.toLowerCase().includes(q) ||
      e.submitter?.full_name?.toLowerCase().includes(q)
    );
  });

  /* ─── Mutations ──────────────────────────────────────── */
  const reviewExpense = useMutation({
    mutationFn: ({id,action,reason}:{id:string;action:string;reason?:string}) =>
      api.post(`/expenses/${id}/approve`, {action,reason}),
    onSuccess: () => qc.invalidateQueries({queryKey:['expenses']}),
  });

  /* ─── View Receipt Handler ───────────────────────────── */
  async function handleViewReceipt(expenseId: string, receiptRef: string | null | undefined) {
    if (!receiptRef) return;
    setLoadingReceiptId(expenseId);
    try {
      const res = await api.get(`/expenses/${expenseId}/receipt`);
      const { data } = res.data ?? {};
      if (data?.receipt_url) {
        setReceiptView({ url: data.receipt_url, name: data.filename ?? 'Receipt' });
      } else {
        alert('Failed to retrieve receipt URL');
      }
    } catch (err: any) {
      alert(`Error: ${err?.response?.data?.error ?? 'Failed to load receipt'}`);
    } finally {
      setLoadingReceiptId(null);
    }
  }

  /* ─── Add Expense (with receipt upload) ─────────────── */
  async function handleAddExpense() {
    if (!form.category_id || !form.amount || !form.description) return;
    setSubmitting(true);
    try {
      // 1. Create expense record
      const res = await api.post('/expenses', {
        category_id:   form.category_id,
        amount:        parseFloat(form.amount),
        description:   form.description,
        expense_date:  form.expense_date,
        notes:         form.notes || undefined,
        payment_method: form.payment_method,
        receipt_reference: form.receipt_reference || undefined,
      });
      const expenseId = res.data?.data?.id;

      // 2. Upload receipt if provided
      if (form.receipt_file && expenseId) {
        const fd = new FormData();
        fd.append('file', form.receipt_file);
        await api.post(`/expenses/${expenseId}/receipt`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      qc.invalidateQueries({queryKey:['expenses']});
      setShowAddModal(false);
      setForm({
        category_id:'',amount:'',description:'',
        expense_date:new Date().toISOString().split('T')[0],
        notes:'',payment_method:'Cash',receipt_reference:'',receipt_file:null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── Receipt upload for existing row ──────────────── */
  async function handleInlineReceiptUpload(expenseId: string, file: File) {
    setUploadingId(expenseId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/expenses/${expenseId}/receipt`, fd, {
        headers: {'Content-Type':'multipart/form-data'},
      });
      qc.invalidateQueries({queryKey:['expenses']});
    } finally {
      setUploadingId(null);
    }
  }

  /* ─── AI Chat ─────────────────────────────────────── */
  async function sendChat(message: string) {
    if (!message.trim() || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMessage = { role:'user', text:message, ts: new Date().toLocaleTimeString() };
    setChatMessages(m => [...m, userMsg]);
    setChatLoading(true);
    try {
      const res = await api.post('/expenses/chat', { message, month:`${currentMonth}-01` });
      const aiMsg: ChatMessage = { role:'ai', text: res.data?.data?.answer ?? '…', ts: new Date().toLocaleTimeString() };
      setChatMessages(m => [...m, aiMsg]);
    } catch {
      setChatMessages(m => [...m, {role:'ai', text:'Unable to reach AI assistant.', ts:new Date().toLocaleTimeString()}]);
    } finally {
      setChatLoading(false);
    }
  }

  /* ─── Export ─────────────────────────────────────── */
  function handleExport() {
    const rows = filtered.map(e => [
      e.expense_date, e.category?.name, e.description,
      e.submitter?.full_name ?? '—', e.amount, e.status,
    ]);
    const csv = [['Date','Category','Description','Submitted By','Amount','Status'], ...rows]
      .map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expenses_${currentMonth}.csv`;
    a.click();
  }

  /* ─── Month display ───────────────────────────────── */
  const monthLabel = new Date(currentMonth + '-01').toLocaleString('default', {month:'long', year:'numeric'});

  /* ═══════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily:"'Inter', 'Outfit', sans-serif" }} className="min-h-screen">
      {/* ── Page wrapper ── */}
      <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">

        {/* ══ HEADER ══════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-base-primary flex items-center gap-2.5 tracking-tight">
              <BookOpen size={28} className="text-[#2563ea]" />
              Expenses &amp; Accounting
            </h1>
            <p className="text-sm text-base-muted mt-1">
              All income, expenses, petty cash, P&amp;L — every rupee tracked
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 surface border border-base rounded-xl text-sm font-semibold text-gray-600 hover:bg-[var(--bg-surface-2)] transition-all shadow-sm"
            >
              <Download size={15} /> P&amp;L Report
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            >
              <Plus size={16} /> Add Expense
            </button>
          </div>
        </div>

        {/* ══ AI ALERT BANNER ═════════════════════════════════ */}
        {flaggedAlert && flaggedAlert.count > 0 && (
          <div
            className="relative rounded-2xl p-4 flex items-start gap-4 border border-red-200 overflow-hidden"
            style={{background:'linear-gradient(135deg,#fff5f5,#fff1f1)'}}
          >
            <div className="absolute inset-0 opacity-5"
              style={{backgroundImage:'repeating-linear-gradient(45deg,#ef4444 0,#ef4444 1px,transparent 0,transparent 50%)',backgroundSize:'8px 8px'}}
            />
            <div className="relative flex-shrink-0 w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle size={20} className="text-red-600" />
            </div>
            <div className="relative flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-widest text-red-500">AIRVOICE AI Alert</span>
                <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-black">
                  {flaggedAlert.count} flagged
                </span>
              </div>
              <p className="text-sm font-semibold text-red-800">
                {flaggedAlert.topExpense?.category} — {fmt(flaggedAlert.topExpense?.amount)}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                🚨 {flaggedAlert.topExpense?.reason}
              </p>
            </div>
          </div>
        )}

        {/* ══ KPI STRIP ════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label:`Income (${monthLabel.split(' ')[0]})`,
              value: fmt(totalIncome || 0),
              change: '+12.4%', up:true,
              icon: TrendingUp,
              grad: 'from-emerald-500 to-green-400',
              glow: 'shadow-emerald-100',
            },
            {
              label:`Expenses (${monthLabel.split(' ')[0]})`,
              value: fmt(totalExpense || 0),
              change: '-3.1%', up:false,
              icon: TrendingDown,
              grad: 'from-red-500 to-rose-400',
              glow: 'shadow-red-100',
            },
            {
              label:'Net Profit',
              value: fmt((totalIncome || 0) - (totalExpense || 0)),
              change: '+18.2%', up:true,
              icon: DollarSign,
              grad: 'from-blue-500 to-cyan-400',
              glow: 'shadow-blue-100',
            },
            {
              label:'AI Flagged',
              value: String(suspiciousCount || flaggedAlert?.count || 0),
              change: 'items',
              icon: AlertTriangle,
              grad: 'from-amber-500 to-yellow-400',
              glow: 'shadow-amber-100',
            },
          ].map(({label, value, change, up, icon:Icon, grad, glow}) => (
            <div key={label} className={`surface rounded-2xl p-5 border border-base shadow-sm hover:shadow-md transition-all ${glow}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-base-muted">{label}</span>
                <div>
                  <Icon size={20} className="text-[#2563ea]" />
                </div>
              </div>
              <div className="text-xl font-black text-base-primary mb-1 tabular-nums leading-none">{value}</div>
              <div className={`text-xs font-semibold ${up===false?'text-red-500':up===true?'text-emerald-500':'text-amber-500'}`}>
                {change}
              </div>
            </div>
          ))}
        </div>

        {/* ══ BUDGET vs ACTUAL ═════════════════════════════════ */}
        <div className="surface rounded-2xl border border-base shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-base flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-black text-base-secondary text-sm tracking-tight">Budget vs Actual</h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 font-bold border border-amber-100">
                {monthLabel}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-base-muted">
                <div className="w-3 h-3 rounded-full bg-slate-200"/>
                <span>Budget</span>
                <div className="w-3 h-3 rounded-full bg-emerald-400 ml-2"/>
                <span>Actual</span>
              </div>
             <input
  type="month" value={currentMonth}
  onChange={e => setCurrentMonth(e.target.value)}
  style={{ colorScheme: 'light' }}
  className="px-3 py-1.5 border border-base rounded-lg text-xs bg-[var(--input-bg)] text-base-primary focus:outline-none focus:ring-2 focus:ring-amber-400"
/>
            </div>
          </div>
          <div className="p-6 grid gap-5">
            {budgets.filter(b => b.budgeted > 0).map(budget => {
              const pct = budget.budgeted > 0 ? Math.min((budget.actual / budget.budgeted) * 100, 120) : 0;
              const over = budget.actual > budget.budgeted;
              const grad = CATEGORY_COLORS[budget.category_name] ?? 'from-gray-500 to-slate-400';
              return (
                <div key={budget.category_id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${grad}`}/>
                      <span className="text-sm font-bold text-base-secondary">{budget.category_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-base-muted font-mono">{fmt(budget.actual)} / {fmt(budget.budgeted)}</span>
                      <span className={`font-black px-2 py-0.5 rounded-full ${over?'bg-red-100 text-red-600':'bg-emerald-100 text-emerald-600'}`}>
                        {over ? '▲' : '▼'} {Math.abs(budget.variance_pct)}%
                      </span>
                    </div>
                  </div>
                  {/* Budget bar (background) */}
                  <div className="relative h-3 surface-2 rounded-full overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-gradient-to-r ${grad} ${over ? 'opacity-80' : ''}`}
                      style={{width:`${Math.min(pct,100)}%`}}
                    />
                    {/* Budget marker */}
                    <div
                      className="absolute inset-y-0 w-0.5 bg-white/80"
                      style={{left:'100%', display: budget.budgeted > 0 ? 'block':'none'}}
                    />
                  </div>
                </div>
              );
            })}
            {budgets.length === 0 && (
              <div className="py-8 text-center text-base-muted text-sm">No budget data for {monthLabel}</div>
            )}
          </div>
        </div>

        {/* ══ FILTERS & TABLE ══════════════════════════════════ */}
        <div className="surface rounded-2xl border border-base shadow-sm overflow-hidden">
          {/* toolbar */}
          <div className="px-6 py-4 border-b border-base flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-base-muted" />
              <h3 className="font-black text-base-secondary text-sm">Expense Ledger — {monthLabel}</h3>
              <span className="text-xs text-base-muted font-semibold">({filtered.length} entries)</span>
            </div>
            <div className="flex gap-2 flex-wrap w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted"/>
                <input
                  className="w-full pl-8 pr-4 py-2 border border-base rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 surface-2"
                  placeholder="Search expenses…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {['all','pending','approved','rejected'].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                      statusFilter===s
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'surface-2 text-base-muted hover:bg-[var(--bg-surface-3)]'
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-base-muted">
              <Loader2 size={22} className="animate-spin mr-2"/> Loading expenses…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-base-muted">
              <Receipt size={40} className="mx-auto mb-3 opacity-20"/>
              <p className="text-sm">No expenses found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="surface-2 border-b border-base">
                    {['Date','Category','Description','Submitted By','Amount (LKR)','Receipt','AI Flag','Action'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-base-muted whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, idx) => {
                    const sm = STATUS_META[e.status] ?? STATUS_META.pending;
                    const hasReceipt = !!(e.receipt_reference && e.receipt_reference !== 'null');
                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-gray-50 transition-colors hover:bg-amber-50/30 ${
                          e.is_suspicious ? 'bg-red-50/40' : idx%2===0?'surface':'bg-gray-50/40'
                        }`}
                      >
                        {/* Date */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-base-muted surface-2 px-2 py-0.5 rounded">
                            {e.expense_date}
                          </span>
                        </td>
                        {/* Category pill */}
                        <td className="px-5 py-3.5">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-black bg-gradient-to-r ${
                            CATEGORY_COLORS[e.category?.name] ?? 'from-gray-400 to-slate-400'
                          } text-white shadow-sm`}>
                            {e.category?.name ?? '—'}
                          </span>
                        </td>
                        {/* Description */}
                        <td className="px-5 py-3.5 max-w-xs">
                          <div className="font-semibold text-base-secondary truncate text-xs">{e.description}</div>
                          {e.payment_method && (
                            <div className="text-xs text-base-muted mt-0.5">{e.payment_method}</div>
                          )}
                        </td>
                        {/* Submitted By */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0">
                              {(e.submitter?.full_name ?? e.submitted_by?.phone_number ?? 'U')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-base-secondary whitespace-nowrap">
                                {e.submitter?.full_name ?? e.submitted_by?.phone_number ?? '—'}
                              </div>
                              {e.submitter?.designation && (
                                <div className="text-xs text-base-muted">{e.submitter.designation}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Amount */}
                        <td className="px-5 py-3.5">
                          <span className="font-black tabular-nums text-base-primary">
                            {fmt(e.amount)}
                          </span>
                        </td>
                        {/* Receipt */}
                        <td className="px-5 py-3.5">
                          {hasReceipt ? (
                            <button
                              onClick={() => handleViewReceipt(e.id, e.receipt_reference)}
                              disabled={loadingReceiptId === e.id}
                              className="flex items-center gap-1 text-xs text-emerald-600 font-bold hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                              title="View receipt"
                            >
                              {loadingReceiptId === e.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Eye size={13}/>
                              )}
                              <span>{loadingReceiptId === e.id ? 'Loading...' : 'View'}</span>
                            </button>
                          ) : (
                            <label className="flex items-center gap-1 text-xs text-base-muted cursor-pointer hover:text-amber-500 transition-colors">
                              {uploadingId===e.id ? (
                                <Loader2 size={13} className="animate-spin text-amber-500"/>
                              ) : (
                                <>
                                  <Paperclip size={13}/>
                                  <span>Upload</span>
                                </>
                              )}
                              <input
                                type="file" className="hidden" accept="image/*,.pdf"
                                onChange={ev => {
                                  const f = ev.target.files?.[0];
                                  if (f) handleInlineReceiptUpload(e.id, f);
                                }}
                              />
                            </label>
                          )}
                        </td>
                        {/* AI Flag */}
                        <td className="px-5 py-3.5 text-center">
                          {e.is_suspicious ? (
                            <span title={e.flagged_reason ?? ''} className="inline-flex items-center gap-1 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">
                              <AlertTriangle size={11}/> Flagged
                            </span>
                          ) : (
                            <span className="text-gray-200 text-lg">·</span>
                          )}
                        </td>
                        {/* Action */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {/* Status badge */}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize flex items-center gap-1 ${sm.bg} ${sm.text}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${sm.dot}`}/>
                              {e.status}
                            </span>
                            {e.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => reviewExpense.mutate({id:e.id, action:'approve'})}
                                  className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                  title="Approve"
                                >
                                  <CheckCircle2 size={14}/>
                                </button>
                                <button
                                  onClick={() => {
                                    const reason = prompt('Rejection reason:');
                                    if (reason) reviewExpense.mutate({id:e.id, action:'reject', reason});
                                  }}
                                  className="p-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                  title="Reject"
                                >
                                  <XCircle size={14}/>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ══ AI ASSISTANT ═════════════════════════════════════ */}
        <div className="surface rounded-2xl border border-base shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-base flex items-center justify-between"
            style={{background:'linear-gradient(135deg,#0f172a,#1e293b)'}}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Sparkles size={16} className="text-white"/>
              </div>
              <div>
                <div className="text-sm font-black text-white">AIRVOICE AI Assistant</div>
                <div className="text-xs text-slate-400">Ask anything about expenses &amp; budgets</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
              <span className="text-xs text-emerald-400 font-semibold">Online</span>
            </div>
          </div>

          {/* Suggestion chips */}
          {chatMessages.length === 0 && (
            <div className="px-6 pt-5 pb-2">
              <p className="text-xs font-bold text-base-muted uppercase tracking-widest mb-3">Suggested questions</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTION_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => sendChat(chip)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="px-6 py-4 max-h-64 overflow-y-auto space-y-3 scroll-smooth">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex items-start gap-2.5 ${msg.role==='user'?'flex-row-reverse':''}`}>
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-black ${
                  msg.role==='ai'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-600'
                    : 'bg-gradient-to-br from-amber-500 to-orange-600'
                }`}>
                  {msg.role==='ai' ? <Bot size={13}/> : <User size={13}/>}
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role==='ai'
                    ? 'bg-slate-50 text-base-secondary border border-base'
                    : 'text-white'
                }`}
                  style={msg.role==='user' ? {background:'linear-gradient(135deg,#f59e0b,#ea580c)'} : {}}
                >
                  {msg.text}
                  <div className={`text-xs mt-1 opacity-50 ${msg.role==='user'?'text-right text-white':'text-base-muted'}`}>
                    {msg.ts}
                  </div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600">
                  <Bot size={13} className="text-white"/>
                </div>
                <div className="bg-slate-50 border border-base rounded-2xl px-4 py-2.5 flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>
                    ))}
                  </div>
                  <span className="text-xs text-base-muted">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* Re-show chips after conversation starts */}
          {chatMessages.length > 0 && (
            <div className="px-6 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTION_CHIPS.map(chip => (
                <button key={chip} onClick={() => sendChat(chip)}
                  className="px-2.5 py-1 rounded-full text-xs border border-base text-base-muted hover:border-violet-300 hover:text-violet-600 transition-colors">
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="px-6 pb-5">
            <div className="flex gap-2 items-center surface-2 rounded-xl border border-base p-1.5">
              <input
                className="flex-1 bg-transparent px-3 py-1.5 text-sm text-base-secondary focus:outline-none placeholder-gray-400"
                placeholder="Ask about expenses, budgets, anomalies…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key==='Enter' && !e.shiftKey && sendChat(chatInput)}
              />
              {chatMessages.length > 0 && (
                <button
                  onClick={() => setChatMessages([])}
                  className="p-2 rounded-lg text-base-muted hover:bg-[var(--bg-surface-3)] transition-colors"
                  title="Clear chat"
                >
                  <RefreshCw size={14}/>
                </button>
              )}
              <button
                onClick={() => sendChat(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={{background:'linear-gradient(135deg,#7c3aed,#4f46e5)'}}
              >
                <Send size={13}/> Ask
              </button>
            </div>
          </div>
        </div>
      </div>{/* end max-w wrapper */}

      {/* ══ ADD EXPENSE MODAL ════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base sticky top-0 surface z-10">
              <h3 className="font-black text-base-primary flex items-center gap-2 text-base">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Plus size={14} className="text-white"/>
                </span>
                Add Expense
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-base-muted hover:text-gray-600 transition-colors">
                <X size={20}/>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Category */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Category</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 surface pr-8 font-medium"
                    value={form.category_id}
                    onChange={e => setForm(f => ({...f, category_id:e.target.value}))}
                  >
                    <option value="">Select category…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"/>
                </div>
              </div>
              {/* Amount */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Amount (LKR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted text-sm font-bold">LKR</span>
                  <input
                    type="number" placeholder="0.00"
                    className="w-full pl-14 pr-4 py-2.5 border border-base rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                    value={form.amount}
                    onChange={e => setForm(f => ({...f, amount:e.target.value}))}
                  />
                </div>
              </div>
              {/* Description */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Description</label>
                <input
                  type="text" placeholder="What was this expense for?"
                  className="w-full border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.description}
                  onChange={e => setForm(f => ({...f, description:e.target.value}))}
                />
              </div>
              {/* Date */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Date</label>
                <input
                  type="date"
                  className="w-full border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.expense_date}
                  onChange={e => setForm(f => ({...f, expense_date:e.target.value}))}
                />
              </div>
              {/* Payment Method */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Payment Method</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 surface pr-8 font-medium"
                    value={form.payment_method}
                    onChange={e => setForm(f => ({...f, payment_method:e.target.value}))}
                  >
                    {['Cash','Bank Transfer','Cheque','Card','Mobile Payment','Other'].map(m => <option key={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"/>
                </div>
              </div>
              {/* Reference */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Reference / Receipt #</label>
                <input
                  type="text" placeholder="Bill or receipt reference"
                  className="w-full border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.receipt_reference}
                  onChange={e => setForm(f => ({...f, receipt_reference:e.target.value}))}
                />
              </div>
              {/* Receipt Upload */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Upload Receipt</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-all ${
                    form.receipt_file
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-base surface-2 hover:border-amber-400 hover:bg-amber-50'
                  }`}
                >
                  {form.receipt_file ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-600">
                      <CheckCircle2 size={18}/>
                      <span className="text-sm font-semibold truncate max-w-[200px]">{form.receipt_file.name}</span>
                      <button
                        onClick={ev => { ev.stopPropagation(); setForm(f=>({...f,receipt_file:null})); }}
                        className="text-base-muted hover:text-red-500"
                      >
                        <X size={14}/>
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload size={22} className="mx-auto text-gray-300 mb-2"/>
                      <p className="text-xs text-base-muted font-semibold">Click to upload image or PDF</p>
                      <p className="text-xs text-gray-300 mt-0.5">Max 10 MB</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf"
                    onChange={e => setForm(f => ({...f, receipt_file: e.target.files?.[0] || null}))}
                  />
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-base-muted mb-1.5">Notes (Optional)</label>
                <textarea
                  rows={2}
                  className="w-full border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  placeholder="Additional notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({...f, notes:e.target.value}))}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 pb-5 pt-2 flex gap-3 justify-end border-t border-base sticky bottom-0 surface">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 border border-base rounded-xl text-sm font-bold hover:bg-[var(--bg-surface-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddExpense}
                disabled={submitting || !form.category_id || !form.amount || !form.description}
                className="px-6 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50 transition-all hover:scale-[1.02] flex items-center gap-2"
                style={{background:'linear-gradient(135deg,#f59e0b,#ea580c)'}}
              >
                {submitting ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : <><Upload size={14}/> Save Expense</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RECEIPT VIEW MODAL ═══════════════════════════════ */}
      {receiptView && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <FileText size={22} className="text-emerald-600"/>
            </div>
            <h3 className="font-black text-base-primary mb-1">Receipt</h3>
            <p className="text-xs text-base-muted mb-5 truncate">{receiptView.name}</p>
            <div className="flex gap-2 justify-center">
              <a href={receiptView.url} target="_blank" rel="noreferrer"
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 flex items-center gap-1">
                <Eye size={13}/> View
              </a>
              <button
                onClick={() => setReceiptView(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold border border-base text-gray-600 hover:bg-[var(--bg-surface-2)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
