-- Migration 000: Create phone_models table
-- Stores information about phone model types (brand, model, specs, pricing)

CREATE TABLE IF NOT EXISTS public.phone_models (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  display_name VARCHAR(200),
  specifications JSONB,
  sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10, 2),
  storage_gb INTEGER,
  ram_gb INTEGER,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by uuid,
  updated_by uuid,
  UNIQUE(brand, model)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_phone_models_brand_model ON public.phone_models(brand, model);
CREATE INDEX IF NOT EXISTS idx_phone_models_active ON public.phone_models(is_active);

-- Add comments
COMMENT ON TABLE public.phone_models IS 'Phone models catalog with brand, model, and pricing information';
COMMENT ON COLUMN public.phone_models.brand IS 'Phone manufacturer (e.g., Apple, Samsung, Nokia)';
COMMENT ON COLUMN public.phone_models.model IS 'Model name (e.g., iPhone 12, Galaxy S21)';
COMMENT ON COLUMN public.phone_models.sale_price IS 'Selling price to customers in LKR';
COMMENT ON COLUMN public.phone_models.cost_price IS 'Cost to acquire the device';
