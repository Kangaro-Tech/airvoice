import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Calendar, Plus, Loader2, X, Check, AlertCircle,
  Clock, User, Phone, FileText, CheckCircle, XCircle
} from 'lucide-react';

interface ScheduleEvent {
  id: string;
  title: string;
  description?: string;
  event_date: string;
  event_time?: string;
  event_type: string;
  status: 'pending' | 'done' | 'cancelled';
  customer?: { full_name: string; phone_number: string };
  application?: { ref_number: string };
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  reminder: 'bg-blue-100 text-blue-700 border-blue-200',
  meeting: 'bg-purple-100 text-purple-700 border-purple-200',
  payment: 'bg-green-100 text-green-700 border-green-200',
  visit: 'bg-amber-100 text-amber-700 border-amber-200',
  call: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  other: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock size={13} className="text-amber-500" />,
  done: <CheckCircle size={13} className="text-green-500" />,
  cancelled: <XCircle size={13} className="text-slate-400" />,
};

const emptyForm = {
  title: '',
  description: '',
  event_date: new Date().toISOString().split('T')[0],
  event_time: '',
  event_type: 'reminder',
  customer_id: '',
  application_id: '',
};

export default function SchedulePage() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState<ScheduleEvent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['schedule', month],
    queryFn: () => api.get('/schedule', { params: { month } }).then(r => r.data),
  });

  const events: ScheduleEvent[] = data?.data ?? [];

  // Group events by date
  const grouped = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    events.forEach(e => {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    });
    return map;
  }, [events]);

  const createMutation = useMutation({
    mutationFn: (payload: object) => api.post('/schedule', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); closeModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.error ?? 'Failed to save'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) => api.put(`/schedule/${id}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); closeModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.error ?? 'Failed to update'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/schedule/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  });

  function openCreate() {
    setEditEvent(null);
    setForm(emptyForm);
    setFormErr('');
    setShowModal(true);
  }

  function openEdit(ev: ScheduleEvent) {
    setEditEvent(ev);
    setForm({
      title: ev.title,
      description: ev.description ?? '',
      event_date: ev.event_date,
      event_time: ev.event_time ?? '',
      event_type: ev.event_type,
      customer_id: ev.customer ? (ev as any).customer_id ?? '' : '',
      application_id: ev.application ? (ev as any).application_id ?? '' : '',
    });
    setFormErr('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditEvent(null);
    setForm(emptyForm);
    setFormErr('');
  }

  function handleSubmit() {
    if (!form.title.trim()) return setFormErr('Title is required');
    if (!form.event_date) return setFormErr('Date is required');
    const payload = {
      ...form,
      customer_id: form.customer_id || undefined,
      application_id: form.application_id || undefined,
      event_time: form.event_time || undefined,
    };
    if (editEvent) {
      updateMutation.mutate({ id: editEvent.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const pending = events.filter(e => e.status === 'pending').length;
  const done = events.filter(e => e.status === 'done').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar size={24} className="text-purple-500" /> Schedule
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage appointments, payments, visits and reminders</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={16} /> New Event
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Events', value: events.length, color: 'text-slate-800' },
          { label: 'Pending', value: pending, color: 'text-amber-600' },
          { label: 'Done', value: done, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm text-center">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 font-semibold mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Events List grouped by date */}
      {isLoading ? (
        <div className="py-16 text-center text-slate-400"><Loader2 className="animate-spin inline" size={24} /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl py-16 text-center text-slate-400 shadow-sm">
          <Calendar size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No events scheduled for this month</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(grouped).sort().map(date => (
            <div key={date} className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-700">
                  {new Date(date + 'T12:00:00').toLocaleDateString('en-LK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {grouped[date].map(ev => (
                  <div key={ev.id} className={`px-5 py-3.5 flex items-start gap-4 ${ev.status === 'done' ? 'opacity-60' : ''}`}>
                    <div className="mt-0.5">{STATUS_ICONS[ev.status]}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800">{ev.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${EVENT_TYPE_COLORS[ev.event_type]}`}>
                          {ev.event_type}
                        </span>
                        {ev.event_time && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={11} /> {ev.event_time}
                          </span>
                        )}
                      </div>
                      {ev.description && <p className="text-xs text-slate-500 mt-0.5">{ev.description}</p>}
                      {ev.customer && (
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                          <span className="flex items-center gap-1"><User size={11} /> {ev.customer.full_name}</span>
                          <span className="flex items-center gap-1"><Phone size={11} /> {ev.customer.phone_number}</span>
                          {ev.application && <span className="flex items-center gap-1"><FileText size={11} /> {ev.application.ref_number}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {ev.status === 'pending' && (
                        <button
                          onClick={() => statusMutation.mutate({ id: ev.id, status: 'done' })}
                          title="Mark done"
                          className="p-1.5 text-green-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        >
                          <CheckCircle size={15} />
                        </button>
                      )}
                      <button onClick={() => openEdit(ev)} className="p-1.5 text-slate-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition">
                        <Clock size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editEvent ? 'Edit Event' : 'New Schedule Event'}</h2>
              <button onClick={closeModal}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                  <AlertCircle size={14} /> {formErr}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Event title"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Date *</label>
                  <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Time</label>
                  <input type="time" value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Event Type</label>
                <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                  {['reminder', 'meeting', 'payment', 'visit', 'call', 'other'].map(t => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Additional notes..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              {editEvent && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                  <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                    {['pending', 'done', 'cancelled'].map(s => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button onClick={closeModal} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editEvent ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
