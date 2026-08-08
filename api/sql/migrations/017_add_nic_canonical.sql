-- Migration 013: Add NIC canonical column for duplicate detection
-- This column stores normalized NIC format (YYMMDD-NNNC) for fast duplicate checking

ALTER TABLE customers ADD COLUMN IF NOT EXISTS nic_canonical TEXT;

-- Create index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_customers_nic_canonical ON customers(nic_canonical) 
WHERE nic_canonical IS NOT NULL;

-- Backfill existing records
UPDATE customers 
SET nic_canonical = CASE 
  WHEN nic IS NULL OR nic = '' THEN NULL
  WHEN LENGTH(TRIM(REPLACE(REPLACE(nic, '-', ''), ' ', ''))) = 10 THEN
    CONCAT(
      SUBSTRING(REPLACE(REPLACE(nic, '-', ''), ' ', ''), 1, 6),
      '-',
      SUBSTRING(REPLACE(REPLACE(nic, '-', ''), ' ', ''), 7, 4)
    )
  ELSE NULL
END
WHERE nic_canonical IS NULL;

COMMIT;
