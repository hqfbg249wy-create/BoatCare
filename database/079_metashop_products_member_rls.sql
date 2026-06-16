-- Migration 079: metashop_products RLS für Team-Mitglieder (provider_members)
--
-- Problem: Die Write-Policy aus 028 erlaubt nur den Haupt-Owner
-- (service_providers.user_id = auth.uid()). Team-Mitglieder, die über
-- provider_members verknüpft sind, bekommen beim Anlegen/Importieren von
-- Produkten "new row violates row-level security policy for table
-- metashop_products".
--
-- Fix: Policy so erweitern, dass auch akzeptierte provider_members
-- (Owner ODER Mitglied) die Produkte ihres Betriebs verwalten dürfen.

DROP POLICY IF EXISTS "metashop_products_provider_manage" ON metashop_products;

CREATE POLICY "metashop_products_provider_manage" ON metashop_products
    FOR ALL TO authenticated
    USING (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_members WHERE user_id = auth.uid()
        )
    );

-- Sanity
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'metashop_products'::regclass;
