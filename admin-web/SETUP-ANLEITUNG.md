# BoatCare Admin Panel - Setup Anleitung

## Problem: Löschung funktioniert nicht über die Admin-App

Die Admin-App verwendet den Supabase `anonKey`, der durch Row Level Security (RLS) Policies eingeschränkt ist. Direktes Löschen über die API wird blockiert.

## Lösung: RPC-Funktion mit erhöhten Rechten

Um Löschungen zu ermöglichen, müssen Sie eine RPC-Funktion in Supabase erstellen, die mit `SECURITY DEFINER` läuft und die RLS-Policies umgeht.

---

## Schritt 1: RPC-Funktion in Supabase erstellen

1. Öffnen Sie die **Supabase SQL-Konsole**:
   - Gehen Sie zu Ihrem Supabase-Projekt
   - Klicken Sie im linken Menü auf **SQL Editor**

2. Führen Sie das SQL-Script aus:
   - Öffnen Sie die Datei `create-bulk-delete-rpc.sql`
   - Kopieren Sie den gesamten Inhalt
   - Fügen Sie ihn in die SQL-Konsole ein
   - Klicken Sie auf **Run** oder drücken Sie `Cmd/Ctrl + Enter`

3. Verifizieren Sie die Installation:
   ```sql
   -- Testen Sie die Funktion mit einem leeren Array
   SELECT bulk_delete_providers(ARRAY[]::UUID[]);
   ```

   Erwartetes Ergebnis:
   ```json
   {
     "deleted": 0,
     "errors": 0,
     "total": 0
   }
   ```

---

## Schritt 2: Datenbank bereinigen (optional aber empfohlen)

Bevor Sie die Admin-App verwenden, sollten Sie die Datenbank bereinigen:

### Option A: Duplikate und Kategorien bereinigen
```sql
-- Führen Sie cleanup-complete.sql aus
-- Dieses Script:
-- 1. Löscht alle Duplikate (behält ältesten Eintrag)
-- 2. Normalisiert alle Kategorien auf die 8 definierten Kategorien
-- 3. Zeigt Vorher/Nachher-Statistiken
```

### Option B: Nur "Unbekannte" Provider löschen
```sql
-- Führen Sie delete-all-unknown.sql aus
-- Löscht alle Provider mit Name='Unbekannt' ODER ohne Stadt
```

### Option C: Nur Kategorien normalisieren
```sql
-- Führen Sie fix-categories.sql aus
-- Mappt alle Kategorien auf die 8 definierten Kategorien
```

---

## Schritt 3: Admin-App verwenden

Nach dem Setup funktionieren alle Löschfunktionen:

### Einzelne Provider löschen
- Klicken Sie auf einen Provider in der Liste
- Klicken Sie auf **🗑️ Löschen**
- Bestätigen Sie die Aktion

### Mehrere Provider gleichzeitig löschen (Bulk-Delete)
1. Wechseln Sie zur **"Nach Kategorien"**-Ansicht
2. Wählen Sie Provider mit den Checkboxen aus:
   - Einzelne Provider auswählen
   - Alle in einer Kategorie: Klicken Sie auf **☑️** neben dem Kategorienamen
   - Alle Provider: Klicken Sie auf **☑️ Alle auswählen** in der Sticky-Bar
3. Klicken Sie auf **🗑️ Ausgewählte löschen**
4. Bestätigen Sie die Aktion

---

## Technische Details

### Die RPC-Funktion

```sql
CREATE OR REPLACE FUNCTION bulk_delete_providers(provider_ids UUID[])
RETURNS JSON AS $$
DECLARE
    deleted_count INTEGER := 0;
    error_count INTEGER := 0;
    current_id UUID;
BEGIN
    FOREACH current_id IN ARRAY provider_ids
    LOOP
        BEGIN
            DELETE FROM service_providers WHERE id = current_id;
            deleted_count := deleted_count + 1;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
        END;
    END LOOP;

    RETURN json_build_object(
        'deleted', deleted_count,
        'errors', error_count,
        'total', array_length(provider_ids, 1)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Wichtige Eigenschaften:**
- `SECURITY DEFINER`: Funktion läuft mit den Rechten des Erstellers (Admin), nicht des Aufrufers
- `GRANT EXECUTE TO authenticated`: Nur authentifizierte Benutzer können die Funktion aufrufen
- Gibt JSON-Ergebnis zurück mit Erfolgs-/Fehlerstatistiken

### JavaScript-Integration

Die Admin-App ruft die RPC-Funktion so auf:

```javascript
const { data, error } = await supabaseClient.rpc('bulk_delete_providers', {
    provider_ids: ['uuid1', 'uuid2', 'uuid3']
});

