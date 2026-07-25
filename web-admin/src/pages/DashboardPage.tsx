import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import {
  Users, Phone, ClipboardList, Target, TrendingUp, AlertCircle,
  Coins, Package, Shield, Download, RefreshCw, BarChart2, Bell, TrendingDown, LayoutDashboard, Calendar
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
          <KPICard label="Net Profit" value={`LKR ${(kpis?.netProfit ?? 0).toLocaleString()}`} sub="June ledger output" icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
          <KPICard label="Total Collections" value={`LKR ${(kpis?.actualTotal ?? 0).toLocaleString()}`} sub={`${kpis?.collectionRatePct}% collection rate`} icon={Coins} color="text-amber-600" bg="bg-amber-50" />
          <KPICard label="Deduction Failures" value={kpis?.failureCount ?? 0} sub="Require follow-up" icon={AlertCircle} color="text-red-600" bg="bg-red-50" />
          <KPICard label="Commission Payable" value={kpis?.commPayable ?? 0} sub="Ready for release" icon={TrendingUp} color="text-blue-600" bg="bg-blue-50" />
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
          <KPICard label="Active Plans" value={kpis?.activePlans ?? 0} sub="Leased devices in force" icon={Phone} color="text-green-600" bg="bg-green-50" />
          <KPICard label="Pending Applications" value={kpis?.pendingApps ?? 0} sub="Awaiting reviews" icon={ClipboardList} color="text-purple-600" bg="bg-purple-50" />
          <KPICard label="Total Customers" value={kpis?.totalCustomers ?? 0} sub="Active registry" icon={Users} color="text-blue-600" bg="bg-blue-50" />
          <KPICard label="Inventory Value" value={`LKR ${(kpis?.inventoryValue ?? 0).toLocaleString()}`} sub={`${kpis?.inStockCount} units available`} icon={Package} color="text-indigo-600" bg="bg-indigo-50" />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-4">
          <ActionCard icon={<ClipboardList size={20} />} title="Create Application" description="New customer application" link="/applications" />
          <ActionCard icon={<Users size={20} />} title="Manage Customers" description="View & edit customers" link="/customers" />
          <ActionCard icon={<Package size={20} />} title="Inventory" description="Check stock availability" link="/inventory" />
          <ActionCard icon={<Calendar size={20} />} title="Schedule" description="Manage appointments" link="/schedule" />
        </div>
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
        <div className="grid grid-cols-4 gap-4">
          <ActionCard icon={<Users size={20} />} title="Camp Portal" description="Access camp management" link="/camp" />
          <ActionCard icon={<ClipboardList size={20} />} title="Applications" description="View camp applications" link="/applications?filter=camp" />
          <ActionCard icon={<Bell size={20} />} title="Notifications" description="View alerts & messages" link="/notifications" />
          <ActionCard icon={<Calendar size={20} />} title="Schedule" description="Manage appointments" link="/schedule" />
        </div>
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
    </div>
  );
}

// Helper Component: KPI Card
interface KPICardProps {
  label: string;
  value: any;
  sub: string;
  icon: any;
  color: string;
  bg: string;
}

function KPICard({ label, value, sub, icon: Icon, color, bg }: KPICardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon size={16} className={color} />
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
