import { useEffect } from 'react';
import { X } from 'lucide-react';

interface EditDrawerProps {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

export function EditDrawer({ title, subtitle, isOpen, onClose, children, width = 'md' }: EditDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[width];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className={`relative w-full ${widthClass} surface h-full shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-base flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-base-primary">{title}</h2>
            {subtitle && <p className="text-sm text-base-muted mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-base-muted hover:text-gray-600 hover:bg-[var(--bg-surface-2)] rounded-lg ml-4 mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
