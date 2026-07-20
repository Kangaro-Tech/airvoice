import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api } from '@/services/api';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileSpreadsheet,
  ChevronRight,
  RefreshCw,
  FileUp,
  Columns3,
  ScanEye,
  DatabaseZap,
  History,
  Link2,
  XCircle,
  PercentCircle,
} from 'lucide-react';
import { format } from 'date-fns';

interface ImportBatch {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  uploaded_at: string;
  sheet_regiment?: string;
}

const STATUS_STYLE: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  uploaded:   { cls: 'bg-blue-50 text-blue-600 border-blue-200',   icon: <Clock size={13} />,         label: 'Uploaded'   },
  mapping:    { cls: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={13} />,         label: 'Mapping'    },
  previewing: { cls: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={13} />,         label: 'Previewing' },
  importing:  { cls: 'bg-blue-50 text-blue-600 border-blue-200',   icon: <RefreshCw size={13} className="animate-spin" />, label: 'Importing' },
  completed:  { cls: 'bg-green-50 text-green-700 border-green-200', icon: <CheckCircle size={13} />,  label: 'Completed'  },
  failed:     { cls: 'bg-red-50 text-red-600 border-red-200',      icon: <AlertTriangle size={13} />, label: 'Failed'     },
};

// icon + accent color for each "how it works" step
const STEP_META = [
  { icon: FileUp,      color: 'bg-blue-500' },
  { icon: Columns3,    color: 'bg-purple-500' },
  { icon: ScanEye,     color: 'bg-amber-500' },
  { icon: DatabaseZap, color: 'bg-emerald-500' },
];

function nextStepUrl(batch: ImportBatch): string | null {
  switch (batch.status) {
    case 'uploaded': return `/legacy-import/${batch.id}/mapping`;
    case 'mapping':  return `/legacy-import/${batch.id}/mapping`;
    case 'previewing': return `/legacy-import/${batch.id}/preview`;
    case 'completed':  return `/legacy-import/${batch.id}/preview`;
    default: return null;
  }
}

export default function LegacyImportPage() {
  const location = useLocation();
  const justImported = location.state?.imported;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['legacy-imports'],
    queryFn: () => api.get('/legacy-import').then(r => r.data.data as ImportBatch[]),
    refetchInterval: (query) => {
      // Auto-refresh if any batch is actively importing
      const batches = query.state.data as ImportBatch[] | undefined;
      return Array.isArray(batches) && batches.some(b => b.status === 'importing') ? 3000 : false;
    },
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={28} className="text-[#2563ea] shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-base-primary">Legacy Import</h1>
            <p className="text-sm text-base-muted mt-1">
              Import existing salary deduction records from Excel/CSV files
            </p>
          </div>
        </div>
        <Link to="/legacy-import/upload" className="btn-primary">
          <Upload size={16} />Upload Deduction Sheet
        </Link>
      </div>

      {/* Success banner */}
      {justImported && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-800">
          <CheckCircle size={20} />
          <div className="font-semibold">Import completed successfully. Records are now available in the system.</div>
        </div>
      )}

      {/* How it works */}
      <div className="card p-5 mb-6">
        <h3 className="font-semibold text-base-primary mb-4">How to import salary deduction sheets</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { t: 'Upload File', d: 'Upload .xlsx or .csv salary deduction sheet (e.g. 7 ESR format)' },
            { t: 'Map Columns', d: 'Match Excel column headers to system fields. Month columns auto-detected.' },
            { t: 'Preview Data', d: 'Review parsed rows and deduction history before committing' },
            { t: 'Import', d: 'Records imported, customers auto-linked by service number' },
          ].map((s, i) => {
            const Icon = STEP_META[i].icon;
            return (
              <div key={s.t} className="flex gap-3">
                <div>
                  <Icon size={20} className="text-[#2563ea]" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-base-primary">{s.t}</div>
                  <div className="text-xs text-base-muted mt-0.5 leading-relaxed">{s.d}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Import history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-base flex items-center justify-between">
          <h2 className="font-semibold text-base-primary flex items-center gap-2">
            <History size={17} className="text-[#2563ea]" />
            Import History
          </h2>
          <button onClick={() => refetch()} className="text-base-muted hover:text-gray-600">
            <RefreshCw size={15} />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-base-muted">Loading…</div>
        ) : !data || data.length === 0 ? (
          <div className="py-12 text-center">
            <FileSpreadsheet size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-base-muted text-sm">No imports yet.</p>
            <Link to="/legacy-import/upload" className="text-amber-600 hover:text-amber-700 text-sm font-medium mt-1 block">
              Upload your first deduction sheet →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.map(batch => {
              const style   = STATUS_STYLE[batch.status] ?? STATUS_STYLE.uploaded;
              const nextUrl = nextStepUrl(batch);
              const pct     = batch.total_rows > 0
                ? Math.round((batch.imported_rows / batch.total_rows) * 100)
                : null;

              return (
                <div key={batch.id} className="px-5 py-4 flex items-center gap-4 hover:bg-[var(--bg-surface-2)] transition-colors">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                    <FileSpreadsheet size={20} className="text-[#2563ea]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base-primary truncate text-sm">{batch.file_name}</span>
                      {batch.sheet_regiment && (
                        <span className="badge surface-2 text-gray-600">{batch.sheet_regiment}</span>
                      )}
                    </div>
                    <div className="text-xs text-base-muted mt-0.5 flex items-center gap-1">
                      <Clock size={11} />
                      {format(new Date(batch.uploaded_at), 'dd MMM yyyy HH:mm')}
                    </div>
                  </div>

                  {/* Stats (only when completed) */}
                  {batch.status === 'completed' && (
                    <div className="flex items-center gap-4 text-center shrink-0">
                      <div>
                        <div className="text-base font-bold text-base-primary flex items-center gap-1 justify-center">
                          <FileSpreadsheet size={13} className="text-base-muted" />
                          {batch.total_rows}
                        </div>
                        <div className="text-xs text-base-muted">Total</div>
                      </div>
                      <div>
                        <div className="text-base font-bold text-green-600 flex items-center gap-1 justify-center">
                          <CheckCircle size={13} />
                          {batch.imported_rows}
                        </div>
                        <div className="text-xs text-base-muted">Imported</div>
                      </div>
                      <div>
                        <div className="text-base font-bold text-amber-600 flex items-center gap-1 justify-center">
                          <Link2 size={13} />
                          {batch.duplicate_rows}
                        </div>
                        <div className="text-xs text-base-muted">Linked</div>
                      </div>
                      <div>
                        <div className="text-base font-bold text-red-600 flex items-center gap-1 justify-center">
                          <XCircle size={13} />
                          {batch.invalid_rows}
                        </div>
                        <div className="text-xs text-base-muted">Errors</div>
                      </div>
                      {pct !== null && (
                        <div>
                          <div className="text-base font-bold text-base-primary flex items-center gap-1 justify-center">
                            <PercentCircle size={13} className="text-base-muted" />
                            {pct}%
                          </div>
                          <div className="text-xs text-base-muted">Success</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status badge */}
                  <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${style.cls}`}>
                    {style.icon}
                    {style.label}
                  </div>

                  {/* Action link */}
                  {nextUrl && (
                    <Link
                      to={nextUrl}
                      className="flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700 shrink-0"
                    >
                      {batch.status === 'completed' ? 'View' : 'Continue'}
                      <ChevronRight size={15} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}