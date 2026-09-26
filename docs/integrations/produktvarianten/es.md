## Variantes de producto (diámetro, talla, color)

Algunos productos existen en varias versiones, p. ej. el cabo en distintos
diámetros o la ropa en tallas y colores. En Skipily defines **opciones** (p. ej.
« Diámetro ») con **valores** (p. ej. 6mm, 8mm, 10mm). Cada combinación es una
**variante** con su propio precio, stock y SKU opcional.

Tres formas:

**1) En el portal de proveedores (manual)**
Abre el producto y ve a la sección "Variantes". Añade opciones y valores; para cada
combinación introduce precio, stock y SKU.

**2) Importación CSV/Excel**
Varias filas con el **mismo nombre de producto** forman UN producto con variantes.
Columnas adicionales:

| Columna | Significado |
|---|---|
| `variante1_name` | nombre de la 1.ª opción, p. ej. Diámetro |
| `variante1_wert` | valor de esta fila, p. ej. 8mm |
| `variante2_name` / `variante2_wert` | segunda opción opcional (p. ej. color) |
| `variante_preis` | precio de esta variante |
| `variante_bestand` | stock de esta variante |
| `variante_sku` | SKU de esta variante |
| `variante_bild` | URL de imagen de la variante (opcional) |

Consejo: con "Exportar inventario" descargas tus productos actuales ya en el nuevo
formato, añades variantes y reimportas el archivo.

**3) API de productos (POST/PUT)**
Envía `variant_options` (definición) y `variants` (combinaciones). En POST/PUT,
`variants` reemplaza **todas** las variantes existentes (array vacío = eliminarlas):

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

**Pedidos:** en una compra, la API y el webhook incluyen la variante elegida por
línea: `variant_sku` y los atributos (`attributes`, p. ej. `{"Durchmesser":"8mm"}`).
Así tu sistema sabe exactamente qué variante se pidió.
