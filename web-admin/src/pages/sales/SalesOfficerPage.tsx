import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { uploadDocumentViaApi, DocumentType } from '@/services/supabaseStorage';
import {
  TrendingUp, Target, Award, Gift, Plus, XCircle,
  Loader2, Download, CheckCircle2, Clock, User, Eye,
  Percent, FileText, ChevronRight, AlertCircle, Sparkles,
  Camera, Check, Search, Smartphone
} from 'lucide-react';
import SpecialApprovalRequestModal from '@/components/SpecialApprovalRequestModal';

function CameraModal({ onClose, onCapture, label }: { onClose: () => void; onCapture: (f: File) => void; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then(s => {
        setStream(s);
        activeStream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(err => {
        console.error('Webcam access error:', err);
        setError('Could not access camera. Please check permissions.');
      });

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `${label.toLowerCase().replace(' ', '_')}_capture.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[60] p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-white text-sm">Take {label} Photo</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><XCircle size={20} /></button>
        </div>
        <div className="p-5 flex-1 flex flex-col items-center justify-center min-h-[300px]">
          {error ? (
            <p className="text-red-500 text-sm font-semibold text-center">{error}</p>
          ) : !stream ? (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="animate-spin text-amber-500" size={24} />
              <p className="text-xs">Initializing camera feed…</p>
            </div>
          ) : (
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            </div>
          )}
        </div>
        <div className="px-5 pb-5 pt-2 flex justify-between gap-3 border-t border-slate-800/50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-805 bg-slate-800 hover:bg-slate-850 text-slate-300 rounded-xl text-xs font-semibold">Cancel</button>
          <button
            onClick={capturePhoto}
            disabled={!stream}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition"
          >
            <Camera size={14} /> Capture Photo
          </button>
        </div>
      </div>
    </div>
  );
}

interface OfficerPerf {
  officer_id: string;
  officer_phone: string;
  officer_name: string;
  phones_sold: number;
  commission_pending: number;
  commission_payable: number;
  commission_paid: number;
  customers: Array<{ name: string; commission: number; status: string }>;
}

interface FreePhoneReq {
  id: string;
  officer_name: string;
  officer_service: string;
  officer_rank: string;
  phone_model: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'dispatched';
  camp: { name: string; branch: string } | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  dispatched: 'bg-blue-100 text-blue-700',
};

const TABS = ['Overview', 'My Applications', 'Special Approvals', 'Commission', 'Targets', 'Leads', 'My Stock', 'Free Phone Reward'] as const;
type Tab = typeof TABS[number];

export default function SalesOfficerPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const now = new Date();
  const [tab, setTab] = useState<Tab>('Overview');
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [showFreePhoneModal, setShowFreePhoneModal] = useState(false);
  const [showAppModal, setShowAppModal] = useState(false);
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [sarStatusFilter, setSarStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isStatusWidgetMinimized, setIsStatusWidgetMinimized] = useState(false);

  // Special Approval Tab states
  const [saSearchNic, setSaSearchNic] = useState('');
  const [saChecked, setSaChecked] = useState(false);
  const [saCustomer, setSaCustomer] = useState<any>(null);
  const [saLoading, setSaLoading] = useState(false);
  const [saEligibility, setSaEligibility] = useState<{
    eligible: boolean;
    active_count: number;
    reason?: string;
    requires_special_approval?: boolean;
    rule_applied: string;
  } | null>(null);
  const [saForm, setSaForm] = useState({
    phone_model_id: '',
    term_months: 12,
    reason: '',
  });

  // Blocked/eligibility helper state (used by SpecialApprovalRequestModal)
  const [blockedCustInfo, setBlockedCustInfo] = useState<{ id: string; name: string } | null>(null);
  const [selectedPhoneModelId, setSelectedPhoneModelId] = useState('');
  const [selectedTermMonths, setSelectedTermMonths] = useState(12);

  // Camera capture states
  const [cameraActiveFor, setCameraActiveFor] = useState<'nic_front' | 'nic_back' | 'selfie' | null>(null);

  // Document upload state
  const [selectedFiles, setSelectedFiles] = useState<{
    nic_front?: File;
    nic_back?: File;
    military_id?: File;
    selfie?: File;
    paysheet_1?: File;
    paysheet_2?: File;
    paysheet_3?: File;
  }>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // New Application wizard states
  const [nicSearch, setNicSearch] = useState('');
  const [nicChecked, setNicChecked] = useState(false);
  const [existingCustomer, setExistingCustomer] = useState<any>(null);
  const [eligibility, setEligibility] = useState<{
    eligible: boolean;
    active_count: number;
    reason?: string;
    requires_special_approval?: boolean;
    rule_applied: string;
  } | null>(null);
  const [newCustForm, setNewCustForm] = useState({
    full_name: '',
    full_name_si: '',
    nic_number: '',
    date_of_birth: '',
    gender: 'male' as 'male' | 'female' | 'other',
    branch: 'army' as 'army' | 'navy' | 'air_force',
    service_number: '',
    rank: '',
    camp_id: '',
    phone_number: '',
    email: '',
    address: '',
    retirement_date: ''
  });

  const [newAppForm, setNewAppForm] = useState({
    phone_model_id: '',
    down_payment: 0,
    term_months: 12,
    first_deduction_month: '',
    notes: ''
  });

  const [nicLoading, setNicLoading] = useState(false);

  const [fpForm, setFpForm] = useState({
    officer_name: '',
    officer_service: '',
    officer_rank: '',
    phone_model: '',
    reason: '',
  });

  // Query datasets
  const { data: perfRes, isLoading: perfLoading } = useQuery({
    queryKey: ['sales-performance', month],
    queryFn: () => api.get('/sales/performance', { params: { month } }).then(r => r.data),
  });

  const { data: freePhoneRes, isLoading: fpLoading } = useQuery({
    queryKey: ['free-phone-requests'],
    queryFn: () => api.get('/sales/free-phone-requests').then(r => r.data),
  });

  const { data: appsRes, isLoading: appsLoading } = useQuery({
    queryKey: ['officer-applications'],
    queryFn: () => api.get('/applications', { params: { sales_officer_id: user?.id } }).then(r => r.data),
  });

  const { data: phoneModelsRes } = useQuery({
    queryKey: ['phone-models'],
    queryFn: () => api.get('/inventory/models').then(r => r.data.data ?? []),
  });

  const { data: campsList } = useQuery({
    queryKey: ['camps-list'],
    queryFn: () => api.get('/camps').then(r => r.data.data),
  });

  const { data: myPendingApprovals = [], isLoading: myApprovalsLoading } = useQuery({
    queryKey: ['my-pending-special-approvals', user?.id],
    queryFn: async () => {
      try {
        // Backend already scopes results to the current sales officer's own requests
        const response = await api.get('/applications/special-approval-requests');
        return response.data?.data || [];
      } catch (error) {
        console.error('Failed to fetch my approvals:', error);
        return [];
      }
    },
    refetchInterval: 5000,
  });

  const filteredApprovals = (myPendingApprovals as any[]).filter((request: any) =>
    sarStatusFilter === 'all' ? true : request.status === sarStatusFilter
  );
  const pendingCount = (myPendingApprovals as any[]).filter((r: any) => r.status === 'pending').length;
  const requestStatusStyles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };

  const officers: OfficerPerf[] = perfRes?.data ?? [];
  const freeRequests: FreePhoneReq[] = freePhoneRes?.data ?? [];
  const applications = appsRes?.data ?? [];
  const phoneModels = phoneModelsRes ?? [];

  const totalSold = officers.reduce((s, o) => s + o.phones_sold, 0);
  const totalPending = officers.reduce((s, o) => s + o.commission_pending, 0);
  const totalPayable = officers.reduce((s, o) => s + o.commission_payable, 0);
  const totalPaid = officers.reduce((s, o) => s + o.commission_paid, 0);

  // Mutations
  const submitFreePhone = useMutation({
    mutationFn: (payload: object) => api.post('/sales/free-phone-requests', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['free-phone-requests'] });
      setShowFreePhoneModal(false);
      setFpForm({ officer_name: '', officer_service: '', officer_rank: '', phone_model: '', reason: '' });
    },
  });

  const reviewFreePhone = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/sales/free-phone-requests/${id}/review`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['free-phone-requests'] }),
  });

  const createCustomerMutation = useMutation({
    mutationFn: (cust: typeof newCustForm) => {
      const payload = Object.fromEntries(
        Object.entries(cust).map(([k, v]) => [k, v === '' ? undefined : v])
      );
      return api.post('/customers', payload).then(r => r.data.data);
    }
  });

  const createAppMutation = useMutation({
    mutationFn: (appPayload: any) => api.post('/applications', appPayload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['officer-applications'] });
      qc.invalidateQueries({ queryKey: ['applications'] });
      setShowAppModal(false);
      resetNewAppForm();
    },
    onError: async (err: any) => {
      if (err?.response?.status === 422) {
        // Trigger special approval flow
        const custRes = await api.get('/customers', { params: { q: nicSearch } });
        const customer = custRes.data.data?.[0];
        if (customer) {
          setBlockedCustInfo({ id: customer.id, name: customer.full_name });
          setSelectedPhoneModelId(newAppForm.phone_model_id);
          setSelectedTermMonths(newAppForm.term_months);
          setShowAppModal(false);
          setShowSpecialModal(true);
        }
      } else {
        alert(err.response?.data?.message || err.message || 'Failed to submit application');
      }
    }
  });

  const handleNICCheck = async () => {
    if (!nicSearch.trim()) return;
    setNicLoading(true);
    try {
      const res = await api.get('/customers', { params: { nic: nicSearch.trim() } });
      const list = res.data.data || [];
      if (list.length > 0) {
        const cust = list[0];
        setExistingCustomer(cust);
        setNewCustForm(prev => ({
          ...prev,
          full_name: cust.full_name || '',
          full_name_si: cust.full_name_si || '',
          nic_number: cust.nic_number || nicSearch.trim(),
          rank: cust.rank || '',
          branch: cust.branch || 'army',
          service_number: cust.service_number || '',
          camp_id: cust.camp_id || '',
          phone_number: cust.phone_number || '',
          retirement_date: cust.retirement_date || '',
        }));

        try {
          const elRes = await api.get(`/customers/${cust.id}/phone-eligibility`);
          setEligibility(elRes.data);
        } catch {
          setEligibility({
            eligible: true,
            active_count: 0,
            rule_applied: 'UNKNOWN_FALLBACK'
          });
        }
      } else {
        setExistingCustomer(null);
        setNewCustForm(prev => ({
          ...prev,
          nic_number: nicSearch.trim()
        }));
        setEligibility({
          eligible: true,
          active_count: 0,
          rule_applied: 'NEW_CUSTOMER'
        });
      }
      setNicChecked(true);
    } catch {
      setExistingCustomer(null);
      setNicChecked(true);
    } finally {
      setNicLoading(false);
    }
  };

  const handleSaCustomerCheck = async () => {
    if (!saSearchNic.trim()) return;
    setSaLoading(true);
    setSaChecked(false);
    setSaCustomer(null);
    setSaEligibility(null);
    try {
      const res = await api.get('/customers', { params: { nic: saSearchNic.trim() } });
      const list = res.data.data || [];
      if (list.length > 0) {
        const cust = list[0];
        setSaCustomer(cust);
        try {
          const elRes = await api.get(`/customers/${cust.id}/phone-eligibility`);
          setSaEligibility(elRes.data);
        } catch {
          setSaEligibility({
            eligible: false,
            active_count: 0,
            rule_applied: 'ERROR_CHECKING_ELIGIBILITY'
          });
        }
      } else {
        setSaCustomer(null);
      }
      setSaChecked(true);
    } catch (err) {
      console.error(err);
      alert('Error searching customer');
    } finally {
      setSaLoading(false);
    }
  };

  const createSpecialApprovalMutation = useMutation({
    mutationFn: (payload: { customer_id: string; phone_model_id: string; term_months: number; reason: string }) =>
      api.post('/applications/request-special-approval', payload),
    onSuccess: () => {
      alert('Special approval request submitted successfully!');
      setSaSearchNic('');
      setSaChecked(false);
      setSaCustomer(null);
      setSaEligibility(null);
      setSaForm({ phone_model_id: '', term_months: 12, reason: '' });
      qc.invalidateQueries({ queryKey: ['my-pending-special-approvals'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.response?.data?.error || 'Failed to submit request');
    }
  });

  const handleSaSubmit = () => {
    if (!saCustomer) return;
    if (saEligibility?.active_count !== 2) {
      alert('Only customers with exactly 2 active plans are eligible for special approval.');
      return;
    }
    if (!saForm.phone_model_id) {
      alert('Please select a device.');
      return;
    }
    if (saForm.reason.trim().length < 10) {
      alert('Please provide a justification (min 10 characters).');
      return;
    }
    createSpecialApprovalMutation.mutate({
      customer_id: saCustomer.id,
      phone_model_id: saForm.phone_model_id,
      term_months: saForm.term_months,
      reason: saForm.reason,
    });
  };

  const handleCreateApplicationSubmit = async () => {
    let customerId = existingCustomer?.id;

    if (!customerId) {
      if (!newCustForm.full_name || !newCustForm.nic_number || !newCustForm.rank || !newCustForm.branch) {
        alert('Please fill out all required customer fields');
        return;
      }
      try {
        const newCust = await createCustomerMutation.mutateAsync(newCustForm);
        customerId = newCust.id;
      } catch (err: any) {
        alert(err.response?.data?.message || 'Failed to register customer');
        return;
      }
    }

    const idToken = localStorage.getItem('av_token');

    // Upload documents
    const filesToUpload = Object.entries(selectedFiles).filter(([_, f]) => !!f) as [any, File][];
    if (filesToUpload.length > 0) {
      setIsUploading(true);
      setUploadError(null);
      try {
        for (const [docType, file] of filesToUpload) {
          setUploadProgress(prev => ({ ...prev, [docType]: 0 }));
          const res = await uploadDocumentViaApi(
            customerId,
            docType as DocumentType,
            file,
            (p) => {
              setUploadProgress(prev => ({ ...prev, [docType]: p.percent }));
            },
            idToken || undefined
          );
          
          if (res && (res as any).auto_verification?.status === 'rejected') {
            throw new Error((res as any).auto_verification.reason || 'AI Verification failed for ' + docType);
          }
        }
      } catch (err: any) {
        setUploadError(err.message || 'File upload failed');
        setIsUploading(false);
        alert(err.message || 'Failed to upload documents. Please try again.');
        return;
      }
      setIsUploading(false);
    }

    if (!newAppForm.phone_model_id) {
      alert('Please select a device');
      return;
    }

    const selectedDevice = phoneModels?.find((d: any) => d.id === newAppForm.phone_model_id);
    if (!selectedDevice) {
      alert('Selected device not found');
      return;
    }

    const appPayload = {
      customer_id: customerId,
      phone_model_id: newAppForm.phone_model_id,
      sale_price: selectedDevice.sale_price,
      down_payment: Number(newAppForm.down_payment || 0),
      term_months: Number(newAppForm.term_months || 12),
      notes: newAppForm.notes || undefined
    };

    createAppMutation.mutate(appPayload);
  };

  const resetNewAppForm = () => {
    setNicSearch('');
    setNicChecked(false);
    setNicLoading(false);
    setExistingCustomer(null);
    setNewCustForm({
      full_name: '',
      full_name_si: '',
      nic_number: '',
      date_of_birth: '',
      gender: 'male',
      branch: 'army',
      service_number: '',
      rank: '',
      camp_id: '',
      phone_number: '',
      email: '',
      address: '',
      retirement_date: ''
    });
    setNewAppForm({
      phone_model_id: '',
      down_payment: 0,
      term_months: 12,
      first_deduction_month: '',
      notes: ''
    });
    setSelectedFiles({});
    setUploadProgress({});
    setUploadError(null);
    setIsUploading(false);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-base-primary flex items-center gap-2">
            <TrendingUp size={28} className="text-[#2563ea]" /> Sales Officer View
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            {totalSold} phones sold · LKR {totalPayable.toLocaleString()} commission payable
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="month"
            className="border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
          <button
            onClick={() => setShowAppModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            <Plus size={16} /> New Application
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Phones Sold', value: totalSold, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Commission Pending', value: `LKR ${totalPending.toLocaleString()}`, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Commission Payable', value: `LKR ${totalPayable.toLocaleString()}`, icon: Target, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Commission Paid', value: `LKR ${totalPaid.toLocaleString()}`, icon: Award, color: 'text-purple-600', bg: 'bg-purple-50' },
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

      {/* Navigation Tabs */}
      <div className="border-b border-base">
        <nav className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-base-muted hover:text-[var(--text-secondary)]'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab contents */}
      {tab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Officer Target Tracker */}
          <div className="lg:col-span-2 card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <h3 className="font-bold text-sm text-base-secondary flex items-center gap-1.5">
                <Target size={16} className="text-amber-500" /> Sales Commission Targets
              </h3>
            </div>
            {perfLoading ? (
              <div className="py-8 text-center text-base-muted"><Loader2 className="animate-spin inline" /></div>
            ) : (
              <div className="space-y-4">
                {officers.map(o => (
                  <div key={o.officer_id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-base-secondary">{o.officer_phone}</span>
                      <span className="text-amber-600">{o.phones_sold} / 5 Sold</span>
                    </div>
                    <div className="w-full surface-2 rounded-full h-2 overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min(100, (o.phones_sold / 5) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Info card */}
          <div className="card p-5 space-y-3.5">
            <h3 className="font-bold text-sm text-base-secondary flex items-center gap-1.5">
              <Percent size={16} className="text-green-500" /> Commission Rules
            </h3>
            <div className="text-xs text-gray-600 space-y-2 leading-relaxed">
              <p>📍 Standard Commission: <strong>LKR 250</strong> per successful phone registration.</p>
              <p>📍 Commission releases automatically only after the <strong>first monthly deduction</strong> is processed successfully.</p>
              <p>📍 Refrain from submitting applications for customers with low credit ratings or retiring soon.</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'My Applications' && (
        <div className="card overflow-hidden">
          {appsLoading ? (
            <div className="py-12 text-center text-base-muted"><Loader2 className="animate-spin inline mr-2" /> Loading applications...</div>
          ) : applications.length === 0 ? (
            <div className="py-12 text-center text-base-muted">No applications found. Click "New Application" to create one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="surface-2 border-b border-base">
                  {['App Ref', 'Customer', 'Phone Model', 'Financed Amount', 'Status', 'Risk Score', 'Created At'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {applications.map((app: any) => (
                  <tr key={app.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-semibold text-base-primary">{app.ref_number || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{app.customer_name || '—'}</div>
                      <div className="text-xs text-base-muted">{app.customer_branch || '—'}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-base-secondary">{app.phone_model_name || '—'}</td>
                    <td className="px-4 py-3 font-mono">LKR {Number(app.financed_amount || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[app.status] || 'surface-2 text-base-secondary'}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${app.customer_risk_score > 70 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {app.customer_risk_score ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-base-muted">{new Date(app.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Special Approvals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Request Form */}
          <div className="card p-6 space-y-5 lg:col-span-1 text-left">
            <div>
              <h3 className="font-bold text-base text-base-primary flex items-center gap-1.5">
                <Plus size={18} className="text-amber-500" /> New Special Approval Request
              </h3>
              <p className="text-xs text-base-muted mt-1">
                Special approval is only available for customers who currently have exactly 2 active plans.
              </p>
            </div>

            <div className="space-y-4">
              {/* Customer NIC Search */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Customer NIC</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 901234567V"
                    value={saSearchNic}
                    onChange={e => {
                      setSaSearchNic(e.target.value);
                      if (saChecked) {
                        setSaChecked(false);
                        setSaCustomer(null);
                        setSaEligibility(null);
                      }
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleSaCustomerCheck()}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono text-slate-800"
                  />
                  <button
                    onClick={handleSaCustomerCheck}
                    disabled={!saSearchNic.trim() || saLoading}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-sm transition-all disabled:opacity-40"
                  >
                    {saLoading ? <Loader2 size={15} className="animate-spin" /> : 'Check'}
                  </button>
                </div>
              </div>

              {/* Eligibility Check Results */}
              {saChecked && (
                <div className="space-y-3">
                  {!saCustomer ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-semibold">
                      ✕ Customer not found. Please register the customer first.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                        <div className="font-bold text-slate-900">{saCustomer.full_name}</div>
                        <div>Service Number: {saCustomer.service_number || '—'}</div>
                        <div>Rank: {saCustomer.rank}</div>
                      </div>

                      <div className={`p-3 border rounded-xl text-xs ${
                        saEligibility?.active_count === 2
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <div className="font-bold">
                          {saEligibility?.active_count === 2
                            ? '✓ Customer is Eligible'
                            : '✕ Customer is Ineligible'}
                        </div>
                        <div className="mt-1">
                          Current Active Plans: <span className="font-bold">{saEligibility?.active_count ?? 0}</span>
                        </div>
                        {saEligibility?.active_count !== 2 && (
                          <div className="mt-1 font-semibold text-red-750">
                            Special approval requests are only allowed for customers who currently have exactly 2 active plans.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Form Fields - Disabled if customer ineligible */}
              <div className="space-y-4 pt-2 border-t border-base text-slate-850">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Select Device</label>
                  <select
                    disabled={!saCustomer || saEligibility?.active_count !== 2}
                    value={saForm.phone_model_id}
                    onChange={e => setSaForm(prev => ({ ...prev, phone_model_id: e.target.value }))}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 surface disabled:bg-[var(--bg-surface-2)] disabled:text-[var(--text-muted)]"
                  >
                    <option value="">Choose Device</option>
                    {(phoneModels || []).filter((d: any) => d.in_stock > 0 || d.sale_price).map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.brand} {d.model} — LKR {d.sale_price?.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Installment Term</label>
                  <select
                    disabled={!saCustomer || saEligibility?.active_count !== 2}
                    value={saForm.term_months}
                    onChange={e => setSaForm(prev => ({ ...prev, term_months: Number(e.target.value) }))}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 surface disabled:bg-[var(--bg-surface-2)] disabled:text-[var(--text-muted)]"
                  >
                    {[6, 9, 12, 18, 24].map(n => (
                      <option key={n} value={n}>{n} months</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Justification / Reason</label>
                  <textarea
                    disabled={!saCustomer || saEligibility?.active_count !== 2}
                    rows={4}
                    placeholder="Provide a detailed justification (min 10 characters)..."
                    value={saForm.reason}
                    onChange={e => setSaForm(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none disabled:bg-[var(--bg-surface-2)] disabled:text-[var(--text-muted)]"
                  />
                </div>

                <button
                  onClick={handleSaSubmit}
                  disabled={
                    createSpecialApprovalMutation.isPending ||
                    !saCustomer ||
                    saEligibility?.active_count !== 2 ||
                    !saForm.phone_model_id ||
                    saForm.reason.trim().length < 10
                  }
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-[var(--bg-surface-3)] text-white font-bold rounded-lg text-sm transition-all disabled:text-[var(--text-muted)] disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {createSpecialApprovalMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                  Submit Request
                </button>
              </div>
            </div>
          </div>

          {/* List of submitted requests */}
          <div className="lg:col-span-2 space-y-4 text-left">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-base flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-base-secondary">My Special Approval Requests</h3>
                  {pendingCount > 0 && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {pendingCount} pending
                    </span>
                  )}
                </div>
                {/* Status filter tabs */}
                <div className="flex gap-1">
                  {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setSarStatusFilter(s)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg capitalize transition-all ${
                        sarStatusFilter === s
                          ? s === 'pending' ? 'bg-amber-500 text-white'
                            : s === 'approved' ? 'bg-green-500 text-white'
                            : s === 'rejected' ? 'bg-red-500 text-white'
                            : 'bg-slate-800 text-white'
                          : 'surface-2 text-base-muted hover:bg-[var(--bg-surface-3)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {myApprovalsLoading ? (
                <div className="py-12 text-center text-base-muted">
                  <Loader2 className="animate-spin inline mr-2" /> Loading special approvals...
                </div>
              ) : myPendingApprovals.length === 0 ? (
                <div className="py-16 text-center text-base-muted text-sm">
                  <AlertCircle size={28} className="mx-auto mb-2 opacity-30" />
                  No special approval requests submitted yet.
                </div>
              ) : filteredApprovals.length === 0 ? (
                <div className="py-16 text-center text-base-muted text-sm">
                  No <span className="font-semibold">{sarStatusFilter}</span> requests found.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredApprovals.map((req: any) => (
                    <div key={req.id} className="p-5 space-y-3 hover:bg-gray-50/50 transition">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${requestStatusStyles[req.status] || 'surface-2 text-base-secondary'}`}>
                              {req.status}
                            </span>
                            <span className="text-[11px] text-base-muted">{new Date(req.created_at).toLocaleString()}</span>
                          </div>
                          <div className="font-bold text-sm text-base-primary">
                            {req.customer?.full_name || 'Customer'}{' '}
                            <span className="font-normal text-xs text-base-muted">— {req.customer?.rank || '—'}</span>
                          </div>
                          <div className="text-xs text-base-muted mt-0.5 space-x-3">
                            <span>Svc #: {req.customer?.service_number || '—'}</span>
                            <span>NIC: {req.customer?.nic_number || '—'}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-bold text-slate-800">
                            {req.phone_model?.brand} {req.phone_model?.model}
                          </div>
                          <div className="text-xs text-base-muted mt-0.5">{req.term_months} months term</div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-slate-700">
                        <span className="font-semibold block text-slate-500 mb-0.5">Reason:</span>
                        {req.reason}
                      </div>

                      {req.review_note && (
                        <div className={`border rounded-lg p-2.5 text-xs ${req.status === 'approved' ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                          <span className="font-bold block mb-0.5">{req.status === 'approved' ? 'Approval Note:' : 'Rejection Reason:'}</span>
                          {req.review_note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'Commission' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-base flex items-center justify-between">
            <h3 className="font-semibold text-sm text-base-secondary flex items-center gap-2">
              <Award size={15} className="text-amber-500" /> Leaderboard & Performance — {month}
            </h3>
          </div>
          {perfLoading ? (
            <div className="py-8 text-center text-base-muted"><Loader2 className="animate-spin inline" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="surface-2 border-b border-base">
                  {['#', 'Officer', 'Phones Sold', 'Pending', 'Payable', 'Paid', 'Total'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {officers.slice().sort((a, b) => (b.commission_pending + b.commission_payable + b.commission_paid) - (a.commission_pending + a.commission_payable + a.commission_paid)).map((o, rank) => (
                  <tr key={o.officer_id} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-black w-5 h-5 rounded-full flex items-center justify-center ${rank === 0 ? 'bg-amber-100 text-amber-700' : rank === 1 ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600'}`}>
                        {rank + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-base-primary text-sm">{o.officer_name || o.officer_phone}</div>
                      <div className="text-[11px] text-base-muted">{o.officer_phone}</div>
                    </td>
                    <td className="px-4 py-3 font-bold">{o.phones_sold}</td>
                    <td className="px-4 py-3 text-amber-600 font-mono">LKR {o.commission_pending.toLocaleString()}</td>
                    <td className="px-4 py-3 text-blue-600 font-mono font-semibold">LKR {o.commission_payable.toLocaleString()}</td>
                    <td className="px-4 py-3 text-green-600 font-mono">LKR {o.commission_paid.toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold font-mono text-base-primary">LKR {(o.commission_pending + o.commission_payable + o.commission_paid).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Targets' && (
        <div className="card p-6 text-center text-base-muted text-sm">
          <Target size={30} className="mx-auto mb-2 opacity-30 text-amber-500" />
          <p className="font-semibold text-base-secondary">Monthly Targets & Objectives</p>
          <p className="text-xs text-base-muted mt-1">Goal: 5 active applications per month. Keep track of customer installments to secure full payouts.</p>
        </div>
      )}

      {tab === 'Leads' && (
        <div className="card p-6 text-center text-base-muted text-sm">
          <Sparkles size={30} className="mx-auto mb-2 opacity-30 text-amber-500" />
          <p className="font-semibold text-base-secondary">Prospective Customer Leads</p>
          <p className="text-xs text-base-muted mt-1">Assigned camp prospects and follow-ups will be listed here.</p>
        </div>
      )}

      {tab === 'My Stock' && (
        <div className="card p-6 text-center text-base-muted text-sm">
          <User size={30} className="mx-auto mb-2 opacity-30 text-amber-500" />
          <p className="font-semibold text-base-secondary">Allocated Officer Stock</p>
          <p className="text-xs text-base-muted mt-1">View list of devices in your custody ready for handovers.</p>
        </div>
      )}

      {tab === 'Free Phone Reward' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-base flex items-center justify-between">
            <h3 className="font-semibold text-sm text-base-secondary flex items-center gap-2">
              <Gift size={15} /> Free Phone Requests
            </h3>
            <button
              onClick={() => setShowFreePhoneModal(true)}
              className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 font-semibold"
            >
              <Plus size={14} /> New Request
            </button>
          </div>
          {fpLoading ? (
            <div className="py-8 text-center text-base-muted"><Loader2 className="animate-spin inline" /></div>
          ) : freeRequests.length === 0 ? (
            <div className="py-10 text-center text-base-muted text-sm">No free phone requests yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {freeRequests.map(req => (
                <div key={req.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-base-primary">{req.officer_name}</span>
                      <span className="text-xs text-base-muted">{req.officer_rank} · {req.officer_service}</span>
                    </div>
                    <div className="text-xs text-base-muted">
                      Model: <strong>{req.phone_model}</strong> · {req.camp?.name ?? '—'} · {new Date(req.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-base-muted mt-0.5 italic">{req.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[req.status]}`}>
                      {req.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Application Modal */}
      {showAppModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="surface rounded-2xl w-full max-w-4xl shadow-2xl border border-base my-4 text-slate-800">

            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-bold text-lg">New Application</h3>
              <button onClick={() => setShowAppModal(false)} className="text-base-muted hover:text-white transition-colors">
                <XCircle size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-left">

              {/* NIC NUMBER */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1.5">NIC Number</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 901234567V"
                    value={nicSearch}
                    onChange={e => { setNicSearch(e.target.value); if (nicChecked) { setNicChecked(false); setExistingCustomer(null); } }}
                    onKeyDown={e => e.key === 'Enter' && handleNICCheck()}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono text-base"
                  />
                  <button
                    onClick={handleNICCheck}
                    disabled={!nicSearch.trim() || nicLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-40"
                  >
                    {nicLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Check
                  </button>
                </div>
                {/* Inline NIC format validation */}
                {nicSearch.trim().length > 0 && (() => {
                  const v = nicSearch.trim();
                  const isOld = /^\d{9}[VvXx]$/.test(v);
                  const isNew = /^\d{12}$/.test(v);
                  const isValid = isOld || isNew;
                  return (
                    <p className={`text-xs mt-1.5 flex items-center gap-1 font-semibold ${isValid ? 'text-green-600' : 'text-red-500'}`}>
                      {isValid
                        ? <><CheckCircle2 size={12} /> Valid Sri Lankan NIC format ({isOld ? 'Old — 9 digits + V/X' : 'New — 12 digits'})</>  
                        : <><XCircle size={12} /> Invalid — must be 9 digits + V/X (e.g. 901234567V) or 12 digits</>}
                    </p>
                  );
                })()}
                {nicSearch.trim().length === 0 && (
                  <p className="text-xs text-blue-600 mt-1.5">
                    Enter NIC to auto-fill existing customer details and skip re-uploading documents
                  </p>
                )}
              </div>

              {/* Existing customer banner */}
              {nicChecked && existingCustomer && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800">
                    <CheckCircle2 size={18} className="shrink-0 text-teal-600 mt-0.5" />
                    <div>
                      <span className="font-bold">Details pre-filled from NIC {nicSearch}.</span>{' '}
                      Only paysheets need to be uploaded.
                    </div>
                  </div>

                  {eligibility && (
                    <div className={`flex items-start gap-3 p-3 border rounded-xl text-sm ${
                      !eligibility.eligible && !eligibility.requires_special_approval
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : !eligibility.eligible && eligibility.requires_special_approval
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-green-50 border-green-200 text-green-800'
                    }`}>
                      <AlertCircle size={18} className={`shrink-0 mt-0.5 ${
                        !eligibility.eligible && !eligibility.requires_special_approval
                          ? 'text-red-600'
                          : !eligibility.eligible && eligibility.requires_special_approval
                          ? 'text-amber-600'
                          : 'text-green-600'
                      }`} />
                      <div>
                        <div className="font-bold">
                          Phone Eligibility: {
                            !eligibility.eligible && !eligibility.requires_special_approval
                              ? 'BLOCKED'
                              : !eligibility.eligible && eligibility.requires_special_approval
                              ? 'Requires Special Approval'
                              : 'Eligible'
                          }
                        </div>
                        <div className="text-xs mt-0.5">
                          {eligibility.reason || `Customer currently has ${eligibility.active_count} active phone plan(s).`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── CUSTOMER DETAILS ── */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 surface-3" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Customer Details</span>
                  <div className="h-px flex-1 surface-3" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="Full name in English"
                      value={newCustForm.full_name}
                      onChange={e => setNewCustForm(p => ({ ...p, full_name: e.target.value }))}
                      readOnly={!!existingCustomer}
                      className={`w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Name with Initials</label>
                    <input
                      type="text"
                      placeholder="e.g. A.B.C. Perera"
                      value={newCustForm.full_name_si}
                      onChange={e => setNewCustForm(p => ({ ...p, full_name_si: e.target.value }))}
                      readOnly={!!existingCustomer}
                      className={`w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Rank</label>
                    <input
                      type="text"
                      placeholder="Military rank"
                      value={newCustForm.rank}
                      onChange={e => setNewCustForm(p => ({ ...p, rank: e.target.value }))}
                      readOnly={!!existingCustomer}
                      className={`w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Service Number</label>
                    <input
                      type="text"
                      placeholder="e.g. SL/0012345"
                      value={newCustForm.service_number}
                      onChange={e => setNewCustForm(p => ({ ...p, service_number: e.target.value }))}
                      readOnly={!!existingCustomer}
                      className={`w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Branch</label>
                    <select
                      value={newCustForm.branch}
                      onChange={e => setNewCustForm(p => ({ ...p, branch: e.target.value as any, camp_id: '' }))}
                      disabled={!!existingCustomer}
                      className={`w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${existingCustomer ? 'surface-2 text-base-muted' : ''}`}
                    >
                      <option value="army">Sri Lanka Army</option>
                      <option value="navy">Sri Lanka Navy</option>
                      <option value="air_force">Sri Lanka Air Force</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Camp / Base</label>
                    <select
                      value={newCustForm.camp_id}
                      onChange={e => setNewCustForm(p => ({ ...p, camp_id: e.target.value }))}
                      disabled={!!existingCustomer}
                      className={`w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${existingCustomer ? 'surface-2 text-base-muted' : ''}`}
                    >
                      <option value="">Select Camp</option>
                      {(campsList || []).filter((c: any) => c.branch === newCustForm.branch || !c.branch).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── DOCUMENTS ── */}
              {nicChecked && existingCustomer ? (
                // Existing customer — only paysheets
                <div className="space-y-4 text-left">
                  <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 mb-3">
                    <CheckCircle2 size={16} className="shrink-0 text-green-600 mt-0.5" />
                    <div>
                      <div className="font-bold mb-0.5">Documents from NIC lookup</div>
                      <div className="text-green-700">NIC (front &amp; back), Service ID, and selfie are already on record. Upload only the latest 3 months paysheets.</div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Latest 3 Months Paysheets (required)</label>
                    <div className="border border-slate-200 rounded-xl p-3 surface">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,image/*"
                        onChange={e => {
                          const filesList = e.target.files;
                          if (!filesList) return;
                          setSelectedFiles(prev => ({
                            ...prev,
                            paysheet_1: filesList[0] || undefined,
                            paysheet_2: filesList[1] || undefined,
                            paysheet_3: filesList[2] || undefined,
                          }));
                        }}
                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1 mt-1 text-xs text-gray-505">
                      {selectedFiles.paysheet_1 && <div>Selected Paysheet 1: {selectedFiles.paysheet_1.name} {uploadProgress.paysheet_1 !== undefined && `(${uploadProgress.paysheet_1}%)`}</div>}
                      {selectedFiles.paysheet_2 && <div>Selected Paysheet 2: {selectedFiles.paysheet_2.name} {uploadProgress.paysheet_2 !== undefined && `(${uploadProgress.paysheet_2}%)`}</div>}
                      {selectedFiles.paysheet_3 && <div>Selected Paysheet 3: {selectedFiles.paysheet_3.name} {uploadProgress.paysheet_3 !== undefined && `(${uploadProgress.paysheet_3}%)`}</div>}
                    </div>
                  </div>
                </div>
              ) : nicChecked && !existingCustomer ? (
                // New customer — full documents
                <div className="space-y-4 text-left">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">NIC (Front &amp; Back)</label>
                    <div className="flex gap-2">
                      <div className="border border-slate-200 rounded-xl p-3 surface flex-1">
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={e => {
                            const filesList = e.target.files;
                            if (!filesList) return;
                            setSelectedFiles(prev => ({
                              ...prev,
                              nic_front: filesList[0] || undefined,
                              nic_back: filesList[1] || undefined,
                            }));
                          }}
                          className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCameraActiveFor('nic_front')}
                        className="px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Capture NIC Front via Webcam"
                      >
                        <Camera size={14} /> Front
                      </button>
                      <button
                        type="button"
                        onClick={() => setCameraActiveFor('nic_back')}
                        className="px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Capture NIC Back via Webcam"
                      >
                        <Camera size={14} /> Back
                      </button>
                    </div>
                    {/* NIC Previews */}
                    {(selectedFiles.nic_front || selectedFiles.nic_back) && (
                      <div className="flex gap-3 mt-2">
                        {selectedFiles.nic_front && (
                          <div className="flex flex-col items-center gap-1">
                            <img
                              src={URL.createObjectURL(selectedFiles.nic_front)}
                              alt="NIC Front"
                              className="w-32 h-20 object-cover rounded-lg border-2 border-green-400 shadow"
                            />
                            <span className="text-[10px] text-green-600 font-bold">✓ NIC Front</span>
                          </div>
                        )}
                        {selectedFiles.nic_back && (
                          <div className="flex flex-col items-center gap-1">
                            <img
                              src={URL.createObjectURL(selectedFiles.nic_back)}
                              alt="NIC Back"
                              className="w-32 h-20 object-cover rounded-lg border-2 border-green-400 shadow"
                            />
                            <span className="text-[10px] text-green-600 font-bold">✓ NIC Back</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Military / Service ID</label>
                    <div className="border border-slate-200 rounded-xl p-3 surface">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          setSelectedFiles(prev => ({ ...prev, military_id: file || undefined }));
                        }}
                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                      />
                    </div>
                    {selectedFiles.military_id && <div className="text-xs text-base-muted mt-1">Selected: {selectedFiles.military_id.name} {uploadProgress.military_id !== undefined && `(${uploadProgress.military_id}%)`}</div>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Selfie / Photo</label>
                    <div className="flex gap-2">
                      <div className="border border-slate-200 rounded-xl p-3 surface flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            setSelectedFiles(prev => ({ ...prev, selfie: file || undefined }));
                          }}
                          className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCameraActiveFor('selfie')}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Capture Selfie via Webcam"
                      >
                        <Camera size={14} /> Capture
                      </button>
                    </div>
                    {/* Selfie Preview */}
                    {selectedFiles.selfie && (
                      <div className="flex flex-col items-center gap-1 mt-2 w-fit">
                        <img
                          src={URL.createObjectURL(selectedFiles.selfie)}
                          alt="Selfie"
                          className="w-24 h-24 object-cover rounded-full border-4 border-amber-400 shadow-lg"
                        />
                        <span className="text-[10px] text-amber-600 font-bold">✓ Selfie captured</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Last 3 Months Paysheets</label>
                    <div className="border border-slate-200 rounded-xl p-3 surface">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,image/*"
                        onChange={e => {
                          const filesList = e.target.files;
                          if (!filesList) return;
                          setSelectedFiles(prev => ({
                            ...prev,
                            paysheet_1: filesList[0] || undefined,
                            paysheet_2: filesList[1] || undefined,
                            paysheet_3: filesList[2] || undefined,
                          }));
                        }}
                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1 mt-1 text-xs text-base-muted">
                      {selectedFiles.paysheet_1 && <div>Selected Paysheet 1: {selectedFiles.paysheet_1.name} {uploadProgress.paysheet_1 !== undefined && `(${uploadProgress.paysheet_1}%)`}</div>}
                      {selectedFiles.paysheet_2 && <div>Selected Paysheet 2: {selectedFiles.paysheet_2.name} {uploadProgress.paysheet_2 !== undefined && `(${uploadProgress.paysheet_2}%)`}</div>}
                      {selectedFiles.paysheet_3 && <div>Selected Paysheet 3: {selectedFiles.paysheet_3.name} {uploadProgress.paysheet_3 !== undefined && `(${uploadProgress.paysheet_3}%)`}</div>}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ── DEVICE & INSTALLMENT PLAN ── */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 surface-3" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Device &amp; Installment Plan</span>
                  <div className="h-px flex-1 surface-3" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Select Device (in stock)</label>
                    <select
                      value={newAppForm.phone_model_id}
                      onChange={e => setNewAppForm(p => ({ ...p, phone_model_id: e.target.value }))}
                      className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 surface"
                    >
                      <option value="">Choose Device</option>
                      {(phoneModels || []).filter((d: any) => d.in_stock > 0 || d.sale_price).map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.brand} {d.model} — LKR {d.sale_price?.toLocaleString()} ({d.storage || '128GB'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Down Payment (LKR)</label>
                    <input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={newAppForm.down_payment || ''}
                      onChange={e => setNewAppForm(p => ({ ...p, down_payment: Number(e.target.value) }))}
                      className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Installment Months</label>
                    <select
                      value={newAppForm.term_months}
                      onChange={e => setNewAppForm(p => ({ ...p, term_months: Number(e.target.value) }))}
                      className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 surface"
                    >
                      {[6, 9, 12, 18, 24].map(n => (
                        <option key={n} value={n}>{n} months</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">First Deduction Month</label>
                    <input
                      type="month"
                      value={newAppForm.first_deduction_month}
                      onChange={e => setNewAppForm(p => ({ ...p, first_deduction_month: e.target.value }))}
                      className="w-full border border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 surface"
                    />
                  </div>
                </div>
              </div>

              {/* IMEI info note */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 text-left">
                <Smartphone size={18} className="shrink-0 text-blue-500 mt-0.5" />
                <div>
                  <div className="font-bold mb-0.5">IMEI not entered here</div>
                  <div className="text-blue-700">IMEI 1 and IMEI 2 are entered by the sales officer at the time of physical handover — after all approvals. This prevents errors and ensures the actual device being handed over is recorded.</div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="surface-2 px-6 py-4 flex justify-end gap-3 border-t border-base rounded-b-2xl">
              <button onClick={() => setShowAppModal(false)} className="px-4 py-2 border border-base rounded-lg text-sm font-medium hover:bg-[var(--bg-surface-2)] surface text-slate-700">
                Cancel
              </button>
              <button
                onClick={handleCreateApplicationSubmit}
                disabled={createCustomerMutation.isPending || createAppMutation.isPending || !nicChecked || (eligibility?.eligible === false && !eligibility?.requires_special_approval)}
                className="flex items-center gap-2 px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-40"
              >
                {(createCustomerMutation.isPending || createAppMutation.isPending) && <Loader2 size={15} className="animate-spin" />}
                Submit Application
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Free Phone Modal */}
      {showFreePhoneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-base">
              <h3 className="font-bold text-base-primary flex items-center gap-2">
                <Gift size={18} /> Free Phone Request
              </h3>
              <button onClick={() => setShowFreePhoneModal(false)} className="text-base-muted hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { key: 'officer_name', label: 'Officer Full Name', placeholder: 'Lt Col. Karunaratne…' },
                { key: 'officer_rank', label: 'Rank', placeholder: 'Lieutenant Colonel…' },
                { key: 'officer_service', label: 'Service Number', placeholder: 'S/12345' },
                { key: 'phone_model', label: 'Phone Model', placeholder: 'Samsung Galaxy A55…' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                  <input
                    type="text"
                    className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder={placeholder}
                    value={fpForm[key as keyof typeof fpForm]}
                    onChange={e => setFpForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason / Justification</label>
                <textarea
                  rows={3}
                  className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  placeholder="Outstanding performance, special achievement…"
                  value={fpForm.reason}
                  onChange={e => setFpForm(f => ({ ...f, reason: e.target.value }))}
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-2 justify-end">
              <button
                onClick={() => setShowFreePhoneModal(false)}
                className="px-4 py-2.5 border border-base rounded-lg text-sm font-medium hover:bg-[var(--bg-surface-2)]"
              >Cancel</button>
              <button
                onClick={() => submitFreePhone.mutate(fpForm)}
                disabled={submitFreePhone.isPending || !fpForm.officer_name || !fpForm.phone_model || !fpForm.reason}
                className="px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {submitFreePhone.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Special Approval Request Modal */}
      {blockedCustInfo && (
        <SpecialApprovalRequestModal
          isOpen={showSpecialModal}
          onClose={() => { setShowSpecialModal(false); setBlockedCustInfo(null); }}
          customerId={blockedCustInfo.id}
          customerName={blockedCustInfo.name}
          phoneModelId={selectedPhoneModelId}
          termMonths={selectedTermMonths}
          onSuccess={() => {
            alert(' Special approval request submitted. Admins and super admins have been notified for review.');
            qc.invalidateQueries({ queryKey: ['officer-applications'] });
            qc.invalidateQueries({ queryKey: ['my-pending-special-approvals'] });
            qc.invalidateQueries({ queryKey: ['applications'] });
          }}
        />
      )}

      {/* Camera Modal for Document Capture */}
      {cameraActiveFor && (
        <CameraModal
          label={cameraActiveFor === 'nic_front' ? 'NIC Front' : cameraActiveFor === 'nic_back' ? 'NIC Back' : 'Selfie'}
          onClose={() => setCameraActiveFor(null)}
          onCapture={(file) => {
            setSelectedFiles(prev => ({ ...prev, [cameraActiveFor!]: file }));
            setCameraActiveFor(null);
          }}
        />
      )}

      {/* Pending Special Approvals Status Panel */}
      {(myPendingApprovals as any[]).length > 0 && (
        isStatusWidgetMinimized ? (
          <button
            onClick={() => setIsStatusWidgetMinimized(false)}
            className="fixed bottom-6 right-6 surface border-2 border-amber-200 rounded-full shadow-lg p-3 z-40 hover:bg-amber-50 transition-all flex items-center gap-2 font-bold text-xs text-amber-800"
          >
            <Clock size={16} className="text-amber-600 animate-pulse" />
            <span>Approval Status ({pendingCount} pending)</span>
          </button>
        ) : (
          <div className="fixed bottom-6 right-6 surface border-2 border-amber-200 rounded-xl shadow-lg p-4 max-w-sm w-80 z-40 transition-all text-left">
            <div className="flex items-start gap-3">
              <Clock size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-1.5">⏳ Approval Status</h3>
                  <button
                    onClick={() => setIsStatusWidgetMinimized(true)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded"
                  >
                    Minimize
                  </button>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  You have <span className="font-bold text-amber-600">{pendingCount}</span> pending special approval request(s).
                </p>
                <div className="mt-2 space-y-1.5 text-xs text-slate-600 max-h-48 overflow-y-auto pr-1">
                  {(myPendingApprovals as any[]).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-700">{r.customer?.full_name || 'Customer'}</div>
                        <div className="truncate text-[11px] text-slate-500">{r.phone_model?.brand} {r.phone_model?.model}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${requestStatusStyles[r.status] || 'bg-slate-100 text-slate-700'}`}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
