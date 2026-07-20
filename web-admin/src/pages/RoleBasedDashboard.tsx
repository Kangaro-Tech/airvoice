/**
 * Role-Based Dashboard Component
 * Displays different widgets based on user role
 */

import { useRoleAccess } from '@/hooks/useRoleAccess';
import { RoleBasedAccess } from '@/components/RoleBasedAccess';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  BarChart2,
  Users,
  DollarSign,
  Package,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

export default function RoleBasedDashboard() {
  const { user, isAdmin, hasRole } = useRoleAccess();

  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/admin/dashboard-stats').then(r => r.data),
    enabled: isAdmin(),
  });

  if (!user) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b surface p-6">
        <h1 className="text-3xl font-bold text-base-primary">Dashboard</h1>
        <p className="mt-1 text-gray-600">Welcome back, {user.phone_number}</p>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Super Admin & Admin Dashboard */}
        <RoleBasedAccess roles={['super_admin', 'admin']}>
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4 text-base-primary">System Overview</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <StatCard
                icon={<Users size={24} />}
                label="Total Customers"
                value={stats?.total_customers || 0}
                bgColor="bg-blue-100"
                textColor="text-blue-700"
              />
              <StatCard
                icon={<TrendingUp size={24} />}
                label="Active Applications"
                value={stats?.active_applications || 0}
                bgColor="bg-green-100"
                textColor="text-green-700"
              />
              <StatCard
                icon={<AlertCircle size={24} />}
                label="Pending Review"
                value={stats?.pending_applications || 0}
                bgColor="bg-yellow-100"
                textColor="text-yellow-700"
              />
              <StatCard
                icon={<AlertCircle size={24} />}
                label="High Risk"
                value={stats?.high_risk_customers || 0}
                bgColor="bg-red-100"
                textColor="text-red-700"
              />
              <StatCard
                icon={<Users size={24} />}
                label="Total Staff"
                value={stats?.total_users || 0}
                bgColor="bg-purple-100"
                textColor="text-purple-700"
              />
            </div>
          </div>
        </RoleBasedAccess>

        {/* Finance Officer Dashboard */}
        <RoleBasedAccess roles={['finance_officer', 'accountant']}>
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4 text-base-primary">Finance Overview</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <QuickActionCard
                icon={<DollarSign size={24} />}
                title="Manage Finance"
                description="View and manage financial records"
                link="/finance"
              />
              <QuickActionCard
                icon={<BarChart2 size={24} />}
                title="Expenses"
                description="Track and approve expenses"
                link="/expenses"
              />
              <QuickActionCard
                icon={<TrendingUp size={24} />}
                title="Payroll"
                description="Manage staff payroll"
                link="/payroll"
              />
            </div>
          </div>
        </RoleBasedAccess>

        {/* Sales Officer Dashboard */}
        <RoleBasedAccess roles={['sales_officer']}>
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4 text-base-primary">Sales Overview</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <QuickActionCard
                icon={<TrendingUp size={24} />}
                title="New Applications"
                description="Create customer applications"
                link="/applications"
              />
              <QuickActionCard
                icon={<Users size={24} />}
                title="Customers"
                description="Manage customer information"
                link="/customers"
              />
              <QuickActionCard
                icon={<Package size={24} />}
                title="Inventory"
                description="View available inventory"
                link="/inventory"
              />
            </div>
          </div>
        </RoleBasedAccess>

        {/* Inventory Manager Dashboard */}
        <RoleBasedAccess roles={['inventory_manager']}>
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4 text-base-primary">Inventory Overview</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <QuickActionCard
                icon={<Package size={24} />}
                title="Manage Inventory"
                description="View and manage phone stock"
                link="/inventory"
              />
              <QuickActionCard
                icon={<TrendingUp size={24} />}
                title="Stock Orders"
                description="Create and track stock orders"
                link="/stock-orders"
              />
            </div>
          </div>
        </RoleBasedAccess>

        {/* Camp Officer Dashboard */}
        <RoleBasedAccess roles={['camp_officer']}>
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4 text-base-primary">Camp Operations</h2>
            <QuickActionCard
              icon={<Users size={24} />}
              title="Camp Portal"
              description="Access camp management portal"
              link="/camp"
            />
          </div>
        </RoleBasedAccess>

        {/* Recovery Officer Dashboard */}
        <RoleBasedAccess roles={['recovery_officer']}>
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4 text-base-primary">Recovery Operations</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <QuickActionCard
                icon={<AlertCircle size={24} />}
                title="Recovery Management"
                description="Manage phone recovery"
                link="/recovery"
              />
              <QuickActionCard
                icon={<Users size={24} />}
                title="View Guarantors"
                description="Guarantor information"
                link="/guarantors"
              />
            </div>
          </div>
        </RoleBasedAccess>

        {/* Role & Permission Info */}
        <div className="mt-6 rounded-lg bg-blue-50 p-4 border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">Your Role Information</h3>
          <p className="text-sm text-blue-800">
            Your current role: <span className="font-semibold">{user.role}</span>
          </p>
          <p className="text-sm text-blue-800 mt-1">
            Status: <span className="font-semibold">{user.is_active ? '✓ Active' : '✗ Inactive'}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  bgColor: string;
  textColor: string;
}

function StatCard({ icon, label, value, bgColor, textColor }: StatCardProps) {
  return (
    <div className={`rounded-lg ${bgColor} p-4 ${textColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{label}</p>
          <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
        </div>
        <div className="opacity-50">{icon}</div>
      </div>
    </div>
  );
}

interface QuickActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  link: string;
}

function QuickActionCard({ icon, title, description, link }: QuickActionCardProps) {
  return (
    <a
      href={link}
      className="rounded-lg surface p-4 shadow-sm hover:shadow-md transition-shadow border border-base hover:border-blue-400"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-base-primary">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
        <div className="text-base-muted">{icon}</div>
      </div>
    </a>
  );
}
