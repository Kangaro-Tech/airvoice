import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/services/api';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Pencil, Loader2 } from 'lucide-react';
import { EditDrawer } from '@/components/EditDrawer';
import { useAuthStore } from '@/store/authStore';

const STAGES = ['submitted','sales_review','camp_review','finance_review','admin_review','approved','active','completed'];
const NEXT_ACTION: Record<string,{endpoint:string;label:string;requiredRoles:string[]}> = {
  submitted:{endpoint:'sales-review',label:'Sales Review',requiredRoles:['sales_officer','admin','super_admin','system_operator']},
  sales_review:{endpoint:'sales-review',label:'Sales Decision',requiredRoles:['sales_officer','admin','super_admin','system_operator']},
  camp_review:{endpoint:'camp-review',label:'Camp Decision',requiredRoles:['camp_officer','admin','super_admin','system_operator']},
  finance_review:{endpoint:'finance-review',label:'Finance Decision',requiredRoles:['finance_officer','accountant','admin','super_admin','system_operator']},
  admin_review:{endpoint:'admin-approve',label:'Admin Decision',requiredRoles:['admin','super_admin','system_operator']},
};

export default function ApplicationDetailPage() {
  const {id} = useParams<{id:string}>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [note,setNote]=useState('');
  const [rejReason,setRejReason]=useState('');
  const [editOpen,setEditOpen]=useState(false);
  const [editNotes,setEditNotes]=useState('');

  const editMutation=useMutation({
    mutationFn:(data:Record<string,unknown>)=>api.patch(`/applications/${id}`,data),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['application',id]});setEditOpen(false);},
  });

  const {data,isLoading}=useQuery({
    queryKey:['application',id],
    queryFn:()=>api.get(`/applications/${id}`).then(r=>r.data.data),
  });

  const actionMutation = useMutation({
    mutationFn:({endpoint,action}:{endpoint:string;action:'approve'|'reject'})=>
      api.post(`/applications/${id}/${endpoint}`,{action,note,rejection_reason:rejReason}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['application',id]});setNote('');setRejReason('');},
  });

  if (isLoading) return <div className="p-6 text-base-muted">Loading…</div>;
  if (!data) return <div className="p-6 text-red-600">Application not found</div>;

  const a = data as Record<string, any>;
  const cust = a.customer as Record<string, any>|null;
  const pm = a.phone_model as {brand:string;model:string;storage:string}|null;
  const campObj = (cust?.camp as {name:string}|null);
  const retRisk = a.retirement_date && a.plan_end_date && a.retirement_date <= a.plan_end_date;
  const nextAction = NEXT_ACTION[a.status as string];

  const stageIdx = STAGES.indexOf(a.status as string);

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/applications" className="text-base-muted hover:text-gray-600"><ArrowLeft size={20}/></Link>
        <div>
          <h1 className="text-xl font-bold text-base-primary">Application {a.ref_number as string}</h1>
          <div className="text-sm text-base-muted">Created {new Date(a.created_at as string).toLocaleDateString()}</div>
        </div>
        {['draft','submitted','sales_review'].includes(a.status as string) && (
          <button onClick={()=>{setEditNotes((a.notes as string)??'');setEditOpen(true);}} className="ml-auto btn-secondary text-sm">
            <Pencil size={14}/>Edit Application
          </button>
        )}
      </div>

      {/* Pipeline progress */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          {STAGES.slice(0,7).map((s,i)=>(
            <div key={s} className="flex items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i<stageIdx?'bg-green-500 text-white':i===stageIdx?'bg-blue-600 text-white':'surface-2 text-base-muted'}`}>
                {i<stageIdx?<CheckCircle size={16}/>:String(i+1)}
              </div>
              {i<6 ? <div className={`h-0.5 flex-1 mx-1 ${i<stageIdx?'bg-green-400':'surface-3'}`}/> : null}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {STAGES.slice(0,7).map(s=><div key={s} className="text-xs text-base-muted capitalize text-center" style={{flex:1}}>{s.replace('_',' ')}</div>)}
        </div>
      </div>

      {retRisk && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800">
          <AlertTriangle size={20}/><div><div className="font-semibold">Retirement Risk</div><div className="text-sm">Plan end date {a.plan_end_date as string} exceeds retirement date {a.retirement_date as string}</div></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* Application details */}
        <div className="card p-5">
          <h2 className="font-semibold text-base-primary mb-4">Application Details</h2>
          <div className="space-y-2.5 text-sm">
            {([['Phone',`${(pm as any)?.brand} ${(pm as any)?.model} ${(pm as any)?.storage}`],['Sale Price',`LKR ${Number((a as any).sale_price||0).toLocaleString()}`],['Monthly',`LKR ${Number((a as any).monthly_amount||0).toLocaleString()}`],['Term',`${(a as any).term_months} months`],['Plan End Date',(a as any).plan_end_date as string],['Sale Date',(a as any).sale_date as string]] as [string,string][]).map(([l,v])=>(
              <div key={l} className="flex justify-between"><span className="text-base-muted">{l}</span><span className="font-medium">{v}</span></div>
            ))}
          </div>
        </div>

        {/* Customer details */}
        <div className="card p-5">
          <h2 className="font-semibold text-base-primary mb-4">Customer</h2>
          <div className="space-y-2.5 text-sm">
            {([['Name',(cust as any)?.full_name],['Rank',(cust as any)?.rank],['Branch',((cust as any)?.branch as string)?.replace('_',' ')],['Camp',(campObj as any)?.name],['Retirement',(cust as any)?.retirement_date],['Risk Level',(cust as any)?.risk_level]] as [string, string|null|undefined][]).filter(([,v])=>v).map(([l,v])=>(
              <div key={l} className="flex justify-between"><span className="text-base-muted">{l}</span><span className="font-medium capitalize">{v}</span></div>
            ))}
          </div>
          <Link to={`/customers/${cust?.id}`} className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 font-semibold block">View full profile →</Link>
        </div>
      </div>

      {/* Submit Action for Draft */}
      {a.status === 'draft' && (user?.role === 'sales_officer' || user?.role === 'admin' || user?.role === 'super_admin') && (
        <div className="card p-5 border-blue-200 bg-blue-50/20">
          <h2 className="font-semibold text-base-primary mb-2">Submit Application</h2>
          <p className="text-sm text-base-muted mb-4 font-medium">This application is currently in draft. Submit it to start the review process.</p>
          <button
            onClick={() => {
              api.post(`/applications/${id}/submit`, {})
                .then(() => qc.invalidateQueries({ queryKey: ['application', id] }))
                .catch((err: any) => alert(err.response?.data?.error || 'Submit failed'));
            }}
            className="flex items-center gap-2 btn-primary"
          >
            <CheckCircle size={16} /> Submit for Review
          </button>
        </div>
      )}

      {/* Action panel */}
      {nextAction && (
        <div className="card p-5">
          <h2 className="font-semibold text-base-primary mb-4">{nextAction.label}</h2>
          <div className="space-y-3">
            <div>
              <label className="form-label">Note (optional)</label>
              <textarea className="form-input" rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a review note…"/>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>actionMutation.mutate({endpoint:nextAction.endpoint,action:'approve'})}
                disabled={actionMutation.isPending}
                className="flex items-center gap-2 btn-primary">
                <CheckCircle size={16}/>Approve
              </button>
              <div className="flex gap-2 flex-1">
                <input className="form-input flex-1" placeholder="Rejection reason" value={rejReason} onChange={e=>setRejReason(e.target.value)}/>
                <button onClick={()=>actionMutation.mutate({endpoint:nextAction.endpoint,action:'reject'})}
                  disabled={actionMutation.isPending||!rejReason}
                  className="flex items-center gap-2 btn-danger disabled:opacity-40">
                  <XCircle size={16}/>Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Application Drawer */}
      <EditDrawer
        title="Edit Application"
        subtitle={`Modify details for application ${a.ref_number}`}
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Down Payment (LKR)</label>
            <input
              type="number"
              className="form-input w-full"
              defaultValue={a.down_payment}
              id="editDownPayment"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Term (Months)</label>
            <select
              className="form-input w-full"
              defaultValue={a.term_months}
              id="editTermMonths"
            >
              {[6, 9, 12, 18, 24].map(n => (
                <option key={n} value={n}>{n} months</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Internal Notes</label>
            <textarea
              className="form-input w-full"
              rows={4}
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Add internal remarks about this application..."
            />
          </div>
          <div className="pt-4 flex justify-end gap-2 border-t border-base">
            <button
              onClick={() => setEditOpen(false)}
              className="btn-secondary py-1.5 px-4 rounded-xl text-base-secondary font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const dp = Number((document.getElementById('editDownPayment') as HTMLInputElement)?.value || 0);
                const term = Number((document.getElementById('editTermMonths') as HTMLSelectElement)?.value || 12);
                editMutation.mutate({
                  down_payment: dp,
                  term_months: term,
                  notes: editNotes || null
                });
              }}
              disabled={editMutation.isPending}
              className="btn bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-5 rounded-xl font-bold flex items-center gap-1.5"
            >
              {editMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </EditDrawer>
    </div>
  );
}
