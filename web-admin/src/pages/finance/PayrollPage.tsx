import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, payrollApi } from '@/services/api';
import {
  Wallet, Users, Plus, CheckCircle2, ChevronRight, Loader2,
  Download, XCircle, FileText, DollarSign, Building, ExternalLink
} from 'lucide-react';

interface Staff {
  id: string;
  user_id?: string | null;
  phone_number?: string;
  email?: string;
  full_name: string;
  nic_number?: string;
  designation: string;
  department: string;
  address?: string;
  date_of_birth?: string;
  basic_salary: number;
  transport_allow: number;
  meal_allow: number;
  commission_rate: number;
  epf_no: string;
  etf_no: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_branch?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  profile_photo_url?: string;
  joined_date?: string;
  is_active?: boolean;
}

interface StaffForm {
  user_id?: string;
  phone_number: string;
  email: string;
  full_name: string;
  nic_number: string;
  designation: string;
  department: string;
  address: string;
  date_of_birth: string;
  basic_salary: string;
  transport_allow: string;
  meal_allow: string;
  commission_rate: string;
  epf_no: string;
  etf_no: string;
  bank_name: string;
  bank_account_no: string;
  bank_branch: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  joined_date: string;
  is_active: boolean;
  create_user_account?: boolean;
  password?: string;
}

interface PayrollRun {
  id: string;
  run_month: string;
  status: 'draft' | 'approved' | 'paid' | 'cancelled';
  total_gross: number;
  total_net: number;
  total_epf_ee: number;
  total_epf_er: number;
  total_etf: number;
  created_at: string;
  lines?: PayrollLine[];
}

interface PayrollLine {
  id: string;
  staff: Staff;
  basic_salary: number;
  transport_allow: number;
  meal_allow: number;
  commission_amount: number;
  phones_sold: number;
  epf_ee: number;
  epf_er: number;
  etf: number;
  deductions?: number;
  gross_salary: number;
  net_salary: number;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'surface-2 text-gray-600',
  approved: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PayrollPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'slips' | 'staff' | 'costs'>('slips');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [createForm, setCreateForm] = useState({
    run_month: new Date().toISOString().slice(0, 7),
    notes: '',
  });
  const initialStaffForm: StaffForm = {
    user_id: undefined,
    phone_number: '',
    email: '',
    full_name: '',
    nic_number: '',
    designation: '',
    department: '',
    address: '',
    date_of_birth: '',
    basic_salary: '0',
    transport_allow: '0',
    meal_allow: '0',
    commission_rate: '0',
    epf_no: '',
    etf_no: '',
    bank_name: '',
    bank_account_no: '',
    bank_branch: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    joined_date: '',
    is_active: true,
    create_user_account: false,
    password: '',
  };
  const [staffForm, setStaffForm] = useState<StaffForm>(initialStaffForm);

