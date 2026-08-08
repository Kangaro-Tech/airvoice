-- ============================================================================
-- AIRVOICE DATABASE MIGRATIONS
-- Run this entire script in the Supabase SQL Editor (Database > SQL Editor)
-- ============================================================================

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

-- Migration 001: Create phones table
-- Stores individual phone inventory with IMEI tracking and allocation status

CREATE TABLE IF NOT EXISTS public.phones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id VARCHAR(100) NOT NULL DEFAULT 'unknown',
  phone_model_id uuid REFERENCES public.phone_models(id) ON DELETE SET NULL,
  imei_1 VARCHAR(20) NOT NULL UNIQUE,
  imei_2 VARCHAR(20),
  serial_number VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'in_stock',
  stock_location VARCHAR(100),
  notes TEXT,
  purchase_cost DECIMAL(10, 2),
  purchase_date DATE,
  warranty_months INTEGER,
  supplier_id uuid,
  received_by uuid,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  sold_date DATE,
  allocated_by uuid,
  allocated_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_phones_imei1 ON public.phones(imei_1);
CREATE INDEX IF NOT EXISTS idx_phones_phone_model_id ON public.phones(phone_model_id);
CREATE INDEX IF NOT EXISTS idx_phones_application_id ON public.phones(application_id);
CREATE INDEX IF NOT EXISTS idx_phones_customer_id ON public.phones(customer_id);
CREATE INDEX IF NOT EXISTS idx_phones_status ON public.phones(status);
CREATE INDEX IF NOT EXISTS idx_phones_deleted_at ON public.phones(deleted_at) WHERE deleted_at IS NULL;

-- Add comments
COMMENT ON TABLE public.phones IS 'Individual phone inventory with IMEI tracking and allocation to applications/customers';
COMMENT ON COLUMN public.phones.imei_1 IS 'Primary IMEI number (international mobile equipment identity)';
COMMENT ON COLUMN public.phones.imei_2 IS 'Secondary IMEI for dual SIM phones';
COMMENT ON COLUMN public.phones.status IS 'Phone status: in_stock, allocated, sold, returned, damaged, lost';
COMMENT ON COLUMN public.phones.application_id IS 'Reference to application if phone is allocated to an installment sale';
COMMENT ON COLUMN public.phones.customer_id IS 'Reference to customer if phone is sold/allocated';
COMMENT ON COLUMN public.phones.phone_model_id IS 'Reference to the phone model from phone_models catalog';

-- ============================================================================
-- END OF REQUIRED MIGRATIONS
-- The tables above are REQUIRED for the handover process to work
-- ============================================================================
