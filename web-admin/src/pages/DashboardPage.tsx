import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { TaskNotepad } from '@/components/TaskNotepad';
import {
  Users, Phone, ClipboardList, Target, TrendingUp, AlertCircle,
  Coins, Package, Shield, Download, RefreshCw, BarChart2, Bell, TrendingDown, LayoutDashboard,
  PieChart as PieChartIcon, Wallet, Award, Percent, User,
  Bot, AlertTriangle, Calendar, Flag, CircleDollarSign, ArrowRight
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

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
}

interface ChartItem {
  month: string;
  amount: number;
}

interface ExpenseBreakdownItem {
  category: string;
  total: number;
  percentage: number;
}

const EXPENSE_SLICE_COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444',
  '#06b6d4', '#eab308', '#ec4899', '#84cc16', '#6366f1',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DashboardPage() {
  const { user, hasRole, can } = useRoleAccess();
  const [aiSummary, setAiSummary] = useState('');

  const { data: kpis, isLoading: kpiLoading } = useQuery<KPIResponse>({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get('/dashboard/kpis').then(r => r.data),
  });

  const { data: chartRes } = useQuery<{ data: ChartItem[] }>({
    queryKey: ['dashboard-chart'],
    queryFn: () => api.get('/dashboard/charts/collections').then(r => r.data),
  });
  const chartData = chartRes?.data ?? [];
  const maxAmount = Math.max(...chartData.map(c => c.amount), 1);

  const { data: alertsRes } = useQuery<{ data: AlertItem[] }>({
    queryKey: ['dashboard-alerts'],
    queryFn: () => api.get('/dashboard/ai-alerts').then(r => r.data),
  });
  const alerts = alertsRes?.data ?? [];

  const aiSummaryMutation = useMutation({
    mutationFn: () => api.post('/dashboard/weekly-summary').then(r => r.data),
    onSuccess: (data) => {
      setAiSummary(data.summary);
    },
  });

  // ── Expense Breakdown by Category (month/year filter) ──────
  const now = new Date();
  const [expenseMonth, setExpenseMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [expenseYear, setExpenseYear] = useState<number>(now.getFullYear());

  const { data: expenseBreakdownRes, isLoading: expenseBreakdownLoading } = useQuery<{ data: ExpenseBreakdownItem[] }>({
    queryKey: ['dashboard-expense-breakdown', expenseYear, expenseMonth],
    queryFn: () =>
      api
        .get('/dashboard/expenses/breakdown', { params: { year: expenseYear, month: expenseMonth } })
        .then(r => r.data),
  });

  const { data: finSummaryRes } = useQuery<{ income: number; expenses: number; netProfit: number }>({
    queryKey: ['dashboard-financial-summary', expenseYear, expenseMonth],
    queryFn: () =>
      api
        .get('/dashboard/financial-summary', { params: { year: expenseYear, month: expenseMonth } })
        .then(r => r.data),
  });

  const finSummary = finSummaryRes || { income: 0, expenses: 0, netProfit: 0 };
  const financialSummaryChartData = [
    { name: 'Income', amount: Math.abs(finSummary.income), fill: '#10b981' },
    { name: 'Expenses', amount: Math.abs(finSummary.expenses), fill: '#ef4444' },
    { name: 'Net Profit', amount: Math.abs(finSummary.netProfit), fill: '#3b82f6' },
  ];

  const expenseBreakdown = useMemo(
    () => [...(expenseBreakdownRes?.data ?? [])].sort((a, b) => b.total - a.total),
    [expenseBreakdownRes]
  );
  const expenseGrandTotal = useMemo(
    () => expenseBreakdown.reduce((s, e) => s + e.total, 0),
    [expenseBreakdown]
  );

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const pieData = kpis ? [
    { name: 'Active Plans', value: kpis.activePlans, color: '#10b981' },
    { name: 'Pending Apps', value: kpis.pendingApps, color: '#8b5cf6' },
  ] : [];

  if (kpiLoading) {
    return (
      <div className="p-10 flex items-center justify-center text-base-muted">
        <RefreshCw className="animate-spin mr-2" size={20} /> Loading Command Intelligence Dashboard…
      </div>
    );
  }

  // ROLE-BASED DASHBOARD RENDERING
  
  // Finance Officer Dashboard
  if (hasRole('finance_officer')) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
              <LayoutDashboard size={28} className="text-[#2563ea]" /> Finance Officer Dashboard
            </h1>
            <p className="text-sm text-base-muted mt-0.5">
              Financial Operations · Revenue Tracking · Expense Management
            </p>
          </div>
        </div>

        {/* Finance KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="Net Profit" value={`LKR ${(kpis?.netProfit ?? 0).toLocaleString()}`} sub="June ledger output" icon={TrendingUp} iconColor="#2563eb" iconBg="#eff6ff" />
          <KPICard label="Total Collections" value={`LKR ${(kpis?.actualTotal ?? 0).toLocaleString()}`} sub={`${kpis?.collectionRatePct}% collection rate`} icon={Coins} iconColor="#2563eb" iconBg="#eff6ff" />
          <KPICard label="Deduction Failures" value={kpis?.failureCount ?? 0} sub="Require follow-up" icon={AlertCircle} iconColor="#2563eb" iconBg="#eff6ff" />
          <KPICard label="Commission Payable" value={kpis?.commPayable ?? 0} sub="Ready for release" icon={TrendingUp} iconColor="#2563eb" iconBg="#eff6ff" />
        </div>

        {/* Collections Chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-sm text-base-secondary mb-5 flex items-center gap-1.5">
            <BarChart2 size={16} /> Monthly Collections Summary
          </h3>
          <div className="flex items-end gap-3 h-48 border-b border-base pb-3">
            {chartData.map(c => {
              const pct = (c.amount / maxAmount) * 100;
              return (
                <div key={c.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div className="w-full bg-green-500 rounded-t-md hover:bg-green-600 transition-all cursor-pointer" style={{ height: `${pct}%` }} title={`LKR ${c.amount.toLocaleString()}`} />
                  <span className="text-xs font-semibold text-base-muted">{c.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <ActionCard icon={<Coins size={20} />} title="Manage Expenses" description="Create & approve expenses" link="/expenses" />
          <ActionCard icon={<BarChart2 size={20} />} title="Payroll" description="Manage staff payroll" link="/payroll" />
          <ActionCard icon={<TrendingDown size={20} />} title="Recovery" description="Track recovery operations" link="/recovery" />
          <ActionCard icon={<Calendar size={20} />} title="Schedule" description="Manage appointments" link="/schedule" />
        </div>
        <FinanceAIRiskAlerts />
        <TaskNotepad />
      </div>
    );
  }

  // Sales Officer Dashboard
  if (hasRole('sales_officer')) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
              <LayoutDashboard size={28} className="text-blue-600" /> Sales Dashboard
            </h1>
            <p className="text-sm text-base-muted mt-0.5">
              Customer Applications · Inventory Status · Sales Performance
            </p>
          </div>
        </div>

        {/* Sales KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="Active Plans" value={kpis?.activePlans ?? 0} sub="Leased devices in force" icon={Phone} iconColor="#2563eb" iconBg="#eff6ff" />
          <KPICard label="Pending Applications" value={kpis?.pendingApps ?? 0} sub="Awaiting reviews" icon={ClipboardList} iconColor="#2563eb" iconBg="#eff6ff" />
          <KPICard label="Total Customers" value={kpis?.totalCustomers ?? 0} sub="Active registry" icon={Users} iconColor="#2563eb" iconBg="#eff6ff" />
          <KPICard label="Inventory Value" value={`LKR ${(kpis?.inventoryValue ?? 0).toLocaleString()}`} sub={`${kpis?.inStockCount} units available`} icon={Package} iconColor="#2563eb" iconBg="#eff6ff" />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <ActionCard icon={<ClipboardList size={20} />} title="Create Application" description="New customer application" link="/applications" />
          <ActionCard icon={<Users size={20} />} title="Manage Customers" description="View & edit customers" link="/customers" />
          <ActionCard icon={<Package size={20} />} title="Inventory" description="Check stock availability" link="/inventory" />
          <ActionCard icon={<Calendar size={20} />} title="Schedule" description="Manage appointments" link="/schedule" />
        </div>
        <CommissionTargetTracker />
        <TaskNotepad />
      </div>
    );
  }

  // Inventory Manager Dashboard
  if (hasRole('inventory_manager')) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
              <LayoutDashboard size={28} className="text-blue-600" /> Inventory Dashboard
            </h1>
            <p className="text-sm text-base-muted mt-0.5">
              Stock Management · Phone Inventory · Order Tracking
            </p>
          </div>
        </div>

        {/* Inventory KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="Inventory Value" value={`LKR ${(kpis?.inventoryValue ?? 0).toLocaleString()}`} sub="Current stock value" icon={Package} color="text-indigo-600" bg="bg-indigo-50" />
          <KPICard label="Units In Stock" value={kpis?.inStockCount ?? 0} sub="Available for allocation" icon={Phone} color="text-blue-600" bg="bg-blue-50" />
          <KPICard label="Active Plans" value={kpis?.activePlans ?? 0} sub="Devices in use" icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
          <KPICard label="Pending Orders" value={0} sub="Awaiting fulfillment" icon={AlertCircle} color="text-orange-600" bg="bg-orange-50" />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <ActionCard icon={<Package size={20} />} title="Manage Inventory" description="View & update stock" link="/inventory" />
          <ActionCard icon={<TrendingUp size={20} />} title="Stock Orders" description="Create stock orders" link="/stock-orders" />
          <ActionCard icon={<BarChart2 size={20} />} title="Reports" description="Inventory reports" link="/reports" />
          <ActionCard icon={<Calendar size={20} />} title="Schedule" description="Manage appointments" link="/schedule" />
        </div>
        <TaskNotepad />
      </div>
    );
  }

  // Recovery Officer Dashboard
  if (hasRole('recovery_officer')) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
              <LayoutDashboard size={28} className="text-blue-600" /> Recovery Dashboard
            </h1>
            <p className="text-sm text-base-muted mt-0.5">
              Phone Recovery · Return Tracking · Guarantor Management
            </p>
          </div>
        </div>

        {/* Recovery KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="Active Plans" value={kpis?.activePlans ?? 0} sub="Devices to recover" icon={Phone} color="text-blue-600" bg="bg-blue-50" />
          <KPICard label="Deduction Failures" value={kpis?.failureCount ?? 0} sub="Require follow-up" icon={AlertCircle} color="text-red-600" bg="bg-red-50" />
          <KPICard label="Collection Rate" value={`${kpis?.collectionRatePct}%`} sub="Recovery success rate" icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
          <KPICard label="Pending Recovery" value={0} sub="Awaiting return" icon={Package} color="text-purple-600" bg="bg-purple-50" />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <ActionCard icon={<TrendingDown size={20} />} title="Manage Recovery" description="Track phone returns" link="/recovery" />
          <ActionCard icon={<Users size={20} />} title="Guarantors" description="Guarantor details" link="/guarantors" />
          <ActionCard icon={<AlertCircle size={20} />} title="High Risk Cases" description="Priority recovery" link="/recovery?filter=high-risk" />
          <ActionCard icon={<Calendar size={20} />} title="Schedule" description="Manage appointments" link="/schedule" />
        </div>
        <TaskNotepad />
      </div>
    );
  }

  // Camp Officer Dashboard
  if (hasRole('camp_officer')) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
              <LayoutDashboard size={28} className="text-blue-600" /> Camp Operations
            </h1>
            <p className="text-sm text-base-muted mt-0.5">
              Camp Management · Personnel · Operations
            </p>
          </div>
        </div>

        {/* Camp KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="Active Plans" value={kpis?.activePlans ?? 0} sub="Personnel deployed" icon={Users} color="text-blue-600" bg="bg-blue-50" />
          <KPICard label="Pending Applications" value={kpis?.pendingApps ?? 0} sub="To be processed" icon={ClipboardList} color="text-purple-600" bg="bg-purple-50" />
          <KPICard label="Collection Rate" value={`${kpis?.collectionRatePct}%`} sub="Camp performance" icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
          <KPICard label="Alerts" value={alerts.length} sub="Pending actions" icon={AlertCircle} color="text-red-600" bg="bg-red-50" />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <ActionCard icon={<Users size={20} />} title="Camp Portal" description="Access camp management" link="/camp" />
          <ActionCard icon={<ClipboardList size={20} />} title="Applications" description="View camp applications" link="/applications?filter=camp" />
          <ActionCard icon={<Bell size={20} />} title="Notifications" description="View alerts & messages" link="/notifications" />
          <ActionCard icon={<Calendar size={20} />} title="Schedule" description="Manage appointments" link="/schedule" />
        </div>
        <TaskNotepad />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <LayoutDashboard size={28} className="text-[#2563ea]" /> Command Dashboard
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            AIRVOICE Defence Finance Management · Real-time Operational Insights
          </p>
        </div>
        <button
          onClick={() => {
            const content = `Command Dashboard Report\nGenerated: ${new Date().toLocaleString()}\nCollection Rate: ${kpis?.collectionRatePct}%\nActive Plans: ${kpis?.activePlans}`;
            const blob = new Blob([content], { type: 'text/plain' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = 'dashboard_brief.txt'; a.click();
          }}
          className="flex items-center gap-2 px-4 py-2 border border-base rounded-lg text-sm font-semibold hover:bg-[var(--bg-surface-2)] transition-colors"
        >
          <Download size={15} /> Export Report
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Customers',      value: kpis?.totalCustomers, sub: 'Active base registry',      icon: Users },
          { label: 'Active Phone Plans',   value: kpis?.activePlans,    sub: 'Leased devices in force',   icon: Phone },
          { label: 'Pending Applications', value: kpis?.pendingApps,    sub: 'Awaiting reviews',          icon: ClipboardList },
          { label: 'Collection Rate',      value: `${kpis?.collectionRatePct}%`, sub: `LKR ${(kpis?.actualTotal ?? 0).toLocaleString()} collected`, icon: Target },
          { label: 'Net Profit',           value: `LKR ${(kpis?.netProfit ?? 0).toLocaleString()}`,       sub: 'June ledger output',       icon: TrendingUp },
          { label: 'Deduction Failures',   value: kpis?.failureCount,   sub: 'Require prompt follow-up',  icon: AlertCircle },
          { label: 'Commission Payable',   value: kpis?.commPayable,    sub: 'Ready for release',         icon: Coins },
          { label: 'Inventory Value',      value: `LKR ${(kpis?.inventoryValue ?? 0).toLocaleString()}`,  sub: `${kpis?.inStockCount} units available`, icon: Package },
        ].map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={18} className="text-[#2563ea]" />
              <span className="text-xs font-bold uppercase tracking-wide text-base-muted">{label}</span>
            </div>
            <div className="text-2xl font-black text-base-primary">{value}</div>
            <div className="text-xs text-base-muted mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Charts and AI summary */}
      <div className="grid grid-cols-4 gap-5">
        {/* Collections chart */}
        <div className="card p-5 col-span-2">
          <h3 className="font-semibold text-sm text-base-secondary mb-5 flex items-center gap-1.5">
            <BarChart2 size={16} /> Monthly Collections Summary — {new Date().getFullYear()}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(val) => `LKR ${(val/1000).toFixed(0)}k`} />
                <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => `LKR ${value.toLocaleString()}`} />
                <Bar dataKey="amount" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Breakdown Pie Chart */}
        <div className="card p-5 col-span-1 flex flex-col justify-between">
          <h3 className="font-semibold text-sm text-base-secondary mb-4 flex items-center gap-1.5">
            <Target size={16} /> Plan Breakdown
          </h3>
          <div className="h-48 flex-1 flex items-center justify-center">
            {pieData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString()} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-base-muted text-center">No data available</div>
            )}
          </div>
        </div>

        {/* AI Weekly Summary */}
        <div className="card p-5 flex flex-col justify-between col-span-1">
          <div>
            <h3 className="font-semibold text-sm text-base-secondary mb-4 flex items-center justify-between">
              <span>AI Command Executive Summary</span>
              <button
                onClick={() => aiSummaryMutation.mutate()}
                disabled={aiSummaryMutation.isPending}
                className="text-xs text-amber-600 hover:text-amber-800 font-semibold flex items-center gap-1"
              >
                <RefreshCw size={12} className={aiSummaryMutation.isPending ? 'animate-spin' : ''} />
                Generate
              </button>
            </h3>
            {aiSummary ? (
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
            ) : (
              <div className="text-center py-10 text-base-muted">
                <AlertCircle size={24} className="mx-auto mb-2 opacity-30 text-amber-500" />
                <p className="text-xs">Click Generate to run AI collection and risk analysis brief.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Alerts */}
      <div className="grid grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-sm text-base-secondary mb-4 flex items-center gap-2">
            <Bell size={16} className="text-red-500" /> Critical AI Alerts
          </h3>
          <div className="divide-y divide-gray-50">
            {alerts.length === 0 ? (
              <p className="text-xs text-base-muted py-4">No critical risk flags at present.</p>
            ) : (
              alerts.map((a, i) => (
                <div key={i} className="py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <div>
                    <h4 className="font-bold text-xs text-base-secondary">{a.title}</h4>
                    <p className="text-xs text-base-muted mt-0.5">{a.msg}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Monthly Financial Analysis */}
      <div className="flex items-center justify-between flex-wrap gap-3 mt-8 mb-2">
        <h2 className="font-bold text-lg text-base-primary">Monthly Financial Analysis</h2>
        <div className="flex items-center gap-2">
          <select
            value={expenseMonth}
            onChange={e => setExpenseMonth(Number(e.target.value))}
            className="text-xs font-semibold rounded-lg border border-base bg-[var(--bg-surface-2)] text-base-primary px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563ea]/40"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={expenseYear}
            onChange={e => setExpenseYear(Number(e.target.value))}
            className="text-xs font-semibold rounded-lg border border-base bg-[var(--bg-surface-2)] text-base-primary px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563ea]/40"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Financial Summary */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-sm text-base-secondary flex items-center gap-1.5">
              <BarChart2 size={16} /> Summary ({MONTH_NAMES[expenseMonth - 1]} {expenseYear})
            </h3>
            <span className="text-sm font-bold text-base-primary">LKR {Math.abs(finSummary.netProfit).toLocaleString()}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialSummaryChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(val) => `LKR ${(val/1000).toFixed(0)}k`} />
                <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => `LKR ${value.toLocaleString()}`} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {financialSummaryChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Custom Legend */}
          <div className="mt-4 flex items-center gap-4 justify-center">
            {financialSummaryChartData.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.fill }} />
                <span className="text-xs font-semibold text-base-secondary">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Expense Breakdown */}
        <div className="card p-5 flex flex-col justify-between">
          <h3 className="font-semibold text-sm text-base-secondary mb-5 flex items-center gap-1.5">
            <PieChartIcon size={16} /> Expense Breakdown by Category
          </h3>

          {expenseBreakdownLoading ? (
            <div className="py-14 flex items-center justify-center text-base-muted text-sm flex-1">
              <RefreshCw className="animate-spin mr-2" size={16} /> Loading expense breakdown…
            </div>
          ) : expenseBreakdown.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center flex-1">
              <Wallet size={28} className="mb-3 text-base-muted opacity-30" />
              <p className="text-sm text-base-muted">No expense data available for the selected period.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-6 items-center">

                {/* Pie Chart */}
                <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseBreakdown}
                      dataKey="total"
                      nameKey="category"
                      outerRadius={100}
                      stroke="none"
                    >
                      {expenseBreakdown.map((_, index) => (
                        <Cell key={`expense-cell-${index}`} fill={EXPENSE_SLICE_COLORS[index % EXPENSE_SLICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        boxShadow: '0 8px 24px -8px rgb(0 0 0 / 0.4)',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, _name: string, entry: any) => [
                        `LKR ${value.toLocaleString()} (${entry?.payload?.percentage}%)`,
                        entry?.payload?.category,
                      ]}
                    />
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      iconType="circle"
                      wrapperStyle={{ fontSize: '12px', paddingLeft: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

                {/* Summary Table */}
                <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-base-muted border-b border-base">
                      <th className="pb-2 pr-2">Category</th>
                      <th className="pb-2 pr-2 text-right">Total Expense</th>
                      <th className="pb-2 text-right">% of Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base/50">
                    {expenseBreakdown.map((item, index) => (
                      <tr key={item.category} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                        <td className="py-2.5 pr-2 font-semibold text-base-primary">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: EXPENSE_SLICE_COLORS[index % EXPENSE_SLICE_COLORS.length] }}
                            />
                            {item.category}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-right text-base-secondary font-medium">
                          LKR {item.total.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right text-base-muted">{item.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card footer - Total Expense */}
            <div className="mt-5 pt-4 border-t border-base flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-base-muted">Total Expenses</span>
              <span className="text-lg font-black text-base-primary">LKR {expenseGrandTotal.toLocaleString()}</span>
            </div>
            </>
          )}
        </div>
      </div>
      <TaskNotepad />
    </div>
  );
}

// Helper Component: KPI Card
interface KPICardProps {
  label: string;
  value: any;
  sub: string;
  icon: any;
  iconColor?: string;
  iconBg?: string;
  color?: string;
  bg?: string;
}

function KPICard({ label, value, sub, icon: Icon, iconColor, iconBg, color, bg }: KPICardProps) {
  // Support both direct hex values (iconColor/iconBg) and Tailwind class names (color/bg)
  const bgStyle = iconBg ? { backgroundColor: iconBg } : undefined;
  const iconStyle = iconColor ? { color: iconColor } : undefined;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${!iconBg ? (bg ?? '') : ''}`}
          style={bgStyle}
        >
          <Icon size={16} className={!iconColor ? (color ?? '') : ''} style={iconStyle} />
        </div>
        <span className="text-xs font-bold uppercase tracking-wide text-base-muted">{label}</span>
      </div>
      <div className="text-2xl font-black text-base-primary">{value}</div>
      <div className="text-xs text-base-muted mt-1">{sub}</div>
    </div>
  );
}

// Helper Component: Action Card
interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  link: string;
}

function ActionCard({ icon, title, description, link }: ActionCardProps) {
  return (
    <a
      href={link}
      className="card p-4 hover:shadow-lg transition-shadow cursor-pointer flex items-start gap-3"
    >
      <div className="text-blue-600 mt-0.5">{icon}</div>
      <div>
        <h4 className="font-semibold text-base-primary text-sm">{title}</h4>
        <p className="text-xs text-gray-600 mt-1">{description}</p>
      </div>
    </a>
  );
}

// Commission Target Tracker — shown on Sales Officer Dashboard
function CommissionTargetTracker() {
  const now = new Date();
  const [month] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const { data: perfRes, isLoading } = useQuery({
    queryKey: ['dashboard-commission-tracker', month],
    queryFn: () => api.get('/sales/performance', { params: { month } }).then(r => r.data),
  });

  const officers: any[] = perfRes?.data ?? [];
  const sorted = officers.slice().sort(
    (a: any, b: any) => (b.commission_pending + b.commission_payable + b.commission_paid) - (a.commission_pending + a.commission_payable + a.commission_paid)
  );

  return (
    <div className="card border border-base overflow-hidden">
      <div className="px-5 py-4 border-b border-base flex items-center justify-between flex-wrap gap-3"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-400/20 flex items-center justify-center">
            <Target size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Commission Target Tracker</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Ranked by highest commission — {month}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
          <Percent size={12} className="text-amber-400" />
          <span className="text-xs text-slate-200 font-semibold">Target: 5 sales/month · LKR 250 per plan</span>
        </div>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="py-8 flex items-center justify-center text-base-muted text-sm">
            <RefreshCw className="animate-spin mr-2" size={15} /> Loading tracker…
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-base-muted text-sm">
            <Award size={28} className="mx-auto mb-2 opacity-20" />
            No commission data for this month.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-1" style={{ minWidth: 0 }}>
            {sorted.map((o: any, rank: number) => {
              const TARGET = 5;
              const progress = Math.min(100, (o.phones_sold / TARGET) * 100);
              const isTargetMet = o.phones_sold >= TARGET;
              const totalCommission = o.commission_pending + o.commission_payable + o.commission_paid;
              const displayName = o.officer_name || `Officer ${o.officer_phone?.slice(-4)}`;
              const topCustomers: any[] = (o.customers || []).slice().sort((a: any, b: any) => b.commission - a.commission).slice(0, 3);

              return (
                <div key={o.officer_id}
                  className={`relative rounded-2xl border overflow-hidden shrink-0 w-[240px] transition-all hover:shadow-md ${rank === 0 ? 'border-amber-400 shadow-sm' : isTargetMet ? 'border-green-200' : 'border-base'}`}
                  style={{ background: 'var(--bg-surface-1)' }}
                >
                  {rank === 0 && (
                    <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                      <span className="text-[9px] font-black text-amber-900">★</span>
                    </div>
                  )}
                  <div className="p-3.5">
                    <div className="flex items-start gap-2.5 mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${rank === 0 ? 'bg-amber-100 text-amber-700' : rank === 1 ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600'}`}>
                        #{rank + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-base-primary text-xs leading-tight truncate">{displayName}</div>
                        <div className="text-[10px] text-base-muted">{o.officer_phone}</div>
                      </div>
                    </div>

                    <div className="mb-2.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-base-muted font-semibold">{o.phones_sold}/{TARGET} sales</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isTargetMet ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isTargetMet ? '✓ MET' : `${Math.round(progress)}%`}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-full rounded-full ${isTargetMet ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 px-2.5 rounded-lg mb-2.5" style={{ background: 'var(--bg-surface-2)' }}>
                      <span className="text-[10px] text-base-muted font-semibold">Commission</span>
                      <span className="text-xs font-black text-green-600">LKR {totalCommission.toLocaleString()}</span>
                    </div>

                    {topCustomers.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-base-muted font-bold mb-1.5 flex items-center gap-1">
                          <User size={9} /> Customers
                        </div>
                        <div className="space-y-1">
                          {topCustomers.map((cust: any, i: number) => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: cust.status === 'paid' ? '#10b981' : cust.status === 'payable' ? '#3b82f6' : '#f59e0b' }} />
                                <span className="text-[10px] text-base-secondary truncate font-medium">{cust.name}</span>
                              </div>
                              <span className="text-[10px] font-semibold text-base-muted ml-1 shrink-0">LKR {cust.commission.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-base grid grid-cols-3 divide-x divide-base">
                    <div className="py-1.5 text-center">
                      <div className="text-[9px] text-amber-600 font-bold">Pending</div>
                      <div className="text-[10px] font-black text-base-primary">{o.commission_pending.toLocaleString()}</div>
                    </div>
                    <div className="py-1.5 text-center">
                      <div className="text-[9px] text-blue-600 font-bold">Payable</div>
                      <div className="text-[10px] font-black text-base-primary">{o.commission_payable.toLocaleString()}</div>
                    </div>
                    <div className="py-1.5 text-center">
                      <div className="text-[9px] text-green-600 font-bold">Paid</div>
                      <div className="text-[10px] font-black text-base-primary">{o.commission_paid.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Finance Dashboard - AI Risk Alerts UI
function FinanceAIRiskAlerts() {
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-base flex items-center justify-between">
        <h3 className="font-bold text-sm text-base-primary flex items-center gap-2">
          <Bot size={18} className="text-slate-400" /> AI Risk Alerts
        </h3>
        <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-md border border-red-100">
          <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
          <span className="text-xs font-bold text-red-700">2 Critical</span>
        </div>
      </div>

      {/* Alerts List */}
      <div className="divide-y divide-base">
        {/* Alert 1 */}
        <div className="p-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600" />
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-base-primary">High Risk — Galle Naval</h4>
              <p className="text-sm text-base-secondary mt-1 leading-relaxed">
                Able Seaman Dilshan risk score 72. 2 consecutive missed deductions. Guarantor deduction transfer pending admin approval.
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-400">2h ago</span>
                <button className="text-xs font-semibold px-3 py-1.5 border border-base rounded-full text-base-secondary hover:bg-slate-50 transition-colors flex items-center gap-1">
                  Review <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Alert 2 */}
        <div className="p-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-600" />
          <div className="flex items-start gap-3">
            <Calendar size={18} className="text-orange-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-base-primary">Retirement Risk Alert</h4>
              <p className="text-sm text-base-secondary mt-1 leading-relaxed">
                6 customers across Galle Naval & Trincomalee retire within 12 months with LKR 247,800 outstanding balance.
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-400">6h ago</span>
                <button className="text-xs font-semibold px-3 py-1.5 border border-base rounded-full text-base-secondary hover:bg-slate-50 transition-colors flex items-center gap-1">
                  View Report <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Alert 3 */}
        <div className="p-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
          <div className="flex items-start gap-3">
            <Flag size={18} className="text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-base-primary">Expense Anomaly</h4>
              <p className="text-sm text-base-secondary mt-1 leading-relaxed">
                Kamal Jayawardena fuel claim LKR 28,000 — 240% above monthly average. Awaiting finance officer review.
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-400">1d ago</span>
                <button className="text-xs font-semibold px-3 py-1.5 border border-base rounded-full text-base-secondary hover:bg-slate-50 transition-colors flex items-center gap-1">
                  Review <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Alert 4 */}
        <div className="p-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400" />
          <div className="flex items-start gap-3">
            <TrendingDown size={18} className="text-yellow-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-base-primary">Camp Performance Dip</h4>
              <p className="text-sm text-base-secondary mt-1 leading-relaxed">
                Diyatalawa deduction rate: 88.5% vs 94% last quarter. 19 affected customers.
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-400">2d ago</span>
                <button className="text-xs font-semibold px-3 py-1.5 border border-base rounded-full text-base-secondary hover:bg-slate-50 transition-colors flex items-center gap-1">
                  View Camp <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Alert 5 */}
        <div className="p-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
          <div className="flex items-start gap-3">
            <CircleDollarSign size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-base-primary">Commission Approval Due</h4>
              <p className="text-sm text-base-secondary mt-1 leading-relaxed">
                130 commissions payable (LKR 32,500) awaiting finance officer approval.
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-400">3d ago</span>
                <button className="text-xs font-semibold px-3 py-1.5 border border-base rounded-full text-base-secondary hover:bg-slate-50 transition-colors flex items-center gap-1">
                  Approve <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}