-- Zeige die Definition der View providers_with_ratings
SELECT pg_get_viewdef('providers_with_ratings', true) as view_definition;

-- Alternative: Zeige alle Views, die 'address' verwenden
SELECT
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE definition LIKE '%address%'
  AND schemaname = 'public';
