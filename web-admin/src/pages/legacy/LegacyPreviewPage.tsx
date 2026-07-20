import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { CheckCircle, AlertTriangle, Loader2, Download, ArrowLeft, XCircle } from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  deducted:    'bg-green-100 text-green-700',
  not_deducted:'bg-red-100 text-red-700',
  partial:     'bg-amber-100 text-amber-700',
  pending:     'surface-2 text-base-muted',
};

export default function LegacyPreviewPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [polling, setPolling]     = useState(false);

  const { data: batchResp, refetch: refetchBatch } = useQuery({
    queryKey: ['legacy-batch', id],
    queryFn:  () => api.get(`/legacy-import/${id}`).then(r => r.data.data),
    refetchInterval: polling ? 3000 : false,
  });

  // Stop polling when the import finishes
  useEffect(() => {
    if (polling && (batchResp?.status === 'completed' || batchResp?.status === 'failed')) {
      setPolling(false);
      qc.invalidateQueries({ queryKey: ['legacy-imports'] });
    }
  }, [polling, batchResp?.status, qc]);

  const alreadyDone    = batchResp?.status === 'completed';
  const importFailed   = batchResp?.status === 'failed';
  const isImporting    = batchResp?.status === 'importing' || polling;

  const { data: preview, isLoading } = useQuery({
    queryKey: ['legacy-preview', id],
    queryFn:  () => api.get(`/legacy-import/${id}/preview`, { params: { limit: 30 } }).then(r => r.data),
  });

  const importMutation = useMutation({
    mutationFn: () => api.post(`/legacy-import/${id}/import`).then(r => r.data),
    onSuccess: () => {
      // API returns 202 immediately — start polling for completion
      setPolling(true);
      refetchBatch();
    },
  });

  const batch        = batchResp as Record<string, unknown> | null;
  const rows         = (preview?.data || []) as Record<string, unknown>[];
  const totalRows    = preview?.total_rows as number | undefined;
  const monthCols    = (preview?.month_columns || []) as string[];

  const handleExportErrors = async () => {
    try {
      const response = await api.get(`/reports/legacy-errors/${id}`, {
        params: { format: 'xlsx' },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Import_Errors_${id?.slice(0, 8)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to export legacy import errors. Please verify your session.');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link to="/legacy-import" className="text-base-muted hover:text-gray-600"><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="text-2xl font-bold">
              Preview: {batch?.file_name as string || 'Import'}
            </h1>
            <p className="text-sm text-base-muted mt-0.5">
              {totalRows} rows parsed · First 30 shown
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportErrors}
            className="btn-secondary"
          >
            <Download size={16} />Error Report
          </button>
          <Link to={`/legacy-import/${id}/mapping`} className="btn-secondary">
            ← Edit Mapping
          </Link>
          {!alreadyDone && !isImporting && (
            <button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || !confirmed}
              className="btn-primary disabled:opacity-50"
            >
              {importMutation.isPending
                ? <><Loader2 size={16} className="animate-spin" />Starting…</>
                : <><CheckCircle size={16} />Run Import</>}
            </button>
          )}
        </div>
      </div>

      {/* Importing in progress banner */}
      {isImporting && !alreadyDone && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 text-blue-800">
          <Loader2 size={20} className="animate-spin shrink-0" />
          <div>
            <div className="font-semibold">Import Running in Background…</div>
            <div className="text-sm">This page will automatically update when the import is done. You can safely navigate away.</div>
          </div>
        </div>
      )}

      {/* Completed banner */}
      {alreadyDone && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-800">
          <CheckCircle size={20} />
          <div>
            <div className="font-semibold">Import Completed</div>
            <div className="text-sm">
              {batch?.imported_rows as number} imported · {batch?.duplicate_rows as number} duplicates · {batch?.invalid_rows as number} errors
            </div>
          </div>
        </div>
      )}

      {/* Failed banner */}
      {importFailed && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800">
          <XCircle size={20} />
          <div>
            <div className="font-semibold">Import Failed</div>
            <div className="text-sm">An error occurred during import. Please check the server logs or try again.</div>
          </div>
        </div>
      )}

      {/* Error */}
      {importMutation.isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-red-700 text-sm">
          <XCircle size={16} className="shrink-0 mt-0.5" />
          {(importMutation.error as Error).message}
        </div>
      )}

      {/* Confirm checkbox */}
      {!alreadyDone && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <input type="checkbox" id="confirm" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-4 h-4" />
          <label htmlFor="confirm" className="text-sm text-amber-800 cursor-pointer">
            I have reviewed the data below and confirm it is correct. Running import will create permanent records.
          </label>
        </div>
      )}

      {/* Data table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="surface-2 border-b border-base">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-base-muted sticky left-0 surface-2">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-base-muted whitespace-nowrap">Service No</th>
                <th className="px-3 py-2.5 text-left font-semibold text-base-muted whitespace-nowrap">Name</th>
                <th className="px-3 py-2.5 text-left font-semibold text-base-muted">Unit</th>
                <th className="px-3 py-2.5 text-left font-semibold text-base-muted whitespace-nowrap">Monthly</th>
                <th className="px-3 py-2.5 text-left font-semibold text-base-muted">Term</th>
                {monthCols.slice(0, 10).map(m => (
                  <th key={m} className="px-2 py-2.5 text-center font-semibold text-base-muted whitespace-nowrap">{m}</th>
                ))}
                {monthCols.length > 10 && (
                  <th className="px-2 py-2.5 text-base-muted whitespace-nowrap">+{monthCols.length - 10}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={20} className="py-8 text-center text-base-muted">Parsing file…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={20} className="py-8 text-center text-base-muted">No rows found. Check the column mapping.</td></tr>
              ) : rows.map((r: Record<string, unknown>) => {
                const hist = (r.deduction_history as Record<string, { status: string; raw: string }> | null) ?? {};
                return (
                  <tr key={r.row_number as number} className="hover:bg-[var(--bg-surface-2)]">
                    <td className="px-3 py-2 text-base-muted sticky left-0 surface">{r.row_number as number}</td>
                    <td className="px-3 py-2 font-mono text-base-secondary">{(r.service_number as string) || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-base-primary whitespace-nowrap">{(r.customer_name as string) || '—'}</td>
                    <td className="px-3 py-2 text-base-muted whitespace-nowrap">{(r.unit as string) || '—'}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {r.monthly_amount ? `LKR ${Number(r.monthly_amount).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-2">{(r.term_months as number) || '—'}</td>
                    {monthCols.slice(0, 10).map(m => {
                      const h = hist[m];
                      return (
                        <td key={m} className="px-2 py-2 text-center">
                          {h ? (
                            <span className={`badge text-xs ${STATUS_STYLE[h.status] || 'surface-2'}`}>
                              {h.raw.slice(0, 8) || h.status.slice(0, 3)}
                            </span>
                          ) : (
                            <span className="text-gray-200">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalRows !== undefined && totalRows > 30 && (
          <div className="px-4 py-3 border-t border-base text-xs text-base-muted">
            Showing first 30 of {totalRows} rows. All {totalRows} rows will be imported.
          </div>
        )}
      </div>
    </div>
  );
}
