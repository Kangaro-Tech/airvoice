import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi, payrollApi, tasksApi } from '@/services/api';
import { CalendarCheck, Clock, CheckCircle2, XCircle, Loader2, LogIn, LogOut, Bell, Edit2 } from 'lucide-react';

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

interface MarkFormState {
  mode: 'in' | 'out' | 'edit';
  staff_id: string;
  staff_name: string;
  in_time: string;
  out_time: string;
  existing_in_time?: string;
  status: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  clocked_in: { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300', label: 'Clocked In (Pending Out)' },
  present: { bg: 'bg-green-500/15', text: 'text-green-500', label: 'Present' },
  absent: { bg: 'bg-red-500/15', text: 'text-red-500', label: 'Absent' },
  late: { bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-700 dark:text-sky-300', label: 'Late' },
  half_day: { bg: 'bg-blue-500/15', text: 'text-blue-500', label: 'Half Day' },
};

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
}

function getHHMM(isoOrDate?: string | Date): string {
  let d: Date;
  if (!isoOrDate) {
    d = new Date();
  } else {
    d = new Date(isoOrDate);
  }
  
  if (isNaN(d.getTime())) {
    d = new Date();
  }
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function toLocalTime(iso?: string): string {
  if (!iso) return '—';
  
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    // Fallback if parsing fails for some reason
    let timeStr = iso;
    if (iso.includes('T')) timeStr = iso.split('T')[1]?.substring(0, 5) || '';
    else if (iso.includes(' ')) timeStr = iso.split(' ')[1]?.substring(0, 5) || '';
    
    if (!timeStr || !timeStr.includes(':')) return iso;
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return iso;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  let hours = d.getHours();
  const minutes = d.getMinutes();
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  
  const padMin = String(minutes).padStart(2, '0');
  const padHr = String(hours).padStart(2, '0');
  return `${padHr}:${padMin} ${ampm}`;
}

function getToday458PmDeadline(): number {
  const d = new Date();
  d.setHours(16, 58, 0, 0);
  return d.getTime();
}

export default function AttendanceManagementPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedStaff, setSelectedStaff] = useState('');
  const [markForm, setMarkForm] = useState<MarkFormState | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);

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
      setSuccess('Attendance updated successfully!');
      setMarkForm(null);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Failed to mark attendance'),
  });

  const handleMarkIn = (staff: StaffMember) => {
    const nowHHMM = getHHMM();
    setMarkForm({
      mode: 'in',
      staff_id: staff.id,
      staff_name: staff.full_name,
      in_time: nowHHMM,
      out_time: '',
      status: 'present',
    });
    setError('');
  };

  const handleMarkOut = (staff: StaffMember, record: AttendanceRecord) => {
    const nowHHMM = getHHMM();
    const formattedIn = record.in_time ? toLocalTime(record.in_time) : '—';
    const rawInTime = record.in_time ? getHHMM(record.in_time) : '';
    setMarkForm({
      mode: 'out',
      staff_id: staff.id,
      staff_name: staff.full_name,
      in_time: rawInTime,
      existing_in_time: formattedIn,
      out_time: nowHHMM,
      status: record.status === 'clocked_in' ? 'present' : record.status,
    });
    setError('');
  };

  const handleMarkEdit = (staff: StaffMember) => {
    const existing = (attendanceData ?? []).find(r => r.staff_id === staff.id);
    let in_time = '';
    let out_time = '';
    
    if (existing) {
      if (existing.in_time) {
        in_time = getHHMM(existing.in_time);
      }
      if (existing.out_time) {
        out_time = getHHMM(existing.out_time);
      }
    }
    
    setMarkForm({ 
      mode: 'edit',
      staff_id: staff.id, 
      staff_name: staff.full_name,
      in_time, 
      out_time, 
      status: existing?.status ?? 'present' 
    });
    setError('');
  };

  const handleSaveForm = () => {
    if (!markForm) return;

    if (markForm.mode === 'in') {
      const inTime = markForm.in_time ? `${selectedDate}T${markForm.in_time}:00+05:30` : undefined;
      const finalStatus = markForm.status === 'absent' ? 'absent' : 'clocked_in';
      markMutation.mutate({
        staff_id: markForm.staff_id,
        date: selectedDate,
        in_time: inTime,
        status: finalStatus,
      });
    } else {
      const inTime = markForm.in_time ? `${selectedDate}T${markForm.in_time}:00+05:30` : undefined;
      const outTime = markForm.out_time ? `${selectedDate}T${markForm.out_time}:00+05:30` : undefined;
      const finalStatus = markForm.mode === 'out' && markForm.status === 'clocked_in' ? 'present' : markForm.status;
      markMutation.mutate({
        staff_id: markForm.staff_id,
        date: selectedDate,
        in_time: inTime,
        out_time: outTime,
        status: finalStatus,
      });
    }
  };

  const unclockedStaffList = (attendanceData ?? []).filter(r => r.in_time && !r.out_time && r.status !== 'absent');
  const unclockedCount = unclockedStaffList.length;

  const triggerTaskReminder = async (isManual = false) => {
    setSendingReminder(true);
    try {
      const unclocked = (attendanceData ?? []).filter(r => r.in_time && !r.out_time && r.status !== 'absent');
      const names = unclocked.map(u => u.staff?.full_name).filter(Boolean).join(', ');
      const text = `⏰ Daily Attendance Alert (4:58 PM): ${unclocked.length} staff member(s) checked IN but haven't marked OUT yet!${names ? ` (${names})` : ''}`;

      const deadline = getToday458PmDeadline();

      await tasksApi.create({
        text,
        deadline,
        created_at: Date.now(),
        notified: false,
        archived: false,
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSuccess(`Added 4:58 PM attendance reminder task to Task Notepad! (${unclocked.length} staff pending out)`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      console.error('Failed to send task reminder', err);
      setError('Failed to trigger 4:58 PM reminder to Task Notepad.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setSendingReminder(false);
    }
  };

  useEffect(() => {
    const checkDailyTime = () => {
      const now = new Date();
      const dateKey = todayStr();
      const storageKey = `att_reminder_sent_${dateKey}`;

      if (now.getHours() === 16 && now.getMinutes() >= 58 && !localStorage.getItem(storageKey)) {
        const pendingOut = (attendanceData ?? []).filter(r => r.in_time && !r.out_time && r.status !== 'absent');
        if (pendingOut.length > 0) {
          localStorage.setItem(storageKey, 'true');
          triggerTaskReminder(false);
        }
      }
    };

    checkDailyTime();
    const interval = setInterval(checkDailyTime, 30000);
    return () => clearInterval(interval);
  }, [attendanceData]);

  const today = attendanceData ?? [];
  const markedIds = new Set(today.map(r => r.staff_id));

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--text-primary)' }}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-600">
            <CalendarCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Attendance Management</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>2-step clock-in / clock-out workflow with daily 4:58 PM task reminders</p>
          </div>
        </div>

        <button
          onClick={() => triggerTaskReminder(true)}
          disabled={sendingReminder}
          className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          title="Schedule 4:58 PM Attendance Alert in Task Notepad"
        >
          {sendingReminder ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          <span>Schedule 4:58 PM Alert in Task Notepad ({unclockedCount} Pending Out)</span>
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/15 text-green-500 text-sm font-semibold">
          <CheckCircle2 size={16} />{success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/15 text-red-500 text-sm font-semibold">
          <XCircle size={16} />{error}
        </div>
      )}

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

      {markForm && (
        <div className="rounded-xl border p-5 space-y-4 border-blue-600 shadow-md transition-all" style={{ backgroundColor: 'var(--bg-surface)' }}>
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              {markForm.mode === 'in' ? (
                <>
                  <LogIn size={16} className="text-blue-600" />
                  <span>Step 1: Mark In (Check In) — {markForm.staff_name}</span>
                </>
              ) : markForm.mode === 'out' ? (
                <>
                  <LogOut size={16} className="text-amber-500" />
                  <span>Step 2: Mark Out (Check Out) — {markForm.staff_name}</span>
                </>
              ) : (
                <>
                  <Edit2 size={16} className="text-blue-600" />
                  <span>Edit Attendance — {markForm.staff_name}</span>
                </>
              )}
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 uppercase">
              {markForm.mode === 'in' ? 'Check In Phase' : markForm.mode === 'out' ? 'Check Out Phase' : 'Edit Phase'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {markForm.mode === 'in' ? (
              <>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                    In Time (Check In) *
                  </label>
                  <input
                    id="mark-in-time"
                    type="time"
                    value={markForm.in_time}
                    onChange={e => setMarkForm(f => f ? { ...f, in_time: e.target.value } : f)}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Status</label>
                  <select
                    id="mark-status"
                    value={markForm.status}
                    onChange={e => setMarkForm(f => f ? { ...f, status: e.target.value } : f)}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="present">Present (In Progress)</option>
                    <option value="late">Late</option>
                    <option value="half_day">Half Day</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    ⏳ Out time will be recorded during evening check-out.
                  </p>
                </div>
              </>
            ) : markForm.mode === 'out' ? (
              <>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Recorded In Time
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={markForm.existing_in_time || '—'}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Out Time (Check Out) *
                  </label>
                  <input
                    id="mark-out-time"
                    type="time"
                    value={markForm.out_time}
                    onChange={e => setMarkForm(f => f ? { ...f, out_time: e.target.value } : f)}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Final Status</label>
                  <select
                    id="mark-status-out"
                    value={markForm.status}
                    onChange={e => setMarkForm(f => f ? { ...f, status: e.target.value } : f)}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
                    style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="present">Present (Complete)</option>
                    <option value="late">Late</option>
                    <option value="half_day">Half Day</option>
                  </select>
                </div>
              </>
            ) : (
              <>
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
                    <option value="clocked_in">Clocked In</option>
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
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              id="confirm-attendance"
              onClick={handleSaveForm}
              disabled={markMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50"
            >
              {markMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : markForm.mode === 'in' ? <LogIn size={14} /> : markForm.mode === 'out' ? <LogOut size={14} /> : <Edit2 size={14} />}
              {markForm.mode === 'in' ? 'Save In Time (Check In)' : markForm.mode === 'out' ? 'Save Out Time (Check Out)' : 'Save Changes'}
            </button>
            <button
              onClick={() => setMarkForm(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Staff Directory — {selectedDate}</h3>
            <span className="text-xs text-base-muted font-medium">Click button to Check In or Check Out</span>
          </div>
          {staffLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-blue-600" /></div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {(staffList ?? []).map(staff => {
                const rec = today.find(r => r.staff_id === staff.id);
                const marked = markedIds.has(staff.id);
                const isClockedInOnly = rec && rec.in_time && !rec.out_time && rec.status !== 'absent';
                const isCompleted = rec && rec.in_time && rec.out_time;

                return (
                  <div key={staff.id} className="flex flex-col md:flex-row items-start md:items-center justify-between px-4 py-3 gap-3 hover:bg-[var(--bg-surface-2)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{staff.full_name}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{staff.designation}</p>
                      {rec && rec.in_time && (
                        <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                          In: {toLocalTime(rec.in_time)} {rec.out_time ? `· Out: ${toLocalTime(rec.out_time)}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isClockedInOnly ? (
                        <>
                          <button
                            id={`mark-out-${staff.id}`}
                            onClick={() => handleMarkOut(staff, rec)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold transition-all bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                          >
                            <LogOut size={13} />
                            Mark Out
                          </button>
                          <button onClick={() => handleMarkEdit(staff)} className="p-1 text-slate-400 hover:text-blue-600 rounded" title="Edit">
                            <Edit2 size={13} />
                          </button>
                        </>
                      ) : isCompleted ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[rec.status]?.bg ?? ''} ${STATUS_STYLES[rec.status]?.text ?? ''}`}>
                            ✓ {STATUS_STYLES[rec.status]?.label ?? rec.status}
                          </span>
                          <button onClick={() => handleMarkEdit(staff)} className="p-1 text-slate-400 hover:text-blue-600 rounded" title="Edit">
                            <Edit2 size={13} />
                          </button>
                        </div>
                      ) : rec?.status === 'absent' ? (
                        <>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40">
                            Absent
                          </span>
                          <button onClick={() => handleMarkEdit(staff)} className="p-1 text-slate-400 hover:text-blue-600 rounded" title="Edit">
                            <Edit2 size={13} />
                          </button>
                        </>
                      ) : (
                        <button
                          id={`mark-in-${staff.id}`}
                          onClick={() => handleMarkIn(staff)}
                          className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        >
                          <LogIn size={13} />
                          Mark In
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Today's Attendance Records ({today.length})</h3>
            {unclockedCount > 0 && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full">
                {unclockedCount} Pending Out
              </span>
            )}
          </div>
          {attLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-blue-600" /></div>
          ) : today.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
              <CalendarCheck size={36} className="mx-auto mb-2 opacity-30 text-blue-600" />
              <p className="text-xs font-semibold">No attendance records for {selectedDate}.</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {today.map(rec => {
                const staffMember = (staffList ?? []).find(s => s.id === rec.staff_id);
                const isPendingOut = rec.in_time && !rec.out_time && rec.status !== 'absent';
                const statusStyle = STATUS_STYLES[rec.status] || { bg: 'bg-slate-100', text: 'text-slate-700', label: rec.status };

                return (
                  <div key={rec.id} className="px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-surface-2)] transition-colors">
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{rec.staff?.full_name ?? staffMember?.full_name ?? '—'}</p>
                      <div className="flex gap-4 mt-0.5">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          <Clock size={11} />In: {toLocalTime(rec.in_time)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                          <Clock size={11} />Out: {toLocalTime(rec.out_time)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isPendingOut && staffMember && (
                        <button
                          onClick={() => handleMarkOut(staffMember, rec)}
                          className="text-[11px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          + Add Out Time
                        </button>
                      )}
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${isPendingOut
                          ? `${STATUS_STYLES.clocked_in.bg} ${STATUS_STYLES.clocked_in.text}`
                          : `${statusStyle.bg} ${statusStyle.text}`
                        }`}>
                        {isPendingOut ? 'Clocked In (Pending Out)' : statusStyle.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
