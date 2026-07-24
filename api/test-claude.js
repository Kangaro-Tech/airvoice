const { Anthropic } = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
dotenv.config({ path: 'f:/australia company project/airVoice/airvoice/api/.env' });

async function main() {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 150,
      messages: [{ role: "user", content: "Hello, say test." }]
    });
    console.log("Success:", response.content[0].text);
  } catch (e) {
    console.error("Error:", e);
  }
}
main();
