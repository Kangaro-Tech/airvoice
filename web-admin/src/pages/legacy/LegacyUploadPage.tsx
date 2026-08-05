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
  Download,
} from 'lucide-react';

export default function LegacyUploadPage() {
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
      const r = await api.post('/legacy-import/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      return r.data;
    },
    onSuccess: (data) => {
      navigate(`/legacy-import/${data.data.id}/mapping`, { state: { uploadResult: data } });
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
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Upload size={28} className="text-[#2563ea] shrink-0" />
          <h1 className="text-2xl font-bold">Upload Deduction Sheet</h1>
        </div>
        <a
          href="/Deduction_Template.xlsx"
          download="Deduction_Template.xlsx"
          className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          <Download size={14} />
          Download Template
        </a>
      </div>
      <p className="text-base-muted text-sm mb-4">
        Upload an Excel (.xlsx) or CSV file containing salary deduction records.
        The system will auto-detect columns from the standard 7 ESR format.
      </p>

      {/* PDF warning banner */}
      <div className="mb-5 p-3 bg-blue-50/70 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900 rounded-xl text-sm text-blue-900 dark:text-blue-200 flex gap-2">
        <Info size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
        <div>
          <span className="font-semibold">PDF files cannot be used for structured import.</span>{' '}
          Only Excel (.xlsx) and CSV files are parsed for import data.
          If you have a PDF print of the deduction sheet, you may attach it below as a reference after upload.
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
      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
        <div className="font-semibold mb-3 flex items-center gap-1.5 text-blue-800 dark:text-blue-200">
          <ListChecks size={15} />
          Column Guide — Required Format (7 ESR Deduction Sheet)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-100 dark:bg-blue-900/60 text-blue-900 dark:text-blue-100">
                <th className="text-left px-2 py-1.5 border border-blue-200 dark:border-blue-700 font-bold">Column Name</th>
                <th className="text-left px-2 py-1.5 border border-blue-200 dark:border-blue-700 font-bold">What to Fill</th>
                <th className="text-left px-2 py-1.5 border border-blue-200 dark:border-blue-700 font-bold">Example</th>
              </tr>
            </thead>
            <tbody className="text-blue-800 dark:text-blue-200">
              {[
                ['No.', 'Row number (auto)', '1, 2, 3…'],
                ['Service No', 'Staff service/employee number', 'EMP001'],
                ['Name', 'Full name of staff member', 'John Perera'],
                ['GU/No', 'Guarantor ID number', 'G001'],
                ['GU/Name', 'Guarantor full name', 'Mary Silva'],
                ['Unit', 'Army/camp unit name', 'Base Unit A'],
                ['Monthly Rental', 'Monthly installment amount (LKR)', '1500'],
                ['Term', 'Total installment months', '12'],
                ['Sale Date', 'Phone sale date', '2023-10-01'],
              ].map(([col, desc, ex]) => (
                <tr key={col} className="border-b border-blue-100 dark:border-blue-800">
                  <td className="px-2 py-1.5 border border-blue-200 dark:border-blue-700 font-mono font-bold text-blue-900 dark:text-blue-100">{col}</td>
                  <td className="px-2 py-1.5 border border-blue-200 dark:border-blue-700">{desc}</td>
                  <td className="px-2 py-1.5 border border-blue-200 dark:border-blue-700 font-mono text-green-700 dark:text-green-400">{ex}</td>
                </tr>
              ))}
              <tr className="bg-amber-50 dark:bg-amber-950/30">
                <td className="px-2 py-1.5 border border-blue-200 dark:border-blue-700 font-mono font-bold text-blue-900 dark:text-blue-100">[Oct-24], [Nov-24]…</td>
                <td className="px-2 py-1.5 border border-blue-200 dark:border-blue-700">Monthly deduction columns. Add one column per month. Header must be in <span className="font-bold">MMM-YY</span> format.</td>
                <td className="px-2 py-1.5 border border-blue-200 dark:border-blue-700 font-mono text-green-700 dark:text-green-400">Oct-24, Nov-24</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="text-xs font-semibold text-blue-900 dark:text-blue-100">📋 Monthly Deduction Column Values:</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 px-2 py-1 rounded font-mono font-bold">500 / 1500 (number)</span>
            <span className="text-blue-700 dark:text-blue-300">→ Deduction amount paid this month</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 px-2 py-1 rounded font-mono font-bold">0 or blank</span>
            <span className="text-blue-700 dark:text-blue-300">→ No deduction this month (will be marked as missed)</span>
          </div>
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
            : <><Upload size={16} />Upload &amp; Detect Columns</>
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