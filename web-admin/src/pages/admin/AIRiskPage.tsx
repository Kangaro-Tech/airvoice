import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Bot, AlertTriangle, CheckCircle, TrendingUp, TrendingDown,
  Users, RefreshCw, Shield, ChevronDown
} from 'lucide-react';

interface CustomerRisk {
  id: string;
  full_name: string;
  service_number: string;
  branch: string;
  rank: string;
  risk_level: string;
  risk_score: number;
  retirement_date?: string;
  phone_number: string;
  camp?: { name: string };
}

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-amber-100 text-amber-700 border-amber-200',
  low:      'bg-green-100 text-green-700 border-green-200',
};

const RISK_BAR: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-green-500',
};

export default function AIRiskPage() {
  const qc = useQueryClient();
  const [aiResponse, setAiResponse] = useState('');
  const [analysisTime, setAnalysisTime] = useState('');
  const [filter, setFilter] = useState('all');

  const { data: customersRes, isLoading } = useQuery({
    queryKey: ['ai-risk-customers'],
    queryFn: () => api.get('/customers?limit=100').then(r => r.data),
  });

  const customers: CustomerRisk[] = (customersRes?.data ?? []).sort(
    (a: CustomerRisk, b: CustomerRisk) => b.risk_score - a.risk_score
  );

  const aiMutation = useMutation({
    mutationFn: () => api.post('/dashboard/ai-alerts').then(r => r.data),
    onSuccess: (data) => {
      const alerts = (data?.data ?? []) as { title: string; msg: string }[];
      if (alerts.length > 0) {
        setAiResponse(alerts.map((a) => `⚠ ${a.title}\n  ${a.msg}`).join('\n\n'));
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

  const buildLocalSummary = () => {
    const highRisk = customers.filter(c => c.risk_score >= 60);
    const medRisk  = customers.filter(c => c.risk_score >= 30 && c.risk_score < 60);
    const soonRetiring = customers.filter(c => {
      if (!c.retirement_date) return false;
      const months = (new Date(c.retirement_date).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000);
      return months < 24;
    });
    const summary = [
      `📊 AIRVOICE Risk Analysis — ${new Date().toLocaleDateString('en-GB')}`,
      '',
      `Customers Scored:  ${customers.length}`,
      `High / Critical:   ${highRisk.length}`,
      `Medium Risk:       ${medRisk.length}`,
      `Low Risk:          ${customers.length - highRisk.length - medRisk.length}`,
      '',
      highRisk.length > 0
        ? `⚠ Top High-Risk Customers:\n${highRisk.slice(0, 3).map(c =>
            `  • ${c.full_name} (${c.service_number}) — Score ${c.risk_score}/100`).join('\n')}`
        : '✅ No high-risk customers detected.',
      '',
      soonRetiring.length > 0
        ? `🏁 ${soonRetiring.length} customer(s) retiring within 24 months — review early repayment plans.`
        : '✅ No customers approaching retirement in next 24 months.',
      '',
      'Recommendation: Monitor high-risk customers monthly. Consider recovery visits for score > 60.',
    ].join('\n');
    setAiResponse(summary);
  };

  const counts = {
    critical: customers.filter(c => c.risk_level === 'critical').length,
    high:     customers.filter(c => c.risk_level === 'high').length,
    medium:   customers.filter(c => c.risk_level === 'medium').length,
    low:      customers.filter(c => c.risk_level === 'low').length,
  };

  const filtered = filter === 'all' ? customers : customers.filter(c => c.risk_level === filter);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2">
            <Bot size={28} className="text-[#2563ea]" />
            AI Risk Engine
          </h1>
          <p className="text-sm text-base-muted mt-1">
            Customer risk scoring, deduction prediction and financial analysis
          </p>
        </div>
        <button
          id="btn-run-analysis"
          onClick={() => aiMutation.mutate()}
          disabled={aiMutation.isPending || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
        >
          {aiMutation.isPending
            ? <RefreshCw size={15} className="animate-spin" />
            : <Bot size={15} />}
          {aiMutation.isPending ? 'Analysing…' : 'Run Full Analysis'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Customers Scored',    value: customers.length,             border: 'border-l-slate-400',  icon: <Users size={18} className="text-[#2563ea]" /> },
          { label: 'Critical / High Risk', value: counts.critical + counts.high, border: 'border-l-red-500',    icon: <AlertTriangle size={18} className="text-[#2563ea]" /> },
          { label: 'Medium Risk',          value: counts.medium,                 border: 'border-l-amber-500',  icon: <TrendingUp size={18} className="text-[#2563ea]" /> },
          { label: 'Low Risk',             value: counts.low,                    border: 'border-l-green-500',  icon: <CheckCircle size={18} className="text-[#2563ea]" /> },
        ].map(stat => (
          <div key={stat.label} className={`card p-4 border-l-4 ${stat.border}`}>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
              {stat.icon}
            </div>
            <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text-secondary)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* AI Response panel */}
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
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>AI Risk Engine Ready</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Click "Run Full Analysis" to generate risk predictions, identify deduction failure candidates, and get recommended actions.
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="surface border border-base rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base">
          <h2 className="font-semibold text-base-primary text-sm flex items-center gap-2">
            <TrendingDown size={15} className="text-slate-400" />
            All Customers — Sorted by Risk Score
          </h2>
          <div className="flex gap-1.5">
            {['all', 'critical', 'high', 'medium', 'low'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
                  filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading customer risk data…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Customer', 'Camp', 'Branch', 'Service No.', 'Risk Score', 'Risk Level', 'Prediction', 'Retirement'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(c => {
                  const retireDate = c.retirement_date ? new Date(c.retirement_date) : null;
                  const monthsLeft = retireDate
                    ? Math.round((retireDate.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000))
                    : null;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{c.full_name}</div>
                        <div className="text-xs text-slate-400">{c.rank}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{c.camp?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold capitalize">{c.branch}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.service_number}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 w-6 text-right">{c.risk_score}</span>
                          <div className="flex-1 surface-2 rounded-full h-1.5 w-20">
                            <div
                              className={`h-1.5 rounded-full ${RISK_BAR[c.risk_level] ?? 'bg-gray-400'} transition-all`}
                              style={{ width: `${Math.min(c.risk_score, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold capitalize ${RISK_COLORS[c.risk_level] ?? ''}`}>
                          {c.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.risk_score >= 60 ? (
                          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertTriangle size={11} /> Likely to miss
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle size={11} /> Expected OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {monthsLeft !== null ? (
                          <span className={monthsLeft < 24 ? 'text-orange-600 font-semibold' : 'text-slate-400'}>
                            {monthsLeft < 0 ? 'Retired' : `${monthsLeft}m left`}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
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
