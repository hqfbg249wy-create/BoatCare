# /.well-known/

Wie im provider-portal: hier kommt die Apple-Pay-Domain-Verifizierungsdatei
für **app.skipily.app** rein.

Datei aus Stripe (`pmd_1TXiU8AKSxHR03mT7Yh5GJrB` → "Download association file")
hier ablegen, **ohne Datei-Endung**:

```
owner-portal/public/.well-known/apple-developer-merchantid-domain-association
```

Vercel deployt automatisch beim Push. Dann in Stripe auf "Verify" klicken.

**Test:**
```bash
curl -sI https://app.skipily.app/.well-known/apple-developer-merchantid-domain-association
```
