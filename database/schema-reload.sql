-- Supabase Schema Cache neu laden
NOTIFY pgrst, 'reload schema';

-- Prüfe alle Spalten der service_providers Tabelle
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'service_providers' 
ORDER BY ordinal_position;
