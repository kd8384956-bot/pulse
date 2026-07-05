/*
# Enable realtime vote updates

Supabase only sends postgres_changes events for tables that are part of the
`supabase_realtime` publication. Add the poll and vote tables so other open
devices receive count changes without a manual refresh.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE polls;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE votes;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
