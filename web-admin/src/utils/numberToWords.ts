/**
 * numberToWords.ts
 * Converts a LKR amount (number) to its English words representation.
 * Port of renderer/numberToWords.js for use in React components.
 *
 * Example: 12500.50 → "RUPEES TWELVE THOUSAND, FIVE HUNDRED AND CENTS FIFTY ONLY"
 */

const ONES = [
  '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE',
  'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
  'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN',
  'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
];

const TENS = [
  '', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY',
  'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY',
];

function spellBelow1000(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const ten = TENS[Math.floor(n / 10)];
    const one = ONES[n % 10];
    return one ? `${ten} ${one}` : ten;
  }
  const hundred = ONES[Math.floor(n / 100)];
  const rest    = spellBelow1000(n % 100);
  return rest ? `${hundred} HUNDRED AND ${rest}` : `${hundred} HUNDRED`;
}

function spellInteger(n: number): string {
  if (n === 0) return 'ZERO';

  const BILLIONS  = Math.floor(n / 1_000_000_000);
  const MILLIONS  = Math.floor((n % 1_000_000_000) / 1_000_000);
  const THOUSANDS = Math.floor((n % 1_000_000) / 1_000);
  const REST      = n % 1_000;

  const parts: string[] = [];
  if (BILLIONS)  parts.push(`${spellBelow1000(BILLIONS)} BILLION`);
  if (MILLIONS)  parts.push(`${spellBelow1000(MILLIONS)} MILLION`);
  if (THOUSANDS) parts.push(`${spellBelow1000(THOUSANDS)} THOUSAND`);
  if (REST)      parts.push(spellBelow1000(REST));

  return parts.join(', ');
}

export function amountToWords(amount: number): string {
  if (isNaN(amount) || amount < 0) return '';

  const rounded = Math.round(amount * 100) / 100;
  const rupees  = Math.floor(rounded);
  const cents   = Math.round((rounded - rupees) * 100);

  const rupeeWords = spellInteger(rupees);

  if (cents === 0) {
    return `RUPEES ${rupeeWords} ONLY`;
  }
  const centWords = spellBelow1000(cents);
  return `RUPEES ${rupeeWords} AND CENTS ${centWords} ONLY`;
}

export function formatAmountFigures(
  amount: number,
  options: {
    prefix?: string;
    useCommas?: boolean;
    securityAsterisks?: boolean;
    decimalPlaces?: number;
  }
): string {
  if (amount == null || isNaN(amount)) return '';
  const decimals = options.decimalPlaces ?? 2;
  let str = Number(amount).toFixed(decimals);
  if (options.useCommas) {
    const [intPart, decPart] = str.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    str = decPart ? `${withCommas}.${decPart}` : withCommas;
  }
  if (options.securityAsterisks) str = `**${str}**`;
  if (options.prefix) str = `${options.prefix} ${str}`;
  return str;
}

export function formatDate(isoDate: string, format = 'DD/MM/YYYY'): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return format
    .replace('YYYY', y)
    .replace('YY',   y.slice(2))
    .replace('MM',   m)
    .replace('DD',   d);
}
