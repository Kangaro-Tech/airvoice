import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Bot, AlertTriangle, CheckCircle, TrendingUp, TrendingDown,
  Users, RefreshCw, Shield, PhoneCall, Clock, Banknote
} from 'lucide-react';

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
  high:     'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
  medium:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  low:      'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800',
};

const RISK_BAR: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-green-500',
};

const ROW_BG: Record<string, string> = {
  critical: 'bg-red-50/60 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30',
  high:     'bg-orange-50/40 hover:bg-orange-50 dark:bg-orange-950/10 dark:hover:bg-orange-950/20',
  medium:   'hover:bg-amber-50/30 dark:hover:bg-amber-950/10',
  low:      'hover:bg-slate-50 dark:hover:bg-slate-800/30',
};

export default function AIRiskPage() {
  const [aiResponse, setAiResponse] = useState('');
  const [analysisTime, setAnalysisTime] = useState('');
  const [filter, setFilter] = useState('all');

  const { data: riskRes, isLoading, refetch } = useQuery({
    queryKey: ['ai-risk-customers'],
    queryFn: () => api.get('/dashboard/customer-phone-counts').then(r => r.data),
    staleTime: 60_000,
  });

  const customers: any[] = riskRes?.data ?? [];
  const riskSummary = riskRes?.summary;

  const counts = {
    total:       riskSummary?.total ?? customers.length,
    critical:    riskSummary?.critical ?? customers.filter(c => c.risk_level === 'critical').length,
    high:        riskSummary?.high ?? customers.filter(c => c.risk_level === 'high').length,
    medium:      riskSummary?.medium ?? customers.filter(c => c.risk_level === 'medium').length,
    low:         riskSummary?.low ?? customers.filter(c => c.risk_level === 'low').length,
    flagged:     riskSummary?.flagged ?? customers.filter(c => c.isFlagged).length,
    withArrears: riskSummary?.withArrears ?? customers.filter(c => c.hasArrears).length,
    multiPhone:  riskSummary?.multiPhone ?? customers.filter(c => c.phoneCount >= 2).length,
    twoPhones:   riskSummary?.twoPhones ?? customers.filter(c => c.phoneCount === 2).length,
  };

  const totalArrearsAmount = riskSummary?.totalArrearsAmount ?? customers.reduce((s: number, c: any) => s + (c.arrearsAmount || 0), 0);

  const buildLocalSummary = () => {
    const highRisk = customers.filter((c: any) => c.risk_score >= 60);
    const summary = [
      `AIRVOICE AI Risk Analysis - ${new Date().toLocaleDateString('en-GB')}`,
      `Generated from live database at ${new Date().toLocaleTimeString()}`,
      '',
      `Customer Risk Summary`,
      `Total Active-Plan Customers:   ${counts.total}`,
      `Critical (Arrears):            ${counts.critical}`,
      `High Risk (2+ Phones):         ${counts.high}`,
      `Medium Risk (2 Phones):        ${counts.medium}`,
      `Low Risk:                      ${counts.low}`,
      `Total Flagged:                 ${counts.flagged}`,
      '',
      `Financial Risk Indicators`,
      `Customers with Arrears:        ${counts.withArrears}`,
      `Total Arrears Amount:          LKR ${totalArrearsAmount.toLocaleString()}`,
      `Multi-Phone (2+):              ${counts.multiPhone}`,
      `Dual-Phone (2):                ${counts.twoPhones}`,
      '',
      highRisk.length > 0
        ? `Top High-Risk Customers\n${highRisk.slice(0, 5).map((c: any, i: number) =>
            `  ${i + 1}. ${c.name} (${c.service_number || 'N/A'}) - Score ${c.risk_score}/100 [${c.risk_level.toUpperCase()}]${c.hasArrears ? ' ARREARS' : ''}${c.phoneCount >= 2 ? ` ${c.phoneCount} PHONES` : ''}`
          ).join('\n')}`
        : 'No high-risk customers detected.',
      '',
      'Recommendation: Prioritize recovery for customers with arrears. Review multi-phone customers for credit concentration risk.',
    ].join('\n');
    setAiResponse(summary);
  };

  const aiMutation = useMutation({
    mutationFn: () => api.post('/dashboard/weekly-summary', { context: 'risk_recovery' }).then(r => r.data),
    onSuccess: (data: any) => {
      if (data?.summary) {
        setAiResponse(
          `AIRVOICE AI Risk Analysis - ${new Date().toLocaleDateString('en-GB')}\n\n` +
          `Live Database: ${counts.total} customers | ${counts.flagged} flagged | ${counts.withArrears} with arrears | Total Arrears: LKR ${totalArrearsAmount.toLocaleString()}\n\n` +
          `OpenAI Analysis:\n${data.summary}`
        );
      } else {
        buildLocalSummary();
      }
      setAnalysisTime(new Date().toLocaleString());
    },
    onError: () => {
      buildLocalSummary();
      setAnalysisTime(new Date().toLocaleString());
    },
  });

  const filtered = filter === 'all'
    ? customers
    : filter === 'flagged'
      ? customers.filter((c: any) => c.isFlagged)
      : customers.filter((c: any) => c.risk_level === filter);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Bot size={28} className="text-[#2563ea]" />
            AI Risk Engine
          </h1>
          <p className="text-sm text-base-muted mt-1">
            Real-time risk scoring from live database � arrears, multi-phone flags, retirement risk
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 border border-base rounded-lg text-sm font-semibold text-base-secondary hover:bg-slate-100 disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            id="btn-run-analysis"
            onClick={() => aiMutation.mutate()}
            disabled={aiMutation.isPending || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
          >
            {aiMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Bot size={15} />}
            {aiMutation.isPending ? 'Analysing...' : 'Run AI Analysis'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Customers',    value: counts.total,         border: 'border-l-slate-400',  icon: <Users size={16} className="text-slate-500" />,        bg: '' },
          { label: 'Critical',     value: counts.critical,      border: 'border-l-red-500',    icon: <AlertTriangle size={16} className="text-red-500" />,  bg: counts.critical > 0 ? 'bg-red-50 dark:bg-red-950/20' : '' },
          { label: 'High Risk',    value: counts.high,          border: 'border-l-orange-500', icon: <TrendingUp size={16} className="text-orange-500" />,  bg: '' },
          { label: 'Medium Risk',  value: counts.medium,        border: 'border-l-amber-500',  icon: <TrendingDown size={16} className="text-amber-500" />, bg: '' },
          { label: 'With Arrears', value: counts.withArrears,   border: 'border-l-rose-600',   icon: <Banknote size={16} className="text-rose-600" />,      bg: counts.withArrears > 0 ? 'bg-rose-50 dark:bg-rose-950/20' : '' },
          { label: 'Multi-Phone',  value: counts.multiPhone,    border: 'border-l-purple-500', icon: <PhoneCall size={16} className="text-purple-500" />,   bg: '' },
        ].map(stat => (
          <div key={stat.label} className={`card p-3 border-l-4 ${stat.border} ${stat.bg}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
              {stat.icon}
            </div>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {counts.withArrears > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
          <AlertTriangle size={20} className="text-red-600 shrink-0" />
          <div>
            <div className="font-bold text-sm text-red-800 dark:text-red-200">
              {counts.withArrears} customer{counts.withArrears > 1 ? 's' : ''} with active arrears � Total: LKR {totalArrearsAmount.toLocaleString()}
            </div>
            <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Customers have installments with arrears amount or not_deducted status. Immediate recovery action required.
            </div>
          </div>
        </div>
      )}

      {aiResponse && (
        <div className="card p-5" style={{ borderLeft: '4px solid #a855f7' }}>
          <div className="flex items-center gap-2 mb-3">
            <Bot size={17} className="text-purple-500" />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>AI Risk Analysis</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{analysisTime}</span>
          </div>
          <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans" style={{ color: 'var(--text-secondary)' }}>{aiResponse}</pre>
        </div>
      )}

      {!aiResponse && (
        <div className="card p-4 flex items-start gap-3" style={{ borderLeft: '4px solid #3b82f6' }}>
          <Shield size={17} className="text-blue-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>AI Risk Engine Ready � Live Database Connected</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {isLoading ? 'Loading...' : `${counts.total} customers with active phone plans. ${counts.flagged} flagged for risk. ${counts.withArrears} with arrears.`}
              {' '}Click "Run AI Analysis" to generate OpenAI-powered risk analysis.
            </div>
          </div>
        </div>
      )}

      <div className="surface border border-base rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base flex-wrap gap-2">
          <h2 className="font-semibold text-base-primary text-sm flex items-center gap-2">
            <TrendingDown size={15} className="text-slate-400" />
            Customers with Active Plans � Sorted by Risk Score
            <span className="badge bg-slate-100 text-slate-600 text-[10px] font-bold ml-1">{filtered.length} shown</span>
          </h2>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'all',      label: `All (${counts.total})` },
              { key: 'critical', label: `Critical (${counts.critical})` },
              { key: 'high',     label: `High (${counts.high})` },
              { key: 'medium',   label: `Medium (${counts.medium})` },
              { key: 'low',      label: `Low (${counts.low})` },
              { key: 'flagged',  label: `Flagged (${counts.flagged})` },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  filter === f.key
                    ? f.key === 'flagged'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading real risk data from database...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  {['#', 'Customer', 'Camp', 'Branch', 'Service No.', 'Phones', 'Arrears (LKR)', 'Risk Score', 'Risk Level', 'Issues', 'Retirement'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {filtered.map((c: any, idx: number) => {
                  const retireDate = c.retirement_date ? new Date(c.retirement_date) : null;
                  const monthsLeft = retireDate
                    ? Math.round((retireDate.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000))
                    : null;
                  return (
                    <tr key={c.customerId} className={`transition-colors ${ROW_BG[c.risk_level] ?? ''}`}>
                      <td className="px-3 py-3 text-[10px] text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{c.name}</div>
                        <div className="text-[10px] text-slate-400">{c.rank}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 max-w-[100px] truncate">{c.campName ?? '�'}</td>
                      <td className="px-3 py-3">
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10px] font-semibold capitalize">{c.branch}</span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{c.service_number || '�'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-black text-base ${c.phoneCount >= 2 ? 'text-red-600' : c.phoneCount === 2 ? 'text-amber-600' : 'text-green-600'}`}>
                          {c.phoneCount}
                        </span>
                        <div className="text-[9px] text-slate-400">{c.phoneCount >= 2 ? 'MULTI' : c.phoneCount === 2 ? 'DUAL' : 'OK'}</div>
                      </td>
                      <td className="px-3 py-3">
                        {c.hasArrears ? (
                          <div>
                            <div className="font-bold text-red-700 dark:text-red-400 text-xs">LKR {(c.arrearsAmount || 0).toLocaleString()}</div>
                            <div className="text-[9px] text-red-500">Arrears</div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-green-600">None</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800 dark:text-slate-200 w-8 text-right text-sm">{c.risk_score}</span>
                          <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${RISK_BAR[c.risk_level] ?? 'bg-gray-400'} transition-all`}
                              style={{ width: `${Math.min(c.risk_score, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${RISK_COLORS[c.risk_level] ?? ''}`}>
                          {c.risk_level}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5 items-start">
                          {c.hasArrears && (
                            <span className="flex items-center gap-0.5 text-[9px] bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-1 py-0.5 rounded font-bold">
                              <AlertTriangle size={8} /> ARREARS
                            </span>
                          )}
                          {c.phoneCount >= 2 && (
                            <span className="flex items-center gap-0.5 text-[9px] bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-1 py-0.5 rounded font-bold">
                              <PhoneCall size={8} /> MULTI-PHONE
                            </span>
                          )}
                          {c.retirementRisk && (
                            <span className="flex items-center gap-0.5 text-[9px] bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 px-1 py-0.5 rounded font-bold">
                              <Clock size={8} /> RETIRING
                            </span>
                          )}
                          {!c.isFlagged && (
                            <span className="flex items-center gap-0.5 text-[9px] text-green-600 font-medium">
                              <CheckCircle size={8} /> OK
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {monthsLeft !== null ? (
                          <span className={monthsLeft < 12 ? 'text-red-600 font-bold' : monthsLeft < 24 ? 'text-orange-600 font-semibold' : 'text-slate-400'}>
                            {monthsLeft < 0 ? 'Retired' : `${monthsLeft}m`}
                          </span>
                        ) : <span className="text-slate-300">�</span>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No customers found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
