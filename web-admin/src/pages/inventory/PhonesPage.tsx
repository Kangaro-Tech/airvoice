import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Phone, Scale, Cpu, Battery, Eye, X, Search,
  Loader2, Image as ImageIcon, Upload, ChevronLeft,
  ChevronRight, Package, Tag, Star, CheckCircle,
  Trash2, ZoomIn, Images,
} from 'lucide-react';

interface PhoneModel {
  id: string;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  sale_price: number;
  purchase_cost: number | null;
  description: string | null;
  specs?: Record<string, string>;
  in_stock?: number;
  images?: string[];      // signed public URLs
}

// ─── Image Carousel ────────────────────────────────────────────
function ImageCarousel({ images, brand, model }: { images: string[]; brand: string; model: string }) {
  const [idx, setIdx] = useState(0);
  if (!images || images.length === 0) {
    return (
      <div className="aspect-square w-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center">
        <Phone size={48} className="text-slate-300" />
      </div>
    );
  }
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-50 group">
      <img
        src={images[idx]}
        alt={`${brand} ${model}`}
        className="w-full h-full object-contain transition-all duration-300"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={() => setIdx(i => (i - 1 + images.length) % images.length)}
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-[var(--bg-surface)] rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition"
          ><ChevronLeft size={14} /></button>
          <button
            onClick={() => setIdx(i => (i + 1) % images.length)}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-[var(--bg-surface)] rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition"
          ><ChevronRight size={14} /></button>
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, i) => (
              <span
                key={i}
                onClick={() => setIdx(i)}
                className={`w-1.5 h-1.5 rounded-full cursor-pointer transition ${i === idx ? 'bg-amber-500' : 'bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
      {/* Photo count badge */}
      {images.length > 1 && (
        <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          <Images size={9} /> {images.length}
        </span>
      )}
    </div>
  );
}

// ─── Lightbox ──────────────────────────────────────────────────
function Lightbox({ images, startIdx, onClose }: { images: string[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx);
  return (
    <div
      className="fixed inset-0 bg-black/92 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <button
        onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + images.length) % images.length); }}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition"
      >
        <ChevronLeft size={24} />
      </button>
      <img
        src={images[idx]}
        alt=""
        className="max-h-[88vh] max-w-[88vw] object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % images.length); }}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition"
      >
        <ChevronRight size={24} />
      </button>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition"
      >
        <X size={20} />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs font-semibold">
        {idx + 1} / {images.length}
      </div>
    </div>
  );
}

// ─── Details Modal ─────────────────────────────────────────────
function PhoneDetailsModal({
  model,
  onClose,
}: {
  model: PhoneModel;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [activeImg, setActiveImg] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const images = model.images ?? [];

  const uploadFiles = async (files: FileList | File[]) => {
    setUploading(true);
    setUploadError('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api.post(`/inventory/models/${model.id}/images`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await qc.invalidateQueries({ queryKey: ['inventory-models'] });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (idx: number) => {
    if (!confirm('Delete this photo?')) return;
    setDeletingIdx(idx);
    try {
      await api.delete(`/inventory/models/${model.id}/images/${idx}`);
      await qc.invalidateQueries({ queryKey: ['inventory-models'] });
      setActiveImg(prev => (prev >= (images.length - 1) ? Math.max(0, images.length - 2) : prev));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Delete failed';
      alert(msg);
    } finally {
      setDeletingIdx(null);
    }
  };

  const SPEC_ROWS = [
    { label: 'Brand', value: model.brand },
    { label: 'Model', value: model.model },
    { label: 'Storage', value: model.storage ?? '—' },
    { label: 'Color', value: model.color ?? '—' },
    { label: 'Sale Price', value: `LKR ${model.sale_price.toLocaleString()}` },
    { label: 'Cost Price', value: model.purchase_cost ? `LKR ${model.purchase_cost.toLocaleString()}` : '—' },
    { label: 'Stock', value: model.in_stock != null ? `${model.in_stock} units` : '—' },
    ...(model.specs
      ? Object.entries(model.specs).map(([k, v]) => ({ label: k, value: v }))
      : []),
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="surface rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-500">{model.brand}</p>
              <h2 className="text-xl font-bold text-base-primary">{model.model}</h2>
            </div>
            <button onClick={onClose} className="text-base-muted hover:text-[var(--text-secondary)] p-1"><X size={20} /></button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left – image gallery */}
            <div
              className={`w-64 shrink-0 flex flex-col p-4 gap-3 border-r border-base overflow-y-auto transition ${dragging ? 'bg-amber-50 border-amber-300' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
            >
              {/* Big active image */}
              <div
                className="aspect-square w-full bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center relative group cursor-zoom-in"
                onClick={() => images.length > 0 && setLightboxOpen(true)}
              >
                {images.length > 0 ? (
                  <>
                    <img src={images[activeImg]} alt="phone" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                      <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition drop-shadow" />
                    </div>
                  </>
                ) : (
                  <Phone size={48} className="text-slate-300" />
                )}
              </div>

              {/* Thumbnails with delete */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {images.map((url, i) => (
                    <div key={i} className="relative group/thumb">
                      <button
                        onClick={() => setActiveImg(i)}
                        className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition ${i === activeImg ? 'border-amber-500' : 'border-transparent hover:border-[var(--border-color)]'}`}
                      >
                        <img src={url} alt="" className="w-full h-full object-contain" />
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteImage(i); }}
                        disabled={deletingIdx === i}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition hover:bg-red-600 shadow"
                        title="Delete photo"
                      >
                        {deletingIdx === i ? <Loader2 size={8} className="animate-spin" /> : <X size={8} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Drag-and-drop upload zone */}
              <div
                className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 border-2 border-dashed rounded-xl text-xs font-semibold transition cursor-pointer ${dragging ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-amber-300 text-amber-600 hover:bg-amber-50'}`}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <><Loader2 size={18} className="animate-spin" /><span>Uploading…</span></>
                ) : (
                  <><Upload size={18} /><span>{dragging ? 'Drop photos here' : 'Upload Photos'}</span><span className="text-amber-400 font-normal text-[10px]">Drag & drop or click · Multiple allowed</span></>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }}
              />
              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
            </div>

            {/* Right – specs & pricing */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {model.description && (
                <p className="text-sm text-base-muted leading-relaxed">{model.description}</p>
              )}
              {/* Stock badge */}
              <div className="flex items-center gap-2">
                {(model.in_stock ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
                    <CheckCircle size={12} /> {model.in_stock} In Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 text-xs font-semibold px-3 py-1 rounded-full">
                    <Package size={12} /> Out of Stock
                  </span>
                )}
                {images.length > 0 && (
                  <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-xs font-semibold px-2.5 py-1 rounded-full">
                    <Images size={11} /> {images.length} photo{images.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Pricing summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-xs text-amber-600 font-semibold mb-1">Cash Price</p>
                  <p className="text-xl font-bold text-amber-700 font-mono">LKR {model.sale_price.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-semibold mb-1">From (12 months)</p>
                  <p className="text-xl font-bold text-base-secondary font-mono">LKR {Math.round(model.sale_price / 12).toLocaleString()}<span className="text-sm font-normal text-base-muted">/mo</span></p>
                </div>
              </div>

              {/* Specs table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-base-muted mb-2">Specifications</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {SPEC_ROWS.map(({ label, value }) => (
                      <tr key={label} className="border-b border-gray-50">
                        <td className="py-2 font-semibold text-base-muted w-32">{label}</td>
                        <td className="py-2 text-base-secondary">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && images.length > 0 && (
        <Lightbox images={images} startIdx={activeImg} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}



// ─── Main Page ─────────────────────────────────────────────────
export default function PhonesPage() {
  const [search, setSearch] = useState('');
  const [compareList, setCompareList] = useState<PhoneModel[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [detailModel, setDetailModel] = useState<PhoneModel | null>(null);

  const { data: modelsRes, isLoading } = useQuery({
    queryKey: ['inventory-models'],
    queryFn: () => api.get('/inventory/models').then(r => r.data),
  });
  const models: PhoneModel[] = modelsRes?.data ?? [];

  const filtered = models.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${m.brand} ${m.model}`.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q);
  });

  const toggleCompare = (model: PhoneModel) => {
    if (compareList.find(x => x.id === model.id)) {
      setCompareList(prev => prev.filter(x => x.id !== model.id));
    } else {
      if (compareList.length >= 3) {
        alert('You can compare a maximum of 3 models.');
        return;
      }
      setCompareList(prev => [...prev, model]);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Phone size={28} className="text-[#2563ea]" /> Phone Catalogue
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            {models.length} device configurations — tap <strong>View Details</strong> to see specs & upload images
          </p>
        </div>
        {compareList.length > 0 && (
          <button
            onClick={() => setShowCompareModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            <Scale size={16} /> Compare ({compareList.length})
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative max-w-lg">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
        <input
  className="w-full pl-9 pr-4 py-2.5 border border-base rounded-lg text-sm bg-[var(--input-bg)] text-base-primary focus:outline-none focus:ring-2 focus:ring-amber-400"
  placeholder="Search phones by model name or specs…"
  value={search}
  onChange={e => setSearch(e.target.value)}
/>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-base-muted">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading phone models…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-base-muted card">
          <Phone size={36} className="mx-auto mb-3 opacity-25" />
          <p>No phone models match your search criteria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(m => {
            const isCompared = compareList.some(x => x.id === m.id);
            const images = m.images ?? [];
            return (
              <div
                key={m.id}
                className={`card p-4 flex flex-col gap-3 hover:shadow-lg transition-shadow ${isCompared ? 'ring-2 ring-amber-500' : ''}`}
              >
                {/* Image */}
                <ImageCarousel images={images} brand={m.brand} model={m.model} />

                {/* Info */}
                <div className="flex-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{m.brand}</span>
                  <h3 className="font-bold text-base text-base-primary mt-0.5 leading-tight">{m.model}</h3>
                  {m.storage && (
                    <span className="inline-block mt-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full font-semibold">{m.storage}</span>
                  )}
                  {m.color && (
                    <span className="inline-block mt-1 ml-1 bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{m.color}</span>
                  )}
                  {/* Stock indicator */}
                  {m.in_stock != null && (
                    <p className={`text-xs mt-1.5 font-semibold ${m.in_stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {m.in_stock > 0 ? `${m.in_stock} in stock` : 'Out of stock'}
                    </p>
                  )}
                </div>

                {/* Pricing */}
                <div className="pt-3 border-t border-base flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-400">From</p>
                    <p className="font-bold text-base-primary font-mono text-sm">LKR {Math.round(m.sale_price / 12).toLocaleString()}<span className="text-xs font-normal text-base-muted">/mo</span></p>
                  </div>
                  <p className="text-xs font-bold text-amber-600 font-mono">LKR {m.sale_price.toLocaleString()}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setDetailModel(m)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"
                  >
                    <Eye size={13} /> View Details
                  </button>
                  <button
                    onClick={() => toggleCompare(m)}
                    title="Compare"
                    className={`p-2 rounded-lg border transition ${isCompared ? 'bg-amber-50 border-amber-300 text-amber-600' : 'border-base text-base-muted hover:bg-[var(--bg-surface-2)]'}`}
                  >
                    <Scale size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      {detailModel && (
        <PhoneDetailsModal
          model={detailModel}
          onClose={() => setDetailModel(null)}
        />
      )}

      {/* Compare Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
              <h3 className="font-bold text-base-primary flex items-center gap-2">
                <Scale size={18} /> Device Comparison
              </h3>
              <button onClick={() => setShowCompareModal(false)} className="text-base-muted hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-x-auto p-6">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-base">
                    <th className="w-1/4 pb-3 text-left text-base-muted font-medium">Feature</th>
                    {compareList.map(c => (
                      <th key={c.id} className="w-1/4 text-center pb-3 px-3">
                        {/* Thumbnail in header */}
                        {(c.images ?? []).length > 0 && (
                          <img src={c.images![0]} alt="" className="w-12 h-12 object-contain mx-auto mb-1 rounded-lg" />
                        )}
                        <div className="font-bold text-base-primary">{c.brand} {c.model}</div>
                        <button
                          onClick={() => setCompareList(prev => prev.filter(x => x.id !== c.id))}
                          className="text-xs text-red-500 hover:text-red-700 mt-1 font-semibold flex items-center gap-0.5 mx-auto"
                        ><X size={12} /> Remove</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Cash Price', (c: PhoneModel) => `LKR ${c.sale_price.toLocaleString()}`],
                    ['Storage', (c: PhoneModel) => c.storage ?? '—'],
                    ['Color Options', (c: PhoneModel) => c.color ?? '—'],
                    ['Est. Installment', (c: PhoneModel) => `LKR ${Math.round(c.sale_price / 12).toLocaleString()} /mo`],
                    ['In Stock', (c: PhoneModel) => c.in_stock != null ? `${c.in_stock} units` : '—'],
                    ['Description', (c: PhoneModel) => c.description ?? '—'],
                  ] as [string, (c: PhoneModel) => string][]).map(([label, getValue]) => (
                    <tr key={label} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 font-semibold text-base-muted">{label}</td>
                      {compareList.map(c => (
                        <td key={c.id} className="py-3 px-3 text-center text-base-secondary">{getValue(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
