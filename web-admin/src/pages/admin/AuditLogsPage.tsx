import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/services/api';
import {
  ScrollText, Search, Tag, User, ChevronLeft, ChevronRight,
  Plus, Pencil, Trash2, LogIn, ShieldCheck, Activity
} from 'lucide-react';

// small icon per action type — matched loosely against common action-name patterns
function actionIcon(action: string) {
  const a = (action || '').toUpperCase();
  if (a.includes('CREATE')) return <Plus size={12} className="text-green-500" />;
  if (a.includes('UPDATE') || a.includes('EDIT')) return <Pencil size={12} className="text-amber-500" />;
  if (a.includes('DELETE') || a.includes('REMOVE')) return <Trash2 size={12} className="text-red-500" />;
  if (a.includes('LOGIN') || a.includes('AUTH')) return <LogIn size={12} className="text-blue-500" />;
  if (a.includes('APPROVE') || a.includes('VERIFY')) return <ShieldCheck size={12} className="text-teal-500" />;
  return <Activity size={12} className="text-slate-400" />;
}

export default function AuditLogsPage() {
  const [page,setPage]=useState(1);
  const [action,setAction]=useState('');
  const [entity,setEntity]=useState('');

  const {data,isLoading}=useQuery({
    queryKey:['audit-logs',page,action,entity],
    queryFn:()=>api.get('/admin/audit-logs',{params:{page,action:action||undefined,entity_type:entity||undefined}}).then(r=>r.data),
  });
  const logs=(data?.data||[]) as Record<string,unknown>[];
  const meta=data?.meta as {total:number;page:number;pages:number}|undefined;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <ScrollText size={28} className="text-[#2563ea]" />
        <h1 className="text-2xl font-bold">Audit Logs</h1>
      </div>

      <div className="card p-4 mb-5 flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
          <input
            className="form-input w-full pl-9"
            placeholder="Filter by action (e.g. CUSTOMER_CREATED)…"
            value={action}
            onChange={e=>{setAction(e.target.value);setPage(1);}}
          />
        </div>
        <div className="relative w-48">
          <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted" />
          <input
            className="form-input w-full pl-9"
            placeholder="Entity type…"
            value={entity}
            onChange={e=>{setEntity(e.target.value);setPage(1);}}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="surface-2 border-b border-base">
              <tr>{['Time','User','Action','Entity','Entity ID','IP'].map(h=><th key={h} className="px-3 py-2.5 text-left font-semibold text-base-muted uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {isLoading?<tr><td colSpan={6} className="py-8 text-center text-base-muted">Loading…</td></tr>
              :logs.map(l=>{
                const u=l.user as {phone_number:string}|null;
                return (
                  <tr key={l.id as number} className="hover:bg-[var(--bg-surface-2)]">
                    <td className="px-3 py-2 text-base-muted">{new Date(l.created_at as string).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <User size={11} className="text-base-muted" />
                        {u?.phone_number||l.firebase_uid as string||'system'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1.5">
                        {actionIcon(l.action as string)}
                        {l.action as string}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{l.entity_type as string}</td>
                    <td className="px-3 py-2 text-base-muted">{(l.entity_id as string)?.slice(0,8)||'—'}</td>
                    <td className="px-3 py-2 text-base-muted">{(l.ip_address as string)||'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {meta&&meta.pages>1&&(
          <div className="px-4 py-3 border-t border-base flex items-center justify-between text-sm text-gray-600">
            <span>Page {meta.page} of {meta.pages} · {meta.total} entries</span>
            <div className="flex gap-2">
              <button disabled={meta.page<=1} onClick={()=>setPage(p=>p-1)} className="btn-secondary text-xs disabled:opacity-40 flex items-center gap-1">
                <ChevronLeft size={13} /> Prev
              </button>
              <button disabled={meta.page>=meta.pages} onClick={()=>setPage(p=>p+1)} className="btn-secondary text-xs disabled:opacity-40 flex items-center gap-1">
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}