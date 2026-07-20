-- 001_seed_districts.sql
-- Seed Sri Lanka districts (upsert)

BEGIN;

INSERT INTO public.districts (id, name, province, name_si, name_ta, created_at, updated_at) VALUES
('d1000000-0000-0000-0000-000000000001','Colombo','Western',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000002','Gampaha','Western',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000003','Kalutara','Western',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000004','Kandy','Central',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000005','Matale','Central',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000006','Nuwara Eliya','Central',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000007','Galle','Southern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000008','Matara','Southern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000009','Hambantota','Southern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-00000000000a','Ratnapura','Sabaragamuwa',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-00000000000b','Kegalle','Sabaragamuwa',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-00000000000c','Kurunegala','North Western',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-00000000000d','Puttalam','North Western',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-00000000000e','Anuradhapura','North Central',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-00000000000f','Polonnaruwa','North Central',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000010','Badulla','Uva',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000011','Moneragala','Uva',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000012','Jaffna','Northern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000013','Kilinochchi','Northern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000014','Mannar','Northern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000015','Vavuniya','Northern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000016','Mullaitivu','Northern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000017','Trincomalee','Eastern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000018','Batticaloa','Eastern',NULL,NULL,NOW(),NOW()),
('d1000000-0000-0000-0000-000000000019','Ampara','Eastern',NULL,NULL,NOW(),NOW())
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      province = EXCLUDED.province,
      name_si = EXCLUDED.name_si,
      name_ta = EXCLUDED.name_ta,
      updated_at = NOW();

COMMIT;
