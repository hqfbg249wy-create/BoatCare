# /.well-known/

Hier liegen Domain-Verifizierungs-Dateien. Sie werden von Apple/Stripe
abgefragt um die Domain für Apple-Pay freizuschalten.

## apple-developer-merchantid-domain-association

**Wo herunterladen?**

Stripe Dashboard → Settings → Payment Method Domains → die jeweilige
Domain anklicken → "Download Apple Pay domain association file".

Datei (ohne Endung!) hier ablegen:

```
provider-portal/public/.well-known/apple-developer-merchantid-domain-association
```

Vercel deployt automatisch, danach in Stripe auf "Verify" klicken.

**Test:**
```
curl -sI https://provider.skipily.app/.well-known/apple-developer-merchantid-domain-association
```
Sollte 200 OK liefern, Content-Type egal.

## Auch zu verifizieren?

Falls Apple-Pay auch auf `app.skipily.app` (Owner-Portal) angeboten werden
soll: dieselbe Datei zusätzlich nach
`owner-portal/public/.well-known/` legen.

Auf der Marketing-Domain `skipily.app` (IONOS/WordPress) müsste die Datei
manuell per FTP/SFTP unter `/.well-known/` hochgeladen werden.
