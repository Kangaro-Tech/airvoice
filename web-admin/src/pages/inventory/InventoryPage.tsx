import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Package, Phone, Truck, AlertTriangle, Plus, Search,
  Loader2, CheckCircle2, XCircle, Download, ScanLine,
  Check, X, Barcode, Hash, Info, Edit2, Send, Trash2, Pencil,
  Smartphone
} from 'lucide-react';

interface PhoneModel {
  id: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  sale_price: number;
  purchase_cost: number;
  in_stock: number;
  sold: number;
  is_active: boolean;
  description: string;
}

interface StockOrder {
  id: string;
  quantity: number;
  unit_price: number | null;
  status: 'pending' | 'approved' | 'ordered' | 'received' | 'cancelled';
  notes: string;
  created_at: string;
  model: { brand: string; model: string };
  supplier: { name: string } | null;
}

const ORDER_STATUS: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-blue-100 text-blue-700',
  ordered:   'bg-purple-100 text-purple-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

import { useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// ── Real WebCam Barcode Scanner Component ───────────────────────────
function BarcodeScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();
    let controls: any = null;

    if (videoRef.current) {
      codeReader.decodeFromVideoDevice(
        undefined, // default camera device
        videoRef.current,
        (result, err) => {
          if (result) {
            const text = result.getText();
            // Validate: IMEI is usually 14 or 15 digit number
            if (/^\d{14,15}$/.test(text)) {
              onScan(text);
              if (controls) controls.stop();
            }
          }
          if (err && !(err.name === 'NotFoundException')) {
            console.debug(err);
          }
        }
      ).then(c => {
        controls = c;
      }).catch(e => {
        console.error('Camera barcode scanner error:', e);
        setError('Failed to access camera for barcode scanning.');
      });
    }

    return () => {
      if (controls) {
        controls.stop();
      }
    };
  }, [onScan]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center">
      <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wider">Live Barcode Scan</h4>
      {error ? (
        <p className="text-xs text-red-500 font-semibold">{error}</p>
      ) : (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black border border-slate-700">
          <video ref={videoRef} className="w-full h-full object-cover" />
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 animate-pulse" />
        </div>
      )}
      <button type="button" onClick={onClose} className="mt-3 text-xs text-slate-400 hover:text-white border border-slate-700 px-3 py-1 rounded-lg">
        Cancel Scan
      </button>
    </div>
  );
}

