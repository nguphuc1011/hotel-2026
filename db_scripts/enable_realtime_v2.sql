-- Enable Realtime for critical tables
BEGIN;

-- 1. Ensure the publication exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

-- 2. Add tables to publication
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE pending_approvals;

-- 3. Set Replica Identity to FULL for pending_approvals to ensure we get old record (optional but recommended for updates)
ALTER TABLE pending_approvals REPLICA IDENTITY FULL;

-- 4. Set Replica Identity for rooms and bookings just in case
ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE bookings REPLICA IDENTITY FULL;

COMMIT;

-- Verify
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
