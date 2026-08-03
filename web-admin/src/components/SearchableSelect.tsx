import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, SearchX } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  minSearchPrompt?: string;
  minSearchLength?: number;
  disabled?: boolean;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select Option...',
  searchPlaceholder = 'Type to search...',
  emptyMessage = 'No options found',
  minSearchPrompt = 'Start typing to search...',
  minSearchLength = 1,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const isSearchActive = search.trim().length >= minSearchLength;

  const filteredOptions = isSearchActive
    ? options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(search.toLowerCase()) ||
          (opt.sublabel && opt.sublabel.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`form-input w-full flex items-center justify-between text-left cursor-pointer transition-all ${
          disabled ? 'surface-2 text-base-muted cursor-not-allowed opacity-75' : 'hover:border-amber-400'
        } ${isOpen ? 'ring-2 ring-amber-500/20 border-amber-500' : ''}`}
      >
        <span className={`truncate text-sm ${!selectedOption ? 'text-base-muted' : 'text-base-primary font-medium'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {value && !disabled && (
            <span
              onClick={handleClear}
              className="text-base-muted hover:text-base-primary p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Clear selection"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-base-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 surface border border-base rounded-xl shadow-xl z-[100] overflow-hidden">
          {/* Search bar inside dropdown */}
          <div className="p-2 border-b border-base surface-2 flex items-center gap-2">
            <Search size={15} className="text-amber-500 shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-xs bg-transparent border-none focus:outline-none text-base-primary placeholder:text-base-muted py-1"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-base-muted hover:text-base-primary text-xs px-1"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto p-1 text-sm space-y-0.5">
            {!isSearchActive ? (
              <div className="py-5 px-3 text-xs text-center text-base-muted flex flex-col items-center justify-center gap-1.5">
                <Search size={18} className="text-amber-500/70 animate-pulse" />
                <span className="font-semibold text-slate-500 dark:text-slate-400">{minSearchPrompt}</span>
                <span className="text-[10px] text-base-muted">Type at least {minSearchLength} character to filter camps</span>
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-5 px-3 text-xs text-center text-base-muted flex flex-col items-center justify-center gap-1.5">
                <SearchX size={18} className="text-red-400 opacity-70" />
                <span className="italic">{emptyMessage}</span>
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-base-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="font-medium truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="text-[10px] text-base-muted truncate">{opt.sublabel}</div>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="text-amber-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
