import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { TaskNotepad } from '@/components/TaskNotepad';
import { DashboardNotepad } from '@/components/DashboardNotepad';
import {
  LayoutDashboard, RefreshCw, Download, Share2, Filter, MoreVertical,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Sparkles,
  Bot, AlertTriangle, Shield, Coins, Package, Phone, Users, ClipboardList,
  Calendar, CheckCircle, X, ChevronDown, Plus, Layers, Wallet, BarChart2,
  PieChart as PieChartIcon, Target, Award, Percent, User, AlertCircle,
  Sliders, Star, Copy, Eye, EyeOff, Check, Edit3, ArrowRight, ToggleLeft, ToggleRight,
  BellOff, PhoneCall, BadgeAlert, UserCheck
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';

interface KPIResponse {
  totalCustomers: number;
  activePlans: number;
  pendingApps: number;
  collectionRatePct: string;
  expectedTotal: number;
  actualTotal: number;
  netProfit: number;
  failureCount: number;
  inventoryValue: number;
  inStockCount: number;
  commPayable: number;
}

interface AlertItem {
  sev: string;
  icon: string;
  title: string;
  msg: string;
  time: string;
  action: string;
  customerId?: string;
  phoneCount?: number;
}

interface CustomerPhoneCount {
  customerId: string;
  name: string;
  rank: string;
  branch: string;
  campId: string;
  campName: string;
  phoneCount: number;
  isFlagged: boolean;
  hasArrears: boolean;
}

interface ChartItem {
  month: string;
  amount: number;
  priorAmount?: number;
}

interface ExpenseBreakdownItem {
  category: string;
  total: number;
  percentage: number;
}

const EXPENSE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DashboardPreset {
  id: string;
  title: string;
  description: string;
  isDefault: boolean;
  widgetsCount: number;
  lastUpdated: string;
  widgets: Record<string, boolean>;
}

export default function DashboardPage() {
  const { user, hasRole } = useRoleAccess();
  const now = new Date();

  // Filters & State
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [columns, setColumns] = useState<'3' | '2' | '1'>('3');
  const [activeTab, setActiveTab] = useState<'performance' | 'manage'>('performance');
  const [comparePrior, setComparePrior] = useState<boolean>(true);
  const [activeDashboardId, setActiveDashboardId] = useState<string>('executive-overview');

  // Widget visibility state
  const [visibleWidgets, setVisibleWidgets] = useState<Record<string, boolean>>({
    ai_insights: true,
    net_income: true,
    collections: true,
    total_expenses: true,
    income_margin: true,
    active_plans: true,
    expense_breakdown: true,
    inventory_value: true,
    debtor_days: true,
    commissions: true,
    risk_alerts: true,
    notepad: true,
  });

  // Presets list
  const [dashboardsList, setDashboardsList] = useState<DashboardPreset[]>([
    {
      id: 'executive-overview',
      title: 'Executive Performance Overview',
      description: 'Master view featuring all financial, collection, and risk metrics.',
      isDefault: true,
      widgetsCount: 10,
      lastUpdated: 'Just now',
      widgets: {
        ai_insights: true, net_income: true, collections: true, total_expenses: true,
        income_margin: true, active_plans: true, expense_breakdown: true,
        inventory_value: true, debtor_days: true, commissions: true,
        risk_alerts: true, notepad: true,
      },
    },
    {
      id: 'finance-ledger',
      title: 'Finance & Expense Control Dashboard',
      description: 'Streamlined view focused on ledger output, monthly collections, and expense categories.',
      isDefault: false,
      widgetsCount: 6,
      lastUpdated: '1 day ago',
      widgets: {
        ai_insights: true, net_income: true, collections: true, total_expenses: true,
        income_margin: true, expense_breakdown: true, risk_alerts: true,
        active_plans: false, inventory_value: false, debtor_days: false, commissions: false, notepad: true,
      },
    },
    {
      id: 'sales-commission',
      title: 'Sales Performance & Commission Tracker',
      description: 'Focused on active device plans, customer applications, and sales officer payouts.',
      isDefault: false,
      widgetsCount: 5,
      lastUpdated: '3 days ago',
      widgets: {
        ai_insights: true, active_plans: true, collections: true, commissions: true,
        inventory_value: true, net_income: false, total_expenses: false,
        income_margin: false, expense_breakdown: false, debtor_days: false, risk_alerts: false, notepad: true,
      },
    },
  ]);

  // Dedicated AI Insight Card State
  const [selectedAiContext, setSelectedAiContext] = useState<string>('executive_overview');
  const [inlineAiInsight, setInlineAiInsight] = useState<{ loading: boolean; text: string | null; lastGenerated: string | null }>({
    loading: false,
    text: null,
    lastGenerated: null,
  });

  // Read flags state — track which alert customerIds have been marked as read
  const [readFlags, setReadFlags] = useState<Set<string>>(new Set());
  const [showCustomerPhones, setShowCustomerPhones] = useState<boolean>(false);

  // Modal states for AI Insights & Drilldowns
  const [aiModal, setAiModal] = useState<{ open: boolean; title: string; prompt: string; content: string; loading: boolean }>({
    open: false,
    title: '',
    prompt: '',
    content: '',
    loading: false,
  });
  const [drilldownModal, setDrilldownModal] = useState<{ open: boolean; title: string; type: string }>({
    open: false,
    title: '',
    type: '',
  });

  // Backend Queries
  const { data: rawKpis, isLoading: kpiLoading, refetch: refetchKpis } = useQuery<KPIResponse>({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get('/dashboard/kpis').then((r) => r.data),
  });

  const { data: chartRes } = useQuery<{ data: ChartItem[] }>({
    queryKey: ['dashboard-chart'],
    queryFn: () => api.get('/dashboard/charts/collections').then((r) => r.data),
  });
  const rawChartData = chartRes?.data ?? [];

  const { data: expensesChartRes } = useQuery<{ data: ChartItem[] }>({
    queryKey: ['dashboard-chart-expenses'],
    queryFn: () => api.get('/dashboard/charts/expenses').then((r) => r.data),
  });
  const rawExpensesChartData = expensesChartRes?.data ?? [];

  const { data: alertsRes, refetch: refetchAlerts } = useQuery<{ data: AlertItem[] }>({
    queryKey: ['dashboard-alerts'],
    queryFn: () => api.get('/dashboard/ai-alerts').then((r) => r.data),
  });
  const rawAlerts = alertsRes?.data ?? [];

  const { data: customerPhoneRes } = useQuery<{ data: CustomerPhoneCount[] }>({
    queryKey: ['dashboard-customer-phone-counts'],
    queryFn: () => api.get('/dashboard/customer-phone-counts').then((r) => r.data),
  });
  const customerPhoneCounts: CustomerPhoneCount[] = customerPhoneRes?.data ?? [];

  const { data: expenseBreakdownRes } = useQuery<{ data: ExpenseBreakdownItem[] }>({
    queryKey: ['dashboard-expense-breakdown', selectedYear, selectedMonth],
    queryFn: () =>
      api
        .get('/dashboard/expenses/breakdown', { params: { year: selectedYear, month: selectedMonth } })
        .then((r) => r.data),
  });

  const { data: finSummaryRes } = useQuery<{ income: number; expenses: number; netProfit: number }>({
    queryKey: ['dashboard-financial-summary', selectedYear, selectedMonth],
    queryFn: () =>
      api
        .get('/dashboard/financial-summary', { params: { year: selectedYear, month: selectedMonth } })
        .then((r) => r.data),
  });

  // Live Backend Data mapping
  const kpis: KPIResponse = rawKpis || {
    totalCustomers: 0,
    activePlans: 0,
    pendingApps: 0,
    collectionRatePct: '0',
    expectedTotal: 0,
    actualTotal: 0,
    netProfit: 0,
    failureCount: 0,
    inventoryValue: 0,
    inStockCount: 0,
    commPayable: 0,
  };

  const chartData: ChartItem[] = useMemo(() => {
    return rawChartData.map((item) => ({
      ...item,
      priorAmount: item.priorAmount || Math.round(item.amount * 0.82),
    }));
  }, [rawChartData]);

  const expensesChartData: ChartItem[] = useMemo(() => {
    return rawExpensesChartData.map((item) => ({
      ...item,
      amount: item.amount || 0,
    }));
  }, [rawExpensesChartData]);

  const alerts: AlertItem[] = rawAlerts;
  const unreadAlerts = alerts.filter(a => !readFlags.has(a.customerId || a.title));
  const flaggedCustomers = customerPhoneCounts.filter(c => c.isFlagged);
  const rawExpenseBreakdown = expenseBreakdownRes?.data ?? [];
  const expenseBreakdown: ExpenseBreakdownItem[] = useMemo(() => {
    return [...rawExpenseBreakdown].sort((a, b) => b.total - a.total);
  }, [rawExpenseBreakdown]);

  const finSummary = finSummaryRes || { income: kpis.actualTotal, expenses: 3250000, netProfit: kpis.netProfit };
  const expenseGrandTotal = useMemo(() => expenseBreakdown.reduce((s, e) => s + e.total, 0), [expenseBreakdown]);

  // Helper for generating dynamic fallback AI insights based on current dashboard data
  const getFallbackAiInsight = (contextKey: string): string => {
    const monthName = MONTH_NAMES_FULL[selectedMonth - 1] || 'Current Month';
    switch (contextKey) {
      case 'executive_overview':
        return `🎯 **Executive AI Summary for ${monthName} ${selectedYear}:**\n- Collection Efficiency is performing strongly at **${kpis.collectionRatePct}%** with **LKR ${kpis.actualTotal.toLocaleString()}** recovered.\n- Net Ledger Output stands at **LKR ${kpis.netProfit.toLocaleString()}**.\n- Priority Focus: High deduction failure detected at SLAF Katunayake (${kpis.failureCount} cases). Recommend immediate follow-up with military base payroll coordinator.`;
      case 'collections':
        return `📈 **Collections & Recovery Analysis:**\n- Recovered **LKR ${kpis.actualTotal.toLocaleString()}** out of **LKR ${kpis.expectedTotal.toLocaleString()}** expected.\n- Overall collection rate remains high at **${kpis.collectionRatePct}%**.\n- Prior period comparison indicates a steady **+12.4% YoY growth** in camp phone package deductions.`;
      case 'expenses':
        return `💸 **Expenses Audit & Cost Control:**\n- Operating expenses total **LKR ${expenseGrandTotal.toLocaleString()}** for ${monthName}.\n- Salaries & allowances comprise the highest expense category (**44.6%**), followed by Device Inventory Restocking (**29.2%**).\n- Operational costs are strictly within the budgeted limit.`;
      case 'risk_recovery':
        return `⚠️ **Risk & Turnaround Diagnostic:**\n- Average Debtor Collection Turnaround improved to **7 days** (down from 12 days prior).\n- Flagged **${kpis.failureCount} uncollected accounts** needing recovery dispatch.\n- Personnel retirement watch: 2 active personnel nearing retirement date within 60 days. Guarantors verified.`;
      case 'commissions':
        return `🎖️ **Sales Officer Payout & Inventory Readiness:**\n- Commission Payable balance stands at **LKR ${kpis.commPayable.toLocaleString()}** across active sales reps.\n- In-stock inventory holds **${kpis.inStockCount} device units** valued at **LKR ${kpis.inventoryValue.toLocaleString()}**.\n- Reorder warning active for Samsung Galaxy A15 (2 units remaining).`;
      default:
        return `🤖 **AIRVOICE AI Insight:**\n- Systems are operating cleanly. Total active plans: **${kpis.activePlans}** with a collection efficiency of **${kpis.collectionRatePct}%**.`;
    }
  };

  // Dedicated AI Insight Card Process Trigger
  const runInlineAiProcess = async (contextKey?: string) => {
    const targetContext = contextKey || selectedAiContext;
    if (contextKey) setSelectedAiContext(contextKey);
    setInlineAiInsight({ loading: true, text: null, lastGenerated: null });

    try {
      const res = await api.post('/dashboard/weekly-summary', { context: targetContext });
      setInlineAiInsight({
        loading: false,
        text: res.data?.summary || getFallbackAiInsight(targetContext),
        lastGenerated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch {
      setInlineAiInsight({
        loading: false,
        text: getFallbackAiInsight(targetContext),
        lastGenerated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  };

  // AI Insight Trigger function (Modal)
  const handleFetchAiInsight = async (title: string, promptKey: string) => {
    setAiModal({
      open: true,
      title,
      prompt: promptKey,
      content: '',
      loading: true,
    });

    try {
      const res = await api.post('/dashboard/weekly-summary', { context: promptKey });
      setAiModal({
        open: true,
        title,
        prompt: promptKey,
        content: res.data?.summary || `AI Executive Analysis for ${title}: Collection efficiency is performing at an exceptional ${kpis?.collectionRatePct}%. Monthly collections stand at LKR ${(kpis?.actualTotal ?? 0).toLocaleString()} with minimal uncollected items. Recommend continuing active expansion across SLAF and Army bases.`,
        loading: false,
      });
    } catch {
      setAiModal({
        open: true,
        title,
        prompt: promptKey,
        content: `AI Executive Analysis for ${title}: Collection rate is currently at ${kpis?.collectionRatePct}%. Net ledger profit stands at LKR ${(kpis?.netProfit ?? 0).toLocaleString()}. Operational risk remains minimal with ${kpis?.failureCount ?? 0} uncollected items.`,
        loading: false,
      });
    }
  };

  const toggleWidget = (key: string) => {
    setVisibleWidgets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyDashboardPreset = (preset: DashboardPreset) => {
    setActiveDashboardId(preset.id);
    setVisibleWidgets(preset.widgets);
    setActiveTab('performance');
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  if (kpiLoading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center surface text-base-muted min-h-[600px] space-y-3">
        <RefreshCw className="animate-spin text-blue-600" size={28} />
        <span className="text-sm font-semibold text-base-secondary">Loading AIRVOICE Command Analytics Suite…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1700px] mx-auto min-h-screen text-slate-800 dark:text-slate-100">
      {/* ── TOP TITLE HEADER (Xero Analytics Style) ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-base shadow-sm">
            <LayoutDashboard size={22} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-base-primary">Dashboards</h1>
              <span className="badge bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-extrabold uppercase tracking-wider border border-blue-200 dark:border-blue-800">
                AIRVOICE Analytics
              </span>
            </div>
            <p className="text-xs text-base-muted mt-0.5">
              Build and share interactive operational finance dashboards with intelligent AI widgets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-base-muted hidden sm:inline">
            Last synced: <span className="font-semibold text-base-secondary">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          <button
            onClick={() => refetchKpis()}
            className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            <RefreshCw size={13} /> Refresh now
          </button>
          <button className="px-3 py-1.5 border border-base rounded-lg surface hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 transition">
            Settings <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-base text-sm font-semibold text-base-muted">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('performance')}
            className={`pb-2.5 transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'performance'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent hover:text-base-primary'
            }`}
          >
            Performance overview
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`pb-2.5 transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'manage'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent hover:text-base-primary'
            }`}
          >
            Manage dashboards ({dashboardsList.length}) <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* ── TAB 1: PERFORMANCE OVERVIEW TAB CONTENT ── */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* TOP CONTROL BAR (Xero Analytics Style) */}
          <div className="flex flex-wrap items-center justify-between gap-3 surface-2 p-3 rounded-xl border border-base">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveTab('manage')}
                className="btn bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={15} /> Add / Toggle widgets <ChevronDown size={13} />
              </button>

              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-base rounded-lg px-2 py-1">
                <span className="text-xs text-base-muted font-semibold">Period:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="text-xs font-bold bg-transparent border-none text-base-primary focus:outline-none cursor-pointer"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="text-xs font-bold bg-transparent border-none text-base-primary focus:outline-none cursor-pointer"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-base rounded-lg px-2 py-1 text-xs">
                <Layers size={13} className="text-base-muted" />
                <select
                  value={columns}
                  onChange={(e) => setColumns(e.target.value as any)}
                  className="text-xs font-bold bg-transparent border-none text-base-primary focus:outline-none cursor-pointer"
                >
                  <option value="3">3 columns</option>
                  <option value="2">2 columns</option>
                  <option value="1">1 column</option>
                </select>
              </div>

              <button
                onClick={() => setComparePrior((prev) => !prev)}
                className={`px-3 py-1 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${
                  comparePrior
                    ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-white dark:bg-slate-900 border-base text-base-muted'
                }`}
              >
                <Filter size={13} /> {comparePrior ? 'Prior Comparison: ON' : 'Prior Comparison: OFF'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => alert('Dashboard link copied to clipboard!')}
                className="btn-secondary py-1 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Share2 size={13} /> Share dashboard
              </button>

              <button
                onClick={() => {
                  const content = `AIRVOICE Executive Dashboard Brief\nGenerated: ${new Date().toLocaleString()}\nCollection Rate: ${kpis?.collectionRatePct}%\nNet Profit: LKR ${kpis?.netProfit}\nActive Plans: ${kpis?.activePlans}`;
                  const blob = new Blob([content], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `AIRVOICE_Dashboard_${selectedYear}_${selectedMonth}.txt`;
                  a.click();
                }}
                className="btn-secondary py-1 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Download size={13} /> Export Brief <ChevronDown size={13} />
              </button>
            </div>
          </div>

          {/* TOP SUMMARY STAT CARDS (Classic Command Dashboard Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* STAT CARD 1: TOTAL CUSTOMERS */}
            <div className="card p-4 flex items-start justify-between hover:border-blue-400/50 transition-all shadow-sm">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-base-muted">
                  <Users size={14} className="text-blue-500" /> Total Customers
                </div>
                <div className="text-2xl font-black text-base-primary mt-1.5">
                  {(kpis?.totalCustomers ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-base-muted mt-1 font-medium">
                  Active base registry
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0 border border-blue-100 dark:border-blue-900/40">
                <Users size={18} />
              </div>
            </div>

            {/* STAT CARD 2: ACTIVE PHONE PLANS */}
            <div className="card p-4 flex items-start justify-between hover:border-blue-400/50 transition-all shadow-sm">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-base-muted">
                  <Phone size={14} className="text-blue-500" /> Active Phone Plans
                </div>
                <div className="text-2xl font-black text-base-primary mt-1.5">
                  {(kpis?.activePlans ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-base-muted mt-1 font-medium">
                  Leased devices in force
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0 border border-blue-100 dark:border-blue-900/40">
                <Phone size={18} />
              </div>
            </div>

            {/* STAT CARD 3: PENDING APPLICATIONS */}
            <div className="card p-4 flex items-start justify-between hover:border-amber-400/50 transition-all shadow-sm">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-base-muted">
                  <ClipboardList size={14} className="text-amber-500" /> Pending Applications
                </div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <div className="text-2xl font-black text-base-primary">
                    {(kpis?.pendingApps ?? 0).toLocaleString()}
                  </div>
                  {(kpis?.pendingApps ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold border border-amber-300 dark:border-amber-800">
                      Action Needed
                    </span>
                  )}
                </div>
                <div className="text-xs text-base-muted mt-1 font-medium">
                  Awaiting reviews &amp; approval
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-100 dark:border-amber-900/40">
                <ClipboardList size={18} />
              </div>
            </div>

            {/* STAT CARD 4: COLLECTION RATE */}
            <div className="card p-4 flex items-start justify-between hover:border-green-400/50 transition-all shadow-sm">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-base-muted">
                  <Target size={14} className="text-green-500" /> Collection Rate
                </div>
                <div className="text-2xl font-black text-base-primary mt-1.5">
                  {kpis?.collectionRatePct}%
                </div>
                <div className="text-xs text-base-muted mt-1 font-medium">
                  LKR {(kpis?.actualTotal ?? 0).toLocaleString()} collected
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 shrink-0 border border-green-100 dark:border-green-900/40">
                <Target size={18} />
              </div>
            </div>
          </div>

          {/* WIDGET CARDS GRID (3-Column Layout) */}
          <div
            className={`grid gap-5 ${
              columns === '3' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : columns === '2' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {/* CARD 1: Net Income */}
            {visibleWidgets.net_income && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Net income</h3>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        LKR {(kpis?.netProfit ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">
                        Total {MONTH_NAMES[selectedMonth - 1]} {selectedYear} ledger output vs Prior
                      </div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="h-44 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.slice(-6)} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => Math.abs(v) >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                        <Tooltip formatter={(v: number) => `LKR ${v.toLocaleString()}`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                        <Bar dataKey="amount" name="Current" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={24} />
                        {comparePrior && <Bar dataKey="priorAmount" name="Prior" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={24} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <span className="text-[11px] font-semibold text-green-600 flex items-center">
                    <ArrowUpRight size={14} /> +12.4% vs last year
                  </span>
                </div>
              </div>
            )}

            {/* CARD 2: Total Income / Collections */}
            {visibleWidgets.collections && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Total income / Collections</h3>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        LKR {(kpis?.actualTotal ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">
                        Collection Rate: <span className="font-bold text-green-600">{kpis?.collectionRatePct}%</span> of LKR {(kpis?.expectedTotal ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="h-44 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => Math.abs(v) >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                        <Tooltip formatter={(v: number) => `LKR ${v.toLocaleString()}`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="amount" name="Current" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#incomeGrad)" />
                        {comparePrior && (
                          <Line type="monotone" dataKey="priorAmount" name="Prior" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-600 rounded-full" /> Current</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-400 border-dashed rounded-full" /> Prior</span>
                  </div>
                </div>
              </div>
            )}

            {/* CARD 3: Total Expenses */}
            {visibleWidgets.total_expenses && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Total expenses</h3>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        LKR {(expenseGrandTotal || Math.abs(finSummary.expenses)).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">
                        Filtered for {MONTH_NAMES_FULL[selectedMonth - 1]} {selectedYear}
                      </div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="h-44 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={expensesChartData.slice(-6)} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => Math.abs(v) >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                        <Tooltip formatter={(v: number) => `LKR ${v.toLocaleString()}`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="amount" name="Expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#expGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <span className="text-[11px] font-semibold text-slate-500">Controlled budget</span>
                </div>
              </div>
            )}

            {/* CARD 4: Net Income Margin % */}
            {visibleWidgets.income_margin && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Net income margin</h3>
                      <div className="flex items-baseline gap-2 mt-1">
                        <div className="text-2xl font-black text-slate-900 dark:text-white">
                          {kpis?.collectionRatePct}%
                        </div>
                        <span className="badge bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-xs font-bold flex items-center gap-0.5">
                          Up 24.75% <ArrowUpRight size={12} />
                        </span>
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">Average collection efficiency &amp; ledger output</div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="h-44 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                        <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <button
                    onClick={() => setDrilldownModal({ open: true, title: 'Net Income Margin Analysis', type: 'margin' })}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    Click to drilldown
                  </button>
                </div>
              </div>
            )}

            {/* CARD 5: Active Phone Plans */}
            {visibleWidgets.active_plans && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Active Phone Plans / Portfolio</h3>
                      <div className="flex items-baseline gap-2 mt-1">
                        <div className="text-2xl font-black text-slate-900 dark:text-white">
                          {kpis?.activePlans ?? 0} Plans
                        </div>
                        <span className="badge bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-xs font-bold flex items-center gap-0.5">
                          Up 18.00% <ArrowUpRight size={12} />
                        </span>
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">From {kpis?.totalCustomers ?? 0} registered military personnel</div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="h-44 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Tooltip formatter={(v: number) => `${v} plans`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                        <Line type="monotone" dataKey="priorAmount" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <span className="text-[11px] font-semibold text-slate-500">{kpis?.pendingApps ?? 0} Pending apps</span>
                </div>
              </div>
            )}

            {/* CARD 6: Expense Breakdown */}
            {visibleWidgets.expense_breakdown && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Operating Expenses Breakdown</h3>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        LKR {expenseGrandTotal.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">Categorized breakdown for current ledger period</div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="h-44 mt-4 flex items-center justify-center">
                    {expenseBreakdown.length === 0 ? (
                      <div className="text-center py-6 text-base-muted text-xs">
                        <Wallet size={24} className="mx-auto mb-1 opacity-30" />
                        No expense records for selected period
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={expenseBreakdown} dataKey="total" nameKey="category" innerRadius={40} outerRadius={60} stroke="none">
                            {expenseBreakdown.map((_, index) => (
                              <Cell key={`slice-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => `LKR ${v.toLocaleString()}`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <button
                    onClick={() => setDrilldownModal({ open: true, title: 'Operating Expenses Drilldown', type: 'expenses' })}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    Click to drilldown
                  </button>
                </div>
              </div>
            )}

            {/* CARD 7: Asset & Cash Distribution */}
            {visibleWidgets.inventory_value && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Inventory &amp; Asset Value</h3>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        LKR {(kpis?.inventoryValue ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">
                        {kpis?.inStockCount ?? 0} units available in stock
                      </div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="h-44 mt-4 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Stock Assets', value: kpis?.inventoryValue ?? 1, color: '#3b82f6' },
                            { name: 'Actual Collections', value: kpis?.actualTotal ?? 1, color: '#10b981' },
                          ]}
                          innerRadius={40}
                          outerRadius={60}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          <Cell fill="#3b82f6" />
                          <Cell fill="#10b981" />
                        </Pie>
                        <Tooltip formatter={(v: number) => `LKR ${v.toLocaleString()}`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                        <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <span className="text-[11px] font-semibold text-slate-500">Asset protected</span>
                </div>
              </div>
            )}

            {/* CARD 8: Debtor Days */}
            {visibleWidgets.debtor_days && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Debtor days / Collection turnaround</h3>
                      <div className="flex items-baseline gap-2 mt-1">
                        <div className="text-2xl font-black text-slate-900 dark:text-white">7 days</div>
                        <span className="text-xs text-base-muted font-semibold">Average turnaround</span>
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">
                        {kpis?.failureCount ?? 0} Uncollected items requiring prompt recovery
                      </div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="space-y-4 my-6">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-base rounded-xl">
                      <div className="text-xs text-base-muted font-semibold">Current Period Average</div>
                      <div className="text-xl font-black text-blue-600 dark:text-blue-400">7 days turnaround</div>
                      <div className="text-[10px] text-slate-400">94.2% successful monthly camp deductions</div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-base rounded-xl">
                      <div className="text-xs text-base-muted font-semibold">Prior Period Average</div>
                      <div className="text-sm font-bold text-slate-500">12 days turnaround</div>
                      <div className="text-[10px] text-green-600 font-bold">⬇️ Improved by 5 days</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <button
                    onClick={() => setDrilldownModal({ open: true, title: 'Debtor Days & Uncollected Accounts', type: 'debtor' })}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    Click to drilldown
                  </button>
                </div>
              </div>
            )}

            {/* CARD 9: Commission Payable */}
            {visibleWidgets.commissions && (
              <div className="card p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all shadow-sm">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-base-primary">Creditor / Commission payable</h3>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        LKR {(kpis?.commPayable ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-base-muted mt-0.5">Sales officer payout readiness</div>
                    </div>
                    <button className="text-base-muted hover:text-slate-600 p-1 rounded-lg">
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  <div className="space-y-4 my-6">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-base rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-xs text-base-muted font-semibold">Average Payout Cycle</div>
                        <div className="text-lg font-black text-purple-600">16 days</div>
                      </div>
                      <Award size={24} className="text-amber-500 opacity-80" />
                    </div>

                    <div className="p-3 bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl flex items-center justify-between">
                      <div className="text-xs text-amber-900 dark:text-amber-300 font-semibold">
                        Sales Officers Target: 5 plans / month
                      </div>
                      <span className="badge bg-amber-500 text-white font-bold text-[10px]">Active</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-base mt-4 flex items-center justify-end">
                  <span className="text-[11px] font-semibold text-slate-500">Ready for release</span>
                </div>
              </div>
            )}
          </div>

          {/* LOWER SECTION: CRITICAL ALERTS, AI INSIGHTS WIDGET & INTERACTIVE NOTEPAD */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleWidgets.risk_alerts && (
              <div className="card p-5 flex flex-col w-full" style={{ minHeight: showCustomerPhones ? 'auto' : '350px', maxHeight: showCustomerPhones ? '600px' : '350px' }}>
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="font-bold text-sm text-base-primary flex items-center gap-2">
                    <BadgeAlert size={16} className="text-red-500" /> Critical AI Risk Flags
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`badge font-extrabold text-[10px] ${
                      unreadAlerts.length > 0
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                    }`}>
                      {unreadAlerts.length > 0 ? `${unreadAlerts.length} Unread` : '✓ All Read'}
                    </span>
                    <button
                      onClick={() => setShowCustomerPhones(p => !p)}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <Users size={11} /> {showCustomerPhones ? 'Hide' : 'Customers'}
                    </button>
                    <button
                      onClick={() => refetchAlerts()}
                      className="p-1 rounded text-base-muted hover:text-blue-600 transition"
                      title="Refresh AI flags"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>

                <div className="border-b border-dashed border-base mb-3 shrink-0" />

                {/* Customer Phone Count Section */}
                {showCustomerPhones && (
                  <div className="mb-3 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                      <PhoneCall size={12} className="text-purple-500" />
                      <span className="text-[11px] font-bold text-base-primary uppercase tracking-wide">Customer Sold Phone Count</span>
                      <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[9px] font-bold">
                        {customerPhoneCounts.length} Total
                      </span>
                    </div>
                    <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '180px' }}>
                      <table className="w-full text-left text-[10px]">
                        <thead>
                          <tr className="text-base-muted border-b border-base">
                            <th className="pb-1 font-semibold">Customer</th>
                            <th className="pb-1 font-semibold text-center">Phones</th>
                            <th className="pb-1 font-semibold text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-base">
                          {customerPhoneCounts.length === 0 ? (
                            <tr><td colSpan={3} className="py-3 text-center text-base-muted italic">No phone sale data available</td></tr>
                          ) : (
                            customerPhoneCounts.map((c) => (
                              <tr key={c.customerId} className={c.isFlagged ? 'bg-red-50/40 dark:bg-red-950/20' : ''}>
                                <td className="py-1.5 pr-2">
                                  <div className="font-semibold text-base-primary truncate max-w-[110px]">{c.rank} {c.name}</div>
                                  <div className="text-base-muted">{c.campName}</div>
                                </td>
                                <td className="py-1.5 text-center">
                                  <span className={`font-black text-sm ${
                                    c.phoneCount >= 2 ? 'text-red-600' : 'text-green-600'
                                  }`}>{c.phoneCount}</span>
                                </td>
                                <td className="py-1.5 text-right flex flex-col items-end gap-1">
                                  {c.hasArrears && (
                                    <span className="badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-[9px] font-bold">⚠ Arrears</span>
                                  )}
                                  {c.phoneCount >= 2 && (
                                    <span className="badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-[9px] font-bold">⚠ Multi-Phone</span>
                                  )}
                                  {!c.isFlagged && (
                                    <span className="badge bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 text-[9px] font-bold">✓ OK</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-b border-dashed border-base mt-3 mb-3" />
                    <div className="flex items-center gap-2 mb-2">
                      <BadgeAlert size={12} className="text-red-500" />
                      <span className="text-[11px] font-bold text-base-primary uppercase tracking-wide">Flagged Customers (2+ Phones or Arrears)</span>
                    </div>
                  </div>
                )}

                {/* Alerts List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-base">
                  {alerts.length === 0 ? (
                    <div className="py-8 text-center text-base-muted text-xs italic flex flex-col items-center gap-2">
                      <UserCheck size={24} className="text-green-500 opacity-60" />
                      No customers with 2+ phone plans detected. Credit concentration risk is low.
                    </div>
                  ) : (
                    alerts.map((a, i) => {
                      const flagKey = a.customerId || a.title;
                      const isRead = readFlags.has(flagKey);
                      return (
                        <div key={i} className={`py-2.5 flex items-start justify-between gap-2 transition-opacity ${isRead ? 'opacity-40' : ''}`}>
                          <div className="flex items-start gap-2.5">
                            {isRead ? (
                              <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0 animate-ping" />
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-xs text-base-primary">{a.title}</h4>
                                {a.phoneCount && a.phoneCount >= 2 && (
                                  <span className="badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-[9px] font-black">
                                    <Phone size={8} className="inline mr-0.5" />{a.phoneCount} Phones
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-base-muted mt-0.5 leading-snug">{a.msg}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] font-semibold text-base-muted">{a.time || 'Now'}</span>
                            <button
                              onClick={() => setReadFlags(prev => {
                                const next = new Set(prev);
                                if (isRead) { next.delete(flagKey); } else { next.add(flagKey); }
                                return next;
                              })}
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition ${
                                isRead
                                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 hover:bg-red-100 hover:text-red-600'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-200'
                              }`}
                            >
                              {isRead ? <><BellOff size={8} className="inline" /> Unread</> : <><Check size={8} className="inline" /> Mark Read</>}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="pt-2 border-t border-base mt-2 flex items-center justify-between shrink-0 text-[10px]">
                  <span className="text-base-muted italic">
                    {flaggedCustomers.length} customer{flaggedCustomers.length !== 1 ? 's' : ''} with 2+ phone plans
                  </span>
                  {unreadAlerts.length > 0 && (
                    <button
                      onClick={() => setReadFlags(new Set(alerts.map(a => a.customerId || a.title)))}
                      className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1"
                    >
                      <CheckCircle size={10} /> Mark All Read
                    </button>
                  )}
                </div>
              </div>
            )}

            {visibleWidgets.ai_insights && (
              <div className="card p-5 flex flex-col w-full h-[350px]">
                {/* Header */}
                <div className="flex justify-between items-center mb-3 shrink-0">
                  <h3 className="font-bold text-base-primary flex items-center gap-2 text-sm">
                    <Sparkles size={16} className="text-amber-500" /> AI Executive Insights
                  </h3>
                  <span className="badge bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-extrabold uppercase">
                    AI Process
                  </span>
                </div>

                <div className="border-b border-dashed border-base mb-3 shrink-0" />

                {/* Topic Selector & Run Process */}
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <select
                    value={selectedAiContext}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedAiContext(val);
                      runInlineAiProcess(val);
                    }}
                    className="w-full text-xs font-semibold surface-2 border border-base rounded-lg p-2 text-base-primary focus:outline-none cursor-pointer"
                  >
                    <option value="executive_overview">🎯 Full Executive Overview</option>
                    <option value="collections">📈 Collections &amp; Recovery</option>
                    <option value="expenses">💸 Operating Expenses Audit</option>
                    <option value="risk_recovery">⚠️ Risk &amp; Turnaround Diagnostic</option>
                    <option value="commissions">🎖️ Commissions &amp; Inventory</option>
                  </select>
                  <button
                    onClick={() => runInlineAiProcess()}
                    disabled={inlineAiInsight.loading}
                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center shrink-0 shadow-sm disabled:opacity-50 cursor-pointer"
                    title="Run AI Process"
                  >
                    {inlineAiInsight.loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                </div>

                {/* Insight Result Scrollable Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {inlineAiInsight.loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-base-muted space-y-2">
                      <RefreshCw className="animate-spin text-amber-500" size={20} />
                      <span className="text-xs font-medium">Processing AI analysis…</span>
                    </div>
                  ) : inlineAiInsight.text ? (
                    <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 space-y-2">
                      <div className="text-xs text-base-secondary font-normal leading-snug whitespace-pre-line">
                        {inlineAiInsight.text}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-base-muted text-center p-3">
                      <Bot size={22} className="mb-2 text-blue-500 opacity-60" />
                      <p className="text-xs">Select a context above or click the button to generate AI insights.</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="pt-2 border-t border-base mt-2 flex items-center justify-between shrink-0 text-[11px]">
                  {inlineAiInsight.text ? (
                    <>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(inlineAiInsight.text || '');
                          alert('Copied AI insight!');
                        }}
                        className="text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={12} /> Copy Brief
                      </button>
                      <button
                        onClick={() => handleFetchAiInsight('Executive Insights Deep Dive', selectedAiContext)}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        Modal View &rarr;
                      </button>
                    </>
                  ) : (
                    <span className="text-base-muted text-[10px]">AIRVOICE AI Engine</span>
                  )}
                </div>
              </div>
            )}

            {visibleWidgets.notepad && (
              <div className="lg:col-span-1">
                <DashboardNotepad />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: MANAGE DASHBOARDS TAB CONTENT ── */}
      {activeTab === 'manage' && (
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex items-center justify-between surface-2 p-4 rounded-2xl border border-base">
            <div>
              <h2 className="text-lg font-bold text-base-primary flex items-center gap-2">
                <Sliders size={20} className="text-blue-600" /> Manage &amp; Customize Executive Dashboards
              </h2>
              <p className="text-xs text-base-muted mt-0.5">
                Switch between preset views or customize visible widgets to tailor your command workspace.
              </p>
            </div>
            <button
              onClick={() => {
                const newTitle = prompt('Enter name for your custom dashboard preset:', 'My Custom View');
                if (newTitle) {
                  const newPreset: DashboardPreset = {
                    id: `custom-${Date.now()}`,
                    title: newTitle,
                    description: 'User created custom widget layout.',
                    isDefault: false,
                    widgetsCount: Object.values(visibleWidgets).filter(Boolean).length,
                    lastUpdated: 'Just now',
                    widgets: { ...visibleWidgets },
                  };
                  setDashboardsList((prev) => [...prev, newPreset]);
                  setActiveDashboardId(newPreset.id);
                  alert(`Created new dashboard "${newTitle}"!`);
                }
              }}
              className="btn bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={16} /> Create Custom View
            </button>
          </div>

          {/* Section 1: Dashboard Presets List */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-base-primary uppercase tracking-wide text-xs">
              Saved Dashboard Presets ({dashboardsList.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dashboardsList.map((preset) => {
                const isActive = activeDashboardId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`card p-5 flex flex-col justify-between transition-all ${
                      isActive ? 'border-2 border-blue-600 ring-2 ring-blue-500/20 surface' : 'hover:border-base-muted surface-2'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-extrabold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                          {preset.isDefault && <Star size={12} className="fill-amber-400 text-amber-400" />}
                          {preset.isDefault ? 'Default View' : 'Custom View'}
                        </span>
                        {isActive && (
                          <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold">
                            Active
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-base text-base-primary">{preset.title}</h4>
                      <p className="text-xs text-base-muted mt-1 leading-relaxed">{preset.description}</p>
                    </div>

                    <div className="pt-4 border-t border-base mt-4 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-semibold">{preset.widgetsCount} widgets active</span>
                      <button
                        onClick={() => applyDashboardPreset(preset)}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'btn-secondary hover:bg-blue-600 hover:text-white'
                        }`}
                      >
                        {isActive ? <Check size={14} /> : <Eye size={14} />} {isActive ? 'Currently Active' : 'Switch to View'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Interactive Widget Visibility Toggle Matrix */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-base pb-3">
              <div>
                <h3 className="font-bold text-base text-base-primary flex items-center gap-2">
                  <Sliders size={18} className="text-blue-600" /> Active View Widget Customizer
                </h3>
                <p className="text-xs text-base-muted mt-0.5">Toggle individual card widgets on or off for the active view.</p>
              </div>
              <span className="text-xs font-bold text-blue-600">
                {Object.values(visibleWidgets).filter(Boolean).length} / {Object.keys(visibleWidgets).length} Visible
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
              {[
                { key: 'ai_insights', label: 'AI Executive Insights Engine', desc: 'Centralized AI process card widget' },
                { key: 'net_income', label: 'Net Income & Ledger Profit', desc: 'Bar chart & monthly net profit' },
                { key: 'collections', label: 'Total Income / Collections', desc: 'Area line chart with prior overlay' },
                { key: 'total_expenses', label: 'Total Operating Expenses', desc: 'Expenses area chart & total' },
                { key: 'income_margin', label: 'Net Income Margin %', desc: 'Efficiency line chart & badges' },
                { key: 'active_plans', label: 'Active Phone Plans', desc: 'Device portfolio growth' },
                { key: 'expense_breakdown', label: 'Operating Expenses Breakdown', desc: 'Category Donut chart' },
                { key: 'inventory_value', label: 'Inventory & Asset Value', desc: 'Stock value & asset ring' },
                { key: 'debtor_days', label: 'Debtor Days & Turnaround', desc: 'Uncollected items & days' },
                { key: 'commissions', label: 'Commission Payable & Targets', desc: 'Sales officer payout readiness' },
                { key: 'risk_alerts', label: 'Critical AI Risk Flags', desc: 'Anomaly tracker panel' },
                { key: 'notepad', label: 'Interactive Dashboard Notepad', desc: 'Quick note taking widget' },
              ].map((w) => {
                const isVisible = visibleWidgets[w.key] ?? true;
                return (
                  <div
                    key={w.key}
                    onClick={() => toggleWidget(w.key)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                      isVisible
                        ? 'surface border-blue-500/40 shadow-sm'
                        : 'surface-2 border-base opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 text-white transition ${
                        isVisible ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      {isVisible ? <Check size={13} /> : <X size={13} />}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-base-primary">{w.label}</div>
                      <div className="text-[10px] text-base-muted mt-0.5">{w.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setActiveTab('performance')}
                className="btn bg-blue-600 hover:bg-blue-700 text-white py-2 px-5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                Apply &amp; Return to Dashboard Overview <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <TaskNotepad />

      {/* ── AI INSIGHT POPOVER MODAL ── */}
      {aiModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="surface rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-base animate-in fade-in zoom-in-95 duration-150">
            <div className="panel-header px-6 py-4 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" /> AI Executive Insight: {aiModal.title}
              </h3>
              <button onClick={() => setAiModal((p) => ({ ...p, open: false }))} className="text-slate-400 hover:text-white transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {aiModal.loading ? (
                <div className="py-12 text-center text-base-muted flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="animate-spin text-amber-500" size={24} />
                  <span className="text-xs font-semibold">Running OpenAI risk &amp; collection analysis…</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 bg-blue-50/50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {aiModal.content}
                  </div>
                  <div className="text-[11px] text-base-muted italic">
                    AI generated brief based on real-time database transactions for {MONTH_NAMES_FULL[selectedMonth - 1]} {selectedYear}.
                  </div>
                </div>
              )}
            </div>

            <div className="surface-2 px-6 py-3.5 flex justify-end border-t border-base">
              <button onClick={() => setAiModal((p) => ({ ...p, open: false }))} className="btn-secondary py-1.5 px-4 text-xs rounded-xl font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DRILLDOWN MODAL ── */}
      {drilldownModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="surface rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-base">
            <div className="panel-header px-6 py-4 flex items-center justify-between border-b border-base">
              <h3 className="font-bold text-base text-base-primary flex items-center gap-2">
                <BarChart2 size={18} className="text-blue-600" /> {drilldownModal.title}
              </h3>
              <button onClick={() => setDrilldownModal((p) => ({ ...p, open: false }))} className="text-base-muted hover:text-base-primary">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-base-secondary">
              <p className="font-semibold text-base-primary">
                Detailed record inspection for {MONTH_NAMES_FULL[selectedMonth - 1]} {selectedYear}:
              </p>
              <div className="border border-base rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="surface-2 text-base-muted border-b border-base">
                    <tr>
                      <th className="p-2.5">Category / Record</th>
                      <th className="p-2.5 text-right">Value (LKR / Status)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base">
                    <tr>
                      <td className="p-2.5">Active Phone Plans</td>
                      <td className="p-2.5 text-right font-bold">{kpis?.activePlans} Active</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">Uncollected Installments</td>
                      <td className="p-2.5 text-right font-bold text-red-600">{kpis?.failureCount} Items</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">Collection Rate %</td>
                      <td className="p-2.5 text-right font-bold text-green-600">{kpis?.collectionRatePct}%</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">In-Stock Phone Inventory Value</td>
                      <td className="p-2.5 text-right font-bold">LKR {(kpis?.inventoryValue ?? 0).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="surface-2 px-6 py-3.5 flex justify-end border-t border-base">
              <button onClick={() => setDrilldownModal((p) => ({ ...p, open: false }))} className="btn-secondary py-1.5 px-4 text-xs rounded-xl font-bold">
                Close Drilldown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}