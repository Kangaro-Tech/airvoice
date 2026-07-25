import React, { useState, useEffect, useRef } from 'react';
import { ClipboardList, Plus, Trash2, X, BellRing, Info } from 'lucide-react';
import { tasksApi } from '../services/api';

export interface TaskNote {
  id: string;
  text: string;
  deadline: number; // timestamp
  createdAt: number;
  notified: boolean;
  archived?: boolean;
}

export function TaskNotepad() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'recent'>('active');
  const [tasks, setTasks] = useState<TaskNote[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [alerts, setAlerts] = useState<TaskNote[]>([]);
  const activeAlarmsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const startAlarm = (alertId: string) => {
    // Play immediately first
    playBeep();
    
    // Then set interval to repeat every second
    const interval = setInterval(() => {
      playBeep();
    }, 1000);

    activeAlarmsRef.current[alertId] = interval;

    // Auto-stop after 1 minute (60000 ms)
    setTimeout(() => {
      stopAlarm(alertId);
    }, 60000);
  };

  const playBeep = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.8, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const stopAlarm = (alertId: string) => {
    const interval = activeAlarmsRef.current[alertId];
    if (interval) {
      clearInterval(interval);
      delete activeAlarmsRef.current[alertId];
    }
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    stopAlarm(id);
  };

  // Load initial settings
  useEffect(() => {
    // Request Notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Fetch tasks on mount
  useEffect(() => {
    tasksApi.list().then(res => {
      if (res.data && res.data.data) {
        setTasks(res.data.data.map((t: any) => ({
          id: t.id,
          text: t.text,
          deadline: Number(t.deadline),
          createdAt: Number(t.created_at),
          notified: t.notified,
          archived: t.archived,
        })));
      }
    }).catch(e => console.error('Failed to fetch tasks', e));
  }, []);

  // Timer loop
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle task expiration side-effects
  useEffect(() => {
    let modified = false;
    const newTasks = tasks.map(task => {
      let updatedTask = { ...task };
      let changed = false;
      
      if (!updatedTask.notified && updatedTask.deadline <= currentTime) {
        modified = true;
        changed = true;
        // Show Notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Task Reminder", {
            body: `Time is up for: ${updatedTask.text}`,
            icon: "/favicon.ico"
          });
        }
        // Add to beautiful in-app alerts & play sound
        setAlerts(prev => {
          if (prev.some(a => a.id === updatedTask.id)) return prev;
          return [...prev, updatedTask];
        });
        
        if (!activeAlarmsRef.current[updatedTask.id]) {
          startAlarm(updatedTask.id);
        }
        
        updatedTask.notified = true;
      }

      // Auto-archive after 1 minute (60000ms)
      if (!updatedTask.archived && updatedTask.deadline + 60000 <= currentTime) {
        modified = true;
        changed = true;
        updatedTask.archived = true;
      }

      if (changed) {
        // Optimistically update backend but dont wait
        tasksApi.update(updatedTask.id, { notified: updatedTask.notified, archived: updatedTask.archived }).catch(console.error);
      }

      return updatedTask;
    });

    if (modified) {
      setTasks(newTasks);
    }
  }, [currentTime, tasks]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim() || !newTaskDeadline) return;

    const deadlineTime = new Date(newTaskDeadline).getTime();
    if (deadlineTime <= Date.now()) {
      alert('Deadline must be in the future.');
      return;
    }

    try {
      const res = await tasksApi.create({
        text: newTaskText.trim(),
        deadline: deadlineTime,
        created_at: Date.now(),
        notified: false,
        archived: false
      });
      
      const t = res.data.data;
      const newTask: TaskNote = {
        id: t.id,
        text: t.text,
        deadline: Number(t.deadline),
        createdAt: Number(t.created_at),
        notified: t.notified,
        archived: t.archived,
      };

      setTasks([...tasks, newTask]);
      setNewTaskText('');
      setNewTaskDeadline('');
    } catch (err) {
      console.error('Failed to create task', err);
      alert('Failed to add task.');
    }
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    tasksApi.delete(id).catch(console.error);
  };

  const formatTimeRemaining = (deadline: number) => {
    const diff = deadline - currentTime;
    if (diff <= 0) return 'Time is up!';
    
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    if (h > 0) return `${h}h ${m}m ${s}s left`;
    return `${m}m ${s}s left`;
  };

  return (
    <>
      {/* Custom Alerts Popup Container */}
      <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 pointer-events-none">
        {alerts.map((alert) => (
          <div 
            key={alert.id} 
            className="alert-popup pointer-events-auto bg-white dark:bg-gray-800 rounded-xl shadow-[0_10px_40px_-10px_rgba(37,99,234,0.3)] border border-blue-100 dark:border-blue-900 border-l-4 border-l-[#2563ea] p-4 flex items-start gap-4 min-w-[320px] max-w-md transform transition-all duration-500 ease-out"
          >
            <div className="bg-blue-50 dark:bg-blue-900/30 p-2.5 rounded-full shrink-0 shadow-sm border border-blue-100 dark:border-blue-800/50">
              <Info className="text-[#2563ea] animate-pulse" size={24} />
            </div>
            <div className="flex-1 mt-0.5">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                Task Reminder <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-[#2563ea]"></span></span>
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">{alert.text}</p>
            </div>
            <button 
              onClick={() => dismissAlert(alert.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg -mr-1 -mt-1"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <style>{`
          @keyframes slideIn {
            0% { transform: translateY(-20px) scale(0.95); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes alarmPulse {
            0% { box-shadow: 0 0 0 0 rgba(37, 99, 234, 0.4); }
            70% { box-shadow: 0 0 0 15px rgba(37, 99, 234, 0); }
            100% { box-shadow: 0 0 0 0 rgba(37, 99, 234, 0); }
          }
          .alert-popup {
            animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards, alarmPulse 1.5s infinite;
          }
        `}</style>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {isOpen && (
        <div className="w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 mb-4 overflow-hidden flex flex-col max-h-[500px]">
          <div className="bg-[#2563ea] text-white px-4 py-3 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2 font-semibold">
              <ClipboardList size={18} />
              Task Notepad
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 p-1 rounded-md transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
            <button 
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${activeTab === 'active' ? 'text-[#2563ea] border-b-2 border-[#2563ea]' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Active
            </button>
            <button 
              onClick={() => setActiveTab('recent')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${activeTab === 'recent' ? 'text-[#2563ea] border-b-2 border-[#2563ea]' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Recent Tasks
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
            {tasks.filter(t => activeTab === 'recent' ? t.archived : !t.archived).length === 0 ? (
              <div className="text-center text-gray-500 py-8 text-sm">
                {activeTab === 'active' ? 'No active tasks. Add one below!' : 'No recent tasks.'}
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.filter(t => activeTab === 'recent' ? t.archived : !t.archived).map(task => {
                  const isExpired = task.deadline <= currentTime;
                  return (
                    <div key={task.id} className={`p-3 rounded-lg border bg-white dark:bg-gray-800 shadow-sm relative ${isExpired ? 'border-red-300 dark:border-red-800/50' : 'border-gray-200 dark:border-gray-700'}`}>
                      <div className="flex justify-between items-start gap-2 pr-6">
                        <p className={`text-sm font-medium ${isExpired ? 'text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                          {task.text}
                        </p>
                        <button
                          onClick={() => removeTask(task.id)}
                          className="absolute right-2 top-2 text-gray-400 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className={`mt-2 text-xs font-semibold flex items-center gap-1.5 ${isExpired ? 'text-red-500' : 'text-[#2563ea]'}`}>
                        {isExpired ? <BellRing size={12} className="animate-pulse" /> : null}
                        {formatTimeRemaining(task.deadline)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <form onSubmit={handleAddTask} className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="What needs to be done?"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#2563ea]/40 focus:border-[#2563ea] outline-none transition-all"
                required
              />
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                  className="flex-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#2563ea]/40 focus:border-[#2563ea] outline-none transition-all"
                  required
                />
                <button
                  type="submit"
                  className="bg-[#2563ea] hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center justify-center transition-colors shadow-sm"
                  title="Add Task"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-[#2563ea] hover:bg-blue-700 text-white rounded-full p-3.5 shadow-lg shadow-blue-500/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Task Notepad"
        >
          <div className="relative">
            <ClipboardList size={24} />
            {(() => {
              const activeCount = tasks.filter(t => !t.archived).length;
              if (activeCount === 0) return null;
              return (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#2563ea]">
                  {activeCount}
                </span>
              );
            })()}
          </div>
        </button>
      )}
    </div>
    </>
  );
}