// data enthält:
// {
//   deleted: 3,   // Anzahl erfolgreich gelöschter Provider
//   errors: 0,    // Anzahl Fehler
//   total: 3      // Gesamtanzahl verarbeiteter IDs
// }
```

---

## Definierte Kategorien

Die 8 Kategorien für Service Provider:

1. **Werkstatt** - Allgemeine Reparatur- und Wartungsarbeiten
2. **Zubehör** - Bootsausrüstung und Zubehör
3. **Tankstelle** - Treibstoffversorgung
4. **Segelmacher** - Segel- und Persenningarbeiten
5. **Rigg** - Takelage und Tauwerk
6. **Instrumente** - Elektronik und Instrumente
7. **Marina** - Yachthäfen (nur als geografischer Bezugspunkt)
8. **Sonstige** - Alle anderen Dienstleistungen

---

## Häufige Probleme

### "Funktion bulk_delete_providers existiert nicht"
- Sie haben das SQL-Script noch nicht ausgeführt
- Führen Sie `create-bulk-delete-rpc.sql` in der Supabase SQL-Konsole aus

### "Keine Berechtigung zum Ausführen der Funktion"
- Sie sind nicht als authentifizierter Benutzer eingeloggt
- Loggen Sie sich in der Admin-App ein

### "Löschung schlägt fehl, aber kein Fehler wird angezeigt"
- Prüfen Sie die Browser-Konsole (F12) auf Fehler
- Verifizieren Sie, dass die RPC-Funktion korrekt installiert ist:
  ```sql
  SELECT bulk_delete_providers(ARRAY[]::UUID[]);
  ```

### Duplikate werden nicht erkannt
- Duplikate werden anhand von Name + Koordinaten (gerundet auf 3 Dezimalstellen) erkannt
- Laufen Sie `cleanup-complete.sql` für eine umfassende Bereinigung

---

## Weitere SQL-Scripts

### cleanup-complete.sql
Umfassende Datenbank-Bereinigung:
- Löscht alle Duplikate (behält ältesten Eintrag)
- Normalisiert alle Kategorien
- Zeigt Vorher/Nachher-Statistiken
- Zeigt finale Liste aller Provider

### delete-all-unknown.sql
Löscht problematische Provider:
- Alle mit Name='Unbekannt'
- Alle ohne Stadt (city IS NULL)

### fix-categories.sql
Kategorie-Normalisierung:
- Mappt englische Kategorien → Deutsch
- Mappt inkonsistente Begriffe → Standardkategorien
- Zeigt Vorher/Nachher-Übersicht

### normalize-categories.py
Python-Script für Kategorie-Normalisierung:
- **Funktioniert NICHT** aufgrund RLS-Policies
- Verwenden Sie stattdessen `fix-categories.sql`

### clean-duplicates.py
Python-Script für Duplikat-Erkennung:
- **Funktioniert NICHT** für Löschungen aufgrund RLS-Policies
- Verwenden Sie stattdessen `cleanup-complete.sql`

---

## Support

Bei Problemen:
1. Prüfen Sie die Browser-Konsole (F12 → Console)
2. Prüfen Sie die Supabase-Logs
3. Verifizieren Sie, dass die RPC-Funktion installiert ist
4. Stellen Sie sicher, dass Sie als Admin eingeloggt sind

---

## Nächste Schritte

Nach dem Setup können Sie:
1. **Globale Suche** verwenden, um Service-Provider in verschiedenen Regionen zu finden
2. **Marina-zentrierte Suche** aktivieren, um Betriebe rund um Marinas zu finden
3. **Bulk-Import** verwenden, um gefundene Provider in die Datenbank zu importieren
4. **Bulk-Delete** verwenden, um Duplikate zu entfernen
5. **Kategorieansicht** nutzen, um Provider übersichtlich zu verwalten
