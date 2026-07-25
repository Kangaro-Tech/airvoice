-- Real data simulation: Insert 3 distinct commission records for EVERY sales officer
DO $$ 
DECLARE
  officer RECORD;
BEGIN
  -- Loop through all users who might view the sales officer dashboard
  FOR officer IN SELECT id FROM public.users WHERE role IN ('sales_officer', 'admin', 'super_admin') LOOP
    
    -- Insert 3 commissions for 3 different applications for this officer
    INSERT INTO public.commissions (sales_officer_id, customer_id, application_id, amount, status, created_at, paid_at)
    SELECT 
      officer.id,
      customer_id,
      id,
      CASE 
        WHEN row_number() over() = 1 THEN 1500.00 
        WHEN row_number() over() = 2 THEN 2500.00 
        ELSE 3000.00 
      END,
      (CASE 
        WHEN row_number() over() = 1 THEN 'paid' 
        ELSE 'pending' 
      END)::commission_status,
      NOW() - (row_number() over() * INTERVAL '2 days'),
      CASE 
        WHEN row_number() over() = 1 THEN NOW() - INTERVAL '1 day' 
        ELSE NULL 
      END
    FROM public.applications
    WHERE customer_id IS NOT NULL 
      AND id NOT IN (SELECT application_id FROM public.commissions)
    LIMIT 3
    ON CONFLICT (application_id) DO NOTHING;
    
  END LOOP;
END $$;

