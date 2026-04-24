-- Erstellt eine RPC-Funktion für Bulk-Löschung von Service Providern
-- Diese Funktion läuft mit SECURITY DEFINER, umgeht also RLS-Policies
-- Führen Sie dieses SQL direkt in der Supabase SQL-Konsole aus

CREATE OR REPLACE FUNCTION bulk_delete_providers(provider_ids UUID[])
RETURNS JSON AS $$
DECLARE
    deleted_count INTEGER := 0;
    error_count INTEGER := 0;
    current_id UUID;
BEGIN
    -- Lösche jeden Provider einzeln und zähle Erfolge/Fehler
    FOREACH current_id IN ARRAY provider_ids
    LOOP
        BEGIN
            DELETE FROM service_providers WHERE id = current_id;
            deleted_count := deleted_count + 1;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
        END;
    END LOOP;

    -- Gib Ergebnis als JSON zurück
    RETURN json_build_object(
        'deleted', deleted_count,
        'errors', error_count,
        'total', array_length(provider_ids, 1)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Erlaube der Funktion, von authentifizierten Benutzern aufgerufen zu werden
GRANT EXECUTE ON FUNCTION bulk_delete_providers(UUID[]) TO authenticated;

-- Teste die Funktion (optional - kommentieren Sie das aus, wenn Sie nicht testen möchten)
-- SELECT bulk_delete_providers(ARRAY[]::UUID[]);
