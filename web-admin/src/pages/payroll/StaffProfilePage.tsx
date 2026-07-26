import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollApi } from '@/services/api';
import {
  ArrowLeft, Camera, User, Phone, Mail, MapPin, Calendar,
  Briefcase, Building2, CreditCard, Shield, Save, Edit2,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Upload,
  DollarSign, Percent, Hash, Clock, UserCheck
} from 'lucide-react';

interface StaffProfile {
  id: string;
  user_id?: string | null;
  full_name: string;
  nic_number?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  date_of_birth?: string;
  designation: string;
  department?: string;
  joined_date?: string;
  basic_salary: number;
  transport_allow: number;
  meal_allow: number;
  commission_rate: number;
  epf_no?: string;
  etf_no?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_branch?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  profile_photo_url?: string;
  is_active: boolean;
  created_at?: string;
}

type EditForm = Omit<StaffProfile, 'id' | 'created_at'>;

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: 'var(--accent-primary)' }}>{icon}</span>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value?: string | number | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <span className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-sm font-medium" style={{ color: value !== null && value !== undefined && value !== '' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {value !== null && value !== undefined && value !== '' ? String(value) : '—'}
        </p>
      </div>
    </div>
  );
}

function InputField({
  label, value, onChange, type = 'text', placeholder, icon
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg text-sm py-2 transition-colors focus:outline-none"
          style={{
            paddingLeft: icon ? '2.25rem' : '0.75rem',
            paddingRight: '0.75rem',
            backgroundColor: 'var(--bg-surface-2)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
        />
      </div>
    </div>
  );
}

export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const { data: res, isLoading, error } = useQuery({
    queryKey: ['payroll-staff-profile', id],
    queryFn: () => payrollApi.getStaff(id!).then(r => r.data),
    enabled: !!id,
  });
  const staff: StaffProfile | null = res?.data ?? null;

  useEffect(() => {
    if (staff && !isEditing) {
      setEditForm({
        full_name: staff.full_name ?? '',
        nic_number: staff.nic_number ?? '',
        phone_number: staff.phone_number ?? '',
        email: staff.email ?? '',
        address: staff.address ?? '',
        date_of_birth: staff.date_of_birth ? staff.date_of_birth.split('T')[0] : '',
        designation: staff.designation ?? '',
        department: staff.department ?? '',
        joined_date: staff.joined_date ? staff.joined_date.split('T')[0] : '',
        basic_salary: staff.basic_salary ?? 0,
        transport_allow: staff.transport_allow ?? 0,
        meal_allow: staff.meal_allow ?? 0,
        commission_rate: staff.commission_rate ?? 0,
        epf_no: staff.epf_no ?? '',
        etf_no: staff.etf_no ?? '',
        bank_name: staff.bank_name ?? '',
        bank_account_no: staff.bank_account_no ?? '',
        bank_branch: staff.bank_branch ?? '',
        emergency_contact_name: staff.emergency_contact_name ?? '',
        emergency_contact_phone: staff.emergency_contact_phone ?? '',
        profile_photo_url: staff.profile_photo_url ?? '',
        user_id: staff.user_id ?? null,
        is_active: staff.is_active ?? true,
      });
    }
  }, [staff, isEditing]);

  const updateMutation = useMutation({
    mutationFn: (payload: unknown) => payrollApi.updateStaff(id!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-staff-profile', id] });
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      setIsEditing(false);
      setSaveMsg({ text: 'Profile updated successfully!', type: 'success' });
      setTimeout(() => setSaveMsg(null), 3000);
    },
    onError: () => {
      setSaveMsg({ text: 'Update failed. Please try again.', type: 'error' });
      setTimeout(() => setSaveMsg(null), 4000);
    },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile || !id) return;
    setUploadingPhoto(true);
    try {
      await payrollApi.uploadStaffPhoto(id, photoFile);
      qc.invalidateQueries({ queryKey: ['payroll-staff-profile', id] });
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      setPhotoFile(null);
      setPhotoPreview(null);
      setSaveMsg({ text: 'Photo updated successfully!', type: 'success' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      setSaveMsg({ text: err.response?.data?.error || 'Photo upload failed.', type: 'error' });
      setTimeout(() => setSaveMsg(null), 4000);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = () => {
    if (!editForm) return;
    updateMutation.mutate({
      full_name: editForm.full_name,
      nic_number: editForm.nic_number || undefined,
      phone_number: editForm.phone_number || undefined,
      email: editForm.email || undefined,
      address: editForm.address || undefined,
      date_of_birth: editForm.date_of_birth || undefined,
      designation: editForm.designation,
      department: editForm.department || undefined,
      joined_date: editForm.joined_date || undefined,
      basic_salary: Number(editForm.basic_salary),
      transport_allow: Number(editForm.transport_allow),
      meal_allow: Number(editForm.meal_allow),
      commission_rate: Number(editForm.commission_rate),
      epf_no: editForm.epf_no || undefined,
      etf_no: editForm.etf_no || undefined,
      bank_name: editForm.bank_name || undefined,
      bank_account_no: editForm.bank_account_no || undefined,
      bank_branch: editForm.bank_branch || undefined,
      emergency_contact_name: editForm.emergency_contact_name || undefined,
      emergency_contact_phone: editForm.emergency_contact_phone || undefined,
      is_active: editForm.is_active,
    });
  };

  const setField = <K extends keyof EditForm>(field: K, value: EditForm[K]) => {
    setEditForm(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const displayPhoto = photoPreview || staff?.profile_photo_url;
  const initials = staff?.full_name
    ? staff.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading staff profile...</p>
        </div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle size={28} style={{ color: '#ef4444' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Staff member not found</p>
          <button onClick={() => navigate('/payroll')} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            ← Back to Payroll
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/payroll')}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
          >
            <ArrowLeft size={14} />
            Payroll
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Staff Profile</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>View & manage staff member details</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {saveMsg && (
            <span className={`text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 ${saveMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {saveMsg.type === 'error' ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
              {saveMsg.text}
            </span>
          )}
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="text-sm px-4 py-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
              >
                {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Changes
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
            >
              <Edit2 size={14} />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Profile Hero Card */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, transparent 60%)' }} />
        <div className="relative flex items-start gap-6 flex-wrap">
          {/* Profile Photo */}
          <div className="relative shrink-0">
            <div
              className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-bold shadow-lg"
              style={{ background: displayPhoto ? undefined : 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white' }}
            >
              {displayPhoto ? (
                <img src={displayPhoto} alt={staff.full_name} className="w-full h-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <button
              onClick={() => photoInputRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center shadow-md transition-colors"
              title="Change profile photo"
            >
              <Camera size={13} className="text-white" />
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>

          {/* Identity Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{staff.full_name}</h2>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--accent-primary)' }}>{staff.designation}</p>
                {staff.department && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{staff.department}</p>}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 mt-1 ${staff.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${staff.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {staff.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {staff.phone_number && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}><Phone size={11} />{staff.phone_number}</span>}
              {staff.email && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}><Mail size={11} />{staff.email}</span>}
              {staff.nic_number && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}><Hash size={11} />NIC: {staff.nic_number}</span>}
              {staff.joined_date && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}><Clock size={11} />Joined: {new Date(staff.joined_date).toLocaleDateString()}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--accent-primary)' }}>
                Basic: LKR {Number(staff.basic_salary).toLocaleString()}
              </span>
              {Number(staff.transport_allow) > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                  Transport: LKR {Number(staff.transport_allow).toLocaleString()}
                </span>
              )}
              {Number(staff.meal_allow) > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                  Meal: LKR {Number(staff.meal_allow).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Photo upload action bar */}
        {photoFile && (
          <div className="mt-4 flex items-center gap-3 p-3 rounded-xl flex-wrap" style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px dashed rgba(59,130,246,0.3)' }}>
            <img src={photoPreview!} alt="preview" className="w-10 h-10 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{photoFile.name}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{(photoFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={handlePhotoUpload}
              disabled={uploadingPhoto}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
            >
              {uploadingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Upload Photo
            </button>
            <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} style={{ color: 'var(--text-muted)' }}>
              <XCircle size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Edit / View Mode */}
      {isEditing && editForm ? (
        <div className="space-y-5">
          {/* Personal */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <User size={15} style={{ color: 'var(--accent-primary)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Personal Information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Full Name *" value={editForm.full_name} onChange={v => setField('full_name', v)} icon={<User size={13} />} placeholder="Full name" />
              <InputField label="NIC Number" value={editForm.nic_number ?? ''} onChange={v => setField('nic_number', v)} icon={<Hash size={13} />} placeholder="National ID Number" />
              <InputField label="Phone Number" value={editForm.phone_number ?? ''} onChange={v => setField('phone_number', v)} icon={<Phone size={13} />} placeholder="+94 71 234 5678" />
              <InputField label="Email Address" value={editForm.email ?? ''} onChange={v => setField('email', v)} icon={<Mail size={13} />} type="email" placeholder="email@example.com" />
              <InputField label="Date of Birth" value={editForm.date_of_birth ?? ''} onChange={v => setField('date_of_birth', v)} icon={<Calendar size={13} />} type="date" />
              <div>
                <label className="block text-[11px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</label>
                <select
                  value={editForm.is_active ? 'active' : 'inactive'}
                  onChange={e => setField('is_active', e.target.value === 'active')}
                  className="w-full rounded-lg text-sm px-3 py-2 focus:outline-none"
                  style={{ backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <InputField label="Home Address" value={editForm.address ?? ''} onChange={v => setField('address', v)} icon={<MapPin size={13} />} placeholder="Full residential address" />
              </div>
            </div>
          </div>

          {/* Employment */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <Briefcase size={15} style={{ color: 'var(--accent-primary)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Employment Details</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Designation *" value={editForm.designation} onChange={v => setField('designation', v)} icon={<Briefcase size={13} />} placeholder="Job title / designation" />
              <InputField label="Department" value={editForm.department ?? ''} onChange={v => setField('department', v)} icon={<Building2 size={13} />} placeholder="Department name" />
              <InputField label="Joined Date" value={editForm.joined_date ?? ''} onChange={v => setField('joined_date', v)} icon={<Calendar size={13} />} type="date" />
              <InputField label="EPF Number" value={editForm.epf_no ?? ''} onChange={v => setField('epf_no', v)} icon={<Hash size={13} />} placeholder="EPF registration number" />
              <InputField label="ETF Number" value={editForm.etf_no ?? ''} onChange={v => setField('etf_no', v)} icon={<Hash size={13} />} placeholder="ETF registration number" />
            </div>
          </div>

          {/* Salary */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <DollarSign size={15} style={{ color: 'var(--accent-primary)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Salary & Allowances</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Basic Salary (LKR)" value={String(editForm.basic_salary)} onChange={v => setField('basic_salary', Number(v))} icon={<DollarSign size={13} />} type="number" placeholder="0" />
              <InputField label="Transport Allowance (LKR)" value={String(editForm.transport_allow)} onChange={v => setField('transport_allow', Number(v))} icon={<DollarSign size={13} />} type="number" placeholder="0" />
              <InputField label="Meal Allowance (LKR)" value={String(editForm.meal_allow)} onChange={v => setField('meal_allow', Number(v))} icon={<DollarSign size={13} />} type="number" placeholder="0" />
              <InputField label="Commission Rate (%)" value={String(editForm.commission_rate)} onChange={v => setField('commission_rate', Number(v))} icon={<Percent size={13} />} type="number" placeholder="0" />
            </div>
          </div>

          {/* Bank */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <CreditCard size={15} style={{ color: 'var(--accent-primary)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Bank Details</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Bank Name" value={editForm.bank_name ?? ''} onChange={v => setField('bank_name', v)} icon={<Building2 size={13} />} placeholder="e.g. Bank of Ceylon" />
              <InputField label="Account Number" value={editForm.bank_account_no ?? ''} onChange={v => setField('bank_account_no', v)} icon={<CreditCard size={13} />} placeholder="Account number" />
              <InputField label="Branch" value={editForm.bank_branch ?? ''} onChange={v => setField('bank_branch', v)} icon={<MapPin size={13} />} placeholder="Branch name" />
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <Shield size={15} style={{ color: 'var(--accent-primary)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Emergency Contact</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Contact Name" value={editForm.emergency_contact_name ?? ''} onChange={v => setField('emergency_contact_name', v)} icon={<User size={13} />} placeholder="Emergency contact name" />
              <InputField label="Contact Phone" value={editForm.emergency_contact_phone ?? ''} onChange={v => setField('emergency_contact_phone', v)} icon={<Phone size={13} />} placeholder="+94 71 234 5678" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <InfoCard title="Personal Information" icon={<User size={16} />}>
            <InfoRow label="Full Name" value={staff.full_name} icon={<User size={13} />} />
            <InfoRow label="NIC Number" value={staff.nic_number} icon={<Hash size={13} />} />
            <InfoRow label="Phone" value={staff.phone_number} icon={<Phone size={13} />} />
            <InfoRow label="Email" value={staff.email} icon={<Mail size={13} />} />
            <InfoRow label="Date of Birth" value={staff.date_of_birth ? new Date(staff.date_of_birth).toLocaleDateString() : null} icon={<Calendar size={13} />} />
            <InfoRow label="Address" value={staff.address} icon={<MapPin size={13} />} />
          </InfoCard>

          <InfoCard title="Employment Details" icon={<Briefcase size={16} />}>
            <InfoRow label="Designation" value={staff.designation} icon={<Briefcase size={13} />} />
            <InfoRow label="Department" value={staff.department} icon={<Building2 size={13} />} />
            <InfoRow label="Joined Date" value={staff.joined_date ? new Date(staff.joined_date).toLocaleDateString() : null} icon={<Calendar size={13} />} />
            <InfoRow label="EPF Number" value={staff.epf_no} icon={<Hash size={13} />} />
            <InfoRow label="ETF Number" value={staff.etf_no} icon={<Hash size={13} />} />
            <InfoRow label="System Account Linked" value={staff.user_id ? '✓ Linked' : 'Not linked'} icon={<UserCheck size={13} />} />
          </InfoCard>

          <InfoCard title="Salary & Allowances" icon={<DollarSign size={16} />}>
            <InfoRow label="Basic Salary" value={`LKR ${Number(staff.basic_salary).toLocaleString()}`} icon={<DollarSign size={13} />} />
            <InfoRow label="Transport Allowance" value={`LKR ${Number(staff.transport_allow).toLocaleString()}`} icon={<DollarSign size={13} />} />
            <InfoRow label="Meal Allowance" value={`LKR ${Number(staff.meal_allow).toLocaleString()}`} icon={<DollarSign size={13} />} />
            <InfoRow label="Commission Rate" value={`${staff.commission_rate}%`} icon={<Percent size={13} />} />
            <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <InfoRow
                label="Total Monthly Package"
                value={`LKR ${(Number(staff.basic_salary) + Number(staff.transport_allow) + Number(staff.meal_allow)).toLocaleString()}`}
                icon={<DollarSign size={13} />}
              />
            </div>
          </InfoCard>

          <InfoCard title="Bank Details" icon={<CreditCard size={16} />}>
            <InfoRow label="Bank Name" value={staff.bank_name} icon={<Building2 size={13} />} />
            <InfoRow label="Account Number" value={staff.bank_account_no} icon={<CreditCard size={13} />} />
            <InfoRow label="Branch" value={staff.bank_branch} icon={<MapPin size={13} />} />
          </InfoCard>

          <InfoCard title="Emergency Contact" icon={<Shield size={16} />}>
            <InfoRow label="Contact Name" value={staff.emergency_contact_name} icon={<User size={13} />} />
            <InfoRow label="Contact Phone" value={staff.emergency_contact_phone} icon={<Phone size={13} />} />
          </InfoCard>

          <InfoCard title="System Information" icon={<Clock size={16} />}>
            <InfoRow label="Staff ID" value={staff.id} icon={<Hash size={13} />} />
            <InfoRow
              label="Account Status"
              value={staff.is_active ? '● Active' : '● Inactive'}
              icon={<CheckCircle2 size={13} />}
            />
            {staff.created_at && (
              <InfoRow label="Record Created" value={new Date(staff.created_at).toLocaleDateString()} icon={<Calendar size={13} />} />
            )}
          </InfoCard>
        </div>
      )}
    </div>
  );
}