  const { data: runsRes, isLoading: runsLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get('/payroll/runs').then(r => r.data),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
  const runs: PayrollRun[] = runsRes?.data ?? [];

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  const { data: staffList, isLoading: staffLoading } = useQuery({
    queryKey: ['payroll-staff'],
    queryFn: () => payrollApi.listStaff().then(r => r.data.data as Staff[]),
    staleTime: 5 * 60 * 1000, // 5 minutes – staff list rarely changes
  });
  const staff: Staff[] = staffList ?? [];

  const { data: staffUsersRes } = useQuery({
    queryKey: ['payroll-staff-users'],
    queryFn: () => payrollApi.listUsers().then(r => r.data),
    enabled: showStaffModal,
    staleTime: 3 * 60 * 1000,
  });
  const staffUsers: { id: string; phone_number: string; role: string; full_name?: string; email?: string }[] = staffUsersRes?.data ?? [];

  const availableStaffUsers = useMemo(() => {
    return staffUsers.filter(user =>
      !staff.some(s => s.user_id === user.id || (s.phone_number && s.phone_number === user.phone_number))
    );
  }, [staffUsers, staff]);

  const { data: runDetailRes, isLoading: runDetailLoading } = useQuery({
    queryKey: ['payroll-run', selectedRunId],
    queryFn: () => api.get(`/payroll/runs/${selectedRunId}`).then(r => r.data),
    enabled: !!selectedRunId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
  const selectedRun: PayrollRun | null = runDetailRes?.data ?? null;

  const createRun = useMutation({
    mutationFn: (payload: object) => payrollApi.createRun(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      setShowCreateModal(false);
      setSelectedRunId(res.data.data?.id ?? null);
    },
  });

  const approveRun = useMutation({
    mutationFn: (id: string) => payrollApi.approveRun(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      if (selectedRunId) qc.invalidateQueries({ queryKey: ['payroll-run', selectedRunId] });
    },
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => payrollApi.markPaidRun(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      if (selectedRunId) qc.invalidateQueries({ queryKey: ['payroll-run', selectedRunId] });
    },
  });

  const createStaff = useMutation({
    mutationFn: (payload: unknown) => payrollApi.createStaff(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      setShowStaffModal(false);
      setSelectedStaff(null);
      setStaffForm(initialStaffForm);
    },
  });

  const updateStaff = useMutation({
    mutationFn: (payload: unknown) => payrollApi.updateStaff(selectedStaff?.id ?? '', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      setShowStaffModal(false);
      setSelectedStaff(null);
      setStaffForm(initialStaffForm);
    },
  });

  const downloadPayslip = (line: PayrollLine) => {
    const content = `
AIRVOICE (PVT) LTD — PAYSLIP
==============================
Employee: ${line.staff?.full_name}
Designation: ${line.staff?.designation}
Period: ${selectedRun?.run_month}
EPF No: ${line.staff?.epf_no ?? '—'}

EARNINGS
Basic Salary:       LKR ${line.basic_salary.toLocaleString()}
Transport Allow:    LKR ${line.transport_allow.toLocaleString()}
Meal Allow:         LKR ${line.meal_allow.toLocaleString()}
Commission (${line.phones_sold} phones): LKR ${line.commission_amount.toLocaleString()}
GROSS:              LKR ${line.gross_salary.toLocaleString()}

DEDUCTIONS
EPF (8%):           LKR ${line.epf_ee.toLocaleString()}
Other (Loan/Adv):   LKR ${Number(line.deductions ?? 0).toLocaleString()}

NET PAY:            LKR ${line.net_salary.toLocaleString()}

EMPLOYER CONTRIBUTIONS
EPF (12%):          LKR ${line.epf_er.toLocaleString()}
ETF (3%):           LKR ${line.etf.toLocaleString()}
    `.trim();
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payslip_${line.staff?.full_name?.replace(/\s/g, '_')}_${selectedRun?.run_month}.txt`;
    a.click();
  };

  const payrollTotals = useMemo(() => {
    const base = staff.reduce((sum, item) => sum + Number(item.basic_salary), 0);
    const allowances = staff.reduce((sum, item) => sum + Number(item.transport_allow) + Number(item.meal_allow), 0);
    return {
      staffCount: staff.length,
      salaryBase: base,
      allowances,
      monthlyPayroll: base + allowances,
      epfLiability: (base + allowances) * 0.2,
      etfLiability: (base + allowances) * 0.03,
    };
  }, [staff]);

  const openStaffModal = (staffMember?: Staff) => {
    if (staffMember) {
      setSelectedStaff(staffMember);
      setStaffForm({
        user_id: staffMember.user_id ?? undefined,
        phone_number: staffMember.phone_number ?? '',
        email: staffMember.email ?? '',
        full_name: staffMember.full_name,
        nic_number: staffMember.nic_number ?? '',
        designation: staffMember.designation,
        department: staffMember.department ?? '',
        address: staffMember.address ?? '',
        date_of_birth: staffMember.date_of_birth ? staffMember.date_of_birth.split('T')[0] : '',
        basic_salary: String(staffMember.basic_salary ?? 0),
        transport_allow: String(staffMember.transport_allow ?? 0),
        meal_allow: String(staffMember.meal_allow ?? 0),
        commission_rate: String(staffMember.commission_rate ?? 0),
        epf_no: staffMember.epf_no ?? '',
        etf_no: staffMember.etf_no ?? '',
        bank_name: staffMember.bank_name ?? '',
        bank_account_no: staffMember.bank_account_no ?? '',
        bank_branch: staffMember.bank_branch ?? '',
        emergency_contact_name: staffMember.emergency_contact_name ?? '',
        emergency_contact_phone: staffMember.emergency_contact_phone ?? '',
        joined_date: staffMember.joined_date ? staffMember.joined_date.split('T')[0] : '',
        is_active: staffMember.is_active ?? true,
      });
    } else {
      setSelectedStaff(null);
      setStaffForm(initialStaffForm);
    }
    setShowStaffModal(true);
  };

  const saveStaff = () => {
    const payload = {
      user_id: staffForm.user_id || undefined,
      phone_number: staffForm.phone_number || undefined,
      email: staffForm.email || undefined,
      full_name: staffForm.full_name,
      nic_number: staffForm.nic_number || undefined,
      designation: staffForm.designation,
      department: staffForm.department || undefined,
      address: staffForm.address || undefined,
      date_of_birth: staffForm.date_of_birth || undefined,
      basic_salary: Number(staffForm.basic_salary),
      transport_allow: Number(staffForm.transport_allow),
      meal_allow: Number(staffForm.meal_allow),
      commission_rate: Number(staffForm.commission_rate),
      epf_no: staffForm.epf_no || undefined,
      etf_no: staffForm.etf_no || undefined,
      bank_name: staffForm.bank_name || undefined,
      bank_account_no: staffForm.bank_account_no || undefined,
      bank_branch: staffForm.bank_branch || undefined,
      emergency_contact_name: staffForm.emergency_contact_name || undefined,
      emergency_contact_phone: staffForm.emergency_contact_phone || undefined,
      joined_date: staffForm.joined_date || undefined,
      is_active: staffForm.is_active,
    };
    if (selectedStaff) {
      updateStaff.mutate(payload);
    } else {
      createStaff.mutate(payload);
    }
  };

  const exportCSV = () => {
    if (!selectedRun || !selectedRun.lines || selectedRun.lines.length === 0) return;
    const headers = ['Staff Name', 'Designation', 'Department', 'Basic Salary', 'Allowances', 'Commission', 'Gross Salary', 'EPF Employee', 'Other Deductions', 'Net Salary'];
    const rows = selectedRun.lines.map(line => [
      line.staff?.full_name,
      line.staff?.designation,
      line.staff?.department,
      line.basic_salary,
      Number(line.transport_allow ?? 0) + Number(line.meal_allow ?? 0),
      line.commission_amount,
      line.gross_salary,
      line.epf_ee,
      line.deductions ?? 0,
      line.net_salary
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val ?? ''}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_${selectedRun.run_month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Suppress unused var warning
  void payrollTotals;

  // ── Page-level loading skeleton (initial load) ──
  if (runsLoading && staffLoading) {
    return (
      <div className="p-6 space-y-5">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-72 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-10 w-40 rounded-lg bg-amber-100 animate-pulse" />
        </div>
        {/* Tab skeleton */}
        <div className="flex gap-1 surface-2 rounded-xl p-1 w-fit">
          {['Overview','Pay Slips','Staff Register','Cost Summary'].map(t => (
            <div key={t} className="px-5 py-2 rounded-lg h-9 w-28 bg-gray-200 animate-pulse" />
          ))}
        </div>
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="card p-5 space-y-3">
              <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
              <div className="h-8 w-32 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-base h-14 bg-gray-50 animate-pulse" />
          <div className="divide-y divide-gray-100">
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-4 w-44 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
                <div className="ml-auto h-6 w-16 rounded-full bg-green-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Wallet size={28} className="text-[#2563ea]" /> Payroll &amp; Salary Management
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            {staff.length} staff members · {runs.length} salary runs
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"
        >
          <Plus size={16} /> New Payroll Run
        </button>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-1 surface-2 rounded-xl p-1 w-fit">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'slips',    label: 'Pay Slips' },
          { key: 'staff',    label: 'Staff Register' },
          { key: 'costs',    label: 'Cost Summary' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? 'surface text-base-primary shadow-sm'
                : 'text-base-muted hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          OVERVIEW TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Staff',      value: staff.length,                                                                                                          icon: Users,      color: 'text-blue-600',   bg: 'bg-blue-50'   },
              { label: 'Monthly Payroll',  value: `LKR ${staff.reduce((s, st) => s + st.basic_salary + st.transport_allow + st.meal_allow, 0).toLocaleString()}`,        icon: DollarSign, color: 'text-green-600',  bg: 'bg-green-50'  },
              { label: 'EPF Liability',    value: `LKR ${Math.round(staff.reduce((s, st) => s + (st.basic_salary + st.transport_allow + st.meal_allow) * 0.20, 0)).toLocaleString()}`, icon: Building, color: 'text-amber-600',  bg: 'bg-amber-50'  },
              { label: 'ETF Liability',    value: `LKR ${Math.round(staff.reduce((s, st) => s + (st.basic_salary + st.transport_allow + st.meal_allow) * 0.03, 0)).toLocaleString()}`, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div>
                    <Icon size={18} className="text-[#2563ea]" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-base-muted">{label}</span>
                </div>
                <div className={`text-xl font-black ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Runs List + Run Detail */}
          <div className="flex gap-5">
            {/* Run list sidebar */}
            <div className="w-72 shrink-0">
              <div className="card h-full">
                <div className="px-4 py-3.5 border-b border-base flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-base-secondary">Salary Runs</h3>
                  <button onClick={() => setShowCreateModal(true)} className="text-amber-600 text-xs font-semibold hover:text-amber-800">New</button>
                </div>
                {runsLoading ? (
                  <div className="flex items-center justify-center py-10 text-base-muted">
                    <Loader2 size={18} className="animate-spin mr-2" />
                  </div>
                ) : runs.length === 0 ? (
                  <div className="py-10 text-center text-base-muted">
                    <Wallet size={30} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No runs yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {runs.map(run => (
                      <button
                        key={run.id}
                        onClick={() => setSelectedRunId(run.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-[var(--bg-surface-2)] transition-colors flex items-center justify-between ${
                          selectedRunId === run.id ? 'bg-amber-50 border-l-2 border-amber-500' : ''
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-sm text-base-primary">{run.run_month}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[run.status]}`}>
                              {run.status}
                            </span>
                          </div>
                          <div className="text-xs text-base-muted mt-1">Net: LKR {Number(run.total_net ?? 0).toLocaleString()}</div>
                        </div>
                        <ChevronRight size={15} className="text-gray-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Run detail panel */}
            {runDetailLoading ? (
              <div className="flex-1 min-w-0 flex items-center justify-center py-24">
                <div className="text-center space-y-3">
                  <Loader2 size={36} className="animate-spin text-amber-500 mx-auto" />
                  <p className="text-sm text-base-muted">Loading payroll run...</p>
                </div>
              </div>
            ) : selectedRun ? (
              <div className="flex-1 min-w-0 space-y-4">
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="font-bold text-lg text-base-primary">Payroll — {selectedRun.run_month}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[selectedRun.status]}`}>
                        {selectedRun.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {selectedRun.status === 'draft' && (
                        <button
                          onClick={() => approveRun.mutate(selectedRun.id)}
                          disabled={approveRun.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle2 size={15} /> Approve
                        </button>
                      )}
                      {selectedRun.status === 'approved' && (
                        <button
                          onClick={() => markPaid.mutate(selectedRun.id)}
                          disabled={markPaid.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle2 size={15} /> Mark as Paid
                        </button>
                      )}
                      <button
                        onClick={exportCSV}
                        className="flex items-center gap-2 px-4 py-2 border border-base text-gray-600 rounded-lg text-sm font-semibold hover:bg-[var(--bg-surface-2)] transition-colors"
                      >
                        <Download size={15} /> Export CSV
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-4">
                    {[
                      ['Total Gross',  `LKR ${Number(selectedRun.total_gross  ?? 0).toLocaleString()}`],
                      ['EPF (EE 8%)', `LKR ${Number(selectedRun.total_epf_ee  ?? 0).toLocaleString()}`],
                      ['EPF (ER 12%)',`LKR ${Number(selectedRun.total_epf_er  ?? 0).toLocaleString()}`],
                      ['ETF (3%)',    `LKR ${Number(selectedRun.total_etf      ?? 0).toLocaleString()}`],
                      ['Total Net Pay',`LKR ${Number(selectedRun.total_net    ?? 0).toLocaleString()}`],
                    ].map(([label, value]) => (
                      <div key={label} className="surface-2 rounded-xl p-3">
                        <div className="text-xs text-base-muted mb-1">{label}</div>
                        <div className="font-bold text-sm text-base-primary font-mono">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lines table */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-base">
                    <h4 className="font-semibold text-sm text-base-secondary flex items-center gap-2">
                      <Users size={15} /> Staff Payslips ({selectedRun.lines?.length ?? 0})
                    </h4>
                  </div>
                  {(!selectedRun.lines || selectedRun.lines.length === 0) ? (
                    <div className="py-12 text-center text-base-muted">
                      <Users size={30} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No payroll lines found</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="surface-2 border-b border-base">
                          {['Staff', 'Basic', 'Allowances', 'Commission', 'Gross', 'EPF(EE)', 'Other Deductions', 'Net Pay', ''].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-muted">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedRun.lines.map(line => (
                          <tr key={line.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-base-primary">{line.staff?.full_name}</div>
                              <div className="text-xs text-base-muted">{line.staff?.designation}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm">LKR {Number(line.basic_salary ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono text-sm text-base-muted">
                              LKR {(Number(line.transport_allow ?? 0) + Number(line.meal_allow ?? 0)).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm">LKR {Number(line.commission_amount ?? 0).toLocaleString()}</span>
                              {line.phones_sold > 0 && <div className="text-xs text-base-muted">{line.phones_sold} phones</div>}
                            </td>
                            <td className="px-4 py-3 font-bold font-mono">LKR {Number(line.gross_salary ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono text-sm text-amber-600">- LKR {Number(line.epf_ee ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono text-sm text-red-500">- LKR {Number(line.deductions ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-bold font-mono text-green-700">LKR {Number(line.net_salary ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => downloadPayslip(line)} className="p-1.5 rounded-lg surface-2 text-base-muted hover:bg-[var(--bg-surface-2)] transition-colors" title="Download Payslip">
                                <Download size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 card flex items-center justify-center py-24">
                <div className="text-center text-base-muted">
                  <Wallet size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a payroll run to view details</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 flex items-center gap-1.5 mx-auto px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors"
                  >
                    <Plus size={14} /> Create First Run
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          PAY SLIPS TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'slips' && (
        <div className="space-y-5">
          {/* Run selector row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-600 shrink-0">Run:</span>
            {runsLoading ? (
              <Loader2 size={16} className="animate-spin text-base-muted" />
            ) : runs.length === 0 ? (
              <span className="text-sm text-base-muted">No runs yet</span>
            ) : (
              runs.map(run => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    selectedRunId === run.id
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'surface text-gray-600 border-base hover:border-amber-300'
                  }`}
                >
                  {run.run_month}
                </button>
              ))
            )}
            {selectedRun && (
              <div className="ml-auto flex gap-2">
                {selectedRun.status === 'draft' && (
                  <button
                    onClick={() => approveRun.mutate(selectedRun.id)}
                    disabled={approveRun.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 size={13} /> Approve Run
                  </button>
                )}
                {selectedRun.status === 'approved' && (
                  <button
                    onClick={() => markPaid.mutate(selectedRun.id)}
                    disabled={markPaid.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 size={13} /> Mark Paid
                  </button>
                )}
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-base text-gray-600 rounded-lg text-xs font-semibold hover:bg-[var(--bg-surface-2)] transition-colors"
                >
                  <Download size={13} /> Export CSV
                </button>
              </div>
            )}
          </div>

          {/* Department filter pills */}
          {(() => {
            const depts = ['All', ...Array.from(new Set(
              (selectedRun?.lines ?? []).map(l => l.staff?.department).filter(Boolean) as string[]
            ))];
            return (
              <div className="flex items-center gap-2 flex-wrap">
                {depts.map(dept => (
                  <button
                    key={dept}
                    onClick={() => setDeptFilter(dept)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      deptFilter === dept
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'surface-2 text-gray-600 hover:bg-[var(--bg-surface-3)]'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Payslip card grid */}
          {!selectedRun ? (
            <div className="card flex items-center justify-center py-24 text-base-muted">
              <div className="text-center">
                <Wallet size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No payroll run selected</p>
              </div>
            </div>
          ) : !selectedRun.lines || selectedRun.lines.length === 0 ? (
            <div className="card flex items-center justify-center py-24 text-base-muted">
              <div className="text-center">
                <Users size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No payslips in this run</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {selectedRun.lines
                .filter(line => deptFilter === 'All' || line.staff?.department === deptFilter)
                .map(line => {
                  const allowances = Number(line.transport_allow ?? 0) + Number(line.meal_allow ?? 0);
                  const companyCost = Number(line.gross_salary ?? 0) + Number(line.epf_er ?? 0) + Number(line.etf ?? 0);
                  return (
                    <div
                      key={line.id}
                      className="surface rounded-2xl border border-base shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                    >
                      {/* Card header */}
                      <div className="px-5 pt-5 pb-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                              {line.staff?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                            </div>
                            <div>
                              <div className="font-bold text-base-primary text-sm leading-tight">{line.staff?.full_name}</div>
                              <div className="text-xs text-base-muted">{line.staff?.designation}</div>
                              <div className="text-xs text-base-muted">{line.staff?.department}</div>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLES[selectedRun.status]}`}>
                            {selectedRun.status.toUpperCase()}
                          </span>
                        </div>

                        {/* Salary breakdown rows */}
                        <div className="space-y-1.5 mt-4">
                          {[
                            { label: 'Basic Salary', value: Number(line.basic_salary ?? 0), neg: false },
                            { label: 'Allowances',   value: allowances,                       neg: false },
                            { label: 'Commission',   value: Number(line.commission_amount ?? 0), neg: false },
                            { label: 'EPF (EE 8%)', value: Number(line.epf_ee ?? 0),          neg: true  },
                            { label: 'Other Deductions', value: Number(line.deductions ?? 0), neg: true  },
                          ].map(({ label, value, neg }) => (
                            <div key={label} className="flex items-center justify-between text-xs">
                              <span className="text-base-muted">{label}</span>
                              <span className={`font-mono font-semibold ${neg ? 'text-red-500' : 'text-base-secondary'}`}>
                                {neg ? '- ' : ''}LKR {Math.abs(value).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="border-t border-dashed border-base my-3" />

                        {/* Net take-home */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-base-muted uppercase tracking-wide">Net Take-Home</span>
                          <span className="text-lg font-black text-base-primary font-mono">
                            LKR {Number(line.net_salary ?? 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Card footer */}
                      <div className="surface-2 px-5 py-3 flex items-center justify-between border-t border-base gap-2">
                        <div className="text-xs text-base-muted truncate">
                          Company cost: <span className="font-semibold text-base-secondary">LKR {companyCost.toLocaleString()}</span>
                        </div>
                        {line.staff?.epf_no && (
                          <div className="text-xs text-base-muted font-mono shrink-0">EPF-{line.staff.epf_no}</div>
                        )}
                        <button
                          onClick={() => downloadPayslip(line)}
                          className="p-1.5 rounded-lg surface border border-base text-base-muted hover:bg-[var(--bg-surface-2)] transition-colors shrink-0"
                          title="Download Payslip"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          STAFF REGISTER TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'staff' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-base flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-base-secondary">Payroll Staff Register</h3>
              <p className="text-xs text-base-muted mt-1">Active staff members used for payroll run computation.</p>
            </div>
            <button
              onClick={() => openStaffModal()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors"
            >
              <Plus size={14} /> Add Staff
            </button>
          </div>
          {staffLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-base-muted">
              <Loader2 size={34} className="animate-spin mb-2 text-[#2563ea]" />
              <p className="text-sm">Loading staff members...</p>
            </div>
          ) : staff.length === 0 ? (
            <div className="py-10 text-center text-base-muted">
              <Users size={34} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No staff members configured yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="surface-2 text-base-muted uppercase text-xs tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Designation</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Salary</th>
                    <th className="px-4 py-3">Allowances</th>
                    <th className="px-4 py-3">Commission %</th>
                    <th className="px-4 py-3">EPF No.</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staff.map(staffMember => (
                    <tr key={staffMember.id} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                      <td className="px-4 py-3 font-semibold text-base-primary">{staffMember.full_name}</td>
                      <td className="px-4 py-3 text-base-muted">{staffMember.designation}</td>
                      <td className="px-4 py-3 text-base-muted">{staffMember.department}</td>
                      <td className="px-4 py-3 font-mono">LKR {Number(staffMember.basic_salary ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono">LKR {Number((staffMember.transport_allow ?? 0) + (staffMember.meal_allow ?? 0)).toLocaleString()}</td>
                      <td className="px-4 py-3">{Number(staffMember.commission_rate ?? 0).toFixed(2)}%</td>
                      <td className="px-4 py-3 text-base-muted font-mono text-xs">{staffMember.epf_no || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${staffMember.is_active ? 'bg-green-100 text-green-700' : 'surface-2 text-base-muted'}`}>
                          {staffMember.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/payroll/staff/${staffMember.id}`)}
                            className="flex items-center gap-1 text-blue-600 text-xs font-semibold hover:text-blue-800"
                            title="View full profile"
                          >
                            <ExternalLink size={12} />Profile
                          </button>
                          <button
                            onClick={() => openStaffModal(staffMember)}
                            className="text-amber-600 text-xs font-semibold hover:text-amber-800"
                          >Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          COST SUMMARY TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'costs' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-base">
            <h3 className="font-semibold text-sm text-base-secondary">Cost Summary by Run</h3>
            <p className="text-xs text-base-muted mt-1">Total employer costs including EPF (ER 12%) and ETF (3%).</p>
          </div>
          {runs.length === 0 ? (
            <div className="py-10 text-center text-base-muted">
              <FileText size={34} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No payroll runs found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="surface-2 text-base-muted uppercase text-xs tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Month</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Gross Payroll</th>
                    <th className="px-4 py-3">EPF EE (8%)</th>
                    <th className="px-4 py-3">EPF ER (12%)</th>
                    <th className="px-4 py-3">ETF (3%)</th>
                    <th className="px-4 py-3">Net Pay</th>
                    <th className="px-4 py-3">Total Company Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.map(run => {
                    const companyCost = Number(run.total_gross ?? 0) + Number(run.total_epf_er ?? 0) + Number(run.total_etf ?? 0);
                    return (
                      <tr key={run.id} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                        <td className="px-4 py-3 font-semibold text-base-primary">{run.run_month}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[run.status]}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">LKR {Number(run.total_gross ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-red-500">LKR {Number(run.total_epf_ee ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-amber-600">LKR {Number(run.total_epf_er ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-purple-600">LKR {Number(run.total_etf ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold font-mono text-green-700">LKR {Number(run.total_net ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold font-mono text-base-primary">LKR {companyCost.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="surface-2 border-t-2 border-base">
                  <tr>
                    <td className="px-4 py-3 font-bold text-base-secondary" colSpan={2}>Totals</td>
                    <td className="px-4 py-3 font-bold font-mono">LKR {runs.reduce((s, r) => s + Number(r.total_gross ?? 0), 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold font-mono text-red-500">LKR {runs.reduce((s, r) => s + Number(r.total_epf_ee ?? 0), 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold font-mono text-amber-600">LKR {runs.reduce((s, r) => s + Number(r.total_epf_er ?? 0), 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold font-mono text-purple-600">LKR {runs.reduce((s, r) => s + Number(r.total_etf ?? 0), 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold font-mono text-green-700">LKR {runs.reduce((s, r) => s + Number(r.total_net ?? 0), 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold font-mono text-base-primary">LKR {runs.reduce((s, r) => s + Number(r.total_gross ?? 0) + Number(r.total_epf_er ?? 0) + Number(r.total_etf ?? 0), 0).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          CREATE RUN MODAL
      ══════════════════════════════════════════ */}
      {showCreateModal && (() => {
        const estGross = staff.reduce((s, st) => s + Number(st.basic_salary ?? 0) + Number(st.transport_allow ?? 0) + Number(st.meal_allow ?? 0), 0);
        const estEpfEr = Math.round(estGross * 0.12);
        const estEtf   = Math.round(estGross * 0.03);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

              {/* Dark navy header */}
              <div className="bg-[#0f1c2e] px-6 py-4 flex items-center justify-between">
                <h3 className="font-bold text-white text-base">Run New Payroll</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                >
                  <XCircle size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">

                {/* Info notice */}
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
                  <span className="mt-0.5 shrink-0 text-blue-500">ℹ</span>
                  <span>Creates a salary draft for all <strong>{staff.length}</strong> staff members based on current salary structures. Review and adjust before marking paid.</span>
                </div>

                {/* Month input */}
                <div>
                  <label className="block text-xs font-bold text-base-muted uppercase tracking-wider mb-2">
                    Payroll Month <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="month"
                    className="w-full border border-base rounded-lg px-4 py-3 text-sm text-base-secondary focus:outline-none focus:ring-2 focus:ring-blue-400 surface-2"
                    value={createForm.run_month}
                    onChange={e => setCreateForm(f => ({ ...f, run_month: e.target.value }))}
                  />
                </div>

                {/* Live stat tiles */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'TOTAL STAFF',        value: `${staff.length} employees` },
                    { label: 'EST. TOTAL GROSS',    value: `LKR ${estGross.toLocaleString()}` },
                    { label: 'EPF EMPLOYER (12%)',  value: `LKR ${estEpfEr.toLocaleString()}` },
                    { label: 'ETF (3%)',             value: `LKR ${estEtf.toLocaleString()}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="surface-2 border border-base rounded-xl px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-base-muted mb-1">{label}</div>
                      <div className="font-bold text-base-primary text-sm">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-base rounded-lg text-sm font-medium text-gray-600 hover:bg-[var(--bg-surface-2)] transition-colors"
                >
                  <XCircle size={14} /> Cancel
                </button>
                <button
                  onClick={() => createRun.mutate(createForm)}
                  disabled={createRun.isPending || !createForm.run_month}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {createRun.isPending
                    ? <><Loader2 size={14} className="animate-spin" />Computing…</>
                    : <><span className="text-base leading-none">▶</span> Create Draft Payroll</>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          STAFF MODAL (Add / Edit)
      ══════════════════════════════════════════ */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base sticky top-0 surface z-10">
              <div className="flex items-center gap-2">
                <Users size={18} style={{ color: 'var(--accent-primary)' }} />
                <h3 className="font-bold text-base-primary">
                  {selectedStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {selectedStaff && (
                  <button
                    onClick={() => { setShowStaffModal(false); navigate(`/payroll/staff/${selectedStaff.id}`); }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold transition-colors"
                  >
                    <ExternalLink size={12} /> Full Profile
                  </button>
                )}
                <button onClick={() => setShowStaffModal(false)} className="text-base-muted hover:text-gray-600">
                  <XCircle size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Section: Link System User */}
              {!selectedStaff && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Link System Account (Optional)</div>
                  <select
                    value={staffForm.user_id ?? ''}
                    onChange={(e) => {
                      const userId = e.target.value || undefined;
                      const selectedUser = staffUsers.find(user => user.id === userId);
                      setStaffForm(prev => ({
                        ...prev,
                        user_id: userId,
                        phone_number: selectedUser?.phone_number ?? prev.phone_number,
                        full_name: selectedUser?.full_name ?? selectedUser?.phone_number ?? prev.full_name,
                        designation: selectedUser ? selectedUser.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : prev.designation,
                      }));
                    }}
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                  >
                    <option value="">— No system account link (standalone staff) —</option>
                    {availableStaffUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.phone_number} {user.email ? `(${user.email})` : ''} — {user.role.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Linking allows commission auto-calculation for sales officers.</p>
                </div>
              )}

              {/* Section: Personal Information */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Personal Information</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Full Name *</label>
                    <input value={staffForm.full_name} onChange={e => setStaffForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Full name" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>NIC Number</label>
                    <input value={staffForm.nic_number} onChange={e => setStaffForm(p => ({ ...p, nic_number: e.target.value }))} placeholder="National ID" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Phone Number</label>
                    <input value={staffForm.phone_number} onChange={e => setStaffForm(p => ({ ...p, phone_number: e.target.value }))} placeholder="+94 71 234 5678" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Email Address</label>
                    <input type="email" value={staffForm.email} onChange={e => setStaffForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Date of Birth</label>
                    <input type="date" value={staffForm.date_of_birth} onChange={e => setStaffForm(p => ({ ...p, date_of_birth: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Home Address</label>
                    <input value={staffForm.address} onChange={e => setStaffForm(p => ({ ...p, address: e.target.value }))} placeholder="Full residential address" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Employment */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Employment Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Designation *</label>
                    <input value={staffForm.designation} onChange={e => setStaffForm(p => ({ ...p, designation: e.target.value }))} placeholder="Job title" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Department</label>
                    <input value={staffForm.department} onChange={e => setStaffForm(p => ({ ...p, department: e.target.value }))} placeholder="Department" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Joined Date</label>
                    <input type="date" value={staffForm.joined_date} onChange={e => setStaffForm(p => ({ ...p, joined_date: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>EPF No.</label>
                    <input value={staffForm.epf_no} onChange={e => setStaffForm(p => ({ ...p, epf_no: e.target.value }))} placeholder="EPF number" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>ETF No.</label>
                    <input value={staffForm.etf_no} onChange={e => setStaffForm(p => ({ ...p, etf_no: e.target.value }))} placeholder="ETF number" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Salary */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Salary &amp; Allowances</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Basic Salary (LKR)</label>
                    <input type="number" min="0" value={staffForm.basic_salary} onChange={e => setStaffForm(p => ({ ...p, basic_salary: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Transport Allowance (LKR)</label>
                    <input type="number" min="0" value={staffForm.transport_allow} onChange={e => setStaffForm(p => ({ ...p, transport_allow: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Meal Allowance (LKR)</label>
                    <input type="number" min="0" value={staffForm.meal_allow} onChange={e => setStaffForm(p => ({ ...p, meal_allow: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Commission Rate (%)</label>
                    <input type="number" min="0" max="100" value={staffForm.commission_rate} onChange={e => setStaffForm(p => ({ ...p, commission_rate: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Bank Details */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Bank Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Bank Name</label>
                    <input value={staffForm.bank_name} onChange={e => setStaffForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. Bank of Ceylon" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Account Number</label>
                    <input value={staffForm.bank_account_no} onChange={e => setStaffForm(p => ({ ...p, bank_account_no: e.target.value }))} placeholder="Account number" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Branch</label>
                    <input value={staffForm.bank_branch} onChange={e => setStaffForm(p => ({ ...p, bank_branch: e.target.value }))} placeholder="Branch name" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Emergency Contact */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Emergency Contact</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Contact Name</label>
                    <input value={staffForm.emergency_contact_name} onChange={e => setStaffForm(p => ({ ...p, emergency_contact_name: e.target.value }))} placeholder="Emergency contact name" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Contact Phone</label>
                    <input value={staffForm.emergency_contact_phone} onChange={e => setStaffForm(p => ({ ...p, emergency_contact_phone: e.target.value }))} placeholder="+94 71 234 5678" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-5 flex gap-2 justify-end sticky bottom-0 surface border-t border-base pt-4">
              <button onClick={() => setShowStaffModal(false)} className="px-4 py-2.5 border border-base rounded-lg text-sm font-medium hover:bg-[var(--bg-surface-2)] transition-colors">Cancel</button>
              <button
                onClick={saveStaff}
                disabled={createStaff.isPending || updateStaff.isPending || !staffForm.full_name || !staffForm.designation}
                className="px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {(createStaff.isPending || updateStaff.isPending) ? <><Loader2 size={14} className="inline animate-spin mr-1" />Saving…</> : selectedStaff ? 'Update Staff' : 'Create Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
