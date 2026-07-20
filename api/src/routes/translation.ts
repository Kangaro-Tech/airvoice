import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const GOOGLE_TRANSLATE_API = 'https://translation.googleapis.com/language/translate/v2';

// Request validation schemas
const TranslateSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  targetLanguage: z.string().min(2, 'Target language is required'),
  sourceLanguage: z.string().default('en'),
});

const TranslateBatchSchema = z.object({
  texts: z.array(z.string().min(1)).min(1),
  targetLanguage: z.string().min(2),
});

const DetectSchema = z.object({
  text: z.string().min(1),
});

/**
 * Translate text using Google Cloud Translation API
 */
async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage: string
): Promise<{ translatedText: string; detectedLanguage?: string }> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) {
    return {
      translatedText: text,
      detectedLanguage: sourceLanguage,
    };
  }

  try {
    const response = await fetch(`${GOOGLE_TRANSLATE_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        target: targetLanguage,
        source: sourceLanguage,
      }),
    });

    if (!response.ok) {
      console.error('Translation API error:', await response.text());
      return { translatedText: text };
    }

    const data = await response.json();
    return {
      translatedText: data.data?.translations?.[0]?.translatedText || text,
      detectedLanguage: data.data?.translations?.[0]?.detectedSourceLanguage,
    };
  } catch (error) {
    console.error('Translation error:', error);
    return { translatedText: text };
  }
}

/**
 * Detect language
 */
async function detectLanguageCode(text: string): Promise<string> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) return 'en';

  try {
    const response = await fetch(`${GOOGLE_TRANSLATE_API}/detect?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });

    if (!response.ok) {
      console.error('Detection API error:', await response.text());
      return 'en';
    }

    const data = await response.json();
    return data.data?.detections?.[0]?.[0]?.language || 'en';
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en';
  }
}

export default async function translationRoutes(fastify: FastifyInstance) {
  /**
   * POST /translate
   * Translate single text
   */
  fastify.post('/translate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = TranslateSchema.parse(request.body);
      const result = await translateText(body.text, body.targetLanguage, body.sourceLanguage);
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: error.errors });
      }
      return reply.status(500).send({ error: 'Translation failed' });
    }
  });

  /**
   * POST /translate/batch
   * Translate multiple texts
   */
  fastify.post('/translate/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = TranslateBatchSchema.parse(request.body);
      const results = await Promise.all(
        body.texts.map(text => translateText(text, body.targetLanguage, 'en'))
      );
      return reply.status(200).send(results);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: error.errors });
      }
      return reply.status(500).send({ error: 'Batch translation failed' });
    }
  });

  /**
   * POST /translate/detect
   * Detect language
   */
  fastify.post('/translate/detect', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = DetectSchema.parse(request.body);
      const language = await detectLanguageCode(body.text);
      return reply.status(200).send({ language, confidence: 0.95 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: error.errors });
      }
      return reply.status(500).send({ error: 'Detection failed' });
    }
  });

  /**
   * GET /translate/languages
   * Get available languages
   */
  fastify.get('/translate/languages', async (request: FastifyRequest, reply: FastifyReply) => {
    const languages = [
      { code: 'en', name: 'English' },
      { code: 'si', name: 'Sinhala (සිංහල)' },
      { code: 'ta', name: 'Tamil (தமிழ්)' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'zh', name: 'Chinese' },
      { code: 'hi', name: 'Hindi' },
    ];
    return reply.status(200).send(languages);
  });
}
