import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useAuthStore } from '@/store/authStore';
import { ROLES } from '@/config/roles';
import { ModuleAccessModal } from '@/components/admin/ModuleAccessModal';
import {
  Edit2,
  Check,
  Plus,
  RefreshCw,
  Search,
  Users,
  User,
  Shield,
  Phone,
  Calendar,
  Settings,
  X,
  Save,
  Info,
  UserCheck,
  UserX,
  Lock,
  Trash2,
} from 'lucide-react';

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { isAdmin } = useRoleAccess();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string>('');
  const [selectedUserForModules, setSelectedUserForModules] = useState<any | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    phone_number: '',
    role: 'camp_officer',
    name: '',
    email: '',
    password: '',
  });
  const queryClient = useQueryClient();

  if (!isAdmin()) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 p-4 text-red-700 flex items-center gap-2">
          <Lock size={18} />
          Access denied. Admin privileges required.
        </div>
      </div>
    );
  }

  // Fetch staff users
  const { data: staffData, isLoading } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: () => api.get('/admin/staff').then(r => r.data.data),
  });

  // Fetch role statistics
  const { data: statsData } = useQuery({
    queryKey: ['role-stats'],
    queryFn: () => api.get('/admin/role-stats').then(r => r.data.data),
    refetchInterval: 30000,
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: (data: { userId: string; role: string }) =>
      api.patch(`/admin/users/${data.userId}/role`, { role: data.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      queryClient.invalidateQueries({ queryKey: ['role-stats'] });
      setEditingUserId(null);
    },
  });

  // Toggle user status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: (data: { userId: string; isActive: boolean }) =>
      api.patch(
        `/admin/users/${data.userId}/${data.isActive ? 'deactivate' : 'activate'}`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
    },
  });

  // Create new staff user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: { phone_number: string; role: string; email?: string; password?: string }) =>
      api.post('/admin/staff', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      queryClient.invalidateQueries({ queryKey: ['role-stats'] });
      setShowCreateModal(false);
      setCreateFormData({
        phone_number: '',
        role: 'camp_officer',
        name: '',
        email: '',
        password: '',
      });
      alert(' Staff member created successfully!');
    },
    onError: (error: any) => {
      const errorMsg = error?.response?.data?.error || error?.response?.data?.message || 'Unknown error';
      alert(`Failed to create staff: ${errorMsg}`);
    },
  });

  const { user: currentUser } = useAuthStore();
  const isSystemOperator = currentUser?.role === 'system_operator';

  const filteredStaff = (staffData || [])
    .filter((user: any) => isSystemOperator || user.role !== 'system_operator')
    .filter(
      (user: any) =>
        (user.phone_number && user.phone_number.includes(searchTerm)) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.role && user.role.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const visibleStatsData = Object.entries(statsData || {}).filter(
    ([role]) => isSystemOperator || role !== 'system_operator'
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b surface p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={28} className="text-[#2563ea]" />
            <div>
              <h1 className="text-3xl font-bold text-base-primary">Staff Management</h1>
              <p className="mt-1 text-gray-600">Manage user roles and permissions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-5">
          {visibleStatsData.map(([role, count]: [string, unknown]) => {
            const roleConfig = ROLES[role as keyof typeof ROLES];
            return (
              <div
                key={role}
                className="rounded-lg surface p-4 shadow-sm border border-base"
              >
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-base-primary">{count as number}</div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-base">
                    {roleConfig?.icon || <Shield size={15} className="text-blue-500" />}
                  </div>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {roleConfig?.displayName || role}
                </div>
              </div>
            );
          })}
        </div>

        {/* Search and Filter */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-base-muted" />
              <input
                type="text"
                placeholder="Search by phone number or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-base surface py-2 pl-10 pr-4 text-base-primary placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 flex items-center gap-2 font-semibold"
          >
            <Plus size={18} />
            Add Staff
          </button>
          <button
            onClick={() => queryClient.refetchQueries({ queryKey: ['admin-staff'] })}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>

        {/* Staff Table */}
        <div className="rounded-lg surface shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="border-b surface-2">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <Phone size={13} className="text-base-muted" />
                    Identifier
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <User size={13} className="text-base-muted" />
                    First Name
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <User size={13} className="text-base-muted" />
                    Last Name
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <Shield size={13} className="text-base-muted" />
                    Role
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <UserCheck size={13} className="text-base-muted" />
                    Status
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <Check size={13} className="text-base-muted" />
                    Verified
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-base-muted" />
                    Last Login
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-base-primary">
                  <span className="flex items-center gap-1.5">
                    <Settings size={13} className="text-base-muted" />
                    Actions
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-base-muted">
                    Loading staff...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-base-muted">
                    No staff members found
                  </td>
                </tr>
              ) : (
                filteredStaff.map((user: any) => {
                  const roleConfig = ROLES[user.role as keyof typeof ROLES];
                  const isEditing = editingUserId === user.id;
                  const staffReg = Array.isArray(user.staff_registry) ? user.staff_registry[0] : user.staff_registry;
                  const fullName = staffReg?.full_name || user.full_name || user.name || '';
                  const nameParts = fullName.trim().split(' ');
                  const firstName = nameParts[0] || '—';
                  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '—';

                  return (
                    <tr key={user.id} className="border-b hover:bg-[var(--bg-surface-2)]">
                      <td className="px-6 py-4 text-sm text-base-primary font-medium">
                        {user.phone_number || user.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-base-primary">
                        {firstName}
                      </td>
                      <td className="px-6 py-4 text-sm text-base-primary">
                        {lastName}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {isEditing ? (
                          <select
                            value={editingRole}
                            onChange={(e) => setEditingRole(e.target.value)}
                            className="rounded border border-base px-2 py-1 text-sm"
                          >
                            {Object.values(ROLES).map((r) => (
                              <option key={r.name} value={r.name}>
                                {r.displayName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white ${roleConfig?.color || 'bg-gray-600'}`}>
                            {roleConfig?.icon && <span>{roleConfig.icon}</span>}
                            {roleConfig?.displayName || user.role}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                            user.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {user.is_active ? <UserCheck size={12} /> : <UserX size={12} />}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                            user.is_verified
                              ? 'bg-blue-100 text-blue-800'
                              : 'surface-2 text-base-secondary'
                          }`}
                        >
                          {user.is_verified && <Check size={12} />}
                          {user.is_verified ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => {
                                  updateRoleMutation.mutate({
                                    userId: user.id,
                                    role: editingRole,
                                  });
                                }}
                                disabled={updateRoleMutation.isPending}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                <Save size={12} />
                                Save
                              </button>
                              <button
                                onClick={() => setEditingUserId(null)}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-300 text-base-secondary rounded hover:bg-gray-400"
                              >
                                <X size={12} />
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingUserId(user.id);
                                  setEditingRole(user.role);
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                                title="Edit role"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  toggleStatusMutation.mutate({
                                    userId: user.id,
                                    isActive: user.is_active,
                                  });
                                }}
                                disabled={toggleStatusMutation.isPending}
                                className="p-2 text-orange-600 hover:bg-orange-50 rounded disabled:opacity-50"
                                title={user.is_active ? 'Deactivate' : 'Activate'}
                              >
                                <Check size={16} />
                              </button>
                              {isSystemOperator && (
                                <button
                                  onClick={() => setSelectedUserForModules(user)}
                                  className="p-2 text-purple-600 hover:bg-purple-50 rounded"
                                  title="Configure Custom Modules"
                                >
                                  <Settings size={16} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 rounded-lg bg-blue-50 p-4">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Shield size={16} />
            Role Icons & Colors:
          </h3>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            {Object.values(ROLES).map((role) => (
              <div key={role.name} className="flex items-center gap-2">
                <span className="text-lg">{role.icon}</span>
                <div>
                  <div className="font-medium text-sm text-base-primary">{role.displayName}</div>
                  <div className="text-xs text-gray-600">{role.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create Staff Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="surface rounded-lg shadow-lg w-full max-w-md">
              {/* Modal Header */}
              <div className="border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-base-primary flex items-center gap-2">
                  <Plus size={18} className="text-green-600" />
                  Add New Staff Member
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-base-muted hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-base-secondary mb-1 flex items-center gap-1.5">
                    <Phone size={13} className="text-base-muted" />
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={createFormData.phone_number}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, phone_number: e.target.value })
                    }
                    placeholder="+94701234567"
                    className="w-full rounded-lg border border-base px-3 py-2 text-base-primary placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-xs text-base-muted mt-1">Unique phone number for the staff member</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-base-secondary mb-1 flex items-center gap-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={createFormData.email}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, email: e.target.value })
                    }
                    placeholder="user@airvoice.com"
                    className="w-full rounded-lg border border-base px-3 py-2 text-base-primary placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-base-secondary mb-1 flex items-center gap-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={createFormData.password}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, password: e.target.value })
                    }
                    placeholder="Enter password (optional)"
                    className="w-full rounded-lg border border-base px-3 py-2 text-base-primary placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-xs text-base-muted mt-1">If provided, user can login with email & password.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-base-secondary mb-1 flex items-center gap-1.5">
                    <Shield size={13} className="text-base-muted" />
                    Role *
                  </label>
                  <select
                    value={createFormData.role}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, role: e.target.value })
                    }
                    className="w-full rounded-lg border border-base px-3 py-2 text-base-primary focus:border-blue-500 focus:ring-blue-500"
                  >
                    {Object.values(ROLES)
                      .filter((role) => role.name !== 'customer' && role.name !== 'guarantor')
                      .map((role) => (
                        <option key={role.name} value={role.name}>
                          {role.displayName}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-base-muted mt-1">Select the staff member's role and permissions</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                  <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">
                    The staff member can update their profile details after their first login.
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={createUserMutation.isPending}
                  className="px-4 py-2 rounded-lg border border-base text-base-secondary hover:bg-[var(--bg-surface-2)] disabled:opacity-50 flex items-center gap-2"
                >
                  <X size={16} />
                  Cancel
                </button>
                <button
                  onClick={() => 
                    createUserMutation.mutate({
                      phone_number: createFormData.phone_number,
                      role: createFormData.role,
                    })
                  }
                  disabled={
                    createUserMutation.isPending ||
                    !createFormData.phone_number ||
                    !createFormData.role
                  }
                  className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus size={16} />
                  {createUserMutation.isPending ? 'Creating...' : 'Create Staff'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedUserForModules && (
        <ModuleAccessModal
          user={selectedUserForModules}
          onClose={() => setSelectedUserForModules(null)}
        />
      )}
    </div>
  );
}