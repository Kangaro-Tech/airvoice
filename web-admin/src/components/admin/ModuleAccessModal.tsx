import { useState } from 'react';
import { X, Check, Save, Info } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

import { NAV_SECTIONS } from '@/components/layout/AppLayout';

const AVAILABLE_MODULES = NAV_SECTIONS.flatMap(section => 
  section.items.map(item => ({
    id: item.to,
    label: item.label,
    group: section.title
  }))
);

interface ModuleAccessModalProps {
  user: any;
  onClose: () => void;
}

export function ModuleAccessModal({ user, onClose }: ModuleAccessModalProps) {
  const queryClient = useQueryClient();
  const [selectedModules, setSelectedModules] = useState<string[] | null>(
    user.custom_modules ?? null
  );

  const isCustomMode = selectedModules !== null;

  const mutation = useMutation({
    mutationFn: async (modules: string[] | null) => {
      await api.patch(`/users/${user.id}/modules`, { custom_modules: modules });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      onClose();
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to update modules');
    },
  });

  const handleToggle = (id: string) => {
    if (selectedModules === null) {
      // Auto-switch to custom mode with dashboard + the clicked module
      const initial = id === '/dashboard' ? ['/dashboard'] : ['/dashboard', id];
      setSelectedModules(initial);
      return;
    }

    if (selectedModules.includes(id)) {
      setSelectedModules(selectedModules.filter(m => m !== id));
    } else {
      setSelectedModules([...selectedModules, id]);
    }
  };

  const handleSave = () => {
    mutation.mutate(selectedModules);
  };

  const handleResetToDefault = () => {
    setSelectedModules(null);
  };

  const groupedModules = AVAILABLE_MODULES.reduce((acc, mod) => {
    if (!acc[mod.group]) acc[mod.group] = [];
    acc[mod.group].push(mod);
    return acc;
  }, {} as Record<string, typeof AVAILABLE_MODULES>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl surface p-6 shadow-xl border overflow-y-auto max-h-[90vh]">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-base-primary">Configure Custom Module Access</h2>
            <p className="text-sm text-base-secondary mt-1">
              For: {user.full_name || user.phone_number || user.email}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-base-muted hover:bg-base-surface">
            <X size={20} />
          </button>
        </div>

        {/* Mode Banner */}
        <div className={`mb-6 flex items-center justify-between p-4 rounded-lg border transition-colors ${
          isCustomMode
            ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800'
        }`}>
          <div className="flex items-start gap-3">
            <Info size={16} className={`mt-0.5 shrink-0 ${isCustomMode ? 'text-purple-500' : 'text-blue-500'}`} />
            <div>
              <p className={`text-sm font-semibold ${isCustomMode ? 'text-purple-800 dark:text-purple-300' : 'text-blue-800 dark:text-blue-300'}`}>
                {isCustomMode ? 'Custom Access Mode' : 'Default Role-Based Access'}
              </p>
              <p className={`text-xs mt-0.5 ${isCustomMode ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`}>
                {isCustomMode
                  ? `${selectedModules!.length} module${selectedModules!.length !== 1 ? 's' : ''} selected — only these will appear in the sidebar.`
                  : "Click any module below to switch to Custom Access and restrict this user's view."}
              </p>
            </div>
          </div>
          {isCustomMode && (
            <button
              onClick={handleResetToDefault}
              className="shrink-0 text-xs px-3 py-1.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-700"
            >
              Reset to Default
            </button>
          )}
        </div>

        {/* Module Checkboxes */}
        <div className="space-y-6">
          {Object.entries(groupedModules).map(([group, modules]) => (
            <div key={group}>
              <h3 className="text-xs font-bold text-base-secondary uppercase tracking-wider mb-3 pb-1 border-b">
                {group}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modules.map(mod => {
                  const isSelected = isCustomMode && selectedModules!.includes(mod.id);

                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => handleToggle(mod.id)}
                      className={`flex items-center gap-3 w-full text-left p-3 rounded-lg border transition-all duration-150 ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          : isCustomMode
                          ? 'bg-transparent border-base hover:bg-base-surface hover:border-gray-300'
                          : 'bg-transparent border-dashed border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                      }`}
                    >
                      {/* Custom Checkbox Visual */}
                      <span className={`w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-transparent border-gray-300 dark:border-gray-600'
                      }`}>
                        {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                      </span>

                      <span className={`text-sm font-medium ${
                        isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-base-primary'
                      }`}>
                        {mod.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-base-secondary hover:bg-base-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {mutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

      </div>
    </div>
  );
}
