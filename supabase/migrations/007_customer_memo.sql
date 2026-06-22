-- 007: customers.memo + owner UPDATE policy on customers

ALTER TABLE customers ADD COLUMN IF NOT EXISTS memo text;

-- Owner UPDATE policy (own store_link only, NO anon)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'customers'
      AND policyname = 'owner_own_update_customers'
  ) THEN
    CREATE POLICY "owner_own_update_customers"
      ON customers
      FOR UPDATE
      TO authenticated
      USING (
        store_link_id IN (
          SELECT sl.id FROM store_links sl
          INNER JOIN owners o ON o.store_link_id = sl.id
          WHERE o.id = auth.uid()
        )
      )
      WITH CHECK (
        store_link_id IN (
          SELECT sl.id FROM store_links sl
          INNER JOIN owners o ON o.store_link_id = sl.id
          WHERE o.id = auth.uid()
        )
      );
  END IF;
END $$;

UPDATE app_meta SET value = '007' WHERE key = 'schema_version';
