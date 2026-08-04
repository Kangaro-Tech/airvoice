import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi, payrollApi } from '@/services/api';
import { CalendarCheck, Clock, CheckCircle2, XCircle, Loader2, Search, ChevronLeft, ChevronRight, User } from 'lucide-react';

interface StaffMember { id: string; full_name: string; designation: string; }
interface AttendanceRecord {
  id: string;
  staff_id: string;
  date: string;
  in_time?: string;
  out_time?: string;
  status: string;
  staff?: { full_name: string };
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  present: { bg: 'bg-green-500/15', text: 'text-green-500', label: 'Present' },
  absent:  { bg: 'bg-red-500/15',   text: 'text-red-500',   label: 'Absent'  },
  late:    { bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-700 dark:text-sky-300', label: 'Late' },
  half_day:{ bg: 'bg-blue-500/15',  text: 'text-blue-500',  label: 'Half Day'},
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function toLocalTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AttendanceManagementPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedStaff, setSelectedStaff] = useState('');
  const [markForm, setMarkForm] = useState<{ staff_id: string; in_time: string; out_time: string; status: string } | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { data: staffList, isLoading: staffLoading } = useQuery({
    queryKey: ['payroll-staff'],
    queryFn: () => payrollApi.listStaff().then(r => r.data.data as StaffMember[]),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance', selectedDate, selectedStaff],
    queryFn: () => hrApi.listAttendance({ date: selectedDate, ...(selectedStaff ? { staff_id: selectedStaff } : {}) })
      .then(r => r.data.data as AttendanceRecord[]),
  });

  const markMutation = useMutation({
    mutationFn: (data: unknown) => hrApi.markAttendance(data),
    onSuccess: () => {
      setSuccess('Attendance marked successfully!');
      setMarkForm(null);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to mark attendance'),
  });

  const handleMark = (staff: StaffMember) => {
    setMarkForm({ staff_id: staff.id, in_time: '', out_time: '', status: 'present' });
    setError('');
  };

  const today = attendanceData ?? [];
  const markedIds = new Set(today.map(r => r.staff_id));

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-600">
          <CalendarCheck size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Attendance Management</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Record and view employee in/out times</p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/15 text-green-500 text-sm">
          <CheckCircle2 size={16} />{success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/15 text-red-500 text-sm">
          <XCircle size={16} />{error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Date</label>
          <input
            id="attendance-date"
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Staff</label>
          <select
            id="attendance-staff-filter"
            value={selectedStaff}
            onChange={e => setSelectedStaff(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="">All Staff</option>
            {(staffList ?? []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      </div>

      {/* Mark Attendance Form */}
      {markForm && (
        <div className="rounded-xl border p-5 space-y-4 border-blue-600" style={{ backgroundColor: 'var(--bg-surface)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Mark Attendance — {(staffList ?? []).find(s => s.id === markForm.staff_id)?.full_name}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Status</label>
              <select
                id="mark-status"
                value={markForm.status}
                onChange={e => setMarkForm(f => f ? { ...f, status: e.target.value } : f)}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>In Time</label>
              <input
                id="mark-in-time"
                type="time"
                value={markForm.in_time}
                onChange={e => setMarkForm(f => f ? { ...f, in_time: e.target.value } : f)}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Out Time</label>
              <input
                id="mark-out-time"
                type="time"
                value={markForm.out_time}
                onChange={e => setMarkForm(f => f ? { ...f, out_time: e.target.value } : f)}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              id="confirm-attendance"
              onClick={() => {
                const inTime = markForm.in_time ? `${selectedDate}T${markForm.in_time}:00` : undefined;
                const outTime = markForm.out_time ? `${selectedDate}T${markForm.out_time}:00` : undefined;
                markMutation.mutate({ staff_id: markForm.staff_id, date: selectedDate, in_time: inTime, out_time: outTime, status: markForm.status });
              }}
              disabled={markMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
            >
              {markMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
            <button onClick={() => setMarkForm(null)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Two-panel layout: Staff list + Attendance table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff quick-mark panel */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Staff — {selectedDate}</h3>
          </div>
          {staffLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-blue-600" /></div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {(staffList ?? []).map(staff => {
                const marked = markedIds.has(staff.id);
                const rec = today.find(r => r.staff_id === staff.id);
                return (
                  <div key={staff.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{staff.full_name}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{staff.designation}</p>
                    </div>
                    {marked && rec ? (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[rec.status]?.bg ?? ''} ${STATUS_STYLES[rec.status]?.text ?? ''}`}>
                        {STATUS_STYLES[rec.status]?.label ?? rec.status}
                      </span>
                    ) : (
                      <button
                        id={`mark-att-${staff.id}`}
                        onClick={() => handleMark(staff)}
                        className="text-xs px-3 py-1 rounded-lg font-semibold transition-colors bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300 hover:bg-blue-600 hover:text-white"
                      >
                        Mark
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Today's attendance records */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Records ({today.length})</h3>
          </div>
          {attLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} /></div>
          ) : today.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
              <CalendarCheck size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">No records for this date.</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {today.map(rec => (
                <div key={rec.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{rec.staff?.full_name ?? '—'}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <Clock size={10} />In: {toLocalTime(rec.in_time)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <Clock size={10} />Out: {toLocalTime(rec.out_time)}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[rec.status]?.bg ?? ''} ${STATUS_STYLES[rec.status]?.text ?? ''}`}>
                    {STATUS_STYLES[rec.status]?.label ?? rec.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
