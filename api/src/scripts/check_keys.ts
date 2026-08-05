import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkKeys() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const translateKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  console.log('--- API Key Check ---');
  console.log('OpenAI Key defined:', !!openaiKey);
  console.log('OpenAI Key prefix:', openaiKey ? openaiKey.slice(0, 20) + '...' : 'none');
  console.log('Translate Key defined:', !!translateKey);
  console.log('Translate Key prefix:', translateKey ? translateKey.slice(0, 10) + '...' : 'none');

  if (openaiKey) {
    console.log('\nTesting OpenAI API connection...');
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 15,
          messages: [{ role: 'user', content: 'Say "OpenAI is online" in 3 words.' }],
        }),
      });

      console.log('OpenAI Status:', res.status, res.statusText);
      const data = await res.json() as any;
      if (res.ok) {
        console.log('OpenAI Response:', data.choices?.[0]?.message?.content?.trim());
      } else {
        console.error('OpenAI Error Response:', JSON.stringify(data));
      }
    } catch (err) {
      console.error('OpenAI connection failed:', err);
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
  }
}

checkKeys();
