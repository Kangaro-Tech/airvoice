-- Migration 015: Add handover e-signature columns
-- Store customer and guarantor signatures (as Base64 data URLs or SVG) captured during physical handover

ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS customer_signature TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_signature TEXT;

-- Create indexes for audit/compliance purposes
CREATE INDEX IF NOT EXISTS idx_applications_customer_sig ON public.applications(customer_signature) 
  WHERE customer_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_guarantor_sig ON public.applications(guarantor_signature) 
  WHERE guarantor_signature IS NOT NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.applications.customer_signature IS 'Base64-encoded PNG or SVG of customer e-signature captured during handover';
COMMENT ON COLUMN public.applications.guarantor_signature IS 'Base64-encoded PNG or SVG of guarantor e-signature captured during handover (if applicable)';

COMMIT;
