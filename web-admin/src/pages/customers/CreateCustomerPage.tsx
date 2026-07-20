import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api, customersApi } from '@/services/api';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';

interface Regiment {
  id: string;
  name: string;
  name_si?: string;
  name_ta?: string;
  branch: string;
  is_active: boolean;
}

interface Camp {
  id: string;
  name: string;
  name_si?: string;
  name_ta?: string;
  branch: string;
  is_active: boolean;
  regiments?: Regiment[];
}

export default function CreateCustomerPage() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [formData, setFormData] = useState({
    full_name: '',
    full_name_si: '',
    full_name_ta: '',
    nic_number: '',
    date_of_birth: '',
    gender: 'male',
    branch: 'army',
    service_number: '',
    military_id_number: '',
    rank: '',
    camp_id: '',
    regiment_id: '',
    retirement_date: '',
    phone_number: '',
    email: '',
    address: '',
  });

  // Fetch all active camps
  const { data: campsData, isLoading: isLoadingCamps } = useQuery({
    queryKey: ['camps-list'],
    queryFn: () => api.get('/camps').then(r => r.data.data as Camp[]),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      // Clean up optional fields if empty string
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      );
      return customersApi.create(payload);
    },
    onSuccess: (res) => {
      const createdId = res.data?.data?.id;
      if (createdId) {
        navigate(`/customers/${createdId}`);
      } else {
        navigate('/customers');
      }
    },
    onError: (err: any) => {
      const respData = err.response?.data;
      if (respData?.details?.fieldErrors) {
        setFieldErrors(respData.details.fieldErrors);
        setErrorMsg('Please correct the highlighted errors.');
      } else {
        setErrorMsg(respData?.message || respData?.error || 'Failed to create customer');
        setFieldErrors({});
      }
    },
  });

  const handleBranchChange = (branch: string) => {
    setFormData(prev => ({
      ...prev,
      branch,
      camp_id: '',
      regiment_id: '',
    }));
  };

  const handleCampChange = (campId: string) => {
    setFormData(prev => ({
      ...prev,
      camp_id: campId,
      regiment_id: '',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});

    // Simple frontend validation
    if (!formData.full_name.trim()) {
      setErrorMsg('Full Name is required');
      return;
    }
    if (!formData.rank.trim()) {
      setErrorMsg('Rank is required');
      return;
    }

    createMutation.mutate(formData);
  };

  // Filter camps by selected branch
  const filteredCamps = campsData?.filter(c => c.branch === formData.branch && c.is_active) || [];

  // Filter regiments by selected camp
  const selectedCampObj = campsData?.find(c => c.id === formData.camp_id);
  const filteredRegiments = selectedCampObj?.regiments?.filter(r => r.is_active) || [];

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/customers" className="text-base-muted hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-base-primary">New Customer</h1>
          <p className="text-sm text-base-muted mt-1">Add a new military customer to the system</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Military Details */}
        <div className="card p-5 space-y-4">
          <h3 className="text-base font-semibold text-base-primary border-b border-base pb-2">
            Service & Military Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Branch *</label>
              <select
                className="form-input capitalize"
                value={formData.branch}
                onChange={e => handleBranchChange(e.target.value)}
              >
                <option value="army">Army</option>
                <option value="navy">Navy</option>
                <option value="air_force">Air Force</option>
              </select>
            </div>

            <div>
              <label className="form-label">Camp</label>
              <select
                className="form-input"
                value={formData.camp_id}
                onChange={e => handleCampChange(e.target.value)}
                disabled={isLoadingCamps}
              >
                <option value="">Select Camp</option>
                {filteredCamps.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Regiment</label>
              <select
                className="form-input"
                value={formData.regiment_id}
                onChange={e => setFormData(p => ({ ...p, regiment_id: e.target.value }))}
                disabled={!formData.camp_id}
              >
                <option value="">Select Regiment</option>
                {filteredRegiments.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Rank *</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.rank ? 'border-red-500' : ''}`}
                placeholder="e.g. Sergeant"
                value={formData.rank}
                onChange={e => setFormData(p => ({ ...p, rank: e.target.value }))}
                required
              />
              {fieldErrors.rank && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.rank[0]}</span>
              )}
            </div>

            <div>
              <label className="form-label">Service Number</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.service_number ? 'border-red-500' : ''}`}
                placeholder="e.g. S/12345"
                value={formData.service_number}
                onChange={e => setFormData(p => ({ ...p, service_number: e.target.value }))}
              />
              {fieldErrors.service_number && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.service_number[0]}</span>
              )}
            </div>

            <div>
              <label className="form-label">Military ID Number</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.military_id_number ? 'border-red-500' : ''}`}
                value={formData.military_id_number}
                onChange={e => setFormData(p => ({ ...p, military_id_number: e.target.value }))}
              />
              {fieldErrors.military_id_number && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.military_id_number[0]}</span>
              )}
            </div>

            <div>
              <label className="form-label">Retirement Date</label>
              <input
                type="date"
                className={`form-input ${fieldErrors.retirement_date ? 'border-red-500' : ''}`}
                value={formData.retirement_date}
                onChange={e => setFormData(p => ({ ...p, retirement_date: e.target.value }))}
              />
              {fieldErrors.retirement_date && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.retirement_date[0]}</span>
              )}
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <div className="card p-5 space-y-4">
          <h3 className="text-base font-semibold text-base-primary border-b border-base pb-2">
            Personal & Contact Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.full_name ? 'border-red-500' : ''}`}
                placeholder="Full Name"
                value={formData.full_name}
                onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
                required
              />
              {fieldErrors.full_name && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.full_name[0]}</span>
              )}
            </div>

            <div>
              <label className="form-label">Name with Initials</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. A.B.C. Perera"
                value={formData.full_name_si}
                onChange={e => setFormData(p => ({ ...p, full_name_si: e.target.value }))}
              />
            </div>



            <div>
              <label className="form-label">NIC Number</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.nic_number ? 'border-red-500' : ''}`}
                placeholder="e.g. 199012345678 or 901234567V"
                value={formData.nic_number}
                onChange={e => setFormData(p => ({ ...p, nic_number: e.target.value }))}
              />
              {fieldErrors.nic_number && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.nic_number[0]}</span>
              )}
            </div>

            <div>
              <label className="form-label">Date of Birth</label>
              <input
                type="date"
                className={`form-input ${fieldErrors.date_of_birth ? 'border-red-500' : ''}`}
                value={formData.date_of_birth}
                onChange={e => setFormData(p => ({ ...p, date_of_birth: e.target.value }))}
              />
              {fieldErrors.date_of_birth && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.date_of_birth[0]}</span>
              )}
            </div>

            <div>
              <label className="form-label">Gender</label>
              <select
                className="form-input"
                value={formData.gender}
                onChange={e => setFormData(p => ({ ...p, gender: e.target.value }))}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className={`form-input ${fieldErrors.phone_number ? 'border-red-500' : ''}`}
                placeholder="+94XXXXXXXXX"
                value={formData.phone_number}
                onChange={e => setFormData(p => ({ ...p, phone_number: e.target.value }))}
              />
              <span className="text-xs text-base-muted mt-1 block">Must start with +94 followed by 9 digits</span>
              {fieldErrors.phone_number && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.phone_number[0]}</span>
              )}
            </div>

            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                className={`form-input ${fieldErrors.email ? 'border-red-500' : ''}`}
                placeholder="email@example.com"
                value={formData.email}
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
              />
              {fieldErrors.email && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.email[0]}</span>
              )}
            </div>

            <div className="md:col-span-3">
              <label className="form-label">Address</label>
              <textarea
                rows={3}
                className={`form-input ${fieldErrors.address ? 'border-red-500' : ''}`}
                value={formData.address}
                onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
              />
              {fieldErrors.address && (
                <span className="text-xs text-red-500 mt-1 block">{fieldErrors.address[0]}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {createMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Create Customer
          </button>
          <Link to="/customers" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
