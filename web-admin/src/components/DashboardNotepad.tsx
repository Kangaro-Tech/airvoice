import React, { useState, useEffect } from 'react';
import { ClipboardList, CheckSquare, Clock } from 'lucide-react';
import { tasksApi } from '../services/api';

export function DashboardNotepad() {
  const [tasks, setTasks] = useState<{id: string, text: string, deadline: number}[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const res = await tasksApi.list();
      if (res.data && res.data.data) {
        // Show only active tasks, ordered by most recent
        const activeTasks = res.data.data
          .filter((t: any) => !t.archived)
          .sort((a: any, b: any) => b.created_at - a.created_at);
        setTasks(activeTasks);
      }
    } catch (e) {
      console.error('Failed to fetch tasks for notepad', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    // Poll every 5 seconds to stay in sync with TaskNotepad
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 flex flex-col w-full h-[350px]">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
          Private Notepad
        </h3>
        <ClipboardList size={16} className="text-gray-400" />
      </div>
      
      <div className="border-b border-dashed border-gray-200 dark:border-gray-700 mb-4 shrink-0"></div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="text-sm text-gray-400 animate-pulse">Loading notes...</div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-gray-400">Write down anything here...</div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => (
              <div key={task.id} className="group flex items-start gap-3 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700/50 transition-all shadow-sm hover:shadow">
                <div className="bg-white dark:bg-gray-800 rounded-md p-1 shadow-sm border border-gray-100 dark:border-gray-700 shrink-0 mt-0.5 group-hover:border-blue-300 dark:group-hover:border-blue-600 transition-colors">
                  <CheckSquare size={16} className="text-blue-500 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug break-words">
                    {task.text}
                  </p>
                  {task.deadline && task.deadline > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-1.5 font-semibold bg-blue-100/50 dark:bg-blue-900/30 w-fit px-2 py-0.5 rounded-full border border-blue-200/50 dark:border-blue-800/50">
                      <Clock size={10} className="shrink-0" />
                      <span className="truncate">
                        {new Date(task.deadline).toLocaleString(undefined, { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
