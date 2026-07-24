import axios from 'axios';

const GOOGLE_TRANSLATE_API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
const API_URL = 'https://translation.googleapis.com/language/translate/v2';

export interface TranslationResponse {
  translatedText: string;
  detectedLanguage?: string;
}

export interface TranslationRequest {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export async function translateText(request: TranslationRequest): Promise<TranslationResponse> {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    throw new Error('Google Translate API Key is missing.');
  }

  try {
    const response = await axios.post(`${API_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      q: request.text,
      target: request.targetLanguage,
      source: request.sourceLanguage || 'en',
      format: 'text',
    });

    const translatedText = response.data.data.translations[0].translatedText;
    const detectedSourceLanguage = response.data.data.translations[0].detectedSourceLanguage;

    return {
      translatedText,
      detectedLanguage: detectedSourceLanguage,
    };
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error('Failed to translate text. Please try again.');
  }
}

export async function translateBatch(texts: string[], targetLanguage: string): Promise<TranslationResponse[]> {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    throw new Error('Google Translate API Key is missing.');
  }

  try {
    const response = await axios.post(`${API_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      q: texts,
      target: targetLanguage,
      format: 'text',
    });

    return response.data.data.translations.map((t: any) => ({
      translatedText: t.translatedText,
      detectedLanguage: t.detectedSourceLanguage,
    }));
  } catch (error) {
    console.error('Batch translation error:', error);
    throw new Error('Failed to translate texts. Please try again.');
  }
}

export async function detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    throw new Error('Google Translate API Key is missing.');
  }

  try {
    const response = await axios.post(`${API_URL}/detect?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      q: text,
    });
    const detection = response.data.data.detections[0][0];
    return {
      language: detection.language,
      confidence: detection.confidence,
    };
  } catch (error) {
    console.error('Language detection error:', error);
    throw new Error('Failed to detect language.');
  }
}

export async function getAvailableLanguages(): Promise<Array<{ code: string; name: string }>> {
  return [
    { code: 'en', name: 'English' },
    { code: 'si', name: 'Sinhala' },
    { code: 'ta', name: 'Tamil' },
  ];
}
