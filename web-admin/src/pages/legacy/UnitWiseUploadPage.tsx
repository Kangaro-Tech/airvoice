import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertCircle,
  Info,
  ListChecks,
  Paperclip,
  X,
  ArrowLeft,
} from 'lucide-react';

export default function UnitWiseUploadPage() {
  const navigate  = useNavigate();
  const xlsxRef   = useRef<HTMLInputElement>(null);
  const pdfRef    = useRef<HTMLInputElement>(null);

  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [pdfFile,  setPdfFile]  = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append('file', f);
      const r = await api.post('/legacy-import/upload-unit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      return r.data;
    },
    onSuccess: (data) => {
      alert(data.message || 'Unit Wise Summary imported started in background.');
      navigate('/legacy-import');
    },
  });

  const handleFile = (f: File) => {
    if (f.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF files cannot be used as the primary import source.\n\nPDFs are stored for reference only and are never parsed for data.\n\nPlease upload an Excel (.xlsx) or CSV file for structured import.');
      return;
    }
    setXlsxFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Upload size={28} className="text-[#2563ea] shrink-0" />
        <h1 className="text-2xl font-bold">Upload Unit Wise Summary</h1>
      </div>
      <p className="text-base-muted text-sm mb-4">
        Upload an Excel (.xlsx) or CSV file containing Unit Wise Summary records.
        The system will auto-detect columns from the standard 7 ESR format.
      </p>

      {/* PDF warning banner */}
      <div className="mb-5 p-3 bg-blue-50/70 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900 rounded-xl text-sm text-blue-900 dark:text-blue-200 flex gap-2">
        <Info size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
        <div>
          <span className="font-semibold">PDF files cannot be used for structured import.</span>{' '}
          Only Excel (.xlsx) and CSV files are parsed for import data.
          If you have a PDF print of the unit wise summary, you may attach it below as a reference after upload.
        </div>
      </div>

      {/* Primary upload zone — Excel/CSV only */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => xlsxRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40' : 'border-base hover:border-blue-400 hover:bg-[var(--bg-surface-2)]'
        }`}
      >
        <input
          ref={xlsxRef}
          type="file"
          className="hidden"
          accept=".xlsx,.csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <FileSpreadsheet size={40} className={`mx-auto mb-3 ${xlsxFile ? 'text-emerald-500' : 'text-base-muted'}`} />
        {xlsxFile ? (
          <div>
            <p className="font-medium text-base-primary flex items-center justify-center gap-1.5">
              {xlsxFile.name}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setXlsxFile(null); }}
                className="text-base-muted hover:text-red-500"
              >
                <X size={14} />
              </button>
            </p>
            <p className="text-sm text-base-muted mt-1">{(xlsxFile.size / 1024).toFixed(0)} KB</p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-base-secondary">Drop Excel or CSV file here</p>
            <p className="text-sm text-base-muted mt-1">Supports .xlsx and .csv · Max 20 MB · No PDFs</p>
          </div>
        )}
      </div>

      {/* Expected format hint */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <div className="font-semibold mb-1 flex items-center gap-1.5">
          <ListChecks size={15} />
          Expected Columns (7 ESR Format)
        </div>
        <div className="text-xs text-blue-700 font-mono">
          No. · Service No · Name · GU/No · GU/Name · Unit · Monthly Rental · Term · Sale Date · [Oct-24] [Nov-24] …
        </div>
      </div>

      {/* Optional PDF reference attachment */}
      <div className="mt-5 p-4 surface-2 border border-base rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={16} className="text-base-muted" />
          <span className="text-sm font-medium text-base-secondary">Optional: Attach PDF print (reference only)</span>
        </div>
        <p className="text-xs text-base-muted mb-3">
          The PDF will be stored alongside the Excel data for human reference.
          It is never parsed and has no effect on import results.
        </p>
        <div
          onClick={() => pdfRef.current?.click()}
          className="border border-dashed border-base rounded-lg px-4 py-3 text-center text-sm text-base-muted cursor-pointer hover:bg-[var(--bg-surface-2)] transition-colors flex items-center justify-center gap-2"
        >
          <input
            ref={pdfRef}
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) setPdfFile(f); }}
          />
          <Paperclip size={14} className="shrink-0" />
          {pdfFile ? (
            <span className="text-base-secondary">{pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)</span>
          ) : (
            <span>Click to attach PDF (optional)</span>
          )}
        </div>
      </div>

      {uploadMutation.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={16} />
          {(uploadMutation.error as Error).message}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={() => xlsxFile && uploadMutation.mutate(xlsxFile)}
          disabled={!xlsxFile || uploadMutation.isPending}
          className="btn-primary disabled:opacity-50"
        >
          {uploadMutation.isPending
            ? <><Loader2 size={16} className="animate-spin" />Uploading…</>
            : <><Upload size={16} />Upload &amp; Process</>
          }
        </button>
        <button onClick={() => navigate('/legacy-import')} className="btn-secondary">
          <ArrowLeft size={16} />
          Cancel
        </button>
      </div>
    </div>
  );
}