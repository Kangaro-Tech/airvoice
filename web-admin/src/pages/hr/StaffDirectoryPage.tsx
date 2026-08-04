import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollApi } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, Plus, UserCheck, UserX, Edit2, Eye,
  Building2, DollarSign, Calendar, Phone, Mail, Loader2, ChevronRight
} from 'lucide-react';

interface StaffMember {
  id: string;
  full_name: string;
  designation: string;
  department?: string;
  phone_number?: string;
  email?: string;
  basic_salary: number;
  epf_no?: string;
  etf_no?: string;
  joined_date?: string;
  is_active: boolean;
  profile_photo_url?: string;
}

export default function StaffDirectoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-staff'],
    queryFn: () => payrollApi.listStaff().then(r => r.data.data as StaffMember[]),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      payrollApi.updateStaff(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-staff'] }),
  });

  const filtered = (data ?? []).filter(s => {
    const matchSearch = !search || s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.designation ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.department ?? '').toLowerCase().includes(search.toLowerCase());
    const matchActive = showInactive ? true : s.is_active;
    return matchSearch && matchActive;
  });

  return (
    <div className="p-6 space-y-6 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-600">
            <Users size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Staff Directory</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Manage employee profiles and payroll settings</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/payroll')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium !text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          Add Staff
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="staff-search"
            type="text"
            placeholder="Search by name, designation, department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show Inactive
        </label>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Staff', value: (data ?? []).length, colorClass: 'text-blue-600' },
          { label: 'Active', value: (data ?? []).filter(s => s.is_active).length, colorClass: 'text-green-500' },
          { label: 'Inactive', value: (data ?? []).filter(s => !s.is_active).length, colorClass: 'text-slate-500 dark:text-slate-400' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.colorClass}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Staff List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No staff members found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(staff => (
            <div
              key={staff.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all hover:shadow-md cursor-pointer group"
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                {staff.profile_photo_url
                  ? <img src={staff.profile_photo_url} alt={staff.full_name} className="w-full h-full object-cover" />
                  : staff.full_name.charAt(0).toUpperCase()
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">{staff.full_name}</p>
                  {!staff.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 font-medium">Inactive</span>
                  )}
                </div>
                <p className="text-xs truncate text-gray-500 dark:text-gray-400">{staff.designation}{staff.department ? ` · ${staff.department}` : ''}</p>
                <div className="flex items-center gap-4 mt-1">
                  {staff.phone_number && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Phone size={10} />{staff.phone_number}
                    </span>
                  )}
                  {staff.joined_date && (
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <Calendar size={10} />Joined {staff.joined_date}
                    </span>
                  )}
                </div>
              </div>

              {/* Salary */}
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  LKR {staff.basic_salary.toLocaleString()}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Basic Salary</p>
                {staff.epf_no && (
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>EPF: {staff.epf_no}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  id={`view-staff-${staff.id}`}
                  onClick={() => navigate(`/payroll/staff/${staff.id}`)}
                  className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                  title="View Profile"
                >
                  <Eye size={14} style={{ color: 'var(--accent-primary)' }} />
                </button>
                <button
                  id={`toggle-staff-${staff.id}`}
                  onClick={() => toggleActiveMutation.mutate({ id: staff.id, is_active: !staff.is_active })}
                  className="p-2 rounded-lg transition-colors"
                  title={staff.is_active ? 'Deactivate' : 'Activate'}
                >
                  {staff.is_active
                    ? <UserX size={14} className="text-slate-400 hover:text-red-500 transition-colors" />
                    : <UserCheck size={14} className="text-green-500" />
                  }
                </button>
              </div>
              <ChevronRight size={14} className="shrink-0 opacity-30 group-hover:opacity-70 transition-opacity" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
