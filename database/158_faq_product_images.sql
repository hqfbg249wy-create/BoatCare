-- 158_faq_product_images.sql
-- FAQ: mehrere Produktbilder (bis zu 5) im Editor und per Excel/CSV
-- (bild2..bild5). DE-Basis + Uebersetzungen EN/FR/IT/ES/NL.

INSERT INTO public.provider_faqs (category, question, answer, translations, sort_order, is_published)
VALUES (
  'csv',
  $q$Wie hinterlege ich mehrere Produktbilder (bis zu 5)?$q$,
  $a$Pro Produkt sind bis zu 5 Bilder moeglich. Der Kunde blaettert im Shop per Wischen oder ueber die Pfeile durch die Bilder (iOS und Web). Das erste Bild ist das Titelbild.

Im Editor: unter "Produktbilder" mehrere Bilder hochladen (Mehrfachauswahl moeglich) oder Bild-URLs einfuegen. Mit "Als Titelbild" bestimmst du das erste Bild, mit dem X entfernst du eines.

Per Excel/CSV: Das Titelbild steht wie bisher in der Spalte image_url (alias bild1). Weitere Bilder traegst du in die Spalten bild2, bild3, bild4 und bild5 ein (jeweils eine Bild-URL). Beim Export "Bestand exportieren" werden diese Spalten mit ausgegeben, sodass die Datei 1:1 wieder importierbar ist.

Hinweis: Die Bilder werden in der Produktansicht immer vollstaendig angezeigt (nicht beschnitten), unabhaengig vom Seitenverhaeltnis.$a$,
  $t${
    "en": {"question": "How do I add multiple product images (up to 5)?",
      "answer": "Up to 5 images per product are possible. In the shop the customer swipes or uses the arrows to browse the images (iOS and web). The first image is the cover.\n\nIn the editor: under \"Product images\" upload several images (multi-select) or paste image URLs. Use \"Set as cover\" to choose the first image and the X to remove one.\n\nVia Excel/CSV: the cover goes into the image_url column as before (alias bild1). Add further images in the columns bild2, bild3, bild4 and bild5 (one image URL each). \"Export inventory\" writes these columns too, so the file can be re-imported one to one.\n\nNote: images are always shown in full in the product view (never cropped), regardless of aspect ratio."},
    "fr": {"question": "Comment ajouter plusieurs images de produit (jusqu'à 5) ?",
      "answer": "Jusqu'à 5 images par produit sont possibles. Dans la boutique, le client fait défiler ou utilise les flèches pour parcourir les images (iOS et web). La première image est la couverture.\n\nDans l'éditeur : sous « Images du produit », importez plusieurs images (sélection multiple) ou collez des URL d'images. « Définir comme couverture » choisit la première image, le X en supprime une.\n\nVia Excel/CSV : la couverture reste dans la colonne image_url (alias bild1). Ajoutez d'autres images dans les colonnes bild2, bild3, bild4 et bild5 (une URL par colonne). « Exporter le stock » inclut ces colonnes, le fichier est donc réimportable à l'identique.\n\nRemarque : les images sont toujours affichées en entier dans la fiche produit (jamais rognées), quel que soit le format."},
    "it": {"question": "Come inserisco più immagini prodotto (fino a 5)?",
      "answer": "Sono possibili fino a 5 immagini per prodotto. Nel negozio il cliente scorre o usa le frecce per sfogliare le immagini (iOS e web). La prima immagine è la copertina.\n\nNell'editor: in \"Immagini prodotto\" carica più immagini (selezione multipla) o incolla URL di immagini. \"Imposta come copertina\" sceglie la prima immagine, la X ne rimuove una.\n\nVia Excel/CSV: la copertina resta nella colonna image_url (alias bild1). Aggiungi altre immagini nelle colonne bild2, bild3, bild4 e bild5 (un URL per colonna). \"Esporta inventario\" include queste colonne, così il file è reimportabile 1:1.\n\nNota: le immagini vengono sempre mostrate per intero nella scheda prodotto (mai tagliate), a prescindere dalle proporzioni."},
    "es": {"question": "¿Cómo añado varias imágenes de producto (hasta 5)?",
      "answer": "Se admiten hasta 5 imágenes por producto. En la tienda el cliente desliza o usa las flechas para pasar las imágenes (iOS y web). La primera imagen es la portada.\n\nEn el editor: en \"Imágenes del producto\" sube varias imágenes (selección múltiple) o pega URL de imágenes. \"Establecer como portada\" elige la primera imagen y la X elimina una.\n\nMediante Excel/CSV: la portada va en la columna image_url como antes (alias bild1). Añade más imágenes en las columnas bild2, bild3, bild4 y bild5 (una URL por columna). \"Exportar inventario\" incluye estas columnas, así el archivo se puede reimportar tal cual.\n\nNota: las imágenes siempre se muestran completas en la ficha del producto (nunca recortadas), sea cual sea la proporción."},
    "nl": {"question": "Hoe voeg ik meerdere productafbeeldingen toe (tot 5)?",
      "answer": "Tot 5 afbeeldingen per product zijn mogelijk. In de shop veegt de klant of gebruikt de pijlen om door de afbeeldingen te bladeren (iOS en web). De eerste afbeelding is de omslag.\n\nIn de editor: upload onder \"Productafbeeldingen\" meerdere afbeeldingen (meervoudige selectie) of plak afbeeldings-URL's. Met \"Als omslag instellen\" kies je de eerste afbeelding, met de X verwijder je er een.\n\nVia Excel/CSV: de omslag staat zoals voorheen in de kolom image_url (alias bild1). Zet extra afbeeldingen in de kolommen bild2, bild3, bild4 en bild5 (één URL per kolom). \"Voorraad exporteren\" neemt deze kolommen mee, zodat het bestand 1:1 opnieuw importeerbaar is.\n\nLet op: afbeeldingen worden in de productweergave altijd volledig getoond (nooit bijgesneden), ongeacht de verhouding."}
  }$t$::jsonb,
  42, true
);
