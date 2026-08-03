import { useState, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Building2, Plus, Pencil, Trash2, UserPlus, UserMinus, ChevronDown, ChevronRight, Check, X, Loader2, Search } from 'lucide-react';

type Branch = 'army' | 'navy' | 'air_force';
const BRANCHES: Branch[] = ['army', 'navy', 'air_force'];
const BRANCH_LABEL: Record<Branch, string> = { army: 'Army', navy: 'Navy', air_force: 'Air Force' };
const BRANCH_COLOR: Record<Branch, string> = {
  army:      'bg-green-100 text-green-800',
  navy:      'bg-blue-100 text-blue-800',
  air_force: 'bg-sky-100 text-sky-800',
};

interface Camp {
  id: string; name: string; name_si: string | null; name_ta: string | null;
  branch: Branch; district: string | null; province: string | null; is_active: boolean;
  regiments: Regiment[];
  camp_officer_assignments: OfficerAssignment[];
}
interface Regiment {
  id: string; name: string; name_si: string | null; branch: Branch; is_active: boolean;
}
interface OfficerAssignment {
  user_id: string; is_active: boolean;
  user: { id: string; phone_number: string; role: string; is_active: boolean };
}
interface District {
  id: string;
  name: string;
  name_si: string | null;
  name_ta: string | null;
  province: string;
}