// ── Add Device Modal ───────────────────────────────────────────
function AddDeviceModal({ models, onClose, onSuccess }: {
  models: PhoneModel[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    brand: 'Samsung',
    model: '',
    imei_1: '',
    imei_2: '',
    purchase_cost: '',
    sale_price: '',
    warranty: '12',
    storage: '',
    color: '',
    supplier: '',
    stock_location: 'Colombo HQ',
  });
  const [scanning, setScanning] = useState<'imei1' | 'imei2' | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleScanSuccess = (text: string) => {
    if (scanning === 'imei1') setForm(f => ({ ...f, imei_1: text }));
    if (scanning === 'imei2') setForm(f => ({ ...f, imei_2: text }));
    setScanning(null);
  };

  const submit = async () => {
    if (!form.brand || !form.model) { setError('Brand and Model Name are required.'); return; }
    if (!form.imei_1 || form.imei_1.length < 14) { setError('IMEI 1 must be at least 14 digits.'); return; }
    setError('');
    setSubmitting(true);
    
    try {
      // 1. Find or create the model
      let targetModelId = models.find(
        m => m.brand.toLowerCase() === form.brand.toLowerCase() && 
             m.model.toLowerCase() === form.model.toLowerCase() &&
             (m.storage || '') === form.storage && 
             (m.color || '') === form.color
      )?.id;

      if (!targetModelId) {
        // Create new model
        const { data: newModelRes } = await api.post('/inventory/models', {
          brand: form.brand,
          model: form.model,
          storage: form.storage || undefined,
          color: form.color || undefined,
          sale_price: parseFloat(form.sale_price) || 0,
          purchase_cost: parseFloat(form.purchase_cost) || undefined,
          specs: {
            warranty_months: form.warranty
          }
        });
        targetModelId = newModelRes.data.id;
      }

      // 2. Add the physical device
      await api.post('/phones', {
        model_id: targetModelId,
        imei_1: form.imei_1,
        ...(form.imei_2 ? { imei_2: form.imei_2 } : {}),
        ...(form.purchase_cost ? { purchase_cost: parseFloat(form.purchase_cost) } : {}),
        notes: form.supplier ? `Supplier: ${form.supplier}` : undefined,
        status: 'in_stock',
        stock_location: form.stock_location,
      });

      onSuccess();
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add device';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="surface rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#0f172a] text-white flex items-center justify-between px-6 py-4">
          <h3 className="font-bold text-lg tracking-tight">Add Device to Inventory</h3>
          <button onClick={onClose} className="text-base-muted hover:text-white transition bg-[#1e293b] p-1.5 rounded-lg border border-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[85vh]">
          {/* Info Banner */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
            <Info size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-800 mb-0.5">IMEI from supplier invoice</p>
              <p className="text-xs text-slate-500 leading-relaxed">Enter IMEI numbers from the supplier delivery note or device packaging. Final IMEI is confirmed again at customer handover.</p>
            </div>
          </div>

          {/* Scanner Overlay */}
          {scanning && (
            <div className="mb-4 rounded-xl overflow-hidden border-2 border-slate-800">
              <BarcodeScanner onScan={handleScanSuccess} onClose={() => setScanning(null)} />
            </div>
          )}

          {/* Form Grid */}
          <div className="grid grid-cols-12 gap-x-6 gap-y-5">
            {/* Brand */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Brand</label>
              <select
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
              >
                <option value="Samsung">Samsung</option>
                <option value="Apple">Apple</option>
                <option value="Xiaomi">Xiaomi</option>
                <option value="Vivo">Vivo</option>
                <option value="Oppo">Oppo</option>
                <option value="Nokia">Nokia</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Model Name */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Model Name</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. Galaxy A55 5G"
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              />
            </div>

            {/* IMEI 1 */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">IMEI 1 (Required)</label>
              <div className="relative">
                <input
                  className="w-full border border-base rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 font-mono placeholder-slate-400 text-slate-700 transition"
                  placeholder="357891234567890"
                  maxLength={15}
                  value={form.imei_1}
                  onChange={e => setForm(f => ({ ...f, imei_1: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
                />
                <button
                  type="button"
                  onClick={() => setScanning('imei1')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1 rounded-md transition"
                  title="Scan barcode via webcam"
                >
                  <Barcode size={16} />
                </button>
              </div>
            </div>

            {/* IMEI 2 */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">IMEI 2 (Optional)</label>
              <div className="relative">
                <input
                  className="w-full border border-base rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 font-mono placeholder-slate-400 text-slate-700 transition"
                  placeholder="Dual SIM second IMEI"
                  maxLength={15}
                  value={form.imei_2}
                  onChange={e => setForm(f => ({ ...f, imei_2: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
                />
                <button
                  type="button"
                  onClick={() => setScanning('imei2')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1 rounded-md transition"
                  title="Scan barcode via webcam"
                >
                  <Barcode size={16} />
                </button>
              </div>
            </div>

            {/* Purchase Cost */}
            <div className="col-span-4">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Purchase Cost (LKR)</label>
              <input
                type="number"
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="0"
                value={form.purchase_cost}
                onChange={e => setForm(f => ({ ...f, purchase_cost: e.target.value }))}
              />
            </div>

            {/* Sale Price */}
            <div className="col-span-4">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Sale Price (LKR)</label>
              <input
                type="number"
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="0"
                value={form.sale_price}
                onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
              />
            </div>
            
            {/* Warranty */}
            <div className="col-span-4">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Warranty (Months)</label>
              <select
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                value={form.warranty}
                onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
              >
                <option value="6">6</option>
                <option value="12">12</option>
                <option value="24">24</option>
              </select>
            </div>

            {/* Storage */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Storage</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. 128GB"
                value={form.storage}
                onChange={e => setForm(f => ({ ...f, storage: e.target.value }))}
              />
            </div>

            {/* Colour */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Colour</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. Midnight Black"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              />
            </div>

            {/* Supplier */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Supplier</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="Supplier company name"
                value={form.supplier}
                onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
              />
            </div>

            {/* Stock Location */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Stock Location</label>
              <select
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                value={form.stock_location}
                onChange={e => setForm(f => ({ ...f, stock_location: e.target.value }))}
              >
                <option value="Colombo HQ">Colombo HQ</option>
                <option value="Kandy Branch">Kandy Branch</option>
                <option value="Galle Branch">Galle Branch</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <XCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3 justify-end border-t border-base surface">
          <button onClick={onClose} className="px-5 py-2 border border-base rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 bg-[#0f172a] text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition shadow-sm flex items-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {submitting ? 'Adding…' : 'Add to Stock'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Edit Model Modal ──────────────────────────────────────────
function EditModelModal({ model, onClose, onSuccess }: {
  model: PhoneModel;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    brand:       model.brand,
    model:       model.model,
    storage:     model.storage || '',
    color:       model.color || '',
    sale_price:  String(model.sale_price || ''),
    description: model.description || '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.brand || !form.model) { setError('Brand and Model are required.'); return; }
    setError(''); setSubmitting(true);
    try {
      await api.patch(`/inventory/models/${model.id}`, {
        brand:       form.brand,
        model:       form.model,
        storage:     form.storage || null,
        color:       form.color || null,
        sale_price:  parseFloat(form.sale_price) || undefined,
        description: form.description || null,
      });
      onSuccess(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to update model');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="surface rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#0f172a] text-white flex items-center justify-between px-6 py-4">
          <h3 className="font-bold text-lg tracking-tight">Edit Product</h3>
          <button onClick={onClose} className="text-base-muted hover:text-white transition bg-[#1e293b] p-1.5 rounded-lg border border-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[85vh]">
          {/* Info Banner */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
            <Info size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-800 mb-0.5">Editing shared model record</p>
              <p className="text-xs text-slate-500 leading-relaxed">Changes here will affect all physical devices linked to this model (sale price, storage, colour, etc.).</p>
            </div>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {/* Form Grid — same 12-col layout as Add Device */}
          <div className="grid grid-cols-12 gap-x-6 gap-y-5">

            {/* Brand */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Brand</label>
              <select
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
              >
                <option value="Samsung">Samsung</option>
                <option value="Apple">Apple</option>
                <option value="Xiaomi">Xiaomi</option>
                <option value="Vivo">Vivo</option>
                <option value="Oppo">Oppo</option>
                <option value="Nokia">Nokia</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Model Name */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Model Name</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. Galaxy A55 5G"
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              />
            </div>

            {/* Storage */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Storage</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. 128GB"
                value={form.storage}
                onChange={e => setForm(f => ({ ...f, storage: e.target.value }))}
              />
            </div>

            {/* Colour */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Colour</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. Midnight Black"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              />
            </div>

            {/* Sale Price */}
            <div className="col-span-12">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Sale Price (LKR)</label>
              <input
                type="number"
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 transition"
                placeholder="e.g. 125000"
                value={form.sale_price}
                onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div className="col-span-12">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Description</label>
              <textarea
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 resize-none text-slate-700 transition"
                rows={3}
                placeholder="Optional notes about this model..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-base surface-2 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50 transition">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2 transition"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Device Modal ─────────────────────────────────────────
function EditDeviceModal({ device, models, onClose, onSuccess }: {
  device: any;
  models: PhoneModel[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    brand:          device.model?.brand  || 'Samsung',
    model:          device.model?.model  || '',
    imei_1:         device.imei_1        || '',
    imei_2:         device.imei_2        || '',
    purchase_cost:  String(device.purchase_cost || ''),
    sale_price:     String(device.model?.sale_price || ''),
    warranty:       String(device.warranty_months || '12'),
    storage:        device.model?.storage || '',
    color:          device.model?.color   || '',
    supplier:       device.notes?.replace('Supplier: ', '') || '',
    stock_location: device.stock_location || 'Colombo HQ',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.imei_1 || form.imei_1.length < 14) { setError('IMEI 1 is required and must be at least 14 digits.'); return; }
    setError(''); setSubmitting(true);
    try {
      // Update physical device record
      await api.patch(`/phones/${device.id}`, {
        imei_1:         form.imei_1,
        imei_2:         form.imei_2 || null,
        stock_location: form.stock_location,
        purchase_cost:  parseFloat(form.purchase_cost) || undefined,
        warranty_months:parseInt(form.warranty) || undefined,
        ...(form.supplier ? { notes: `Supplier: ${form.supplier}` } : {}),
      });
      // Update phone model record (brand, model, storage, colour, sale price)
      if (device.model?.id) {
        await api.patch(`/inventory/models/${device.model.id}`, {
          brand:      form.brand      || undefined,
          model:      form.model      || undefined,
          storage:    form.storage    || undefined,
          color:      form.color      || undefined,
          sale_price: parseFloat(form.sale_price) || undefined,
        });
      }
      onSuccess(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to update device');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="surface rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#0f172a] text-white flex items-center justify-between px-6 py-4">
          <h3 className="font-bold text-lg tracking-tight">Edit Device</h3>
          <button onClick={onClose} className="text-base-muted hover:text-white transition bg-[#1e293b] p-1.5 rounded-lg border border-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[85vh]">
          {/* Info Banner */}
          <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
            <Info size={18} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-800 mb-0.5">Editing device record</p>
              <p className="text-xs text-slate-500 leading-relaxed">Changes to Brand, Model, Storage, Colour and Sale Price will update the shared model record and affect all devices of this model.</p>
            </div>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {/* Form Grid — same 12-col layout as Add Device */}
          <div className="grid grid-cols-12 gap-x-6 gap-y-5">

            {/* Brand */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Brand</label>
              <select
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
              >
                <option value="Samsung">Samsung</option>
                <option value="Apple">Apple</option>
                <option value="Xiaomi">Xiaomi</option>
                <option value="Vivo">Vivo</option>
                <option value="Oppo">Oppo</option>
                <option value="Nokia">Nokia</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Model Name */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Model Name</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. Galaxy A55 5G"
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              />
            </div>

            {/* IMEI 1 */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">IMEI 1 (Required)</label>
              <div className="relative">
                <input
                  className="w-full border border-base rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-300 text-slate-700 transition"
                  placeholder="357891234567890"
                  maxLength={15}
                  value={form.imei_1}
                  onChange={e => setForm(f => ({ ...f, imei_1: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
                />
              </div>
            </div>

            {/* IMEI 2 */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">IMEI 2 (Optional)</label>
              <div className="relative">
                <input
                  className="w-full border border-base rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-300 text-slate-700 transition"
                  placeholder="Dual SIM second IMEI"
                  maxLength={15}
                  value={form.imei_2}
                  onChange={e => setForm(f => ({ ...f, imei_2: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
                />
              </div>
            </div>

            {/* Purchase Cost */}
            <div className="col-span-4">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Purchase Cost (LKR)</label>
              <input
                type="number"
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 transition"
                placeholder="0"
                value={form.purchase_cost}
                onChange={e => setForm(f => ({ ...f, purchase_cost: e.target.value }))}
              />
            </div>

            {/* Sale Price */}
            <div className="col-span-4">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Sale Price (LKR)</label>
              <input
                type="number"
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 transition"
                placeholder="0"
                value={form.sale_price}
                onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
              />
            </div>

            {/* Warranty */}
            <div className="col-span-4">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Warranty (Months)</label>
              <select
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                value={form.warranty}
                onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
              >
                {['0','3','6','12','18','24'].map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            {/* Storage */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Storage</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. 128GB"
                value={form.storage}
                onChange={e => setForm(f => ({ ...f, storage: e.target.value }))}
              />
            </div>

            {/* Colour */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Colour</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="e.g. Midnight Black"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              />
            </div>

            {/* Supplier */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Supplier</label>
              <input
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 placeholder-slate-400 text-slate-700 transition"
                placeholder="Supplier name"
                value={form.supplier}
                onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
              />
            </div>

            {/* Stock Location */}
            <div className="col-span-6">
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Stock Location</label>
              <select
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 surface text-slate-700 transition"
                value={form.stock_location}
                onChange={e => setForm(f => ({ ...f, stock_location: e.target.value }))}
              >
                <option value="Colombo HQ">Colombo HQ</option>
                <option value="Kandy Branch">Kandy Branch</option>
                <option value="Galle Branch">Galle Branch</option>
              </select>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-base surface-2 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50 transition">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2 transition"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'models' | 'orders' | 'lowstock' | 'devices'>('models');
  const [search, setSearch] = useState('');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [editModel, setEditModel] = useState<PhoneModel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PhoneModel | null>(null);
  const [deleteError, setDeleteError] = useState('');
  
  const [editDevice, setEditDevice] = useState<any | null>(null);
  const [deleteDeviceConfirm, setDeleteDeviceConfirm] = useState<any | null>(null);
  const [deleteDeviceError, setDeleteDeviceError] = useState('');

  const [orderForm, setOrderForm] = useState({ model_id: '', quantity: '1', supplier: '', unit_price: '', justification: '', required_by_date: '' });

  const { data: modelsRes, isLoading: modelsLoading } = useQuery({
    queryKey: ['inventory-models'],
    queryFn: () => api.get('/inventory/models').then(r => r.data),
  });
  const models: PhoneModel[] = modelsRes?.data ?? [];

  const { data: ordersRes, isLoading: ordersLoading } = useQuery({
    queryKey: ['stock-orders'],
    queryFn: () => api.get('/inventory/stock-orders').then(r => r.data),
  });
  const orders: StockOrder[] = ordersRes?.data ?? [];

  const { data: lowStockRes } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then(r => r.data),
  });
  const lowStock: PhoneModel[] = lowStockRes?.data ?? [];

  const filteredModels = models.filter(m => {
    if (!search) return true;
    return `${m.brand} ${m.model}`.toLowerCase().includes(search.toLowerCase());
  });

  const createOrder = useMutation({
    mutationFn: (payload: object) => api.post('/inventory/stock-orders', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-orders'] });
      setShowOrderModal(false);
      setOrderForm({ model_id: '', quantity: '1', supplier: '', unit_price: '', justification: '', required_by_date: '' });
    },
  });

  const { data: phonesRes, isLoading: phonesLoading } = useQuery({
    queryKey: ['phones'],
    queryFn: () => api.get('/phones', { params: { limit: 100 } }).then(r => r.data),
    placeholderData: (prev) => prev,
  });
  const phones = phonesRes?.data || [];

  const updateOrderStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/inventory/stock-orders/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-orders'] }),
  });

  const deleteModel = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/models/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-models'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      setDeleteConfirm(null);
      setDeleteError('');
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.error ?? 'Failed to delete model');
    },
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => api.delete(`/phones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phones'] });
      qc.invalidateQueries({ queryKey: ['inventory-models'] });
      setDeleteDeviceConfirm(null);
      setDeleteDeviceError('');
    },
    onError: (err: any) => {
      setDeleteDeviceError(err?.response?.data?.error ?? 'Failed to delete device');
    },
  });

  const totalValue = models.reduce((s, m) => s + m.in_stock * m.sale_price, 0);
  const totalUnits = models.reduce((s, m) => s + m.in_stock, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Package size={28} className="text-[#2563ea]" /> Device Inventory
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            {totalUnits} units in stock · LKR {totalValue.toLocaleString()} total value
            {lowStock.length > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">⚠ {lowStock.length} models low stock</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const rows = models.map(m => [`${m.brand} ${m.model}`, m.storage, m.color, m.sale_price, m.in_stock, m.sold]);
              const csv = [['Model', 'Storage', 'Color', 'Price', 'In Stock', 'Sold'], ...rows].map(r => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'inventory.csv';
              a.click();
            }}
            className="flex items-center gap-2 px-3 py-2 border border-base rounded-lg text-sm hover:bg-[var(--bg-surface-2)]"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() => setShowAddDevice(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <ScanLine size={15} /> Add Device
          </button>
          <button
            onClick={() => setShowOrderModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            <Truck size={15} /> Stock Order
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Models', value: models.length, icon: Phone, color: 'text-blue-600' },
          { label: 'Units In Stock', value: totalUnits, icon: Package, color: 'text-green-600' },
          { label: 'Total Value', value: `LKR ${(totalValue / 1000).toFixed(0)}K`, icon: CheckCircle2, color: 'text-amber-600' },
          { label: 'Low Stock Alerts', value: lowStock.length, icon: AlertTriangle, color: 'text-red-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={18} className="text-[#2563ea]" />
              <span className="text-xs font-semibold uppercase tracking-wide text-base-muted">{label}</span>
            </div>
            <div className={`text-xl font-black ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-base">
        {[
          { id: 'models', label: 'Models & Pricing' },
          { id: 'devices', label: 'Physical Devices' },
          { id: 'orders', label: 'Stock Orders' },
          { id: 'lowstock', label: 'Low Stock Alerts' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === id ? 'border-amber-500 text-amber-600' : 'border-transparent text-base-muted hover:text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Models Tab */}
      {tab === 'models' && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border border-base rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Search models…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {modelsLoading ? (
            <div className="flex items-center justify-center py-12 text-base-muted">
              <Loader2 size={20} className="animate-spin mr-2" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {filteredModels.map(m => (
                <div key={m.id} className={`card p-5 ${m.in_stock < 5 ? 'border-amber-300' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1d4ed8] flex items-center justify-center">
                      <Phone size={18} className="text-white" />
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      m.in_stock === 0 ? 'bg-red-100 text-red-700' :
                      m.in_stock < 5 ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {m.in_stock === 0 ? 'Out of Stock' : `${m.in_stock} in stock`}
                    </span>
                  </div>
                  <div className="font-bold text-base-primary">{m.brand} {m.model}</div>
                  <div className="text-xs text-base-muted mt-0.5">{m.storage} · {m.color}</div>
                  <div className="mt-3 pt-3 border-t border-base flex items-center justify-between">
                    <div>
                      <div className="text-xs text-base-muted">Sale Price</div>
                      <div className="font-bold text-amber-600 font-mono">LKR {m.sale_price.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-base-muted">Sold</div>
                      <div className="font-semibold text-gray-600">{m.sold} units</div>
                    </div>
                  </div>
                  {/* Edit / Delete actions */}
                  <div className="mt-3 pt-3 border-t border-base flex gap-2">
                    <button
                      onClick={() => setEditModel(m)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg border border-base hover:bg-slate-50 transition-colors"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => { setDeleteConfirm(m); setDeleteError(''); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stock Orders Tab */}
      {tab === 'orders' && (
        <div className="card overflow-hidden">
          {ordersLoading ? (
            <div className="flex items-center justify-center py-12 text-base-muted">
              <Loader2 size={20} className="animate-spin mr-2" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-base-muted">
              <Truck size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No stock orders yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="surface-2 border-b border-base">
                  {['Model', 'Qty', 'Supplier', 'Unit Price', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-base-primary">
                      {o.model?.brand} {o.model?.model}
                    </td>
                    <td className="px-4 py-3 font-bold text-base-primary">{o.quantity}</td>
                    <td className="px-4 py-3 text-base-muted">{o.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-sm">{o.unit_price ? `LKR ${o.unit_price.toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${ORDER_STATUS[o.status]}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-base-muted text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {o.status === 'pending' && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => updateOrderStatus.mutate({ id: o.id, status: 'approved' })}
                            disabled={updateOrderStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 transition"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            onClick={() => updateOrderStatus.mutate({ id: o.id, status: 'cancelled' })}
                            disabled={updateOrderStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                      {o.status === 'approved' && (
                        <button
                          onClick={() => updateOrderStatus.mutate({ id: o.id, status: 'received' })}
                          disabled={updateOrderStatus.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition"
                        >
                          <CheckCircle2 size={12} /> Mark Received
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Devices Tab */}
      {tab === 'devices' && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border border-base rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Search IMEI or Model…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-surface-2)] text-base-muted border-b border-base">
                <tr>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Model</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">IMEI 1</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">IMEI 2</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {phones.filter((p: any) => 
                  p.imei_1.toLowerCase().includes(search.toLowerCase()) || 
                  p.model?.brand?.toLowerCase().includes(search.toLowerCase()) ||
                  p.model?.model?.toLowerCase().includes(search.toLowerCase())
                ).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-base-primary">{p.model?.brand} {p.model?.model}</div>
                      <div className="text-xs text-base-muted">{p.model?.storage}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{p.imei_1}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{p.imei_2 || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.status === 'in_stock' ? 'bg-green-100 text-green-700' :
                        p.status === 'allocated' ? 'bg-amber-100 text-amber-700' :
                        p.status === 'sold' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.stock_location || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditDevice(p)}
                          className="p-1.5 rounded-lg text-base-muted hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Edit Device"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => { setDeleteDeviceConfirm(p); setDeleteDeviceError(''); }}
                          className={`p-1.5 rounded-lg text-base-muted hover:text-red-600 hover:bg-red-50 transition-colors ${p.status !== 'in_stock' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={p.status === 'in_stock' ? 'Delete Device' : 'Cannot delete device unless in stock'}
                          disabled={p.status !== 'in_stock'}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Low Stock Tab */}
      {tab === 'lowstock' && (
        <div className="space-y-3">
          {lowStock.length === 0 ? (
            <div className="card py-12 text-center text-base-muted">
              <CheckCircle2 size={36} className="mx-auto mb-3 opacity-30 text-green-500" />
              <p className="text-sm font-medium text-green-600">All models adequately stocked</p>
            </div>
          ) : lowStock.map(m => (
            <div key={m.id} className="card p-4 border-amber-300 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-amber-600" />
                </div>
                <div>
                  <div className="font-semibold text-base-primary">{m.brand} {m.model}</div>
                  <div className="text-xs text-base-muted">{m.storage} · {m.color}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-black text-amber-600">{m.in_stock}</div>
                  <div className="text-xs text-base-muted">in stock</div>
                </div>
                <button
                  onClick={() => { setOrderForm(f => ({ ...f, model_id: m.id })); setShowOrderModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors"
                >
                  <Truck size={13} /> Order Stock
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Device Modal */}
      {showAddDevice && (
        <AddDeviceModal
          models={models}
          onClose={() => setShowAddDevice(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['inventory-models'] });
            qc.invalidateQueries({ queryKey: ['low-stock'] });
            qc.invalidateQueries({ queryKey: ['phones'] });
          }}
        />
      )}

      {/* Edit Model Modal */}
      {editModel && (
        <EditModelModal
          model={editModel}
          onClose={() => setEditModel(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['inventory-models'] });
          }}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <div className="font-bold text-base-primary">Delete Product?</div>
                <div className="text-xs text-base-muted mt-0.5">{deleteConfirm.brand} {deleteConfirm.model}</div>
              </div>
            </div>
            <p className="text-sm text-base-secondary mb-4">This will deactivate the product and it will no longer appear in lists. Existing records will not be affected.</p>
            {deleteError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{deleteError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setDeleteConfirm(null); setDeleteError(''); }} className="flex-1 py-2 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => deleteModel.mutate(deleteConfirm.id)}
                disabled={deleteModel.isPending}
                className="flex-1 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleteModel.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Device Modal */}
      {editDevice && (
        <EditDeviceModal
          device={editDevice}
          models={models}
          onClose={() => setEditDevice(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['phones'] });
            qc.invalidateQueries({ queryKey: ['inventory-models'] });
          }}
        />
      )}

      {/* Delete Device Confirm Modal */}
      {deleteDeviceConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <div className="font-bold text-base-primary">Delete Device?</div>
                <div className="text-xs text-base-muted mt-0.5 font-mono">IMEI: {deleteDeviceConfirm.imei_1}</div>
              </div>
            </div>
            <p className="text-sm text-base-secondary mb-4">This will permanently remove the device from inventory. This action cannot be undone.</p>
            {deleteDeviceError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{deleteDeviceError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setDeleteDeviceConfirm(null); setDeleteDeviceError(''); }} className="flex-1 py-2 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => deleteDevice.mutate(deleteDeviceConfirm.id)}
                disabled={deleteDevice.isPending}
                className="flex-1 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleteDevice.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="surface rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-950 text-white">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] opacity-80">New Stock Order Request</div>
              </div>
              <button onClick={() => setShowOrderModal(false)} className="rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-800/70 transition">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 surface">
              {createOrder.isError && (
                <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2 rounded-xl flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>Failed to submit: {(createOrder.error as any)?.response?.data?.error || createOrder.error?.message}</div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Phone Model</label>
                  <select
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                    value={orderForm.model_id}
                    onChange={e => setOrderForm(f => ({ ...f, model_id: e.target.value }))}
                  >
                    <option value="">e.g. Samsung Galaxy A55 5G</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.brand} {m.model} — {m.in_stock} in stock</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Quantity</label>
                    <input type="number" min="1"
                      className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                      placeholder="0"
                      value={orderForm.quantity}
                      onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Preferred Supplier</label>
                    <input type="text"
                      className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                      placeholder="Supplier name"
                      value={orderForm.supplier}
                      onChange={e => setOrderForm(f => ({ ...f, supplier: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Estimated Cost Per Unit (LKR)</label>
                  <input type="number"
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                    placeholder="0"
                    value={orderForm.unit_price}
                    onChange={e => setOrderForm(f => ({ ...f, unit_price: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Justification / Reason for Order</label>
                  <textarea rows={3}
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 resize-none"
                    placeholder="Reason for stock request..."
                    value={orderForm.justification}
                    onChange={e => setOrderForm(f => ({ ...f, justification: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Required By Date</label>
                  <input type="date"
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 text-slate-700"
                    value={orderForm.required_by_date}
                    onChange={e => setOrderForm(f => ({ ...f, required_by_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-3">
              <button onClick={() => setShowOrderModal(false)} className="rounded-full border border-slate-200 surface px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition">
                Cancel
              </button>
              <button
                onClick={() => {
                  const qty = parseInt(orderForm.quantity);
                  const price = parseFloat(orderForm.unit_price);
                  createOrder.mutate({
                    model_id: orderForm.model_id,
                    quantity: isNaN(qty) ? 1 : qty,
                    ...(!isNaN(price) ? { unit_price: price } : {}),
                    notes: [
                      orderForm.supplier ? `Supplier: ${orderForm.supplier}` : '',
                      orderForm.required_by_date ? `Required By: ${orderForm.required_by_date}` : '',
                      orderForm.justification ? `Justification: ${orderForm.justification}` : ''
                    ].filter(Boolean).join('\n')
                  });
                }}
                disabled={createOrder.isPending || !orderForm.model_id}
                className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition shadow-sm flex items-center gap-2"
              >
                {createOrder.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                {createOrder.isPending ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
