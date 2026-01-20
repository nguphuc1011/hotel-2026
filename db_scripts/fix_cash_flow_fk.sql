ALTER TABLE public.cash_flow 
DROP CONSTRAINT IF EXISTS cash_flow_verified_by_staff_id_fkey;

ALTER TABLE public.cash_flow
ADD CONSTRAINT cash_flow_verified_by_staff_id_fkey
FOREIGN KEY (verified_by_staff_id)
REFERENCES public.staff(id)
ON DELETE SET NULL;
