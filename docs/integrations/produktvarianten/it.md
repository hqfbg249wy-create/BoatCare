## Varianti di prodotto (diametro, taglia, colore)

Alcuni prodotti esistono in più versioni, ad es. il cordame in diversi diametri o
l'abbigliamento in taglie e colori. In Skipily definisci **opzioni** (ad es.
« Diametro ») con **valori** (ad es. 6mm, 8mm, 10mm). Ogni combinazione è una
**variante** con prezzo, giacenza e SKU propri (facoltativo).

Tre modi:

**1) Nel portale fornitori (manuale)**
Apri il prodotto e vai alla sezione "Varianti". Aggiungi opzioni e valori; per ogni
combinazione inserisci prezzo, giacenza e SKU.

**2) Import CSV/Excel**
Più righe con lo **stesso nome prodotto** formano UN prodotto con varianti.
Colonne aggiuntive:

| Colonna | Significato |
|---|---|
| `variante1_name` | nome della 1ª opzione, ad es. Diametro |
| `variante1_wert` | valore di questa riga, ad es. 8mm |
| `variante2_name` / `variante2_wert` | seconda opzione facoltativa (ad es. colore) |
| `variante_preis` | prezzo di questa variante |
| `variante_bestand` | giacenza di questa variante |
| `variante_sku` | SKU di questa variante |
| `variante_bild` | URL immagine della variante (facoltativo) |

Suggerimento: con "Esporta inventario" scarichi i tuoi prodotti attuali già nel
nuovo formato, aggiungi le varianti e reimporti il file.

**3) API prodotto (POST/PUT)**
Invia `variant_options` (definizione) e `variants` (combinazioni). Con POST/PUT,
`variants` sostituisce **tutte** le varianti esistenti (array vuoto = eliminazione):

```json
{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}
```

**Ordini:** all'acquisto, l'API e il webhook includono la variante scelta per ogni
riga: `variant_sku` e gli attributi (`attributes`, ad es. `{"Durchmesser":"8mm"}`).
Così il tuo sistema sa esattamente quale variante è stata ordinata.
