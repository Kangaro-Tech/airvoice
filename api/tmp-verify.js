const dotenv = require('dotenv');
const raw = dotenv.config({ path: '.env' }).parsed.FIREBASE_SERVICE_ACCOUNT_KEY;
console.log('raw length', raw.length);
console.log('prefix', raw.slice(0, 120));
console.log('suffix', raw.slice(-120));

const value = raw.trim().replace(/^(['"])(.*)\1$/s, '$2').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');

const getStringValue = (key) => {
  const match = value.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'm'));
  if (!match) return null;
  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

console.log('project_id', getStringValue('project_id'));
console.log('client_email', getStringValue('client_email'));
console.log('has private key', Boolean(getStringValue('private_key')));
