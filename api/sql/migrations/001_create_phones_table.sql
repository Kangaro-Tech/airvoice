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
