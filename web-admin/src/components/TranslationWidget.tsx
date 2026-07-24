import React, { useState, useEffect } from 'react';
import { Globe, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface TranslationWidgetProps {
  currentLanguage?: string;
  onLanguageChange?: (language: string) => void;
  textToTranslate?: string;
}

export function TranslationWidget({
  currentLanguage = 'en',
  onLanguageChange,
  textToTranslate,
}: TranslationWidgetProps) {
  const { translate, getLanguages, isLoading, error, translatedText } = useTranslation();
  const [languages, setLanguages] = useState<Array<{ code: string; name: string }>>([
    { code: 'en', name: 'English' },
    { code: 'si', name: 'Sinhala (සිංහල)' },
    { code: 'ta', name: 'Tamil (தமிழ்)' },
  ]);
  const [selectedLanguage, setSelectedLanguage] = useState(currentLanguage);

  useEffect(() => {
    // Load available languages
    getLanguages().catch(err => console.error('Failed to load languages:', err));
  }, []);

  const handleLanguageChange = async (newLanguage: string) => {
    setSelectedLanguage(newLanguage);
    onLanguageChange?.(newLanguage);

    if (textToTranslate && newLanguage !== currentLanguage) {
      try {
        await translate(textToTranslate, newLanguage, currentLanguage);
      } catch (err) {
        console.error('Translation failed:', err);
      }
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Globe size={18} className="text-blue-600" />
        <label className="text-xs font-semibold text-gray-600">Language</label>
      </div>

      <select
        value={selectedLanguage}
        onChange={e => handleLanguageChange(e.target.value)}
        className="px-3 py-2 border border-base rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        disabled={isLoading}
      >
        {languages.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>

      {isLoading && (
        <div className="flex items-center gap-1 text-xs text-blue-600">
          <Loader2 size={14} className="animate-spin" />
          <span>Translating...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle size={14} />
          <span>{error.message}</span>
        </div>
      )}

      {translatedText && !isLoading && (
        <div className="text-xs text-green-600 font-medium">✓ Translated</div>
      )}
    </div>
  );
}

/**
 * Language Selector Component (Standalone)
 */
export function LanguageSelector({
  currentLanguage = 'en',
  onChange,
  size = 'md',
}: {
  currentLanguage?: string;
  onChange?: (language: string) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const languageOptions = [
    { code: 'en', name: 'EN', fullName: 'English' },
    { code: 'si', name: 'SI', fullName: 'Sinhala' },
    { code: 'ta', name: 'TA', fullName: 'Tamil' },
  ];

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <div className="flex gap-1 surface-2 rounded-lg p-1 no-translate">
      {languageOptions.map(lang => (
        <button
          key={lang.code}
          onClick={() => onChange?.(lang.code)}
          className={`${sizeClasses[size]} rounded font-semibold transition-colors ${
            currentLanguage === lang.code
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-[var(--bg-surface-3)]'
          }`}
          title={lang.fullName}
        >
          {lang.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Translation Status Component
 */
export function TranslationStatus({ isLoading, error, success }: {
  isLoading?: boolean;
  error?: Error | null;
  success?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-blue-600">
        <Loader2 size={16} className="animate-spin" />
        <span>Translating...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <AlertCircle size={16} />
        <span>{error.message}</span>
      </div>
    );
  }

  if (success) {
    return <div className="text-sm text-green-600 font-medium">✓ Translation complete</div>;
  }

  return null;
}
