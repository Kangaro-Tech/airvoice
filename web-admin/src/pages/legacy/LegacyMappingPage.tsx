import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ArrowRight, CheckCircle, Loader2, Info, Package } from 'lucide-react';

const DB_FIELDS = [
  // ── Customer ─────────────────────────────────────────────────
  { key: 'service_number', label: 'Service Number',       required: true  },
  { key: 'customer_name',  label: 'Customer Name',        required: true  },
  { key: 'mobile_number',  label: 'Mobile Number',        required: false },
  { key: 'nic_number',     label: 'NIC Number',           required: false },
  { key: 'address',        label: 'Address',              required: false },
  { key: 'unit',           label: 'Unit / Regiment',      required: false },
  { key: 'item_count',     label: 'Item Count / Phone Model', required: false },
  { key: 'monthly_amount', label: 'Monthly Amount (LKR)', required: true  },
  { key: 'term_months',    label: 'Term (Months)',        required: false },
  { key: 'sale_date',      label: 'Sale Date',            required: false },
  // ── 1st Guarantor ────────────────────────────────────────────
  { key: 'guarantor_service_number', label: '1st GU — Service No', required: false },
  { key: 'guarantor_name',           label: '1st GU — Name',       required: false },
  { key: 'guarantor_mobile',         label: '1st GU — Mobile No',  required: false },
  { key: 'guarantor_nic',            label: '1st GU — NIC No',     required: false },
  { key: 'guarantor_address',        label: '1st GU — Address',    required: false },
  { key: 'guarantor_unit',           label: '1st GU — Unit',       required: false },
  // ── 2nd Guarantor ────────────────────────────────────────────
  { key: 'guarantor2_name',    label: '2nd GU — Name',      required: false },
  { key: 'guarantor2_mobile',  label: '2nd GU — Mobile No', required: false },
  { key: 'guarantor2_nic',     label: '2nd GU — NIC No',    required: false },
  { key: 'guarantor2_address', label: '2nd GU — Address',   required: false },
  { key: 'guarantor2_unit',    label: '2nd GU — Unit',      required: false },
];

interface UploadResult {
  data: { id: string };
  detected_headers: string[];
  month_headers: string[];
  suggested_mapping: Record<string, string>;
}

