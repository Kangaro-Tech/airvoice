import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, payrollApi } from '@/services/api';
import {
  Wallet, Users, Plus, CheckCircle2, ChevronRight, Loader2,
  Download, XCircle, FileText, DollarSign, Building, ExternalLink,
  TrendingUp, Clock, AlertCircle, ArrowUpRight, ArrowDownRight, PieChart as PieIcon, ShieldCheck, CalendarCheck
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';

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
  attendance_allowance?: number;
  performance_allowance?: number;
  allowance_01?: number;
  allowance_02?: number;
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
  attendance_allowance: string;
  performance_allowance: string;
  allowance_01: string;
  allowance_02: string;
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
  attendance_allowance?: number;
  performance_allowance?: number;
  allowance_01?: number;
  allowance_02?: number;
  commission_amount: number;
  phones_sold: number;
  epf_ee: number;
  epf_er: number;
  etf: number;
  deductions?: number;
  no_pay_deduction?: number;
  loans?: number;
  working_days?: number;
  leave_days?: number;
  no_pay_days?: number;
  gross_salary: number;
  net_salary: number;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'surface-2 text-gray-600',
  approved: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
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
    attendance_allowance: '0',
    performance_allowance: '0',
    allowance_01: '0',
    allowance_02: '0',
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
    staleTime: 5 * 60 * 1000, // 5 minutes â€“ staff list rarely changes
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
    const fmt = (n: number | undefined | null) =>
      Number(n ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const month = selectedRun?.run_month ?? '-';
    const year = month.split('-')[0] ?? '';
    const totalDeductions = Number(line.epf_ee) + Number(line.deductions ?? 0) + Number(line.loans ?? 0) + Number(line.no_pay_deduction ?? 0);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Payslip - ${line.staff?.full_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #000; background: #fff; }
    .wrap { max-width: 680px; margin: 30px auto; border: 2px solid #000; padding: 30px; }
    h2 { text-align: center; font-size: 18px; text-transform: uppercase; letter-spacing: 1px; }
    h3 { text-align: center; font-size: 14px; font-weight: normal; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; padding: 3px 0; }
    .row span:first-child { flex: 1; }
    .row span:last-child { text-align: right; min-width: 120px; }
    .bold { font-weight: bold; }
    .section-header { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin: 14px 0 6px; display: flex; justify-content: space-between; }
    .section-title { font-weight: bold; margin: 14px 0 6px; }
    .total-row { display: flex; justify-content: space-between; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; font-weight: bold; margin: 8px 0 14px; }
    .net-pay-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin: 14px 0; }
    .footer-box { border: 1px solid #000; padding: 10px; display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
    .receipt-text { font-size: 13px; line-height: 1.6; margin-bottom: 12px; }
    .sig-area { display: flex; justify-content: space-between; margin-top: 30px; }
    .sig-line { border-bottom: 1px solid #000; width: 160px; margin-bottom: 4px; height: 18px; }
    .bank-info { text-align: right; font-size: 13px; }
    .info-row { margin-bottom: 4px; }
    @media print { body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h2>AirVoice (Pvt) Ltd</h2>
    <h3>Pay Slip</h3>

    <div class="row info-row"><span><strong>Month:</strong> ${month}</span><span>[${year}]</span></div>
    <div class="info-row"><strong>Name:</strong> ${line.staff?.full_name ?? '-'}</div>
    <div class="info-row"><strong>Designation:</strong> ${line.staff?.designation ?? '-'}</div>
    <div class="info-row"><strong>EPF Number:</strong> ${line.staff?.epf_no ?? '-'}</div>

    <div class="section-header"><span>CONSOLIDATED SALARY</span><span>Rs. Cts.</span></div>
    <div class="row"><span>Basic Pay</span><span>${fmt(line.basic_salary)}</span></div>
    <div class="row"><span>Attendance Allowance</span><span>${fmt(line.attendance_allowance)}</span></div>
    <div class="row"><span>Performance Allowance</span><span>${fmt(line.performance_allowance)}</span></div>
    <div class="row"><span>Allowance 01</span><span>${fmt(line.allowance_01)}</span></div>
    <div class="row"><span>Allowance 02</span><span>${fmt(line.allowance_02)}</span></div>
    <div class="row"><span>Commission</span><span>${fmt(line.commission_amount)}</span></div>
    <div class="total-row"><span>Gross Pay</span><span>${fmt(line.gross_salary)}</span></div>

    <div class="section-title">DEDUCTIONS</div>
    <div class="row"><span>E.P.F. 8%</span><span>${fmt(line.epf_ee)}</span></div>
    <div class="row"><span>S. Adv. and others</span><span>${fmt(line.deductions)}</span></div>
    <div class="row"><span>Loans</span><span>${fmt(line.loans)}</span></div>
    <div class="row"><span>No Pay</span><span>${fmt(line.no_pay_deduction)}</span></div>
    <div class="total-row"><span>Total Deductions</span><span>${fmt(totalDeductions)}</span></div>

    <div class="net-pay-row"><span>NET PAY</span><span>${fmt(line.net_salary)}</span></div>

    <div class="row"><span>EPF Co. Contribution 12%</span><span>${fmt(line.epf_er)}</span></div>
    <div class="row"><span>Total EPF 20%</span><span>${fmt(Number(line.epf_ee) + Number(line.epf_er))}</span></div>
    <div class="row" style="border-bottom:1px dashed #000; padding-bottom:14px; margin-bottom:14px;"><span>ETF 3%</span><span>${fmt(line.etf)}</span></div>

    <div class="section-title">RECEIPT</div>
    <p class="receipt-text">Received with thanks from AirVoice (Pvt) Ltd the under mentioned amount being the NET PAY due to me for the month of <strong>${month}</strong></p>

    <div class="sig-area">
      <div>
        <div class="sig-line"></div>
        <div>Signature:</div>
      </div>
      <div class="bank-info">
        <div><strong>${line.staff?.bank_name ?? 'Commercial Bank'}</strong></div>
        <div>[${line.staff?.bank_branch ?? 'Branch Name'}]</div>
        <div>[${line.staff?.bank_account_no ?? 'Account Number'}]</div>
      </div>
    </div>

    <div class="footer-box">
      <div>
        <div style="margin-bottom:4px;"><strong>NAME:</strong> ${line.staff?.full_name ?? '-'}</div>
        <div style="margin-bottom:4px;"><strong>EPF NO:</strong> ${line.staff?.epf_no ?? '-'}</div>
        <div><strong>Net Pay Rs. <u>&nbsp;&nbsp;&nbsp;${fmt(line.net_salary)}&nbsp;&nbsp;&nbsp;</u></strong></div>
      </div>
      <div style="text-align:right; font-size:13px;">
        <div>Working Days: ${line.working_days ?? '-'}</div>
        <div>Leave Days: ${line.leave_days ?? '-'}</div>
        <div>No pay - Days: ${line.no_pay_days ?? '-'}</div>
      </div>
    </div>
  </div>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
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
        attendance_allowance: String(staffMember.attendance_allowance ?? 0),
        performance_allowance: String(staffMember.performance_allowance ?? 0),
        allowance_01: String(staffMember.allowance_01 ?? 0),
        allowance_02: String(staffMember.allowance_02 ?? 0),
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
      attendance_allowance: Number(staffForm.attendance_allowance),
      performance_allowance: Number(staffForm.performance_allowance),
      allowance_01: Number(staffForm.allowance_01),
      allowance_02: Number(staffForm.allowance_02),
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

const MONTH_OPTIONS = [
  { value: 'All', label: 'All Months' },
  { value: '01', label: 'January (01)' },
  { value: '02', label: 'February (02)' },
  { value: '03', label: 'March (03)' },
  { value: '04', label: 'April (04)' },
  { value: '05', label: 'May (05)' },
  { value: '06', label: 'June (06)' },
  { value: '07', label: 'July (07)' },
  { value: '08', label: 'August (08)' },
  { value: '09', label: 'September (09)' },
  { value: '10', label: 'October (10)' },
  { value: '11', label: 'November (11)' },
  { value: '12', label: 'December (12)' },
];

  const [overviewTimeframe, setOverviewTimeframe] = useState<'1M' | '3M' | '6M' | '1Y'>('6M');
  const [runYearFilter, setRunYearFilter] = useState<string>('All');
  const [runMonthFilter, setRunMonthFilter] = useState<string>('All');

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYear = new Date().getFullYear().toString();
    years.add(currentYear);
    (runs || []).forEach(r => {
      if (r.run_month && r.run_month.includes('-')) {
        years.add(r.run_month.split('-')[0]);
      }
    });
    return Array.from(years).sort().reverse();
  }, [runs]);

  const filteredRuns = useMemo(() => {
    return (runs || []).filter(r => {
      if (!r.run_month || !r.run_month.includes('-')) return true;
      const [y, m] = r.run_month.split('-');
      if (runYearFilter !== 'All' && y !== runYearFilter) return false;
      if (runMonthFilter !== 'All' && m !== runMonthFilter) return false;
      return true;
    });
  }, [runs, runYearFilter, runMonthFilter]);

  useEffect(() => {
    if (filteredRuns.length > 0) {
      const exists = filteredRuns.some(r => r.id === selectedRunId);
      if (!exists) {
        setSelectedRunId(filteredRuns[0].id);
      }
    }
  }, [filteredRuns, selectedRunId]);

  const monthlyPayrollBreakdown = useMemo(() => {
    if (selectedRun && selectedRun.lines && selectedRun.lines.length > 0) {
      const basic = selectedRun.lines.reduce((s, l) => s + Number(l.basic_salary || 0), 0);
      const allow = selectedRun.lines.reduce((s, l) => s + Number(l.transport_allow || 0) + Number(l.meal_allow || 0), 0);
      const comm = selectedRun.lines.reduce((s, l) => s + Number(l.commission_amount || 0), 0);
      const epfEe = Number(selectedRun.total_epf_ee || 0);
      const epfEr = Number(selectedRun.total_epf_er || 0);
      const etf = Number(selectedRun.total_etf || 0);
      const gross = Number(selectedRun.total_gross || 0);
      const net = Number(selectedRun.total_net || 0);
      const count = selectedRun.lines.length;
      return { basic, allow, comm, epfEe, epfEr, etf, statutory: epfEe + epfEr + etf, gross, net, count, month: selectedRun.run_month };
    }

    const basic = staff.reduce((s, st) => s + Number(st.basic_salary || 0), 0);
    const allow = staff.reduce((s, st) => s + Number(st.transport_allow || 0) + Number(st.meal_allow || 0), 0);
    const comm = 0;
    const gross = basic + allow;
    const epfEe = Math.round(gross * 0.08);
    const epfEr = Math.round(gross * 0.12);
    const etf = Math.round(gross * 0.03);
    const net = gross - epfEe;
    const count = staff.length;
    return { basic, allow, comm, epfEe, epfEr, etf, statutory: epfEe + epfEr + etf, gross, net, count, month: 'Current Month' };
  }, [selectedRun, staff]);

  const overviewStats = useMemo(() => {
    const paid = runs.filter(r => r.status === 'paid');
    const approved = runs.filter(r => r.status === 'approved');
    const draft = runs.filter(r => r.status === 'draft');

    const paidTotal = paid.reduce((sum, r) => sum + Number(r.total_net || 0), 0);
    const approvedTotal = approved.reduce((sum, r) => sum + Number(r.total_net || 0), 0);
    const draftTotal = draft.reduce((sum, r) => sum + Number(r.total_net || 0), 0);

    const grandTotal = paidTotal + approvedTotal + draftTotal;
    const paidPct = grandTotal > 0 ? Math.round((paidTotal / grandTotal) * 100) : 0;

    const previousRun = paid.length > 0 ? paid[0] : (runs.length > 1 ? runs[1] : null);
    const upcomingRun = draft.length > 0 ? draft[0] : (approved.length > 0 ? approved[0] : (runs.length > 0 ? runs[0] : null));

    return {
      paidTotal,
      approvedTotal,
      draftTotal,
      paidCount: paid.length,
      approvedCount: approved.length,
      draftCount: draft.length,
      paidPct,
      previousRun,
      upcomingRun,
    };
  }, [runs]);

  // Suppress unused var warning
  void payrollTotals;

  // â”€â”€ Page-level loading skeleton (initial load) â”€â”€
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
      {/* â”€â”€ Page Header â”€â”€ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Wallet size={28} className="text-[#2563ea]" /> Payroll &amp; Salary Management
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            {staff.length} staff members Â· {runs.length} salary runs
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> New Payroll Run
        </button>
      </div>

      {/* â”€â”€ Tab Bar â”€â”€ */}
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          OVERVIEW TAB
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* ═════════════════════════════════════════════════════════════════════
          OVERVIEW TAB (Redesigned SaaS Premium Dashboard)
      ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* ── Top 4 KPI Summary Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'TOTAL STAFF',      value: staff.length,                                                                                                          icon: Users,      color: 'text-blue-600'   },
              { label: 'MONTHLY PAYROLL',  value: `LKR ${staff.reduce((s, st) => s + st.basic_salary + st.transport_allow + st.meal_allow, 0).toLocaleString()}`,        icon: DollarSign, color: 'text-green-600'  },
              { label: 'EPF LIABILITY',    value: `LKR ${Math.round(staff.reduce((s, st) => s + (st.basic_salary + st.transport_allow + st.meal_allow) * 0.20, 0)).toLocaleString()}`, icon: Building, color: 'text-amber-600'  },
              { label: 'ETF LIABILITY',    value: `LKR ${Math.round(staff.reduce((s, st) => s + (st.basic_salary + st.transport_allow + st.meal_allow) * 0.03, 0)).toLocaleString()}`, icon: FileText, color: 'text-purple-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={18} className="text-[#2563ea]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-base-muted">{label}</span>
                </div>
                <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── Top Hero Analytics Section (2-Column Layout) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left Card (8 Columns): Monthly Payroll Summary & Distribution Breakdown */}
            <div className="lg:col-span-8 card p-6 relative overflow-hidden flex flex-col justify-between space-y-6">
              
              {/* Card Header */}
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={16} className="text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-base-muted">
                      Monthly Payroll Breakdown
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl lg:text-4xl font-extrabold text-base-primary tracking-tight font-mono">
                      LKR {monthlyPayrollBreakdown.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50">
                      <CalendarCheck size={13} />
                      {monthlyPayrollBreakdown.month}
                    </span>
                  </div>
                  <p className="text-xs text-base-muted mt-1">
                    Total Net Payout for {monthlyPayrollBreakdown.count} staff member(s)
                  </p>
                </div>
              </div>

              {/* 4 Cost Component Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="surface-2 rounded-2xl p-3.5 border border-base">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-base-muted mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-600" /> Basic Pay
                  </div>
                  <div className="text-sm font-extrabold font-mono text-base-primary">
                    LKR {monthlyPayrollBreakdown.basic.toLocaleString()}
                  </div>
                </div>

                <div className="surface-2 rounded-2xl p-3.5 border border-base">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-base-muted mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-600" /> Allowances
                  </div>
                  <div className="text-sm font-extrabold font-mono text-green-600">
                    LKR {monthlyPayrollBreakdown.allow.toLocaleString()}
                  </div>
                </div>

                <div className="surface-2 rounded-2xl p-3.5 border border-base">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-base-muted mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" /> Commissions
                  </div>
                  <div className="text-sm font-extrabold font-mono text-amber-600">
                    LKR {monthlyPayrollBreakdown.comm.toLocaleString()}
                  </div>
                </div>

                <div className="surface-2 rounded-2xl p-3.5 border border-base">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-base-muted mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-purple-600" /> EPF / ETF
                  </div>
                  <div className="text-sm font-extrabold font-mono text-purple-600">
                    LKR {monthlyPayrollBreakdown.statutory.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Visual Multi-Segment Proportional Distribution Bar */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-base-primary font-bold">Cost Distribution Breakdown</span>
                  <span className="text-base-muted font-mono">
                    Gross: LKR {monthlyPayrollBreakdown.gross.toLocaleString()}
                  </span>
                </div>

                {(() => {
                  const gross = monthlyPayrollBreakdown.gross || 1;
                  const basicPct = Math.min(100, Math.round((monthlyPayrollBreakdown.basic / gross) * 100));
                  const allowPct = Math.min(100, Math.round((monthlyPayrollBreakdown.allow / gross) * 100));
                  const commPct = Math.min(100, Math.round((monthlyPayrollBreakdown.comm / gross) * 100));
                  const statPct = Math.max(0, 100 - (basicPct + allowPct + commPct));

                  return (
                    <div>
                      <div className="w-full h-3.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                        <div style={{ width: `${basicPct}%` }} className="bg-blue-600 h-full transition-all" title={`Basic Salary: ${basicPct}%`} />
                        <div style={{ width: `${allowPct}%` }} className="bg-green-500 h-full transition-all" title={`Allowances: ${allowPct}%`} />
                        <div style={{ width: `${commPct}%` }} className="bg-amber-500 h-full transition-all" title={`Commissions: ${commPct}%`} />
                        <div style={{ width: `${statPct}%` }} className="bg-purple-500 h-full transition-all" title={`Statutory: ${statPct}%`} />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-medium text-base-muted pt-2 flex-wrap gap-2">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600" /> Basic ({basicPct}%)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Allowances ({allowPct}%)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Commissions ({commPct}%)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /> Statutory ({statPct}%)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer Stats Bar */}
              <div className="pt-3 border-t border-base flex items-center justify-between text-xs text-base-muted flex-wrap gap-2">
                <span>Avg Pay / Staff: <strong className="text-base-primary font-mono font-bold">LKR {monthlyPayrollBreakdown.count > 0 ? Math.round(monthlyPayrollBreakdown.net / monthlyPayrollBreakdown.count).toLocaleString() : 0}</strong></span>
                <span>Company EPF (12%): <strong className="text-amber-600 font-mono font-bold">LKR {monthlyPayrollBreakdown.epfEr.toLocaleString()}</strong></span>
                <span>Company ETF (3%): <strong className="text-purple-600 font-mono font-bold">LKR {monthlyPayrollBreakdown.etf.toLocaleString()}</strong></span>
              </div>
            </div>

            {/* Right Card (4 Columns): Payroll Summary Arc Gauge Card */}
            <div className="lg:col-span-4 card p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-base text-base-primary">Payroll Summary</h3>
                    <p className="text-xs text-base-muted mt-0.5">Disbursement &amp; Approval Status</p>
                  </div>
                  <button onClick={() => navigate('/reports')} className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors">
                    View report
                  </button>
                </div>

                {/* 3 Metric Columns with Vertical Color Bars */}
                <div className="grid grid-cols-3 gap-2 border-b border-base pb-4 mb-4">
                  <div className="pl-3 border-l-2 border-blue-600">
                    <div className="text-[11px] font-semibold text-base-muted">Paid</div>
                    <div className="text-xs font-bold text-base-primary mt-0.5 font-mono truncate" title={`LKR ${overviewStats.paidTotal.toLocaleString()}`}>
                      LKR {(overviewStats.paidTotal / 1000).toFixed(0)}k
                    </div>
                  </div>
                  <div className="pl-3 border-l-2 border-sky-500">
                    <div className="text-[11px] font-semibold text-base-muted">Approved</div>
                    <div className="text-xs font-bold text-base-primary mt-0.5 font-mono truncate" title={`LKR ${overviewStats.approvedTotal.toLocaleString()}`}>
                      LKR {(overviewStats.approvedTotal / 1000).toFixed(0)}k
                    </div>
                  </div>
                  <div className="pl-3 border-l-2 border-amber-500">
                    <div className="text-[11px] font-semibold text-base-muted">Pending</div>
                    <div className="text-xs font-bold text-base-primary mt-0.5 font-mono truncate" title={`LKR ${overviewStats.draftTotal.toLocaleString()}`}>
                      LKR {(overviewStats.draftTotal / 1000).toFixed(0)}k
                    </div>
                  </div>
                </div>
              </div>

              {/* Donut Arc Gauge */}
              <div className="relative flex items-center justify-center my-2">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={[
                          { name: 'Paid', value: overviewStats.paidTotal || (runs.length === 0 ? 1 : 0), color: '#2563ea' },
                          { name: 'Approved', value: overviewStats.approvedTotal || 0, color: '#0284c7' },
                          { name: 'Pending', value: overviewStats.draftTotal || 0, color: '#f59e0b' },
                        ]}
                        cx="50%"
                        cy="70%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {[
                          { color: '#2563ea' },
                          { color: '#0284c7' },
                          { color: '#f59e0b' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                {/* Gauge Center Badge */}
                <div className="absolute top-[48%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="text-2xl font-black text-base-primary">
                    {overviewStats.paidPct}%
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-base-muted">
                    Disbursed
                  </div>
                </div>
              </div>

              <div className="text-center text-[11px] text-base-muted font-medium mt-1">
                {overviewStats.paidCount} Paid · {overviewStats.approvedCount} Approved · {overviewStats.draftCount} Draft Run(s)
              </div>
            </div>
          </div>

          {/* ── Bottom Section (2-Column Layout) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left Main Card (8 Columns): Selected Run Staff Disbursement Details */}
            <div className="lg:col-span-8 space-y-4">
              
              {runDetailLoading ? (
                <div className="card p-12 text-center">
                  <Loader2 size={32} className="animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-xs text-base-muted font-medium">Loading payroll details...</p>
                </div>
              ) : selectedRun ? (
                <div className="card overflow-hidden">
                  
                  {/* Selected Run Top Header */}
                  <div className="p-6 border-b border-base flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-extrabold text-xl text-base-primary">
                          Payroll — {selectedRun.run_month}
                        </h3>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${STATUS_STYLES[selectedRun.status]}`}>
                          {selectedRun.status}
                        </span>
                      </div>
                      <p className="text-xs text-base-muted mt-1">
                        {selectedRun.lines?.length ?? 0} staff members included in this payroll run
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedRun.status === 'draft' && (
                        <button
                          onClick={() => approveRun.mutate(selectedRun.id)}
                          disabled={approveRun.isPending}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> Approve Run
                        </button>
                      )}
                      {selectedRun.status === 'approved' && (
                        <button
                          onClick={() => markPaid.mutate(selectedRun.id)}
                          disabled={markPaid.isPending}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> Mark as Paid
                        </button>
                      )}
                      <button
                        onClick={exportCSV}
                        className="flex items-center gap-1.5 px-4 py-2 surface-2 text-base-secondary rounded-xl text-xs font-bold transition-all hover:bg-[var(--bg-surface-3)]"
                      >
                        <Download size={14} /> Export CSV
                      </button>
                    </div>
                  </div>

                  {/* 5 Key Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-6 surface-2 border-b border-base">
                    {[
                      ['Total Gross', `LKR ${Number(selectedRun.total_gross || 0).toLocaleString()}`, 'text-base-primary'],
                      ['EPF (EE 8%)', `LKR ${Number(selectedRun.total_epf_ee || 0).toLocaleString()}`, 'text-amber-600'],
                      ['EPF (ER 12%)', `LKR ${Number(selectedRun.total_epf_er || 0).toLocaleString()}`, 'text-amber-600'],
                      ['ETF (3%)', `LKR ${Number(selectedRun.total_etf || 0).toLocaleString()}`, 'text-purple-600'],
                      ['Total Net Pay', `LKR ${Number(selectedRun.total_net || 0).toLocaleString()}`, 'text-green-600'],
                    ].map(([label, val, color]) => (
                      <div key={label} className="surface rounded-2xl p-3.5 border border-base">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-base-muted mb-1">{label}</div>
                        <div className={`text-xs font-bold font-mono truncate ${color}`}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Staff Payslips Table / Transaction History */}
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-sm text-base-primary flex items-center gap-2">
                        <Users size={16} className="text-blue-600" />
                        Transaction &amp; Staff Payslip History
                      </h4>
                      <span className="text-xs font-semibold text-base-muted">
                        {selectedRun.lines?.length ?? 0} Record(s)
                      </span>
                    </div>

                    {(!selectedRun.lines || selectedRun.lines.length === 0) ? (
                      <div className="py-12 text-center text-base-muted">
                        <Users size={32} className="mx-auto mb-2 opacity-30 text-blue-500" />
                        <p className="text-xs font-medium">No staff lines found in this run.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {selectedRun.lines.map(line => {
                          const name = line.staff?.full_name ?? 'Staff Member';
                          const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                          const netAmt = Number(line.net_salary ?? 0);

                          return (
                            <div
                              key={line.id}
                              className="flex items-center justify-between p-3.5 rounded-2xl surface border border-base hover:bg-[var(--bg-surface-2)] transition-all gap-4"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Staff Avatar */}
                                <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
                                  {line.staff?.profile_photo_url ? (
                                    <img src={line.staff.profile_photo_url} alt={name} className="w-full h-full rounded-full object-cover" />
                                  ) : initials}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-sm text-base-primary truncate">
                                    {name}
                                  </div>
                                  <div className="text-xs text-base-muted truncate">
                                    {line.staff?.designation ?? 'Employee'} {line.staff?.department ? `· ${line.staff.department}` : ''}
                                  </div>
                                </div>
                              </div>

                              {/* Amount Breakdown */}
                              <div className="flex items-center gap-6 shrink-0">
                                <div className="text-right hidden sm:block">
                                  <div className="text-xs text-base-muted font-mono">
                                    Basic: LKR {Number(line.basic_salary ?? 0).toLocaleString()}
                                  </div>
                                  <div className="text-[11px] text-green-600 font-medium">
                                    +Allowances: LKR {(Number(line.transport_allow ?? 0) + Number(line.meal_allow ?? 0)).toLocaleString()}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="font-mono font-extrabold text-sm text-base-primary">
                                    LKR {netAmt.toLocaleString()}
                                  </div>
                                  <div className="text-[10px] text-base-muted font-mono">
                                    Gross: LKR {Number(line.gross_salary ?? 0).toLocaleString()}
                                  </div>
                                </div>

                                {/* Download Payslip Button */}
                                <button
                                  onClick={() => downloadPayslip(line)}
                                  className="flex items-center gap-1 px-3 py-1.5 surface-2 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950 text-base-secondary rounded-xl text-xs font-semibold transition-colors"
                                  title="Download Payslip"
                                >
                                  <Download size={13} />
                                  <span className="hidden md:inline">Payslip</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card p-12 text-center">
                  <Wallet size={36} className="mx-auto mb-2 opacity-30 text-blue-500" />
                  <p className="text-xs text-base-muted font-medium">Select a payroll run from the right panel to view details.</p>
                </div>
              )}
            </div>

            {/* Right Side Widgets (4 Columns): Previous/Upcoming Run Cards + Run Switcher */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* Previous Payroll Card */}
              {overviewStats.previousRun && (
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-base-muted flex items-center gap-1.5">
                      <Clock size={13} className="text-blue-500" />
                      Previous Payroll
                    </span>
                    <span className="text-[11px] font-extrabold text-base-muted uppercase">
                      {overviewStats.previousRun.run_month}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <div className="text-2xl font-extrabold text-base-primary font-mono">
                      LKR {Number(overviewStats.previousRun.total_net || 0).toLocaleString()}
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${STATUS_STYLES[overviewStats.previousRun.status]}`}>
                      {overviewStats.previousRun.status}
                    </span>
                  </div>
                </div>
              )}

              {/* Upcoming / Active Payroll Card */}
              {overviewStats.upcomingRun && (
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-base-muted flex items-center gap-1.5">
                      <CalendarCheck size={13} className="text-amber-500" />
                      Upcoming / Active Payroll
                    </span>
                    <span className="text-[11px] font-extrabold text-base-muted uppercase">
                      {overviewStats.upcomingRun.run_month}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <div className="text-2xl font-extrabold text-base-primary font-mono">
                      LKR {Number(overviewStats.upcomingRun.total_net || 0).toLocaleString()}
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${STATUS_STYLES[overviewStats.upcomingRun.status]}`}>
                      {overviewStats.upcomingRun.status}
                    </span>
                  </div>
                </div>
              )}

              {/* Interactive Salary Runs Selector List */}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-base space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-base-primary">All Salary Runs ({filteredRuns.length})</h4>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                    >
                      <Plus size={13} /> New Run
                    </button>
                  </div>

                  {/* Year & Month Dropdown Selectors */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-base-muted block mb-1">
                        Year
                      </label>
                      <select
                        value={runYearFilter}
                        onChange={e => setRunYearFilter(e.target.value)}
                        className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-base surface outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="All">All Years</option>
                        {availableYears.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-base-muted block mb-1">
                        Month
                      </label>
                      <select
                        value={runMonthFilter}
                        onChange={e => setRunMonthFilter(e.target.value)}
                        className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-base surface outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {MONTH_OPTIONS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {runsLoading ? (
                  <div className="p-8 text-center"><Loader2 size={18} className="animate-spin text-blue-600 mx-auto" /></div>
                ) : filteredRuns.length === 0 ? (
                  <div className="p-8 text-center text-xs text-base-muted">
                    No salary runs found for selected filters ({runYearFilter} / {runMonthFilter === 'All' ? 'All Months' : runMonthFilter}).
                  </div>
                ) : (
                  <div className="divide-y divide-base max-h-96 overflow-y-auto">
                    {filteredRuns.map(run => {
                      const isSelected = selectedRunId === run.id;
                      return (
                        <button
                          key={run.id}
                          onClick={() => setSelectedRunId(run.id)}
                          className={`w-full p-3.5 text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-blue-50/70 border-l-4 border-blue-600 dark:bg-blue-950/30'
                              : 'hover:bg-[var(--bg-surface-2)]'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-sm text-base-primary">
                              {run.run_month}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_STYLES[run.status]}`}>
                                {run.status}
                              </span>
                              <span className="text-xs text-base-muted font-mono">
                                LKR {Number(run.total_net || 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <ChevronRight size={16} className={isSelected ? 'text-blue-600' : 'text-base-muted'} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          PAY SLIPS TAB
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'slips' && (
        <div className="space-y-5">
          {/* Run Selector Bar with Year & Month Dropdowns */}
          <div className="card p-4 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-base-muted shrink-0 flex items-center gap-1.5">
                <CalendarCheck size={16} className="text-blue-600" /> Select Run:
              </span>

              {/* Year Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-base-muted">Year:</span>
                <select
                  value={runYearFilter}
                  onChange={e => setRunYearFilter(e.target.value)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-base surface outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Years</option>
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Month Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-base-muted">Month:</span>
                <select
                  value={runMonthFilter}
                  onChange={e => setRunMonthFilter(e.target.value)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-base surface outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MONTH_OPTIONS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Run Selector Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-base-muted">Payroll Run:</span>
                {runsLoading ? (
                  <Loader2 size={16} className="animate-spin text-blue-600" />
                ) : filteredRuns.length === 0 ? (
                  <span className="text-xs text-base-muted italic">No matching runs</span>
                ) : (
                  <select
                    value={selectedRunId || ''}
                    onChange={e => setSelectedRunId(e.target.value)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {filteredRuns.map(run => (
                      <option key={run.id} value={run.id}>
                        {run.run_month} — LKR {Number(run.total_net || 0).toLocaleString()} ({run.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {selectedRun && (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${STATUS_STYLES[selectedRun.status]}`}>
                  {selectedRun.status}
                </span>

                {selectedRun.status === 'draft' && (
                  <button
                    onClick={() => approveRun.mutate(selectedRun.id)}
                    disabled={approveRun.isPending}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 size={14} /> Approve Run
                  </button>
                )}
                {selectedRun.status === 'approved' && (
                  <button
                    onClick={() => markPaid.mutate(selectedRun.id)}
                    disabled={markPaid.isPending}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 size={14} /> Mark Paid
                  </button>
                )}
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 surface-2 text-base-secondary rounded-xl text-xs font-bold transition-all hover:bg-[var(--bg-surface-3)]"
                >
                  <Download size={14} /> Export CSV
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
                        ? 'bg-blue-600 text-white shadow-sm'
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
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          STAFF REGISTER TAB
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'staff' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-base flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-base-secondary">Payroll Staff Register</h3>
              <p className="text-xs text-base-muted mt-1">Active staff members used for payroll run computation.</p>
            </div>
            <button
              onClick={() => openStaffModal()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
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
                            className="text-blue-600 text-xs font-semibold hover:text-blue-800"
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

      {/* ─────────────────────────────────────────
          COST SUMMARY TAB
      ───────────────────────────────────────── */}
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
                        <td className="px-4 py-3 font-mono text-sky-600">LKR {Number(run.total_epf_er ?? 0).toLocaleString()}</td>
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
                    <td className="px-4 py-3 font-bold font-mono text-blue-600">LKR {runs.reduce((s, r) => s + Number(r.total_epf_er ?? 0), 0).toLocaleString()}</td>
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

      {/* ─────────────────────────────────────────
          CREATE RUN MODAL
      ───────────────────────────────────────── */}
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
                    className="w-full border border-base rounded-lg px-4 py-3 text-sm text-base-secondary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface-2"
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
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
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

      {/* ─────────────────────────────────────────
          STAFF MODAL (Add / Edit)
      ───────────────────────────────────────── */}
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
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    <input value={staffForm.full_name} onChange={e => setStaffForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Full name" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>NIC Number</label>
                    <input value={staffForm.nic_number} onChange={e => setStaffForm(p => ({ ...p, nic_number: e.target.value }))} placeholder="National ID" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Phone Number</label>
                    <input value={staffForm.phone_number} onChange={e => setStaffForm(p => ({ ...p, phone_number: e.target.value }))} placeholder="+94 71 234 5678" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Email Address</label>
                    <input type="email" value={staffForm.email} onChange={e => setStaffForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Date of Birth</label>
                    <input type="date" value={staffForm.date_of_birth} onChange={e => setStaffForm(p => ({ ...p, date_of_birth: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Home Address</label>
                    <input value={staffForm.address} onChange={e => setStaffForm(p => ({ ...p, address: e.target.value }))} placeholder="Full residential address" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Employment */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Employment Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Designation *</label>
                    <input value={staffForm.designation} onChange={e => setStaffForm(p => ({ ...p, designation: e.target.value }))} placeholder="Job title" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Department</label>
                    <input value={staffForm.department} onChange={e => setStaffForm(p => ({ ...p, department: e.target.value }))} placeholder="Department" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Joined Date</label>
                    <input type="date" value={staffForm.joined_date} onChange={e => setStaffForm(p => ({ ...p, joined_date: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>EPF No.</label>
                    <input value={staffForm.epf_no} onChange={e => setStaffForm(p => ({ ...p, epf_no: e.target.value }))} placeholder="EPF number" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>ETF No.</label>
                    <input value={staffForm.etf_no} onChange={e => setStaffForm(p => ({ ...p, etf_no: e.target.value }))} placeholder="ETF number" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Salary */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Salary &amp; Allowances</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Basic Salary (LKR)</label>
                    <input type="number" min="0" value={staffForm.basic_salary} onChange={e => setStaffForm(p => ({ ...p, basic_salary: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Transport Allowance (LKR)</label>
                    <input type="number" min="0" value={staffForm.transport_allow} onChange={e => setStaffForm(p => ({ ...p, transport_allow: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Meal Allowance (LKR)</label>
                    <input type="number" min="0" value={staffForm.meal_allow} onChange={e => setStaffForm(p => ({ ...p, meal_allow: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Attendance Allow. (LKR)</label>
                    <input type="number" min="0" value={staffForm.attendance_allowance} onChange={e => setStaffForm(p => ({ ...p, attendance_allowance: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Performance Allow. (LKR)</label>
                    <input type="number" min="0" value={staffForm.performance_allowance} onChange={e => setStaffForm(p => ({ ...p, performance_allowance: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Allowance 01 (LKR)</label>
                    <input type="number" min="0" value={staffForm.allowance_01} onChange={e => setStaffForm(p => ({ ...p, allowance_01: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Allowance 02 (LKR)</label>
                    <input type="number" min="0" value={staffForm.allowance_02} onChange={e => setStaffForm(p => ({ ...p, allowance_02: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Commission Rate (%)</label>
                    <input type="number" min="0" max="100" value={staffForm.commission_rate} onChange={e => setStaffForm(p => ({ ...p, commission_rate: e.target.value }))} className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Bank Details */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Bank Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Bank Name</label>
                    <input value={staffForm.bank_name} onChange={e => setStaffForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. Bank of Ceylon" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Account Number</label>
                    <input value={staffForm.bank_account_no} onChange={e => setStaffForm(p => ({ ...p, bank_account_no: e.target.value }))} placeholder="Account number" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Branch</label>
                    <input value={staffForm.bank_branch} onChange={e => setStaffForm(p => ({ ...p, bank_branch: e.target.value }))} placeholder="Branch name" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Section: Emergency Contact */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Emergency Contact</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Contact Name</label>
                    <input value={staffForm.emergency_contact_name} onChange={e => setStaffForm(p => ({ ...p, emergency_contact_name: e.target.value }))} placeholder="Emergency contact name" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Contact Phone</label>
                    <input value={staffForm.emergency_contact_phone} onChange={e => setStaffForm(p => ({ ...p, emergency_contact_phone: e.target.value }))} placeholder="+94 71 234 5678" className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }} />
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
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {(createStaff.isPending || updateStaff.isPending) ? <><Loader2 size={14} className="inline animate-spin mr-1" />Savingâ€¦</> : selectedStaff ? 'Update Staff' : 'Create Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
