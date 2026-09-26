-- 157_faq_excel_import_export.sql
-- FAQ fuer Excel-Import (inkl. Varianten-Mehrzeilen) und Excel-Export
-- ("Bestand exportieren"). DE-Basis + Uebersetzungen EN/FR/IT/ES/NL.

-- ── Excel-Import inkl. Varianten ──
INSERT INTO public.provider_faqs (category, question, answer, translations, sort_order, is_published)
VALUES (
  'csv',
  $q$Kann ich Excel-Dateien (.xlsx) importieren und dabei Varianten anlegen?$q$,
  $a$Ja. Der Import akzeptiert CSV UND Excel (.xlsx/.xls). Lade die Vorlage herunter (Button "CSV-Vorlage") oder nutze "Bestand exportieren", fuelle sie aus und lade sie ueber "CSV/Excel importieren" hoch.

Fuer Produktvarianten legst du mehrere Zeilen mit DEMSELBEN Produktnamen an. Jede Zeile mit Optionswerten wird eine Variante. Zusaetzliche Spalten: variante1_name, variante1_wert (optional variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Beispiel: ein Tauwerk unter demselben Namen in mehreren Zeilen mit je einem Durchmesser und eigenem Preis.

Bei Zeilen ohne Artikelnummer, die per Name auf ein bestehendes Produkt passen, fragt der Import vor dem Speichern nach (aktualisieren, Bestand addieren oder neu anlegen), damit nichts versehentlich ueberschrieben wird.$a$,
  $t${
    "en": {"question": "Can I import Excel files (.xlsx) and create variants?",
      "answer": "Yes. The import accepts CSV AND Excel (.xlsx/.xls). Download the template (\"CSV template\" button) or use \"Export inventory\", fill it in and upload it via \"Import CSV/Excel\".\n\nFor product variants, add several rows with the SAME product name. Each row with option values becomes a variant. Additional columns: variante1_name, variante1_wert (optional variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Example: a rope under the same name across several rows, each with a diameter and its own price.\n\nFor rows without an SKU that match an existing product by name, the import asks before saving (update, add stock or create new) so nothing is overwritten by accident."},
    "fr": {"question": "Puis-je importer des fichiers Excel (.xlsx) et créer des variantes ?",
      "answer": "Oui. L'import accepte le CSV ET Excel (.xlsx/.xls). Téléchargez le modèle (bouton « Modèle CSV ») ou utilisez « Exporter le stock », remplissez-le et importez-le via « Importer CSV/Excel ».\n\nPour les variantes, ajoutez plusieurs lignes avec le MÊME nom de produit. Chaque ligne avec des valeurs d'option devient une variante. Colonnes : variante1_name, variante1_wert (option variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Exemple : un cordage sous le même nom sur plusieurs lignes, chacune avec un diamètre et son prix.\n\nPour les lignes sans SKU correspondant à un produit existant par le nom, l'import demande avant d'enregistrer (mettre à jour, ajouter du stock ou créer)."},
    "it": {"question": "Posso importare file Excel (.xlsx) e creare varianti?",
      "answer": "Sì. L'import accetta CSV E Excel (.xlsx/.xls). Scarica il modello (pulsante \"Modello CSV\") oppure usa \"Esporta inventario\", compilalo e caricalo tramite \"Importa CSV/Excel\".\n\nPer le varianti, aggiungi più righe con lo STESSO nome prodotto. Ogni riga con valori di opzione diventa una variante. Colonne: variante1_name, variante1_wert (opzionale variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Esempio: un cordame con lo stesso nome su più righe, ognuna con un diametro e il suo prezzo.\n\nPer le righe senza SKU che corrispondono a un prodotto esistente per nome, l'import chiede prima di salvare (aggiornare, aggiungere giacenza o creare)."},
    "es": {"question": "¿Puedo importar archivos Excel (.xlsx) y crear variantes?",
      "answer": "Sí. La importación acepta CSV Y Excel (.xlsx/.xls). Descarga la plantilla (botón \"Plantilla CSV\") o usa \"Exportar inventario\", complétala y súbela con \"Importar CSV/Excel\".\n\nPara variantes, añade varias filas con el MISMO nombre de producto. Cada fila con valores de opción se convierte en una variante. Columnas: variante1_name, variante1_wert (opcional variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Ejemplo: un cabo con el mismo nombre en varias filas, cada una con un diámetro y su precio.\n\nEn filas sin SKU que coinciden con un producto existente por nombre, la importación pregunta antes de guardar (actualizar, sumar stock o crear)."},
    "nl": {"question": "Kan ik Excel-bestanden (.xlsx) importeren en varianten aanmaken?",
      "answer": "Ja. De import accepteert CSV ÉN Excel (.xlsx/.xls). Download het sjabloon (knop \"CSV-sjabloon\") of gebruik \"Voorraad exporteren\", vul het in en upload via \"CSV/Excel importeren\".\n\nVoor varianten voeg je meerdere regels met DEZELFDE productnaam toe. Elke regel met optiewaarden wordt een variant. Kolommen: variante1_name, variante1_wert (optioneel variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Voorbeeld: een touw onder dezelfde naam over meerdere regels, elk met een diameter en eigen prijs.\n\nBij regels zonder SKU die op naam overeenkomen met een bestaand product, vraagt de import vóór het opslaan (bijwerken, voorraad optellen of nieuw aanmaken)."}
  }$t$::jsonb,
  40, true
);

-- ── Excel-Export ("Bestand exportieren") ──
INSERT INTO public.provider_faqs (category, question, answer, translations, sort_order, is_published)
VALUES (
  'csv',
  $q$Wie exportiere ich meinen aktuellen Produktbestand (Excel)?$q$,
  $a$Im Bereich Produkte gibt es den Button "Bestand exportieren". Damit laedst du deinen kompletten Bestand als Excel im aktuellen Vorlagen-Format herunter, inklusive der Varianten-Spalten. Bestehende Varianten erscheinen als mehrere Zeilen mit demselben Produktnamen.

So kannst du z. B. bei vorhandenen Produkten Varianten ergaenzen und die Datei ueber "CSV/Excel importieren" 1:1 wieder hochladen. Ideal, um bestehende Produkte nachtraeglich mit Optionen (Durchmesser, Groesse, Farbe) zu versehen.$a$,
  $t${
    "en": {"question": "How do I export my current product inventory (Excel)?",
      "answer": "In the Products area there is an \"Export inventory\" button. It downloads your entire inventory as Excel in the current template format, including the variant columns. Existing variants appear as several rows with the same product name.\n\nThis lets you add variants to existing products and re-upload the file via \"Import CSV/Excel\" one to one. Ideal for adding options (diameter, size, color) to existing products afterwards."},
    "fr": {"question": "Comment exporter mon stock de produits actuel (Excel) ?",
      "answer": "Dans la section Produits, un bouton « Exporter le stock » télécharge tout votre stock en Excel au format de modèle actuel, y compris les colonnes de variantes. Les variantes existantes apparaissent sur plusieurs lignes avec le même nom de produit.\n\nVous pouvez ainsi ajouter des variantes à des produits existants et réimporter le fichier via « Importer CSV/Excel ». Idéal pour ajouter des options (diamètre, taille, couleur) après coup."},
    "it": {"question": "Come esporto il mio inventario prodotti attuale (Excel)?",
      "answer": "Nell'area Prodotti c'è il pulsante \"Esporta inventario\". Scarica tutto l'inventario in Excel nel formato modello attuale, incluse le colonne varianti. Le varianti esistenti appaiono come più righe con lo stesso nome prodotto.\n\nCosì puoi aggiungere varianti a prodotti esistenti e ricaricare il file tramite \"Importa CSV/Excel\". Ideale per aggiungere opzioni (diametro, taglia, colore) in un secondo momento."},
    "es": {"question": "¿Cómo exporto mi inventario de productos actual (Excel)?",
      "answer": "En la sección Productos hay un botón \"Exportar inventario\". Descarga todo tu inventario en Excel con el formato de plantilla actual, incluidas las columnas de variantes. Las variantes existentes aparecen como varias filas con el mismo nombre de producto.\n\nAsí puedes añadir variantes a productos existentes y volver a subir el archivo con \"Importar CSV/Excel\". Ideal para añadir opciones (diámetro, talla, color) más tarde."},
    "nl": {"question": "Hoe exporteer ik mijn huidige productvoorraad (Excel)?",
      "answer": "In het gedeelte Producten staat de knop \"Voorraad exporteren\". Die downloadt je volledige voorraad als Excel in het huidige sjabloonformaat, inclusief de variantkolommen. Bestaande varianten verschijnen als meerdere regels met dezelfde productnaam.\n\nZo kun je varianten toevoegen aan bestaande producten en het bestand opnieuw uploaden via \"CSV/Excel importeren\". Ideaal om achteraf opties (diameter, maat, kleur) toe te voegen."}
  }$t$::jsonb,
  41, true
);
