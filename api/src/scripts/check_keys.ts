import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkKeys() {
  const claudeKey = process.env.CLAUDE_API_KEY;
  const translateKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  console.log('--- API Key Check ---');
  console.log('Claude Key defined:', !!claudeKey);
  console.log('Claude Key prefix:', claudeKey ? claudeKey.slice(0, 15) + '...' : 'none');
  console.log('Translate Key defined:', !!translateKey);
  console.log('Translate Key prefix:', translateKey ? translateKey.slice(0, 10) + '...' : 'none');

  if (claudeKey) {
    console.log('\nTesting Claude API connection...');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      console.log('Claude Status:', res.status, res.statusText);
      const data = await res.json() as any;
      if (res.ok) {
        console.log('Claude Response:', data.content?.[0]?.text);
      } else {
        console.error('Claude Error Response:', JSON.stringify(data));
      }
    } catch (err) {
      console.error('Claude connection failed:', err);
    }
  }

  if (translateKey) {
    console.log('\nTesting Google Translate API connection...');
    try {
      const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${translateKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'Hello',
          target: 'si',
          source: 'en',
        }),
      });

      console.log('Translate Status:', res.status, res.statusText);
      const data = await res.json() as any;
      if (res.ok) {
        console.log('Translate Response:', data.data?.translations?.[0]?.translatedText);
      } else {
        console.error('Translate Error Response:', JSON.stringify(data));
      }
    } catch (err) {
      console.error('Translate connection failed:', err);
    }

    console.log('\nTesting Gemini API connection using Google Translate API key...');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${translateKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "Gemini is online"' }] }]
        }),
      });

      console.log('Gemini Status:', res.status, res.statusText);
      const data = await res.json() as any;
      if (res.ok) {
        console.log('Gemini Response:', data.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
      } else {
        console.error('Gemini Error Response:', JSON.stringify(data));
      }
    } catch (err) {
      console.error('Gemini connection failed:', err);
    }
  }
}

checkKeys();
