## Variantes de produit (diamètre, taille, couleur)

Certains produits existent en plusieurs versions, p. ex. le cordage en différents
diamètres ou les vêtements en tailles et couleurs. Dans Skipily, vous définissez
des **options** (p. ex. « Diamètre ») avec des **valeurs** (p. ex. 6mm, 8mm, 10mm).
Chaque combinaison est une **variante** avec son propre prix, stock et SKU en option.

Trois possibilités :

**1) Dans le portail fournisseur (manuel)**
Ouvrez le produit et allez à la section « Variantes ». Ajoutez options et valeurs ;
pour chaque combinaison, saisissez prix, stock et SKU.

**2) Import CSV/Excel**
Plusieurs lignes avec le **même nom de produit** forment UN produit avec variantes.
Colonnes supplémentaires :

| Colonne | Signification |
|---|---|
| `variante1_name` | nom de la 1re option, p. ex. Diamètre |
| `variante1_wert` | valeur de cette ligne, p. ex. 8mm |
| `variante2_name` / `variante2_wert` | deuxième option en option (p. ex. couleur) |
| `variante_preis` | prix de cette variante |
| `variante_bestand` | stock de cette variante |
| `variante_sku` | SKU de cette variante |
| `variante_bild` | URL d'image de la variante (facultatif) |

Astuce : « Exporter le stock » télécharge vos produits actuels déjà au nouveau
format ; ajoutez les variantes et réimportez le fichier.

**3) API produit (POST/PUT)**
Envoyez `variant_options` (définition) et `variants` (combinaisons). Au POST/PUT,
`variants` remplace **toutes** les variantes existantes (tableau vide = suppression) :

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

**Commandes :** lors d'un achat, l'API et le webhook incluent la variante choisie
par ligne : `variant_sku` et les attributs (`attributes`, p. ex.
`{"Durchmesser":"8mm"}`). Votre système sait ainsi exactement quelle variante a été
commandée.


## Images de produit (jusqu'à 5)

Jusqu'à **5 images** par produit sont possibles. Dans la boutique, le client parcourt
les images en **faisant défiler** ou via les **flèches** (iOS et web). La première
image est la **couverture**.

**Dans le portail fournisseur :** sous « Images du produit », importez plusieurs
images (sélection multiple) ou collez des URL d'images. « Définir comme couverture »
choisit la première image, le X en supprime une.

**CSV/Excel :** la couverture va dans `image_url` (alias `bild1`). Ajoutez d'autres
images dans ces colonnes :

| Colonne | Signification |
|---|---|
| `image_url` / `bild1` | couverture (image 1) |
| `bild2` | deuxième image (URL) |
| `bild3` | troisième image (URL) |
| `bild4` | quatrième image (URL) |
| `bild5` | cinquième image (URL) |

« Exporter le stock » inclut ces colonnes, le fichier est donc réimportable à
l'identique. Via l'API produit, vous remplissez la même chose avec le champ `images`
(tableau d'URL). Remarque : les images sont toujours affichées en **entier** dans la
fiche produit (jamais rognées), quel que soit le format.
