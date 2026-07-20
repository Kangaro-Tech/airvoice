import { useState, useCallback } from 'react';
import { translateText, translateBatch, detectLanguage, getAvailableLanguages } from '@/services/translationService';

interface UseTranslationOptions {
  autoDetect?: boolean;
  onError?: (error: Error) => void;
}

export function useTranslation(options: UseTranslationOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const translate = useCallback(
    async (text: string, targetLanguage: string, sourceLanguage: string = 'en') => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await translateText({
          text,
          targetLanguage,
          sourceLanguage,
        });

        setTranslatedText(result.translatedText);
        return result.translatedText;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Translation failed');
        setError(error);
        options.onError?.(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const translateMultiple = useCallback(
    async (texts: string[], targetLanguage: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const results = await translateBatch(texts, targetLanguage);
        return results.map(r => r.translatedText);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Batch translation failed');
        setError(error);
        options.onError?.(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const detect = useCallback(async (text: string) => {
    try {
      return await detectLanguage(text);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Detection failed');
      setError(error);
      throw error;
    }
  }, []);

  const getLanguages = useCallback(async () => {
    try {
      return await getAvailableLanguages();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to get languages');
      setError(error);
      throw error;
    }
  }, []);

  return {
    translate,
    translateMultiple,
    detect,
    getLanguages,
    isLoading,
    error,
    translatedText,
    clearError: () => setError(null),
  };
}
