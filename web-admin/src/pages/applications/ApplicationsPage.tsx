import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, applicationsApi, customersApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { uploadDocumentViaApi, DocumentType } from '@/services/supabaseStorage';
import { SearchableSelect } from '@/components/SearchableSelect';
import {
  ChevronRight, AlertTriangle, Search, Plus, Download, Mail,
  Printer, Eye, Check, X, FileText, Smartphone, RefreshCw,
  Shield, CheckCircle, XCircle, ArrowLeft, Loader2, Camera,
  ClipboardList, Users, DollarSign, Award, MessageCircle,
  PackageCheck, Receipt, ScrollText, Truck, PenTool
} from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  draft: 'surface-2 text-gray-600 border border-base',
  submitted: 'bg-blue-50 text-blue-700 border border-blue-200',
  docs_review: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300',
  camp_review: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300',
  finance_review: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300',
  approved: 'bg-teal-50 text-teal-700 border border-teal-200',
  active: 'bg-green-50 text-green-700 border border-green-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  completed: 'surface-2 text-base-secondary border border-base',
};

const STAGES = ['submitted', 'approved', 'active', 'rejected'];
const STAGE_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  active: 'Active',
  rejected: 'Rejected'
};

const fmtLKR = (val: any) => {
  const num = Number(val);
  return isNaN(num) ? 'LKR 0' : `LKR ${num.toLocaleString()}`;
};

import CameraModal from '@/components/CameraModal';
import SignatureModal from '@/components/SignatureModal';