export default function LegacyMappingPage() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const location   = useLocation();

  // Headers may arrive via navigation state (from upload page) or via API
  const stateResult = location.state?.uploadResult as UploadResult | null;

  // Fetch the batch if we don't have state (e.g. navigating directly from /legacy-import)
  const { data: batchResp } = useQuery({
    queryKey: ['legacy-batch', id],
    queryFn: () => api.get(`/legacy-import/${id}`).then(r => r.data),
    enabled: !stateResult,
  });

  // Fetch preview to get headers when we don't have them from upload state
  const { data: previewResp } = useQuery({
    queryKey: ['legacy-preview-headers', id],
    queryFn: () => api.get(`/legacy-import/${id}/preview`, { params: { limit: 1 } }).then(r => r.data),
    enabled: !stateResult,
  });

  const detectedHeaders: string[] = stateResult?.detected_headers
    ?? (previewResp?.data?.[0] ? Object.keys(previewResp.data[0].raw_data) : []);
  const monthHeaders: string[] = stateResult?.month_headers
    ?? previewResp?.month_columns ?? [];
  const suggested: Record<string, string> = stateResult?.suggested_mapping
    ?? (batchResp?.data?.column_mapping ?? {});

  const [mapping,    setMapping]    = useState<Record<string, string>>({});
  const [regiment,   setRegiment]   = useState('');
  const [period,     setPeriod]     = useState('');

  // Pre-fill mapping when data arrives
  useEffect(() => {
    if (Object.keys(suggested).length > 0 && Object.keys(mapping).length === 0) {
      setMapping(suggested);
    }
  }, [JSON.stringify(suggested)]); // eslint-disable-line

  const saveMutation = useMutation({
    mutationFn: () => api.post(`/legacy-import/${id}/mapping`, {
      column_mapping: mapping,
      sheet_regiment: regiment || undefined,
      sheet_period:   period   || undefined,
    }),
    onSuccess: () => navigate(`/legacy-import/${id}/preview`),
  });

  const requiredMapped = DB_FIELDS.filter(f => f.required).every(f => mapping[f.key]);

  // Fetch available phone models to check if item_count header matches one
  const { data: phoneModelsResp } = useQuery({
    queryKey: ['phone-models'],
    queryFn: () => api.get('/inventory/models').then(r => r.data?.data ?? []),
  });

  // Detect if the mapped item_count column header matches a real phone model name
  const detectedPhoneModel = useMemo(() => {
    const itemCountHeader = mapping['item_count'];
    if (!itemCountHeader || !phoneModelsResp) return null;
    return phoneModelsResp.find((m: { model: string; is_active: boolean }) =>
      m.is_active && m.model.toLowerCase().includes(itemCountHeader.toLowerCase())
    ) ?? null;
  }, [mapping['item_count'], phoneModelsResp]);

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Map Columns</h1>
      <p className="text-sm text-base-muted mb-6">
        Match each column in the Excel file to the correct database field.
        Suggestions are auto-filled from column names.
      </p>

      {/* Sheet info */}
      <div className="card p-5 mb-4">
        <h3 className="font-semibold mb-4 text-base-primary">Sheet Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Regiment / Unit Name</label>
            <input className="form-input" value={regiment} onChange={e => setRegiment(e.target.value)} placeholder="e.g. 7 ESR" />
          </div>
          <div>
            <label className="form-label">Period</label>
            <input className="form-input" value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. 2024-2025" />
          </div>
        </div>
      </div>

      {/* Column mapping */}
      <div className="card p-5 mb-4">
        <h3 className="font-semibold mb-4 text-base-primary">Column Mapping</h3>
        {detectedHeaders.length === 0 ? (
          <div className="flex items-center gap-2 text-amber-600 text-sm py-2">
            <Loader2 size={16} className="animate-spin" />
            Detecting columns from file…
          </div>
        ) : (
          <div className="space-y-3">
            {DB_FIELDS.map(field => (
              <div key={field.key} className="flex items-center gap-3">
                <div className="w-52 shrink-0">
                  <span className="text-sm font-medium text-base-secondary">{field.label}</span>
                  {field.required && <span className="text-red-500 ml-1 text-xs">*required</span>}
                </div>
                <ArrowRight size={14} className="text-gray-300 shrink-0" />
                <select
                  className="form-input flex-1"
                  value={mapping[field.key] || ''}
                  onChange={e => setMapping(m => ({ ...m, [field.key]: e.target.value }))}
                >
                  <option value="">— not mapped —</option>
                  {detectedHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                {mapping[field.key] && <CheckCircle size={16} className="text-green-500 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Month columns */}
      {monthHeaders.length > 0 && (
        <div className="card p-5 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-base-primary">Month Columns Auto-Detected ({monthHeaders.length})</h3>
            <Info size={14} className="text-base-muted" />
          </div>
          <p className="text-xs text-base-muted mb-3">
            These columns are automatically mapped to installment payment history. No action needed.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {monthHeaders.map(h => (
              <span key={h} className="badge bg-green-50 text-green-700 border border-green-200">{h}</span>
            ))}
          </div>
        </div>
      )}

      {/* Phone model detection banner */}
      {detectedPhoneModel && (
        <div className="mb-4 p-4 bg-green-50 border border-green-300 rounded-lg flex items-start gap-3">
          <Package size={18} className="text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-green-800 font-semibold text-sm">📱 Phone Model Auto-Detected: {detectedPhoneModel.model}</p>
            <p className="text-green-700 text-xs mt-0.5">
              When you import, the system will automatically assign available phones from stock to each customer
              and deduct them from your inventory. Customers without enough stock will be assigned a "Legacy Plan" fallback.
            </p>
          </div>
        </div>
      )}

      {!requiredMapped && detectedHeaders.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          Customer Name and Monthly Amount must be mapped before continuing.
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !requiredMapped}
          className="btn-primary disabled:opacity-50"
        >
          {saveMutation.isPending ? <><Loader2 size={16} className="animate-spin" />Saving…</> : 'Save & Preview'}
        </button>
        <button onClick={() => navigate('/legacy-import')} className="btn-secondary">Cancel</button>
      </div>
    </div>
  );
}
