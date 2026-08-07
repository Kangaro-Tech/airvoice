import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { Search, Shield, Anchor, Plane, Building2, AlertTriangle, Smartphone, ChevronLeft, ChevronRight } from 'lucide-react';

interface CustomerPhoneCount {
  customerId: string;
  name: string;
  rank: string;
  branch: string;
  campId: string;
  campName: string;
  phoneCount: number;
  risk_score: number;
  risk_level: string;
  service_number: string;
  phone_number: string;
}

interface PagedResponse {
  data: CustomerPhoneCount[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const BRANCH_LABEL: Record<string, string> = {
  army: 'Army', navy: 'Navy', air_force: 'Air Force',
};
const BRANCH_ICON: Record<string, React.ElementType> = {
  army: Shield, navy: Anchor, air_force: Plane,
};
const BRANCH_STYLE: Record<string, string> = {
  army: 'bg-green-100 text-green-800 border-green-200',
  navy: 'bg-blue-100  text-blue-800  border-blue-200',
  air_force: 'bg-sky-100 text-sky-800 border-sky-200',
};

function BranchTag({ branch }: { branch: string }) {
  const Icon = BRANCH_ICON[branch];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${BRANCH_STYLE[branch] ?? 'surface-2 text-base-secondary border-base'}`}>
      {Icon && <Icon size={11} />}
      {BRANCH_LABEL[branch] ?? branch}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function MultiplePhonesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search input by 400ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever search changes
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { data: pageData, isLoading, isFetching } = useQuery<PagedResponse>({
    queryKey: ['multi-phone-customers', page, debouncedSearch],
    queryFn: () =>
      api.get('/dashboard/multi-phone-customers', {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,  // v5 API (replaces keepPreviousData: true)
    staleTime: 1000 * 60 * 5,          // cache 5 min — data doesn't change often
  });

  const customers  = pageData?.data  ?? [];
  const total      = pageData?.total ?? 0;
  const totalPages = pageData?.pages ?? 0;

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-base-primary flex items-center gap-2">
            <AlertTriangle size={28} className="text-red-500" />
            Multiple Phones Customers
          </h1>
          <p className="text-sm text-base-muted mt-0.5">
            Customers who have taken <strong>2 or more phones</strong> in total.&nbsp;
            {!isLoading && total > 0 && (
              <span className="font-bold text-red-600">{total.toLocaleString()} customers flagged</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="flex gap-3 mb-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
          <input
            className="form-input pl-9 text-sm w-full"
            placeholder="Search by Name, Service No or Phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isFetching && !isLoading && (
          <span className="text-xs text-base-muted animate-pulse">Updating…</span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="surface-2 border-b border-base">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase tracking-wider">Service No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase tracking-wider">Branch &amp; Camp</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-base-muted uppercase tracking-wider">Phones</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase tracking-wider">Risk Score</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-7 h-7 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-base-muted text-sm">
                        Scanning all {(23459).toLocaleString()}+ customers for multi-phone records…
                      </span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-base-muted">
                    {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No customers with 2 or more phones found.'}
                  </td>
                </tr>
              ) : (
                customers.map(c => (
                  <tr
                    key={c.customerId}
                    onClick={() => navigate(`/customers/${c.customerId}`)}
                    className="cursor-pointer transition-colors bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500"
                  >
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-red-800">{c.name}</div>
                      <div className="text-xs text-red-500/70 mt-0.5 capitalize">{c.rank}</div>
                    </td>

                    {/* Service / Phone */}
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="text-red-700 font-semibold">{c.service_number || '—'}</div>
                      <div className="text-red-500/70 mt-0.5">{c.phone_number || '—'}</div>
                    </td>

                    {/* Branch & Camp */}
                    <td className="px-4 py-3">
                      {!!c.branch && <BranchTag branch={c.branch} />}
                      {c.campName && (
                        <div className="text-xs text-red-500/70 mt-1 flex items-center gap-1">
                          <Building2 size={11} className="opacity-60" /> {c.campName}
                        </div>
                      )}
                    </td>

                    {/* Phone count icons */}
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span className="text-xl font-black text-red-600">{c.phoneCount}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: Math.min(c.phoneCount, 5) }).map((_, i) => (
                            <Smartphone key={i} size={10} className="text-red-400" />
                          ))}
                          {c.phoneCount > 5 && <span className="text-[10px] text-red-400">+{c.phoneCount - 5}</span>}
                        </div>
                      </div>
                    </td>

                    {/* Risk score */}
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-bold
                        ${c.risk_score > 60
                          ? 'text-red-800 bg-red-200 border-red-300'
                          : 'text-red-700 bg-red-100 border-red-200'}`}>
                        {c.risk_score || 0}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span className="text-red-500 font-medium text-xs hover:underline">View →</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-base flex items-center justify-between text-sm">
              <span className="text-base-muted">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                &nbsp;·&nbsp;
                <span className="text-red-600 font-semibold">{total.toLocaleString()} total flagged</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="btn-secondary disabled:opacity-40 flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Prev
                </button>

                {/* Page number buttons – show window of 5 around current page */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                  .reduce<(number | '...')[]>((acc, n, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === 'number' && (n as number) - (arr[idx - 1] as number) > 1) {
                      acc.push('...');
                    }
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === '...'
                      ? <span key={`ellipsis-${idx}`} className="px-2 text-base-muted select-none">…</span>
                      : (
                        <button
                          key={item}
                          onClick={() => setPage(item as number)}
                          className={`w-8 h-8 rounded text-xs font-semibold transition-colors
                            ${page === item
                              ? 'bg-red-500 text-white'
                              : 'btn-secondary'}`}
                        >
                          {item}
                        </button>
                      )
                  )
                }

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="btn-secondary disabled:opacity-40 flex items-center gap-1"
                >
                  Next <ChevronRight size={14} />
                </button>
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
