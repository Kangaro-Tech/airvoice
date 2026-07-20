import { api } from './api';

export interface TranslationResponse {
  translatedText: string;
  detectedLanguage?: string;
}

export interface TranslationRequest {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

/**
 * Translate text using Google Cloud Translation API via backend
 * This keeps the API key secure on the backend
 */
export async function translateText(request: TranslationRequest): Promise<TranslationResponse> {
  try {
    const response = await api.post('/translate', {
      text: request.text,
      targetLanguage: request.targetLanguage,
      sourceLanguage: request.sourceLanguage || 'en',
    });

    return response.data;
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error('Failed to translate text. Please try again.');
  }
}

/**
 * Translate multiple texts in batch
 */
export async function translateBatch(texts: string[], targetLanguage: string): Promise<TranslationResponse[]> {
  try {
    const response = await api.post('/translate/batch', {
      texts,
      targetLanguage,
    });

    return response.data;
  } catch (error) {
    console.error('Batch translation error:', error);
    throw new Error('Failed to translate texts. Please try again.');
  }
}

/**
 * Detect language of given text
 */
export async function detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
  try {
    const response = await api.post('/translate/detect', { text });
    return response.data;
  } catch (error) {
    console.error('Language detection error:', error);
    throw new Error('Failed to detect language.');
  }
}

/**
 * Get available languages
 */
export async function getAvailableLanguages(): Promise<Array<{ code: string; name: string }>> {
  try {
    const response = await api.get('/translate/languages');
    return response.data;
  } catch (error) {
    console.error('Get languages error:', error);
    return [
      { code: 'en', name: 'English' },
      { code: 'si', name: 'Sinhala' },
      { code: 'ta', name: 'Tamil' },
    ];
  }
}
