import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
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
  GitMerge,
  X,
  Loader2,
  ArrowRight,
  Trash2,
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
  const { user } = useAuthStore();
  const qc = useQueryClient();

  // Merge camps modal state
  const [showMerge, setShowMerge]       = useState(false);
  const [mergeSource, setMergeSource]   = useState('');
  const [mergeTarget, setMergeTarget]   = useState('');
  const [mergeResult, setMergeResult]   = useState<null | Record<string, unknown>>(null);
  const [mergeError, setMergeError]     = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['legacy-imports'],
    queryFn: () => api.get('/legacy-import').then(r => r.data.data as ImportBatch[]),
    refetchInterval: (query) => {
      const batches = query.state.data as ImportBatch[] | undefined;
      return Array.isArray(batches) && batches.some(b => b.status === 'importing') ? 3000 : false;
    },
  });

  // All camps (including inactive — so duplicates from import are visible)
  const { data: campsRes } = useQuery({
    queryKey: ['camps-all'],
    queryFn: () => api.get('/camps', { params: { include_inactive: 'true' } }).then(r => r.data.data as Record<string, unknown>[]),
    enabled: showMerge,
  });

  const mergeMutation = useMutation({
    mutationFn: (payload: { source_camp_id: string; target_camp_id: string }) =>
      api.post('/legacy-import/merge-camps', payload).then(r => r.data),
    onSuccess: (res) => {
      setMergeResult(res);
      setMergeError('');
      qc.invalidateQueries({ queryKey: ['camps'] });
      qc.invalidateQueries({ queryKey: ['camps-all'] });
    },
    onError: (err: any) => {
      setMergeError(err?.response?.data?.error ?? 'Merge failed. Please try again.');
    },
  });

  const handleMerge = () => {
    if (!mergeSource || !mergeTarget) { setMergeError('Please select both camps.'); return; }
    if (mergeSource === mergeTarget)  { setMergeError('Source and target must be different camps.'); return; }
    setMergeError('');
    setMergeResult(null);
    mergeMutation.mutate({ source_camp_id: mergeSource, target_camp_id: mergeTarget });
  };

  const closeMerge = () => {
    setShowMerge(false);
    setMergeSource('');
    setMergeTarget('');
    setMergeResult(null);
    setMergeError('');
  };

  const canMerge = ['super_admin', 'admin'].includes(user?.role ?? '');

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
        <div className="flex items-center gap-2">
          {canMerge && (
            <button
              onClick={() => { setShowMerge(true); setMergeResult(null); setMergeError(''); }}
              className="flex items-center gap-1.5 text-sm px-4 py-2 border border-base rounded-lg hover:bg-[var(--bg-surface-2)] font-medium text-base-secondary"
            >
              <GitMerge size={15} className="text-amber-500" /> Merge Duplicate Camps
            </button>
          )}
          <Link to="/legacy-import/upload-unit" className="flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition shadow-sm">
            <Upload size={16} />Upload Unit Wise Summary
          </Link>
          <Link to="/legacy-import/upload" className="btn-primary">
            <Upload size={16} />Upload Deduction Sheet
          </Link>
        </div>
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

      {/* ── Merge Duplicate Camps Modal ───────────────────────────── */}
      {showMerge && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="surface rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

            {/* Header */}
            <div className="bg-[#0f172a] text-white flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <GitMerge size={20} className="text-amber-400" />
                <h3 className="font-bold text-lg tracking-tight">Merge Duplicate Camps</h3>
              </div>
              <button onClick={closeMerge} className="text-slate-400 hover:text-white transition bg-[#1e293b] p-1.5 rounded-lg border border-slate-700">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">

              {/* Info banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={17} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Use with caution</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    All <strong>customers</strong>, <strong>regiments</strong>, and <strong>officer assignments</strong> from the
                    source camp will be moved to the target camp. The source camp will then be <strong>deactivated</strong>.
                    This cannot be undone easily.
                  </p>
                </div>
              </div>

              {/* Success result */}
              {mergeResult && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
                    <CheckCircle size={16} /> Merge completed successfully
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <div>✅ Customers moved: <strong>{String(mergeResult.customers_moved ?? 0)}</strong></div>
                    <div>✅ Regiments moved: <strong>{String(mergeResult.regiments_moved ?? 0)}</strong></div>
                    <div>✅ Officers moved: <strong>{String(mergeResult.officers_moved ?? 0)}</strong></div>
                    <div className="mt-2 text-slate-500">
                      Source camp <em>{String((mergeResult.source_camp as any)?.name ?? '')}</em> has been deactivated.
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {mergeError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {mergeError}
                </div>
              )}

              {!mergeResult && (
                <>
                  {/* Source camp */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Source Camp <span className="text-red-500">*</span>
                      <span className="ml-1 font-normal normal-case text-slate-400">(will be deactivated)</span>
                    </label>
                    <select
                      className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 surface text-slate-700 transition"
                      value={mergeSource}
                      onChange={e => setMergeSource(e.target.value)}
                    >
                      <option value="">Select source camp to remove…</option>
                      {(campsRes ?? []).map((c: any) => (
                        <option key={c.id} value={c.id} disabled={c.id === mergeTarget}>
                          {c.name}{!c.is_active ? ' (inactive)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                    <ArrowRight size={15} className="text-amber-500 shrink-0" />
                    <span>merges into</span>
                    <ArrowRight size={15} className="text-amber-500 shrink-0" />
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                  </div>

                  {/* Target camp */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Target Camp <span className="text-red-500">*</span>
                      <span className="ml-1 font-normal normal-case text-slate-400">(will be kept)</span>
                    </label>
                    <select
                      className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:ring-4 focus:ring-green-500/10 surface text-slate-700 transition"
                      value={mergeTarget}
                      onChange={e => setMergeTarget(e.target.value)}
                    >
                      <option value="">Select target camp to keep…</option>
                      {(campsRes ?? []).map((c: any) => (
                        <option key={c.id} value={c.id} disabled={c.id === mergeSource}>
                          {c.name}{!c.is_active ? ' (inactive)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-base surface-2 flex justify-end gap-3">
              <button
                onClick={closeMerge}
                className="px-5 py-2.5 text-sm font-semibold border border-base rounded-lg hover:bg-slate-50 transition"
              >
                {mergeResult ? 'Close' : 'Cancel'}
              </button>
              {!mergeResult && (
                <button
                  onClick={handleMerge}
                  disabled={mergeMutation.isPending || !mergeSource || !mergeTarget}
                  className="px-5 py-2.5 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2 transition"
                >
                  {mergeMutation.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Merging…</>
                    : <><Trash2 size={14} /> Merge & Deactivate Source</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}