export default function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = parseInt(params.get('page') || '1');
  const search = params.get('q') || '';
  const filterBranch = params.get('branch') || '';
  const filterCamp = params.get('camp_id') || '';
  const qc = useQueryClient();
  const { user, idToken } = useAuthStore();

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

  // Modals state
  const [selApp, setSelApp] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState<any>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState<any>(null);
  const [showAgreementModal, setShowAgreementModal] = useState<any>(null);
  const [showWAModal, setShowWAModal] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState<any>(null);
  const [specialApprovalReviewNotes, setSpecialApprovalReviewNotes] = useState<Record<string, string>>({});

  // Camera capture states
  const [cameraActiveFor, setCameraActiveFor] = useState<'nic_front' | 'nic_back' | 'selfie' | null>(null);

  // Review state
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNote, setReviewNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [retirementRiskConfirmed, setRetirementRiskConfirmed] = useState(false);

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

  // NIC loading state
  const [nicLoading, setNicLoading] = useState(false);

  // Handover state
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().split('T')[0]);
  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');
  const [cameraActiveForImei, setCameraActiveForImei] = useState<'imei_1' | 'imei_2' | null>(null);
  const [customerSignature, setCustomerSignature] = useState<string>('');
  const [guarantorSignature, setGuarantorSignature] = useState<string>('');
  const [showCustomerSignaturePad, setShowCustomerSignaturePad] = useState(false);
  const [showGuarantorSignaturePad, setShowGuarantorSignaturePad] = useState(false);
  const customerSignaturePadRef = React.useRef<any>(null);
  const guarantorSignaturePadRef = React.useRef<any>(null);

  // WhatsApp template state
  const [waMessage, setWaMessage] = useState('');

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ['applications', status, page, search, filterBranch, filterCamp],
    queryFn: () =>
      api.get('/applications', {
        params: {
          status: status || undefined,
          page,
          limit: 25,
          q: search || undefined,
          branch: filterBranch || undefined,
          camp_id: filterCamp || undefined,
        }
      }).then(r => r.data),
  });

  const { data: allAppsRes } = useQuery({
    queryKey: ['applications-all-counts'],
    queryFn: () => api.get('/applications', { params: { limit: 1000 } }).then(r => r.data),
  });

  const { data: campsList } = useQuery({
    queryKey: ['camps-list'],
    queryFn: () => api.get('/camps').then(r => r.data.data),
    enabled: true
  });

  const { data: devicesList } = useQuery({
    queryKey: ['devices-list'],
    queryFn: () => api.get('/inventory/models').then(r => r.data.data),
    enabled: showNewModal
  });

  const isAdminReviewRole = user?.role === 'admin' || user?.role === 'super_admin';
  const isSalesOfficer = user?.role === 'sales_officer';

  const { data: specialApprovalRequests = [], isLoading: specialApprovalLoading, refetch: refetchSpecialApprovals } = useQuery({
    queryKey: ['special-approval-requests', 'pending'],
    queryFn: async () => {
      try {
        const response = await api.get('/applications/special-approval-requests', { params: { status: 'pending' } });
        return response.data?.data || [];
      } catch {
        return [];
      }
    },
    enabled: isAdminReviewRole,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  const { data: mySpecialApprovalRequests = [], isLoading: myRequestsLoading } = useQuery({
    queryKey: ['my-special-approval-requests', user?.id],
    queryFn: async () => {
      try {
        const response = await api.get('/applications/special-approval-requests', { params: { status: 'pending' } });
        return response.data?.data || [];
      } catch {
        return [];
      }
    },
    enabled: isSalesOfficer,
    refetchInterval: 5000,
  });

  const reviewSpecialApprovalMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      api.post(`/applications/special-approval-requests/${id}/review`, { action, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special-approval-requests'] });
      qc.invalidateQueries({ queryKey: ['my-special-approval-requests'] });
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['applications-all-counts'] });
      refetchSpecialApprovals();
      alert('✅ Special approval request updated.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Failed to review request');
    },
  });

  const apps = (data?.data || []) as Record<string, any>[];
  const meta = data?.meta as { total: number; page: number; pages: number } | undefined;

  // Pipeline Summary Counts
  const allApps = (allAppsRes?.data || []) as Record<string, any>[];
  const getStageCount = (s: string) => allApps.filter(a => a.status === s).length;

  // Mutations
  const createCustomerMutation = useMutation({
    mutationFn: (cust: typeof newCustForm) => {
      const payload = Object.fromEntries(
        Object.entries(cust).map(([k, v]) => [k, v === '' ? undefined : v])
      );
      return customersApi.create(payload).then(r => r.data.data);
    }
  });

  const createAppMutation = useMutation({
    mutationFn: (appPayload: any) => applicationsApi.create(appPayload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['applications-all-counts'] });
      setShowNewModal(false);
      resetNewAppForm();
    }
  });

  const advanceStageMutation = useMutation({
    mutationFn: ({ id, endpoint, data }: { id: string; endpoint: string; data?: any }) =>
      api.post(`/applications/${id}/${endpoint}`, data || {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['applications-all-counts'] });
      if (showDetailModal && selApp) {
        api.get(`/applications/${selApp.id}`).then(r => setSelApp(r.data.data));
      }
    }
  });

  const handoverMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      applicationsApi.handover(id, data),
    onSuccess: (res, variables) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['applications-all-counts'] });
      setShowHandoverModal(null);
      // Automatically show invoice modal for the handed over application
      api.get(`/applications/${variables.id}`).then(r => {
        setShowInvoiceModal(r.data.data);
      });
    },
    onError: (error: any) => {
      let errorMsg = 'Failed to confirm handover. Please try again.';

      if (error?.response?.status === 400) {
        const details = error?.response?.data?.details;

        if (details) {
          const fieldErrors: string[] = [];
          if (details.fieldErrors) {
            Object.entries(details.fieldErrors).forEach(([field, msgs]: any) => {
              fieldErrors.push(`${field}: ${msgs.join(', ')}`);
            });
          }
          if (fieldErrors.length > 0) {
            errorMsg = `Validation Error:\n${fieldErrors.join('\n')}`;
          } else {
            errorMsg = `Validation Error: ${JSON.stringify(details)}`;
          }
        } else if (error?.response?.data?.message) {
          errorMsg = error.response.data.message;
        } else {
          errorMsg = 'Validation error. Please check all fields.';
        }
      } else if (error?.response?.status === 500) {
        const serverMessage = error?.response?.data?.message || error?.response?.data?.error;
        errorMsg = 'Server error occurred. Please check the data and try again.';
        if (serverMessage) {
          errorMsg = `Server error: ${serverMessage}`;
        }
      } else if (error?.response?.data?.message) {
        errorMsg = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMsg = error.response.data.error;
      } else if (error?.message) {
        errorMsg = error.message;
      }

      alert(`Error: ${errorMsg}`);
    }
  });

  // Actions
  const handleNICCheck = async () => {
    if (!nicSearch.trim()) return;
    setNicLoading(true);
    try {
      const res = await api.get('/customers', { params: { nic: nicSearch.trim() } });
      const list = res.data.data || [];
      if (list.length > 0) {
        const cust = list[0];
        setExistingCustomer(cust);
        // Pre-fill form fields from existing customer
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

        // Fetch active phone eligibility from backend
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

  const handleCreateApplicationSubmit = async () => {
    let customerId = existingCustomer?.id;

    if (!customerId) {
      // Validate customer fields
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

    // Upload documents to Supabase Storage via backend API
    const filesToUpload = Object.entries(selectedFiles).filter(([_, f]) => !!f) as [DocumentType, File][];
    if (filesToUpload.length > 0) {
      setIsUploading(true);
      setUploadError(null);
      try {
        for (const [docType, file] of filesToUpload) {
          setUploadProgress(prev => ({ ...prev, [docType]: 0 }));
          const res = await uploadDocumentViaApi(
            customerId,
            docType,
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

    const selectedDevice = devicesList?.find((d: any) => d.id === newAppForm.phone_model_id);
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

  const canReviewApp = (appStatus: string) => {
    if (appStatus === 'submitted') {
      return user?.role === 'sales_officer' || user?.role === 'admin' || user?.role === 'super_admin';
    }
    return false;
  };

  const handleReviewSubmit = () => {
    if (!showReviewModal) return;

    let endpoint = '';
    if (showReviewModal.status === 'submitted') endpoint = 'sales-review';

    if (!endpoint) return;

    advanceStageMutation.mutate({
      id: showReviewModal.id,
      endpoint,
      data: {
        action: reviewAction,
        note: reviewNote || undefined,
        rejection_reason: reviewAction === 'reject' ? rejectionReason : undefined,
      }
    }, {
      onSuccess: () => {
        setShowReviewModal(null);
      }
    });
  };

  const handleConfirmHandover = () => {
    if (!imei1.trim()) {
      alert('Please scan or enter IMEI 1');
      return;
    }
    if (!customerSignature || customerSignature.trim() === '') {
      alert('Please capture customer e-signature');
      return;
    }
    // Check guarantor signature if guarantor exists
    if (showHandoverModal?.guarantor_id && (!guarantorSignature || guarantorSignature.trim() === '')) {
      alert('Please capture guarantor e-signature');
      return;
    }
    
    // Verify handover_date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(handoverDate)) {
      alert(`Invalid date format. Must be YYYY-MM-DD, got: ${handoverDate}`);
      return;
    }
    
    // Build payload with only non-null/non-empty fields
    const payload: any = {
      imei_1: imei1.trim(),
      handover_date: handoverDate,
      customer_signature: customerSignature,
    };
    
    // Only add optional fields if they have values
    if (imei2 && imei2.trim()) {
      payload.imei_2 = imei2.trim();
    }
    if (guarantorSignature && guarantorSignature.trim()) {
      payload.guarantor_signature = guarantorSignature;
    }
    
    handoverMutation.mutate({
      id: showHandoverModal.id,
      data: payload
    });
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

  const handleWhatsAppOpen = (a: any) => {
    const cust = a.customer || {};
    const phone = cust.phone_number || '';
    const name = cust.full_name || '';
    const text = `Dear ${name}, this is AIRVOICE Defence Finance. Your application ${a.ref_number} has been approved. Monthly salary deduction of ${fmtLKR(a.monthly_amount)} will commence soon.`;
    setWaMessage(text);
    setShowWAModal({ phone, text });
  };

  const downloadCSV = () => {
    const headers = ['App ID', 'Customer', 'NIC', 'Phone', 'Monthly', 'Months', 'Status', 'Date', 'Handed Over'];
    const rows = allApps.map(a => [
      a.id || a.ref_number || '',
      a.customer_name || '',
      a.service_number || '',
      a.phone_model || '',
      a.monthly_amount || 0,
      a.term_months || 0,
      a.status || '',
      a.created_at ? new Date(a.created_at).toLocaleDateString() : '',
      a.handover_date ? 'Yes' : 'No'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => JSON.stringify(v)).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `applications_export_${new Date().toLocaleDateString('sv-SE')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const viewDetail = async (id: string) => {
    try {
      const res = await api.get(`/applications/${id}`);
      setSelApp(res.data.data);
      setShowDetailModal(true);
    } catch {
      alert('Failed to load application details');
    }
  };

  const handleReviewSpecialApproval = (id: string, action: 'approve' | 'reject') => {
    reviewSpecialApprovalMutation.mutate({
      id,
      action,
      note: specialApprovalReviewNotes[id]?.trim() || undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-base pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-base-primary flex items-center gap-2.5">
            <FileText size={28} className="text-[#2563ea]" /> Applications
          </h1>
          <p className="text-sm text-base-muted mt-1">
            Active plans monthly total: {fmtLKR(allApps.filter(a => a.status === 'active').reduce((s, a) => s + (a.monthly_amount || 0), 0))} · {allApps.length} total applications
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={downloadCSV} className="btn-secondary flex items-center gap-2">
            <Download size={16} /> Export
          </button>
          <button onClick={() => { resetNewAppForm(); setShowNewModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Application
          </button>
        </div>
      </div>

      {isAdminReviewRole && (
        <div className="card border-blue-200 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-900 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-2">
              <Shield size={18} className="text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">Pending special approval requests</h2>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  These requests need admin or super admin review before the customer can proceed.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 px-3 py-1 text-xs font-bold whitespace-nowrap">
              {specialApprovalLoading ? 'Loading…' : `${(specialApprovalRequests as any[]).length} pending`}
            </span>
          </div>

          {specialApprovalLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <Loader2 size={14} className="animate-spin text-blue-600" />
              <span>Loading pending requests…</span>
            </div>
          ) : !specialApprovalRequests || (specialApprovalRequests as any[]).length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">✅ No pending special approval requests right now.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {(specialApprovalRequests as any[]).map((request: any) => (
                <div key={request.id} className="rounded-xl border border-blue-200 dark:border-blue-800 surface p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{request.customer?.full_name || 'Customer'}</span>
                        <span className="text-xs text-slate-500">{request.customer?.service_number || '—'}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{request.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-1">
                          Requested by {request.requested_by_user?.full_name || request.requested_by_user?.phone_number || 'Sales officer'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1">
                          {request.phone_model?.brand} {request.phone_model?.model}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1">{request.term_months} months</span>
                      </div>
                    </div>

                    <div className="w-full lg:w-72">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Admin note (optional)
                      </label>
                      <textarea
                        rows={3}
                        value={specialApprovalReviewNotes[request.id] || ''}
                        onChange={e => setSpecialApprovalReviewNotes(prev => ({ ...prev, [request.id]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Add note for the sales officer"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => handleReviewSpecialApproval(request.id, 'reject')}
                      disabled={reviewSpecialApprovalMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                    <button
                      onClick={() => handleReviewSpecialApproval(request.id, 'approve')}
                      disabled={reviewSpecialApprovalMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isSalesOfficer && (
        <div className="card border-blue-200 bg-blue-50/70 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-2">
              <Mail size={18} className="text-blue-600 mt-0.5" />
              <div>
                <h2 className="font-semibold text-slate-900">Your pending special approval requests</h2>
                <p className="text-sm text-blue-700 mt-1">
                  Track the status of your special approval requests here.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 whitespace-nowrap">
              {myRequestsLoading ? 'Loading…' : `${(mySpecialApprovalRequests as any[]).length} pending`}
            </span>
          </div>

          {myRequestsLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading your requests…</span>
            </div>
          ) : !mySpecialApprovalRequests || (mySpecialApprovalRequests as any[]).length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">✅ No pending requests. All your requests have been reviewed.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {(mySpecialApprovalRequests as any[]).map((request: any) => (
                <div key={request.id} className="rounded-xl border border-blue-200 surface p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">{request.customer?.full_name || 'Customer'}</div>
                      <p className="text-sm text-slate-600 mt-1">{request.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-1">
                          {request.phone_model?.brand} {request.phone_model?.model}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1">{request.term_months} months</span>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700 font-semibold">⏳ Pending Review</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metric summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { key: 'submitted', label: 'Submitted', color: 'border-blue-500 text-blue-600', icon: FileText },
          { key: 'approved', label: 'Approved', color: 'border-teal-500 text-teal-600', icon: Award }
        ].map(card => {
          const cnt = getStageCount(card.key);
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              onClick={() => setParams(p => { p.set('status', card.key); p.set('page', '1'); return p; })}
              className={`card p-4 border-l-4 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${card.color} ${status === card.key ? 'ring-2 ring-slate-900' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-3xl font-extrabold">{cnt}</div>
                <Icon size={20} className="opacity-60" />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-base-muted mt-1">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filter and Search controls */}
      <div className="card p-4 flex flex-col gap-3">
        {/* Row 1: search + branch/camp filters */}
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
            <input
              type="text"
              placeholder="Search name, NIC / New NIC, application ID..."
              value={search}
              onChange={e => setParams(p => { p.set('q', e.target.value); p.set('page', '1'); return p; })}
              className="form-input pl-9"
            />
          </div>
          {/* Branch filter */}
          <select
            value={filterBranch}
            onChange={e => setParams(p => { if (e.target.value) p.set('branch', e.target.value); else p.delete('branch'); p.set('page', '1'); return p; })}
            className="form-input w-full md:w-44"
          >
            <option value="">All Branches</option>
            <option value="army">Army</option>
            <option value="navy">Navy</option>
            <option value="air_force">Air Force</option>
          </select>
          {/* Camp filter */}
          <div className="w-full md:w-52">
            <SearchableSelect
              options={[
                { value: '', label: 'All Camps' },
                ...((campsList as any[] | undefined) || []).map((c: any) => ({
                  value: String(c.id),
                  label: c.name,
                  sublabel: c.code ? `Code: ${c.code}` : undefined,
                }))
              ]}
              value={filterCamp}
              onChange={val => setParams(p => { if (val) p.set('camp_id', val); else p.delete('camp_id'); p.set('page', '1'); return p; })}
              placeholder="All Camps"
              searchPlaceholder="Search camp..."
              minSearchLength={0}
            />
          </div>
          {(filterBranch || filterCamp || search) && (
            <button
              onClick={() => setParams(p => { p.delete('branch'); p.delete('camp_id'); p.delete('q'); p.set('page', '1'); return p; })}
              className="text-xs text-red-500 hover:text-red-700 font-semibold whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setParams(p => { p.delete('status'); p.set('page', '1'); return p; })}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${!status ? 'tab-pill-active' : 'tab-pill'}`}
          >
            All
          </button>
          {STAGES.map(s => {
            const cnt = getStageCount(s);
            return (
              <button
                key={s}
                onClick={() => setParams(p => { p.set('status', s); p.set('page', '1'); return p; })}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${status === s ? 'tab-pill-active' : 'tab-pill'}`}
              >
                {STAGE_LABELS[s] || s} {cnt > 0 && <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full font-black" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}>{cnt}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Applications list Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head text-xs uppercase tracking-wider">
              <tr>
                {['App ID', 'Customer / NIC', 'Branch & Camp', 'Device', 'Plan', 'Status', 'Risk', 'Officer', 'IMEI', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 surface">
              {isLoading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-base-muted font-medium">Loading applications...</td></tr>
              ) : apps.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-12 text-center text-base-muted font-medium">No applications found</td></tr>
              ) : (
                apps.map(a => {
                  const retRisk = a.retirement_flag === 'retire_risk';
                  const stagesList = ['submitted', 'approved', 'active'];
                  const currentIdx = stagesList.indexOf(a.status);
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-base-primary">{a.ref_number || a.id}</td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-base-primary">{a.customer_name || '—'}</div>
                        <div className="text-xs text-base-muted font-mono mt-0.5">
                          {a.service_number || '—'}
                          {a.customer_nic && <span className="ml-1 opacity-80">· {a.customer_nic}</span>}
                        </div>
                        {a.customer_new_nic && (
                          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-bold font-mono mt-0.5">
                            New: {a.customer_new_nic}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded capitalize ${a.customer_branch === 'army' ? 'bg-green-100 text-green-800' : a.customer_branch === 'navy' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {a.customer_branch || '—'}
                        </span>
                        <div className="text-xs text-base-muted mt-1">{a.camp_name || '—'}</div>
                      </td>
                      <td className="px-5 py-4 text-base-secondary font-medium">{a.phone_brand} {a.phone_model}</td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {fmtLKR(Number(a.financed_amount) || (Number(a.monthly_amount || 0) * Number(a.term_months || 0)))}
                        </div>
                        <div className="text-xs text-base-muted mt-0.5">{fmtLKR(a.monthly_amount)}/mo × {a.term_months}m</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1.5">
                          <span className={`badge ${STATUS_BADGE[a.status || ''] || 'surface-2'}`}>{STAGE_LABELS[a.status] || a.status}</span>
                          {a.status !== 'rejected' && a.status !== 'active' && (
                            <div className="flex gap-0.5 w-24">
                              {stagesList.slice(0, 5).map((stage, idx) => (
                                <div key={stage} className={`h-1 flex-1 rounded-full ${idx <= currentIdx ? 'bg-green-500' : 'surface-3'}`} />
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-bold rounded border ${(a.risk_score || a.customer?.risk_score || 0) < 25 ? 'bg-green-50 text-green-700 border-green-200' :
                            (a.risk_score || a.customer?.risk_score || 0) < 40 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-red-50 text-red-700 border-red-200'
                          }`}>
                          {a.risk_score || a.customer?.risk_score || 0}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-base-secondary text-xs font-medium">
                        {a.sales_officer_name || a.sales_officer?.full_name || '—'}
                      </td>
                      <td className="px-5 py-4">
                        {a.phone_id || a.phone?.imei_1 ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200 text-xs">
                            <Check size={12} /> Set
                          </span>
                        ) : (
                          <span className="text-base-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button onClick={() => viewDetail(a.id)} className="p-1.5 rounded-lg border border-base hover:bg-[var(--bg-surface-2)] text-gray-600" title="View details">
                            <Eye size={14} />
                          </button>
                          {a.status === 'draft' && (user?.role === 'sales_officer' || user?.role === 'admin' || user?.role === 'super_admin') && (() => {
                            // Count active/pending phones for this customer to enforce max 2 limit
                            const activePhones = (allApps ?? []).filter((ap: any) =>
                              ap.customer_id === a.customer_id &&
                              ['active', 'submitted', 'approved'].includes(ap.status)
                            ).length;
                            const atLimit = activePhones >= 2;
                            return (
                              <button
                                disabled={atLimit}
                                title={atLimit ? 'This customer already has 2 active phones. Cannot submit more.' : 'Submit application'}
                                onClick={() => {
                                  api.post(`/applications/${a.id}/submit`, {})
                                  .then(() => {
                                    qc.invalidateQueries({ queryKey: ['applications'] });
                                    qc.invalidateQueries({ queryKey: ['applications-all-counts'] });
                                  })
                                  .catch((err: any) => alert(err.response?.data?.error || 'Submit failed'));
                              }}
                              className={`btn text-white px-2.5 py-1 text-xs rounded font-bold ${atLimit ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                              {atLimit ? '⛔ Limit' : 'Submit'}
                            </button>
                            );
                          })()}
                          {a.status === 'approved' && (
                            <button onClick={() => {
                              setImei1('');
                              setImei2('');
                              setHandoverDate(new Date().toISOString().split('T')[0]);
                              setShowHandoverModal(a);
                            }} className="btn bg-amber-500 hover:bg-amber-600 text-slate-900 px-2.5 py-1 text-xs rounded font-bold">
                              Handover
                            </button>
                          )}
                          {a.status === 'active' && (
                            <>
                              <button onClick={async () => {
                                const res = await api.get(`/applications/${a.id}`);
                                setShowInvoiceModal(res.data.data);
                              }} className="px-2 py-1 border border-base text-xs font-bold rounded hover:bg-[var(--bg-surface-2)] text-base-secondary">
                                Invoice
                              </button>
                              <button onClick={async () => {
                                const res = await api.get(`/applications/${a.id}`);
                                setShowAgreementModal(res.data.data);
                              }} className="px-2 py-1 border border-base text-xs font-bold rounded hover:bg-[var(--bg-surface-2)] text-base-secondary">
                                Agreement
                              </button>
                              <button onClick={() => handleWhatsAppOpen(a)} className="p-1.5 rounded-lg border border-green-200 hover:bg-green-50 text-green-600" title="WhatsApp Notice">
                                <Smartphone size={14} />
                              </button>
                            </>
                          )}
                          {canReviewApp(a.status) && (
                            <button
                              onClick={() => {
                                setShowReviewModal(a);
                                setReviewAction('approve');
                                setReviewNote('');
                                setRejectionReason('');
                                setRetirementRiskConfirmed(false);
                              }}
                              className="btn bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs rounded font-bold"
                            >
                              Review
                            </button>
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

        {/* Pagination controls */}
        {meta && meta.pages > 1 && (
          <div className="px-5 py-4 border-t border-base flex items-center justify-between text-sm text-gray-600 surface">
            <span>Page {meta.page} of {meta.pages} · {meta.total} total applications</span>
            <div className="flex gap-2">
              <button disabled={meta.page <= 1} onClick={() => setParams(p => { p.set('page', String(meta.page - 1)); return p; })} className="btn-secondary py-1 px-3 disabled:opacity-40">Prev</button>
              <button disabled={meta.page >= meta.pages} onClick={() => setParams(p => { p.set('page', String(meta.page + 1)); return p; })} className="btn-secondary py-1 px-3 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Detail Modal */}
      {showDetailModal && selApp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="surface rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border border-base">
            <div className="panel-header px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={19} /> Application Details: {selApp.ref_number}</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-base-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Section */}
                <div className="space-y-3 surface-2 p-4 rounded-xl border border-base">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Customer Info</h4>
                  <div className="space-y-2 text-sm text-base-secondary">
                    <div className="flex justify-between"><span className="text-base-muted">Name</span><span className="font-semibold text-slate-900">{selApp.customer?.full_name}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">NIC</span><span className="font-mono">{selApp.customer?.nic_number}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Service No</span><span className="font-mono">{selApp.customer?.service_number}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Rank & Branch</span><span className="capitalize">{selApp.customer?.rank} · {selApp.customer?.branch}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Camp / Base</span><span>{selApp.customer?.camp?.name}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Retirement</span><span>{selApp.customer?.retirement_date}</span></div>
                  </div>
                </div>

                {/* Plan Section */}
                <div className="space-y-3 surface-2 p-4 rounded-xl border border-base">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Plan & Device</h4>
                  <div className="space-y-2 text-sm text-base-secondary">
                    <div className="flex justify-between"><span className="text-base-muted">Device Model</span><span className="font-semibold text-slate-900">{selApp.phone_model?.brand} {selApp.phone_model?.model}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Financed Amount</span><span className="font-bold text-slate-900">{fmtLKR(selApp.financed_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Monthly Installment</span><span className="font-bold text-green-700">{fmtLKR(selApp.monthly_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Term Duration</span><span>{selApp.term_months} months</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Start Date</span><span>{selApp.sale_date}</span></div>
                    <div className="flex justify-between"><span className="text-base-muted">Plan End Date</span><span>{selApp.plan_end_date}</span></div>
                  </div>
                </div>
              </div>

              {/* Status progression tracker */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Approval Timeline</h4>
                <div className="relative pl-6 space-y-4 before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[var(--bg-surface-2)]">
                  {[
                    { key: 'submitted', label: 'Submitted' },
                    { key: 'docs_review', label: 'Docs Verification' },
                    { key: 'camp_review', label: 'Camp Officer Review' },
                    { key: 'finance_review', label: 'Finance Assessment' },
                    { key: 'approved', label: 'Approved for Handover' },
                    { key: 'active', label: 'Active Plan' }
                  ].map((stage, idx) => {
                    const pipelineStages = ['submitted', 'docs_review', 'camp_review', 'finance_review', 'approved', 'active'];
                    const currentStageIdx = pipelineStages.indexOf(selApp.status);
                    const done = idx <= currentStageIdx;
                    return (
                      <div key={stage.key} className="flex items-center gap-3 relative">
                        <div className={`absolute -left-[22px] w-[14px] h-[14px] rounded-full border-2 surface flex items-center justify-center ${done ? 'border-green-500 bg-green-500' : 'border-base'}`}>
                          {done && <Check size={8} className="text-white" />}
                        </div>
                        <span className={`text-sm font-semibold ${done ? 'text-slate-900' : 'text-base-muted'}`}>{stage.label}</span>
                        {selApp.status === stage.key && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-extrabold rounded-full uppercase tracking-wider animate-pulse">Current</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="surface-2 px-6 py-4 flex justify-end gap-2 border-t border-base">
              <button onClick={() => setShowDetailModal(false)} className="btn-secondary py-1.5 px-4 rounded-xl">Close</button>
              {selApp && canReviewApp(selApp.status) && (
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setShowReviewModal(selApp);
                    setReviewAction('approve');
                    setReviewNote('');
                    setRejectionReason('');
                    setRetirementRiskConfirmed(false);
                  }}
                  className="btn bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-5 rounded-xl font-bold"
                >
                  Review Application
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="surface rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-base">
            <div className="panel-header px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><Shield size={19} /> Review Application: {showReviewModal.ref_number || showReviewModal.id}</h3>
              <button onClick={() => setShowReviewModal(null)} className="text-base-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <span className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Current Status</span>
                <span className="badge bg-slate-100 text-slate-800 font-bold border border-slate-200">
                  {STAGE_LABELS[showReviewModal.status] || showReviewModal.status}
                </span>
              </div>

              {/* Action Buttons */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Decision *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewAction('approve')}
                    className={`py-3 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 ${reviewAction === 'approve' ? 'bg-green-50 border-green-500 text-green-700 shadow-sm' : 'border-base hover:bg-[var(--bg-surface-2)] text-base-secondary'}`}
                  >
                    <CheckCircle size={16} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('reject')}
                    className={`py-3 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 ${reviewAction === 'reject' ? 'bg-red-50 border-red-500 text-red-700 shadow-sm' : 'border-base hover:bg-[var(--bg-surface-2)] text-base-secondary'}`}
                  >
                    <XCircle size={16} /> Reject
                  </button>
                </div>
              </div>

              {/* Note / Remarks */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Internal Note</label>
                <textarea
                  rows={3}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Add internal remarks about this decision..."
                  className="form-input w-full surface text-sm"
                />
              </div>

              {/* Rejection Reason */}
              {reviewAction === 'reject' && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-red-500 mb-1">Rejection Reason *</label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="Provide a clear reason for the rejection..."
                    className="form-input w-full surface border-red-200 text-sm focus:border-red-500 focus:ring-red-500"
                    required
                  />
                </div>
              )}

              {/* Retirement Risk Checkbox */}
              {showReviewModal.status === 'camp_review' && showReviewModal.retirement_flag === 'retire_risk' && (
                <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <input
                    type="checkbox"
                    id="retirementRisk"
                    checked={retirementRiskConfirmed}
                    onChange={e => setRetirementRiskConfirmed(e.target.checked)}
                    className="mt-1 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="retirementRisk" className="text-xs text-blue-900 leading-normal font-semibold">
                    I confirm that I have reviewed the retirement risk of this customer. The application is eligible for the plan duration despite retirement warning.
                  </label>
                </div>
              )}
            </div>
            <div className="surface-2 px-6 py-4 flex justify-end gap-2 border-t border-base rounded-b-2xl">
              <button onClick={() => setShowReviewModal(null)} className="btn-secondary py-1.5 px-4 rounded-xl text-base-secondary font-medium">Cancel</button>
              <button
                onClick={handleReviewSubmit}
                disabled={advanceStageMutation.isPending || (reviewAction === 'reject' && !rejectionReason.trim()) || (showReviewModal.status === 'camp_review' && showReviewModal.retirement_flag === 'retire_risk' && !retirementRiskConfirmed && reviewAction === 'approve')}
                className="btn bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-5 rounded-xl font-bold flex items-center gap-1.5 disabled:opacity-40"
              >
                {advanceStageMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                Submit Decision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Application Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="surface rounded-2xl w-full max-w-4xl shadow-2xl border border-base my-4">

            {/* Modal Header */}
            <div className="panel-header px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-bold text-lg flex items-center gap-2"><Plus size={19} /> New Application</h3>
              <button onClick={() => setShowNewModal(false)} className="text-base-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">

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
                    className="form-input font-mono flex-1 text-base"
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
                        ? <><CheckCircle size={12} /> Valid Sri Lankan NIC format ({isOld ? 'Old — 9 digits + V/X' : 'New — 12 digits'})</>
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
                    <CheckCircle size={18} className="shrink-0 text-teal-600 mt-0.5" />
                    <div>
                      <span className="font-bold">Details pre-filled from NIC {nicSearch}.</span>{' '}
                      Only paysheets need to be uploaded.
                    </div>
                  </div>

                  {eligibility && (
                    <div className={`flex items-start gap-3 p-3 border rounded-xl text-sm ${!eligibility.eligible && !eligibility.requires_special_approval
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : !eligibility.eligible && eligibility.requires_special_approval
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-green-50 border-green-200 text-green-800'
                      }`}>
                      <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${!eligibility.eligible && !eligibility.requires_special_approval
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
                      className={`form-input w-full ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
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
                      className={`form-input w-full ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
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
                      className={`form-input w-full ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
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
                      className={`form-input font-mono w-full ${existingCustomer ? 'surface-2 text-gray-600' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Branch</label>
                    <select
                      value={newCustForm.branch}
                      onChange={e => setNewCustForm(p => ({ ...p, branch: e.target.value as any, camp_id: '' }))}
                      disabled={!!existingCustomer}
                      className={`form-input w-full ${existingCustomer ? 'surface-2 text-base-muted' : ''}`}
                    >
                      <option value="army">Sri Lanka Army</option>
                      <option value="navy">Sri Lanka Navy</option>
                      <option value="air_force">Sri Lanka Air Force</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Camp / Base</label>
                    <SearchableSelect
                      options={(campsList || [])
                        .filter((c: any) => c.branch === newCustForm.branch || !c.branch)
                        .map((c: any) => ({
                          value: String(c.id),
                          label: c.name,
                          sublabel: c.code ? `Code: ${c.code}` : undefined,
                        }))}
                      value={newCustForm.camp_id}
                      onChange={val => setNewCustForm(p => ({ ...p, camp_id: val }))}
                      disabled={!!existingCustomer}
                      placeholder="Select Camp / Base"
                      searchPlaceholder="Search camp by name..."
                      emptyMessage="No matching camps found"
                    />
                  </div>
                </div>
              </div>

              {/* ── DOCUMENTS ── */}
              {nicChecked && existingCustomer ? (
                // Existing customer — only paysheets
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 mb-3">
                    <CheckCircle size={16} className="shrink-0 text-green-600 mt-0.5" />
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
                    <div className="flex flex-col gap-1 mt-1 text-xs text-base-muted">
                      {selectedFiles.paysheet_1 && <div>Selected Paysheet 1: {selectedFiles.paysheet_1.name} {uploadProgress.paysheet_1 !== undefined && `(${uploadProgress.paysheet_1}%)`}</div>}
                      {selectedFiles.paysheet_2 && <div>Selected Paysheet 2: {selectedFiles.paysheet_2.name} {uploadProgress.paysheet_2 !== undefined && `(${uploadProgress.paysheet_2}%)`}</div>}
                      {selectedFiles.paysheet_3 && <div>Selected Paysheet 3: {selectedFiles.paysheet_3.name} {uploadProgress.paysheet_3 !== undefined && `(${uploadProgress.paysheet_3}%)`}</div>}
                    </div>
                  </div>
                </div>
              ) : nicChecked && !existingCustomer ? (
                // New customer — full documents
                <div className="space-y-4">
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
                    <SearchableSelect
                      options={(devicesList || [])
                        .filter((d: any) => d.in_stock > 0)
                        .map((d: any) => ({
                          value: String(d.id),
                          label: `${d.brand} ${d.model}`,
                          sublabel: `${fmtLKR(d.sale_price)} · Storage: ${d.storage || 'Standard'}`,
                        }))}
                      value={newAppForm.phone_model_id}
                      onChange={val => setNewAppForm(p => ({ ...p, phone_model_id: val }))}
                      placeholder="Choose Device"
                      searchPlaceholder="Search brand, model, storage..."
                      minSearchPrompt="Type phone brand or model to search..."
                      emptyMessage="No matching devices in stock"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Down Payment (LKR)</label>
                    <input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={newAppForm.down_payment || ''}
                      onChange={e => setNewAppForm(p => ({ ...p, down_payment: Number(e.target.value) }))}
                      className="form-input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Installment Months</label>
                    <select
                      value={newAppForm.term_months}
                      onChange={e => setNewAppForm(p => ({ ...p, term_months: Number(e.target.value) }))}
                      className="form-input w-full"
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
                      className="form-input w-full"
                    />
                  </div>
                </div>
              </div>

              {/* IMEI info note */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                <Smartphone size={18} className="shrink-0 text-blue-500 mt-0.5" />
                <div>
                  <div className="font-bold mb-0.5">IMEI not entered here</div>
                  <div className="text-blue-700">IMEI 1 and IMEI 2 are entered by the sales officer at the time of physical handover — after all approvals. This prevents errors and ensures the actual device being handed over is recorded.</div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="surface-2 px-6 py-4 flex justify-end gap-3 border-t border-base rounded-b-2xl">
              <button onClick={() => setShowNewModal(false)} className="btn-secondary py-2 px-5 rounded-xl text-base-secondary font-medium">
                Cancel
              </button>
              <button
                onClick={handleCreateApplicationSubmit}
                disabled={createCustomerMutation.isPending || createAppMutation.isPending || !nicChecked || (eligibility?.eligible === false && !eligibility?.requires_special_approval) || (eligibility?.active_count !== undefined && eligibility.active_count >= 2)}
                className="flex items-center gap-2 px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-40"
              >
                {(createCustomerMutation.isPending || createAppMutation.isPending) && <Loader2 size={15} className="animate-spin" />}
                Submit Application
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover Modal */}
      {showHandoverModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="surface rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-base my-8">
            <div className="panel-header px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-bold text-lg flex items-center gap-2"><Truck size={19} /> Physical Handover Confirmation</h3>
              <button onClick={() => {
                setShowHandoverModal(null);
                setImei1('');
                setImei2('');
                setCustomerSignature('');
                setGuarantorSignature('');
              }} className="text-base-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-4 text-xs leading-relaxed">
                Scan IMEI numbers and capture e-signatures for the <strong className="text-slate-900 font-bold">{showHandoverModal.phone_brand} {showHandoverModal.phone_model}</strong> being handed over.
              </div>
              
              {/* IMEI Capture Section */}
              <div className="space-y-3 pb-4 border-b border-base">
                {/* IMEI 1 */}
                <div>
                  <label className="form-label font-bold text-xs text-gray-600">IMEI 1 *</label>
                  <div className="flex gap-2 mt-1.5">
                    <input
                      type="text"
                      placeholder="Scan or type IMEI 1"
                      value={imei1}
                      onChange={e => setImei1(e.target.value)}
                      className="form-input surface flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setCameraActiveForImei('imei_1')}
                      className="px-3 py-2 border border-amber-300 hover:bg-amber-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition bg-amber-50"
                      title="Scan IMEI 1 via Camera"
                    >
                      <Camera size={14} /> Scan
                    </button>
                  </div>
                </div>
                
                {/* IMEI 2 */}
                <div>
                  <label className="form-label font-bold text-xs text-gray-600">IMEI 2 (Optional)</label>
                  <div className="flex gap-2 mt-1.5">
                    <input
                      type="text"
                      placeholder="Scan or type IMEI 2"
                      value={imei2}
                      onChange={e => setImei2(e.target.value)}
                      className="form-input surface flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setCameraActiveForImei('imei_2')}
                      className="px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                      title="Scan IMEI 2 via Camera"
                    >
                      <Camera size={14} /> Scan
                    </button>
                  </div>
                </div>
                
                {/* Handover Date */}
                <div>
                  <label className="form-label font-bold text-xs text-gray-600">Handover Date *</label>
                  <input
                    type="date"
                    value={handoverDate}
                    onChange={e => setHandoverDate(e.target.value)}
                    className="form-input surface mt-1.5"
                  />
                </div>
              </div>
              
              {/* E-Signature Capture Section */}
              <div className="space-y-6">
                {/* Customer E-Signature */}
                <div>
                  <label className="form-label font-bold text-sm text-gray-700 flex items-center gap-2">
                    <PenTool size={16} className="text-indigo-600" />
                    Customer E-Signature *
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-3 mt-2 bg-slate-50">
                    {customerSignature ? (
                      <div className="space-y-2">
                        <div className="relative flex items-center justify-center">
                          <img src={customerSignature} alt="Customer Signature" className="h-auto max-h-32 object-contain" />
                          <button
                            type="button"
                            onClick={() => setCustomerSignature('')}
                            className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 text-xs"
                            title="Clear signature"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowCustomerSignaturePad(true)}
                            className="flex-1 py-2 px-3 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-medium"
                          >
                            Redraw
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-3">
                        <PenTool size={24} className="text-slate-400 mx-auto" />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowCustomerSignaturePad(true)}
                            className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-medium"
                          >
                            Draw Signature
                          </button>
                          <label className="flex-1 py-2 px-3 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 text-xs font-medium cursor-pointer">
                            Upload File
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (evt) => {
                                    setCustomerSignature(evt.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Guarantor E-Signature */}
                {showHandoverModal?.guarantor_id && (
                  <div>
                    <label className="form-label font-bold text-sm text-gray-700 flex items-center gap-2">
                      <PenTool size={16} className="text-amber-600" />
                      Guarantor E-Signature *
                    </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-3 mt-2 bg-slate-50">
                      {guarantorSignature ? (
                        <div className="space-y-2">
                          <div className="relative flex items-center justify-center">
                            <img src={guarantorSignature} alt="Guarantor Signature" className="h-auto max-h-32 object-contain" />
                            <button
                              type="button"
                              onClick={() => setGuarantorSignature('')}
                              className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 text-xs"
                              title="Clear signature"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setShowGuarantorSignaturePad(true)}
                              className="flex-1 py-2 px-3 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium"
                            >
                              Redraw
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center space-y-3">
                          <PenTool size={24} className="text-slate-400 mx-auto" />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setShowGuarantorSignaturePad(true)}
                              className="flex-1 py-2 px-3 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-xs font-medium"
                            >
                              Draw Signature
                            </button>
                            <label className="flex-1 py-2 px-3 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 text-xs font-medium cursor-pointer">
                              Upload File
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (evt) => {
                                      setGuarantorSignature(evt.target?.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="surface-2 px-6 py-4 flex justify-end gap-2 border-t border-base sticky bottom-0">
              <button onClick={() => {
                setShowHandoverModal(null);
                setImei1('');
                setImei2('');
                setCustomerSignature('');
                setGuarantorSignature('');
              }} className="btn-secondary py-1.5 px-4 rounded-xl text-base-secondary font-medium">Cancel</button>
              <button
                onClick={handleConfirmHandover}
                disabled={!imei1.trim() || !customerSignature || (showHandoverModal?.guarantor_id && !guarantorSignature) || handoverMutation.isPending}
                className="btn bg-green-600 hover:bg-green-700 text-white py-1.5 px-5 rounded-xl font-bold flex items-center gap-1.5 disabled:opacity-40"
              >
                {handoverMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                Handover & Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="surface rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-base">
            <div className="panel-header px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><Receipt size={19} /> Installment Invoice</h3>
              <button onClick={() => setShowInvoiceModal(null)} className="text-base-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 max-h-[70vh] overflow-y-auto font-sans" id="printable-invoice">
              <div className="border border-base rounded-2xl p-6 surface space-y-6">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center font-black text-slate-900 text-sm">AV</div>
                    <div>
                      <div className="font-black text-lg text-slate-900">AIRVOICE (PVT) LTD</div>
                      <div className="text-xs text-base-muted">Defence Finance Division · Colombo, Sri Lanka</div>
                      <div className="text-xs text-base-muted">finance@airvoice.lk · +94 11 234 5678</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Installment Agreement</div>
                    <div className="font-bold text-slate-900 text-lg">{showInvoiceModal.ref_number || showInvoiceModal.id}</div>
                    <div className="text-xs text-base-muted mt-1">Date: {new Date(showInvoiceModal.handover_date || showInvoiceModal.created_at).toLocaleDateString()}</div>
                  </div>
                </div>

                {/* Parties */}
                <div className="grid grid-cols-2 gap-8 surface-2 p-4 rounded-xl border border-base text-xs">
                  <div>
                    <div className="font-black text-[10px] uppercase text-slate-400 tracking-wider mb-2">Customer (Buyer)</div>
                    <div className="font-bold text-slate-900 text-sm">{showInvoiceModal.customer?.full_name}</div>
                    <div className="text-gray-600 mt-1 space-y-1">
                      <div>Rank: {showInvoiceModal.customer?.rank} · {showInvoiceModal.customer?.branch?.toUpperCase()}</div>
                      <div>Service No: {showInvoiceModal.customer?.service_number}</div>
                      <div>NIC: {showInvoiceModal.customer?.nic_number}</div>
                      <div>Phone: {showInvoiceModal.customer?.phone_number || '—'}</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-black text-[10px] uppercase text-slate-400 tracking-wider mb-2">Guarantor</div>
                    <div className="font-bold text-slate-900 text-sm">{showInvoiceModal.guarantor?.full_name || 'Not Assigned'}</div>
                    {showInvoiceModal.guarantor && (
                      <div className="text-gray-600 mt-1 space-y-1">
                        <div>NIC: {showInvoiceModal.guarantor?.nic_number || '—'}</div>
                        <div>Phone: {showInvoiceModal.guarantor?.phone_number || '—'}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Device Details */}
                <div className="bg-slate-900 text-white rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Device Details</div>
                  <div className="font-bold text-base mt-1">{showInvoiceModal.phone_model?.brand} {showInvoiceModal.phone_model?.model}</div>
                  <div className="text-xs text-slate-300 font-mono mt-1">IMEI 1: {showInvoiceModal.phone?.imei_1 || 'Pending'} {showInvoiceModal.phone?.imei_2 ? ` · IMEI 2: ${showInvoiceModal.phone?.imei_2}` : ''}</div>
                </div>

                {/* Pricing Table */}
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-base text-slate-400 text-xs font-bold uppercase tracking-wider">
                      <th className="py-2">Description</th>
                      <th className="py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-slate-800">
                    <tr className="py-3">
                      <td className="py-3">Monthly Installment (Deducted from salary)</td>
                      <td className="py-3 font-semibold">{fmtLKR(showInvoiceModal.monthly_amount)} / mo</td>
                    </tr>
                    <tr>
                      <td className="py-3">Term Duration</td>
                      <td className="py-3">{showInvoiceModal.term_months} Months</td>
                    </tr>
                    <tr className="font-bold text-slate-900 text-base bg-slate-50 border-t-2 border-slate-900">
                      <td className="py-3.5 px-3">Total Amount Payable</td>
                      <td className="py-3.5 px-3">{fmtLKR(showInvoiceModal.monthly_amount * showInvoiceModal.term_months)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="surface-2 px-6 py-4 flex justify-end gap-2 border-t border-base">
              <button onClick={() => window.print()} className="btn-secondary py-1.5 px-4 rounded-xl flex items-center gap-2">
                <Printer size={16} /> Print
              </button>
              <button onClick={() => setShowInvoiceModal(null)} className="btn-secondary py-1.5 px-4 rounded-xl text-base-secondary font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Agreement Modal */}
      {showAgreementModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="surface rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border border-base">
            <div className="panel-header px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><ScrollText size={19} /> Military Installment Sale Agreement</h3>
              <button onClick={() => setShowAgreementModal(null)} className="text-base-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 max-h-[70vh] overflow-y-auto text-slate-800 text-sm leading-relaxed space-y-6" style={{ fontFamily: 'Georgia, serif' }}>
              <div className="text-center space-y-1">
                <div className="font-bold text-xl uppercase tracking-wider">AIRVOICE (PVT) LTD</div>
                <div className="text-xs text-base-muted">Defence Finance Division · Registered in Sri Lanka</div>
                <div className="font-bold text-base uppercase tracking-widest pt-4">Installment Sale Agreement</div>
                <div className="text-xs text-base-muted">Agreement No: {showAgreementModal.ref_number || showAgreementModal.id}</div>
              </div>

              <div className="space-y-4">
                <p>This Installment Sale Agreement ("Agreement") is entered into between:</p>
                <div className="p-3 surface-2 rounded border border-base">
                  <strong>SELLER:</strong> AIRVOICE (PVT) LTD, Colombo, Sri Lanka.
                </div>
                <div className="p-3 surface-2 rounded border border-base">
                  <strong>BUYER:</strong> {showAgreementModal.customer?.full_name || 'Customer Name Not Available'}, {showAgreementModal.customer?.rank || 'Rank Not Available'}, Service No: {showAgreementModal.customer?.service_number || '—'}, NIC: {showAgreementModal.customer?.nic_number || showAgreementModal.customer?.new_nic_number || '—'}, serving at {showAgreementModal.customer?.camp?.name || '—'}.
                </div>
                <div className="p-3 surface-2 rounded border border-base">
                  <strong>GUARANTOR:</strong> {showAgreementModal.guarantor?.full_name || showAgreementModal.guarantor_name || 'Not Assigned'}{showAgreementModal.guarantor?.nic_number ? `, NIC: ${showAgreementModal.guarantor.nic_number}` : ''}.
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold border-b border-base pb-1">1. GOODS & PAYMENT TERMS</h4>
                <p>
                  1.1 The Customer agrees to purchase and take delivery of the device: <strong>{showAgreementModal.phone_model?.brand || showAgreementModal.phone_brand || 'Device'} {showAgreementModal.phone_model?.model || showAgreementModal.phone_model_name || ''}</strong> (IMEI 1: {showAgreementModal.phone?.imei_1 || showAgreementModal.imei_1 || 'Pending'}{showAgreementModal.phone?.imei_2 || showAgreementModal.imei_2 ? `, IMEI 2: ${showAgreementModal.phone?.imei_2 || showAgreementModal.imei_2}` : ''}).
                </p>
                <p>
                  1.2 The Customer agrees to pay the total sum of <strong>{fmtLKR((Number(showAgreementModal.monthly_amount) || 0) * (Number(showAgreementModal.term_months) || 0))}</strong> in <strong>{showAgreementModal.term_months}</strong> consecutive monthly installments of <strong>{fmtLKR(showAgreementModal.monthly_amount)}</strong>.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold border-b border-base pb-1">2. DIRECT SALARY DEDUCTIONS</h4>
                <p>
                  2.1 The monthly installments shall be deducted directly from the Customer's salary via the commanding payroll system at their assigned base or camp.
                </p>
                <p>
                  2.2 Deductions will be executed automatically on or before the 25th day of each calendar month.
                </p>
              </div>
            </div>
            <div className="surface-2 px-6 py-4 flex justify-end gap-2 border-t border-base">
              <button onClick={() => window.print()} className="btn-secondary py-1.5 px-4 rounded-xl flex items-center gap-2">
                <Printer size={16} /> Print
              </button>
              <button onClick={() => setShowAgreementModal(null)} className="btn-secondary py-1.5 px-4 rounded-xl text-base-secondary font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Composer Modal */}
      {showWAModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="surface rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-base">
            <div className="panel-header px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><MessageCircle size={19} /> Send WhatsApp Notice</h3>
              <button onClick={() => setShowWAModal(null)} className="text-base-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label font-bold text-xs text-gray-600">Phone Number</label>
                <input
                  type="text"
                  value={showWAModal.phone}
                  readOnly
                  className="form-input surface-2 font-mono mt-1"
                />
              </div>
              <div>
                <label className="form-label font-bold text-xs text-gray-600">Message Template</label>
                <textarea
                  rows={4}
                  value={waMessage}
                  onChange={e => setWaMessage(e.target.value)}
                  className="form-input surface mt-1 text-sm"
                />
              </div>
            </div>
            <div className="surface-2 px-6 py-4 flex justify-end gap-2 border-t border-base">
              <button onClick={() => setShowWAModal(null)} className="btn-secondary py-1.5 px-4 rounded-xl text-base-secondary font-medium">Cancel</button>
              <button
                onClick={() => {
                  const cleanedPhone = showWAModal.phone.replace(/[^0-9]/g, '');
                  window.open(`https://wa.me/${cleanedPhone}?text=${encodeURIComponent(waMessage)}`, '_blank');
                  setShowWAModal(null);
                }}
                className="btn bg-green-600 hover:bg-green-700 text-white py-1.5 px-5 rounded-xl font-bold flex items-center gap-1.5"
              >
                Send Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {cameraActiveFor && (
        <CameraModal
          onClose={() => setCameraActiveFor(null)}
          onCapture={(file) => {
            setSelectedFiles(prev => ({
              ...prev,
              [cameraActiveFor]: file
            }));
            setCameraActiveFor(null);
          }}
          facingMode={cameraActiveFor === 'selfie' ? 'user' : 'environment'}
          label={cameraActiveFor === 'nic_front' ? 'NIC Front' : cameraActiveFor === 'nic_back' ? 'NIC Back' : 'Selfie'}
        />
      )}
      
      {/* IMEI Camera Capture Modal */}
      {cameraActiveForImei && (
        <CameraModal
          onClose={() => setCameraActiveForImei(null)}
          onCapture={(file) => {
            // For IMEI, we could implement OCR here in the future
            // For now, we'll just store the file and let user manually enter IMEI
            // This serves as a visual reference when scanning the device
            setCameraActiveForImei(null);
          }}
          facingMode="environment"
          label={cameraActiveForImei === 'imei_1' ? 'Scan IMEI 1' : 'Scan IMEI 2'}
        />
      )}

      {/* Customer Signature Pad Modal */}
      {showCustomerSignaturePad && (
        <SignatureModal
          title="Draw Customer Signature"
          onClose={() => setShowCustomerSignaturePad(false)}
          onSave={(signatureData) => {
            setCustomerSignature(signatureData);
            setShowCustomerSignaturePad(false);
          }}
        />
      )}

      {/* Guarantor Signature Pad Modal */}
      {showGuarantorSignaturePad && (
        <SignatureModal
          title="Draw Guarantor Signature"
          onClose={() => setShowGuarantorSignaturePad(false)}
          onSave={(signatureData) => {
            setGuarantorSignature(signatureData);
            setShowGuarantorSignaturePad(false);
          }}
        />
      )}
    </div>
  );
}