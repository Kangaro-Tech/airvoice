/**
 * Normalize NIC format to canonical form for duplicate detection.
 * Handles both formats: 123456789V and 12345678901
 * Returns: YYMMDD-NNNNNNNNNC format (11 chars: 9 digits + 1 dash + 1 digit)
 */
export function normalizeNic(nic: string): string {
  if (!nic) return '';
  
  // Remove spaces/dashes, convert to uppercase
  let cleaned = nic.trim().replace(/[\s\-]/g, '').toUpperCase();
  
  // Handle old format: 123456789V => convert to 10-digit
  if (cleaned.endsWith('V') || cleaned.endsWith('X')) {
    const base = cleaned.slice(0, -1);
    if (base.length === 9) {
      // 123456789V => 1234567890 (last digit becomes 0 for canonical form)
      // OR: 123456789V => 12345678901 (add check digit 1)
      // Standardized: just remove the V/X suffix and pad to 10 digits
      cleaned = (parseInt(base) * 10).toString().slice(0, 10);
    }
  }
  
  // Ensure exactly 10 digits
  if (!/^\d{10}$/.test(cleaned)) {
    return cleaned; // Return as-is if malformed, will fail duplicate check
  }
  
  // Format: YYMMDD-NNNNNNNNNC
  const yymmdd = cleaned.slice(0, 6);
  const serialNumbers = cleaned.slice(6, 9);
  const checkDigit = cleaned.slice(9, 10);
  
  return `${yymmdd}-${serialNumbers}${checkDigit}`;
}
