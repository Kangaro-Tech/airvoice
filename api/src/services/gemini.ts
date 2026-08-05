import OpenAI from 'openai';

/**
 * Get a configured OpenAI client using OPENAI_API_KEY from environment.
 */
function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith('sk-')) return null;
  return new OpenAI({ apiKey });
}

/**
 * Call OpenAI Vision API to extract NIC number from image base64 data.
 * Falls back to pattern-based extraction if API unavailable.
 */
export async function extractNicFromImage(imageBase64: string, mimeType: string): Promise<string> {
  const client = getOpenAIClient();

  if (client) {
    console.log('[AI] Using OpenAI GPT-4o for NIC extraction');
    try {
      const dataUrl = `data:${mimeType};base64,${imageBase64}`;
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl, detail: 'high' },
              },
              {
                type: 'text',
                text: "Extract the National Identity Card (NIC) number from this Sri Lankan National Identity Card image. Sri Lankan NIC format is either 9 digits followed by 'V' or 'X' (case-insensitive) or 12 digits. Return ONLY the extracted NIC number as a single word, with no extra text, labels, or spaces. If you cannot find a valid NIC, return 'NONE'.",
              },
            ],
          },
        ],
      });

      const text = response.choices[0]?.message?.content?.trim() ?? 'NONE';
      return text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    } catch (err) {
      console.error('[AI] OpenAI NIC extraction error:', err);
      return 'NONE';
    }
  }

  console.warn('[AI] OPENAI_API_KEY not configured. Skipping AI NIC verification.');
  return 'NONE';
}

export interface MilitaryUnitDetails {
  battalion?: string;
  regiment?: string;
  regiment_short_name?: string;
  full_unit_name?: string;
  short_unit_name?: string;
  camp_location?: string;
}

export async function extractMilitaryUnitDetails(unitString: string): Promise<MilitaryUnitDetails | null> {
  const client = getOpenAIClient();

  const promptText = `Analyze the following Sri Lankan military unit string and extract details in JSON format:
{ "battalion": "", "regiment": "", "regiment_short_name": "", "full_unit_name": "", "short_unit_name": "", "camp_location": "" }
Example: '4 MIR - AIYAKACHCHI (army)' -> { "battalion": "4th Battalion", "regiment": "Mechanized Infantry Regiment", "regiment_short_name": "MIR", "full_unit_name": "4th Battalion, Mechanized Infantry Regiment", "short_unit_name": "4 MIR", "camp_location": "AIYAKACHCHI" }.
If you cannot determine a field, leave it empty or omit it. Only output valid JSON, no markdown formatting.

Unit String: "${unitString}"`;

  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        messages: [{ role: 'user', content: promptText }],
      });
      let text = response.choices[0]?.message?.content?.trim();
      if (text) {
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text) as MilitaryUnitDetails;
      }
    } catch (err) {
      console.error('[AI] OpenAI military extraction error:', err);
    }
  }

  return null;
}

export async function extractMultipleMilitaryUnitDetails(unitStrings: string[]): Promise<Record<string, MilitaryUnitDetails>> {
  if (unitStrings.length === 0) return {};

  const client = getOpenAIClient();

  const promptText = `Analyze the following Sri Lankan military unit strings and extract details for EACH one.
Return ONLY a JSON object where the keys are the exact original strings, and the values are objects with these fields:
{ "battalion": "", "regiment": "", "regiment_short_name": "", "full_unit_name": "", "short_unit_name": "", "camp_location": "" }

If you cannot determine a field, leave it empty. Only output valid JSON, no markdown formatting.

Unit Strings:
${JSON.stringify(unitStrings)}`;

  const parseResponse = (text: string | undefined) => {
    if (!text) return {};
    try {
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText) as Record<string, MilitaryUnitDetails>;
    } catch {
      return {};
    }
  };

  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        messages: [{ role: 'user', content: promptText }],
      });
      return parseResponse(response.choices[0]?.message?.content ?? undefined);
    } catch (err) {
      console.error('[AI] OpenAI batch military extraction error:', err);
    }
  }

  return {};
}

/**
 * Generate an AI text summary/insight using OpenAI GPT-4o-mini.
 */
export async function generateAiSummary(prompt: string, maxTokens = 300): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: 'You are a professional financial AI assistant for AIRVOICE Defence Finance Management, a Sri Lankan military phone financing company. Provide concise, professional insights without markdown formatting.',
        },
        { role: 'user', content: prompt },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error('[AI] OpenAI summary generation error:', err);
    return null;
  }
}
