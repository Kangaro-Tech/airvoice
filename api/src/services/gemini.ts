

/**
 * Call Gemini 1.5 Flash Vision API to extract NIC number from image base64 data.
 * @param imageBase64 Base64-encoded image content (without data:image/... prefix)
 * @param mimeType Image MIME type (e.g. image/jpeg, image/png)
 */
export async function extractNicFromImage(imageBase64: string, mimeType: string): Promise<string> {
  const rawClaudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  // Only treat as valid Claude key if it starts with 'sk-' and does not contain curl/command text
  const claudeApiKey = (rawClaudeKey && rawClaudeKey.trim().startsWith('sk-')) ? rawClaudeKey.trim() : null;

  // Resolve best Google/Gemini key: try GEMINI_API_KEY first, fallback to GOOGLE_TRANSLATE_API_KEY if invalid or empty
  let geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey || !geminiApiKey.trim().startsWith('AIzaSy')) {
    const translateKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (translateKey && translateKey.trim().startsWith('AIzaSy')) {
      console.log('[AI] GEMINI_API_KEY invalid or missing. Reusing GOOGLE_TRANSLATE_API_KEY for Gemini extraction.');
      geminiApiKey = translateKey;
    }
  }

  if (claudeApiKey) {
    console.log('[AI] Using Anthropic Claude API for NIC extraction');
    const url = 'https://api.anthropic.com/v1/messages';
    
    // Normalize mimeType (e.g. image/jpg -> image/jpeg)
    let mediaType = mimeType;
    if (mimeType === 'image/jpg') mediaType = 'image/jpeg';

    const payload = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: "Extract the National Identity Card (NIC) number from this Sri Lankan National Identity Card image. Sri Lankan NIC format is either 9 digits followed by 'V' or 'X' (case-insensitive) or 12 digits. Return ONLY the extracted NIC number as a single word, with no extra text, labels, or spaces. If you cannot find a valid NIC, return 'NONE'.",
            },
          ],
        },
      ],
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[AI] Claude API Error:', errText);
        // Fallback to Gemini if available
        if (geminiApiKey) {
          return extractNicWithGemini(imageBase64, mimeType, geminiApiKey);
        }
        return 'NONE';
      }

      const data = await res.json() as any;
      const text = data.content?.[0]?.text?.trim() ?? 'NONE';
      return text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    } catch (err) {
      console.error('[AI] Claude exception:', err);
      if (geminiApiKey) {
        return extractNicWithGemini(imageBase64, mimeType, geminiApiKey);
      }
      return 'NONE';
    }
  }

  if (geminiApiKey) {
    return extractNicWithGemini(imageBase64, mimeType, geminiApiKey);
  }

  console.warn('[AI] Neither a valid Claude API key nor Google API key is configured. Skipping AI verification.');
  return 'NONE';
}

async function extractNicWithGemini(imageBase64: string, mimeType: string, apiKey: string): Promise<string> {
  console.log('[AI] Using Google Gemini API for NIC extraction');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          {
            text: "Extract the National Identity Card (NIC) number from this Sri Lankan National Identity Card image. Sri Lankan NIC format is either 9 digits followed by 'V' or 'X' (case-insensitive) or 12 digits. Return ONLY the extracted NIC number as a single word, with no extra text, labels, or spaces. If you cannot find a valid NIC, return 'NONE'."
          }
        ]
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[GEMINI] API Error:', errText);
      return 'NONE';
    }

    const data = await res.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'NONE';
    return text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  } catch (err) {
    console.error('[GEMINI] Exception occurred during extraction:', err);
    return 'NONE';
  }
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
  const rawClaudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const claudeApiKey = (rawClaudeKey && rawClaudeKey.trim().startsWith('sk-')) ? rawClaudeKey.trim() : null;

  let geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey || !geminiApiKey.trim().startsWith('AIzaSy')) {
    const translateKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (translateKey && translateKey.trim().startsWith('AIzaSy')) {
      geminiApiKey = translateKey;
    }
  }

  const promptText = `Analyze the following Sri Lankan military unit string and extract details in JSON format:
{ "battalion": "", "regiment": "", "regiment_short_name": "", "full_unit_name": "", "short_unit_name": "", "camp_location": "" }
Example: '4 MIR - AIYAKACHCHI (army)' -> { "battalion": "4th Battalion", "regiment": "Mechanized Infantry Regiment", "regiment_short_name": "MIR", "full_unit_name": "4th Battalion, Mechanized Infantry Regiment", "short_unit_name": "4 MIR", "camp_location": "AIYAKACHCHI" }.
If you cannot determine a field, leave it empty or omit it. Only output valid JSON, no markdown formatting.

Unit String: "${unitString}"`;

  if (claudeApiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 500,
          messages: [{ role: 'user', content: [{ type: 'text', text: promptText }] }],
        }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        let text = data.content?.[0]?.text?.trim();
        if (text) {
          text = text.replace(/```json/g, '').replace(/```/g, '').trim();
          return JSON.parse(text) as MilitaryUnitDetails;
        }
      }
    } catch (err) {
      console.error('[AI] Claude exception during military extraction:', err);
    }
  }

  if (geminiApiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          text = text.replace(/```json/g, '').replace(/```/g, '').trim();
          return JSON.parse(text) as MilitaryUnitDetails;
        }
      }
    } catch (err) {
      console.error('[GEMINI] Exception during military extraction:', err);
    }
  }

  return null;
}

export async function extractMultipleMilitaryUnitDetails(unitStrings: string[]): Promise<Record<string, MilitaryUnitDetails>> {
  if (unitStrings.length === 0) return {};
  
  const rawClaudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const claudeApiKey = (rawClaudeKey && rawClaudeKey.trim().startsWith('sk-')) ? rawClaudeKey.trim() : null;

  let geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey || !geminiApiKey.trim().startsWith('AIzaSy')) {
    const translateKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (translateKey && translateKey.trim().startsWith('AIzaSy')) {
      geminiApiKey = translateKey;
    }
  }

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

  if (claudeApiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': claudeApiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1500,
          messages: [{ role: 'user', content: [{ type: 'text', text: promptText }] }],
        }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        return parseResponse(data.content?.[0]?.text);
      }
    } catch (err) {
      console.error('[AI] Claude exception during batch military extraction:', err);
    }
  }

  if (geminiApiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        return parseResponse(data.candidates?.[0]?.content?.parts?.[0]?.text);
      }
    } catch (err) {
      console.error('[GEMINI] Exception during batch military extraction:', err);
    }
  }

  return {};
}