function CampForm({ initial, districts = [], onSubmit, onCancel, loading }: {
  initial?: Partial<Camp>;
  districts?: District[];
  onSubmit: (d: Record<string, unknown>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    name:     initial?.name     ?? '',
    branch:   (initial?.branch  ?? 'army') as Branch,
    district: initial?.district ?? '',
    province: initial?.province ?? '',
    is_active: initial?.is_active ?? true,
  });
  const set = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const setDistrict = (e: ChangeEvent<HTMLSelectElement>) => {
    const district = e.target.value;
    const selected = districts.find(d => d.name === district);
    setForm(f => ({ ...f, district, province: selected?.province ?? f.province }));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="form-label">Camp Name *</label>
          <input className="form-input" value={form.name} onChange={set('name')} placeholder="e.g. Panagoda Army Camp" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Branch *</label>
            <select className="form-input" value={form.branch} onChange={set('branch')}>
              {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_LABEL[b]}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">District</label>
            <select className="form-input" value={form.district} onChange={setDistrict}>
              <option value="">Select district</option>
              {form.district && !districts.some(d => d.name === form.district) && (
                <option value={form.district}>Unknown district: {form.district}</option>
              )}
              {districts.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Province</label>
            <input className="form-input" value={form.province} onChange={set('province')} placeholder="Western" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="w-4 h-4 rounded" />
              <span className="text-sm text-base-secondary">Active</span>
            </label>
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={() => onSubmit(form)} disabled={!form.name || loading} className="btn-primary disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {initial?.id ? 'Save Changes' : 'Create Camp'}
        </button>
        <button onClick={onCancel} className="btn-secondary"><X size={15} />Cancel</button>
      </div>
    </div>
  );
}

export default function CampManagementPage() {
  const qc = useQueryClient();
  const [selectedCamp, setSelectedCamp] = useState<Camp | null>(null);
  const [expandedCamps, setExpandedCamps] = useState<Set<string>>(new Set());
  const [editingCamp, setEditingCamp] = useState<Camp | null>(null);
  const [addingCamp, setAddingCamp] = useState(false);
  const [addingRegiment, setAddingRegiment] = useState(false);
  const [editingRegiment, setEditingRegiment] = useState<Regiment | null>(null);
  const [newRegName, setNewRegName] = useState('');
  const [newRegNameSi, setNewRegNameSi] = useState('');
  const [officerSearch, setOfficerSearch] = useState('');
  const [officerSearchResult, setOfficerSearchResult] = useState<{ id: string; phone_number: string; role: string } | null>(null);
  const [branchFilter, setBranchFilter] = useState<Branch | ''>('');

  const { data: campsData, isLoading } = useQuery({
    queryKey: ['camps', 'all'],
    queryFn: () => api.get('/camps', { params: { include_inactive: 'true' } }).then(r => r.data.data as Camp[]),
  });
  const { data: districtsData } = useQuery({
    queryKey: ['districts'],
    queryFn: () => api.get('/districts').then(r => r.data.data as District[]),
  });
  const districts = districtsData ?? [];
  const camps = (campsData ?? []).filter(c => !branchFilter || c.branch === branchFilter);

  const campMut = useMutation({
    mutationFn: (d: { id?: string; data: Record<string, unknown> }) =>
      d.id ? api.patch(`/camps/${d.id}`, d.data) : api.post('/camps', d.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camps'] }); setEditingCamp(null); setAddingCamp(false); },
  });
  const regMut = useMutation({
    mutationFn: (d: { campId: string; id?: string; data: Record<string, unknown> }) =>
      d.id ? api.patch(`/camps/${d.campId}/regiments/${d.id}`, d.data) : api.post(`/camps/${d.campId}/regiments`, d.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camps'] }); setAddingRegiment(false); setEditingRegiment(null); setNewRegName(''); setNewRegNameSi(''); },
  });
  const deleteRegMut = useMutation({
    mutationFn: ({ campId, rid }: { campId: string; rid: string }) => api.delete(`/camps/${campId}/regiments/${rid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }),
  });
  const officerMut = useMutation({
    mutationFn: ({ campId, userId }: { campId: string; userId: string }) => api.post(`/camps/${campId}/officers`, { user_id: userId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['camps'] }); setOfficerSearch(''); setOfficerSearchResult(null); },
  });
  const removeOfficerMut = useMutation({
    mutationFn: ({ campId, userId }: { campId: string; userId: string }) => api.delete(`/camps/${campId}/officers/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }),
  });

  const searchOfficer = async () => {
    if (!officerSearch.trim()) return;
    try {
      const res = await api.get('/users', { params: { limit: 5 } });
      const users = res.data.data as { id: string; phone_number: string; role: string }[];
      const found = users.find(u => u.phone_number.includes(officerSearch));
      setOfficerSearchResult(found ?? null);
    } catch { setOfficerSearchResult(null); }
  };

  const toggleExpand = (id: string) => setExpandedCamps(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (isLoading) return <div className="p-6 text-base-muted">Loading camps…</div>;

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-primary flex items-center gap-2"><Building2 size={22} />Camp &amp; Regiment Management</h1>
          <p className="text-sm text-base-muted mt-1">Super admin only — create camps, manage regiments, and assign camp officers.</p>
        </div>
        <button onClick={() => { setAddingCamp(true); setEditingCamp(null); }} className="btn-primary">
          <Plus size={16} />New Camp
        </button>
      </div>

      {/* Branch filter */}
      <div className="flex gap-2">
        {(['', ...BRANCHES] as const).map(b => (
          <button key={b} onClick={() => setBranchFilter(b as Branch | '')}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${branchFilter === b ? 'bg-blue-600 text-white border-transparent' : 'border-base text-gray-600 hover:border-gray-400'}`}
            style={{ backgroundColor: branchFilter === b ? '#2563eb' : undefined }}>
            {b ? BRANCH_LABEL[b as Branch] : 'All'}
          </button>
        ))}
      </div>

      {/* Add camp form */}
      {addingCamp && (
        <div className="card p-5 border-2 border-amber-300">
          <h2 className="font-semibold text-base-primary mb-4">New Camp</h2>
          <CampForm districts={districts} onSubmit={d => campMut.mutate({ data: d })} onCancel={() => setAddingCamp(false)} loading={campMut.isPending} />
        </div>
      )}

      {/* Camp list */}
      {camps.length === 0 && <div className="card p-8 text-center text-base-muted">No camps found. Create one above.</div>}

      {camps.map(camp => {
        const expanded = expandedCamps.has(camp.id);
        const activeOfficers = (camp.camp_officer_assignments ?? []).filter(a => a.is_active);
        return (
          <div key={camp.id} className={`card overflow-hidden ${!camp.is_active ? 'opacity-60' : ''}`}>
            {/* Camp header */}
            <div className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-surface-2)]" onClick={() => toggleExpand(camp.id)}>
              {expanded ? <ChevronDown size={18} className="text-base-muted" /> : <ChevronRight size={18} className="text-base-muted" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base-primary">{camp.name}</span>
                  <span className={`badge text-xs ${BRANCH_COLOR[camp.branch]}`}>{BRANCH_LABEL[camp.branch]}</span>
                  {!camp.is_active && <span className="badge bg-red-100 text-red-700 text-xs">Inactive</span>}
                </div>
                <div className="text-xs text-base-muted mt-0.5">
                  {camp.district && `${camp.district} · `}{camp.province}
                  {camp.name_si && <span className="ml-2 text-gray-300">{camp.name_si}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-base-muted">
                <span>{(camp.regiments ?? []).filter(r => r.is_active).length} regiments</span>
                <span>{activeOfficers.length} officers</span>
              </div>
              <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditingCamp(camp); setAddingCamp(false); setSelectedCamp(camp); setExpandedCamps(s => { const n = new Set(s); n.add(camp.id); return n; }); }}
                  className="p-1.5 text-base-muted hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil size={15} /></button>
              </div>
            </div>

            {/* Expanded content */}
            {expanded && (
              <div className="border-t border-base px-5 py-4 space-y-5 surface-2">

                {/* Edit camp form */}
                {editingCamp?.id === camp.id && (
                  <div className="surface rounded-xl p-4 border border-amber-200">
                    <h3 className="font-semibold text-base-secondary mb-3">Edit Camp</h3>
                    <CampForm
                      initial={camp}
                      districts={districts}
                      onSubmit={d => campMut.mutate({ id: camp.id, data: d })}
                      onCancel={() => setEditingCamp(null)}
                      loading={campMut.isPending}
                    />
                  </div>
                )}

                {/* Regiments */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-base-secondary">Regiments / Units</h3>
                    <button onClick={() => { setAddingRegiment(true); setSelectedCamp(camp); }} className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1">
                      <Plus size={13} />Add Regiment
                    </button>
                  </div>

                  {addingRegiment && selectedCamp?.id === camp.id && (
                    <div className="surface rounded-lg p-3 mb-2 border border-base space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input className="form-input text-sm" value={newRegName} onChange={e => setNewRegName(e.target.value)} placeholder="Regiment name (English)" />
                        <input className="form-input text-sm" value={newRegNameSi} onChange={e => setNewRegNameSi(e.target.value)} placeholder="රෙජිමේන්තු නාමය (SI)" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => regMut.mutate({ campId: camp.id, data: { name: newRegName, name_si: newRegNameSi || undefined, branch: camp.branch } })}
                          disabled={!newRegName || regMut.isPending} className="btn-primary text-xs py-1 disabled:opacity-50">
                          {regMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                        </button>
                        <button onClick={() => setAddingRegiment(false)} className="btn-secondary text-xs py-1"><X size={12} />Cancel</button>
                      </div>
                    </div>
                  )}

                  {(camp.regiments ?? []).length === 0 && (
                    <p className="text-xs text-base-muted py-2">No regiments yet.</p>
                  )}

                  <div className="space-y-1">
                    {(camp.regiments ?? []).map(reg => (
                      <div key={reg.id} className={`flex items-center gap-3 px-3 py-2 surface rounded-lg border border-base ${!reg.is_active ? 'opacity-50' : ''}`}>
                        {editingRegiment?.id === reg.id ? (
                          <>
                            <input className="form-input text-sm flex-1 py-1" defaultValue={reg.name}
                              onBlur={e => setEditingRegiment(r => r ? { ...r, name: e.target.value } : null)} />
                            <button onClick={() => regMut.mutate({ campId: camp.id, id: reg.id, data: { name: editingRegiment.name } })}
                              className="text-green-600 hover:text-green-800 p-1"><Check size={14} /></button>
                            <button onClick={() => setEditingRegiment(null)} className="text-base-muted hover:text-gray-600 p-1"><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-base-secondary">{reg.name}</span>
                            {reg.name_si && <span className="text-xs text-base-muted">{reg.name_si}</span>}
                            {!reg.is_active && <span className="badge bg-red-50 text-red-600 text-xs">Inactive</span>}
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditingRegiment(reg)} className="p-1 text-base-muted hover:text-blue-600"><Pencil size={13} /></button>
                              <button onClick={() => { if (confirm(`Deactivate ${reg.name}?`)) deleteRegMut.mutate({ campId: camp.id, rid: reg.id }); }}
                                className="p-1 text-base-muted hover:text-red-600"><Trash2 size={13} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Camp officers */}
                <div>
                  <h3 className="font-semibold text-sm text-base-secondary mb-2">Camp Officers</h3>
                  {activeOfficers.length === 0 && <p className="text-xs text-base-muted">No officers assigned.</p>}
                  <div className="space-y-1 mb-3">
                    {activeOfficers.map(a => (
                      <div key={a.user_id} className="flex items-center gap-3 px-3 py-2 surface rounded-lg border border-base">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                          {a.user.phone_number.slice(-2)}
                        </div>
                        <span className="flex-1 text-sm font-medium">{a.user.phone_number}</span>
                        <span className="badge bg-green-100 text-green-700 text-xs">{a.user.role.replace(/_/g, ' ')}</span>
                        <button onClick={() => { if (confirm('Remove this officer from camp?')) removeOfficerMut.mutate({ campId: camp.id, userId: a.user_id }); }}
                          className="p-1 text-base-muted hover:text-red-600"><UserMinus size={14} /></button>
                      </div>
                    ))}
                  </div>

                  {/* Assign new officer */}
                  <div className="flex gap-2">
                    <input className="form-input text-sm flex-1 py-1.5" value={officerSearch} onChange={e => setOfficerSearch(e.target.value)}
                      placeholder="Search by phone number…" onKeyDown={e => e.key === 'Enter' && searchOfficer()} />
                    <button onClick={searchOfficer} className="btn-secondary text-xs py-1.5"><Search size={14} /></button>
                  </div>
                  {officerSearchResult && (
                    <div className="mt-2 flex items-center gap-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                      <span className="flex-1 text-sm">{officerSearchResult.phone_number}</span>
                      <span className="text-xs text-base-muted">{officerSearchResult.role}</span>
                      <button onClick={() => officerMut.mutate({ campId: camp.id, userId: officerSearchResult.id })}
                        className="flex items-center gap-1 text-xs bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600">
                        <UserPlus size={12} />Assign
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-base-muted mt-2">
                    The officer must have logged in at least once before they can be assigned. Assigning will automatically set their role to camp_officer.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
