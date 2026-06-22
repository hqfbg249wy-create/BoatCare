-- Migration 089: FAQ „Zwei-Faktor-Anmeldung (2FA)" + neue Kategorie „security"
-- ============================================================================
-- Fügt dem Provider-Portal eine Sicherheits-FAQ hinzu, die erklärt, wie die
-- 2-Faktor-Authentifizierung funktioniert und eingerichtet wird (TOTP per
-- Authenticator-App, via Supabase-Auth-MFA; Pflicht über
-- service_providers.mfa_required).
--
-- Quelle = Deutsch (question/answer); Übersetzungen direkt in translations.
-- Neue Kategorie 'security' — muss in Help.jsx (CATEGORY_ORDER/LABELS) und in
-- der Admin-FAQ-Liste (FAQ_CATS) ergänzt sein, damit sie angezeigt wird.
-- ============================================================================

INSERT INTO public.provider_faqs (category, sort_order, question, answer, translations) VALUES
('security', 10,
$q$Wie funktioniert die Zwei-Faktor-Anmeldung (2FA) und wie richte ich sie ein?$q$,
$a$Die Zwei-Faktor-Authentifizierung (2FA) schützt dein Anbieter-Konto zusätzlich zum Passwort: Bei der Anmeldung gibst du neben dem Passwort einen 6-stelligen Einmal-Code ein, den eine Authenticator-App auf deinem Smartphone alle 30 Sekunden neu erzeugt. Selbst wer dein Passwort kennt, kommt ohne dein Telefon nicht hinein.

Einrichtung (einmalig):
1. Installiere eine Authenticator-App, z. B. Google Authenticator, 1Password oder Authy.
2. Ist für dein Konto 2FA aktiv, führt dich Skipily beim nächsten Login automatisch durch die Einrichtung.
3. Scanne den angezeigten QR-Code mit der App – oder trage den Geheimcode manuell ein.
4. Gib den 6-stelligen Code aus der App ein, um die Einrichtung zu bestätigen.

Bei jeder weiteren Anmeldung:
Zuerst E-Mail und Passwort, danach den aktuellen 6-stelligen Code aus deiner Authenticator-App.

Gut zu wissen:
• Die 2FA-Pflicht aktiviert Skipily für dein Konto – einen eigenen Schalter im Profil gibt es derzeit nicht. Wünschst du 2FA, melde dich beim Skipily-Support.
• Bewahre deinen Authenticator sicher auf und übertrage ihn rechtzeitig, wenn du das Smartphone wechselst.
• Hast du keinen Zugriff mehr auf die App, wende dich an den Skipily-Support – wir setzen die 2FA zurück, damit du sie neu einrichten kannst.$a$,
$json${
  "en": {
    "question": "How does two-factor sign-in (2FA) work and how do I set it up?",
    "answer": "Two-factor authentication (2FA) protects your provider account on top of your password: when you sign in, you enter a 6-digit one-time code in addition to your password — generated fresh every 30 seconds by an authenticator app on your phone. Even someone who knows your password can't get in without your phone.\n\nOne-time setup:\n1. Install an authenticator app, e.g. Google Authenticator, 1Password or Authy.\n2. If 2FA is active for your account, Skipily guides you through setup automatically at your next login.\n3. Scan the QR code shown with the app – or enter the secret key manually.\n4. Enter the 6-digit code from the app to confirm setup.\n\nOn every following login:\nFirst your email and password, then the current 6-digit code from your authenticator app.\n\nGood to know:\n• Skipily enables the 2FA requirement for your account – there is currently no self-service toggle in your profile. If you want 2FA, contact Skipily support.\n• Keep your authenticator safe and move it over in time when you switch phones.\n• If you lose access to the app, contact Skipily support – we'll reset 2FA so you can set it up again."
  },
  "fr": {
    "question": "Comment fonctionne la connexion à deux facteurs (2FA) et comment l'activer ?",
    "answer": "L'authentification à deux facteurs (2FA) protège votre compte fournisseur en plus du mot de passe : lors de la connexion, vous saisissez, en plus du mot de passe, un code à usage unique à 6 chiffres généré toutes les 30 secondes par une application d'authentification sur votre smartphone. Même quelqu'un qui connaît votre mot de passe ne peut pas entrer sans votre téléphone.\n\nConfiguration (une seule fois) :\n1. Installez une application d'authentification, par ex. Google Authenticator, 1Password ou Authy.\n2. Si la 2FA est active pour votre compte, Skipily vous guide automatiquement lors de votre prochaine connexion.\n3. Scannez le code QR affiché avec l'application – ou saisissez la clé secrète manuellement.\n4. Saisissez le code à 6 chiffres de l'application pour confirmer.\n\nÀ chaque connexion suivante :\nD'abord votre e-mail et votre mot de passe, puis le code à 6 chiffres actuel de votre application.\n\nBon à savoir :\n• Skipily active l'obligation de 2FA pour votre compte – il n'y a actuellement pas d'option dans le profil. Si vous souhaitez la 2FA, contactez le support Skipily.\n• Conservez votre authentificateur en sécurité et transférez-le à temps lorsque vous changez de téléphone.\n• Si vous perdez l'accès à l'application, contactez le support Skipily – nous réinitialiserons la 2FA pour que vous puissiez la reconfigurer."
  },
  "it": {
    "question": "Come funziona l'accesso a due fattori (2FA) e come si attiva?",
    "answer": "L'autenticazione a due fattori (2FA) protegge il tuo account fornitore oltre alla password: all'accesso inserisci, oltre alla password, un codice monouso a 6 cifre generato ogni 30 secondi da un'app di autenticazione sul tuo smartphone. Anche chi conosce la tua password non può entrare senza il tuo telefono.\n\nConfigurazione (una tantum):\n1. Installa un'app di autenticazione, ad es. Google Authenticator, 1Password o Authy.\n2. Se per il tuo account la 2FA è attiva, Skipily ti guida automaticamente alla configurazione al prossimo accesso.\n3. Scansiona il codice QR mostrato con l'app – oppure inserisci la chiave segreta manualmente.\n4. Inserisci il codice a 6 cifre dell'app per confermare.\n\nA ogni accesso successivo:\nPrima email e password, poi il codice a 6 cifre attuale della tua app.\n\nBuono a sapersi:\n• Skipily attiva l'obbligo di 2FA per il tuo account – al momento non c'è un interruttore nel profilo. Se desideri la 2FA, contatta l'assistenza Skipily.\n• Conserva l'autenticatore in modo sicuro e trasferiscilo in tempo quando cambi telefono.\n• Se perdi l'accesso all'app, contatta l'assistenza Skipily – reimposteremo la 2FA così potrai configurarla di nuovo."
  },
  "es": {
    "question": "¿Cómo funciona el inicio de sesión de dos factores (2FA) y cómo lo configuro?",
    "answer": "La autenticación de dos factores (2FA) protege tu cuenta de proveedor además de la contraseña: al iniciar sesión introduces, junto con la contraseña, un código de un solo uso de 6 dígitos que una app de autenticación de tu móvil genera cada 30 segundos. Aunque alguien conozca tu contraseña, no podrá entrar sin tu teléfono.\n\nConfiguración (una sola vez):\n1. Instala una app de autenticación, p. ej. Google Authenticator, 1Password o Authy.\n2. Si la 2FA está activa para tu cuenta, Skipily te guía automáticamente en la configuración en tu próximo inicio de sesión.\n3. Escanea el código QR mostrado con la app – o introduce la clave secreta manualmente.\n4. Introduce el código de 6 dígitos de la app para confirmar.\n\nEn cada inicio de sesión posterior:\nPrimero tu correo y contraseña, luego el código de 6 dígitos actual de tu app.\n\nBueno saber:\n• Skipily activa la obligación de 2FA para tu cuenta – por ahora no hay un interruptor en el perfil. Si deseas la 2FA, contacta con el soporte de Skipily.\n• Guarda tu autenticador de forma segura y transfiérelo a tiempo al cambiar de teléfono.\n• Si pierdes el acceso a la app, contacta con el soporte de Skipily – restableceremos la 2FA para que puedas configurarla de nuevo."
  },
  "nl": {
    "question": "Hoe werkt het inloggen met twee factoren (2FA) en hoe stel ik het in?",
    "answer": "Tweefactorauthenticatie (2FA) beschermt je aanbiederaccount naast je wachtwoord: bij het inloggen voer je naast je wachtwoord een 6-cijferige eenmalige code in, die een authenticator-app op je telefoon elke 30 seconden opnieuw genereert. Zelfs wie je wachtwoord kent, komt er zonder je telefoon niet in.\n\nInstellen (eenmalig):\n1. Installeer een authenticator-app, bijv. Google Authenticator, 1Password of Authy.\n2. Is 2FA voor je account actief, dan leidt Skipily je bij de volgende login automatisch door het instellen.\n3. Scan de getoonde QR-code met de app – of voer de geheime sleutel handmatig in.\n4. Voer de 6-cijferige code uit de app in om te bevestigen.\n\nBij elke volgende login:\nEerst je e-mail en wachtwoord, daarna de actuele 6-cijferige code uit je app.\n\nGoed om te weten:\n• Skipily activeert de 2FA-plicht voor je account – er is momenteel geen schakelaar in je profiel. Wil je 2FA, neem dan contact op met Skipily-support.\n• Bewaar je authenticator veilig en zet hem op tijd over wanneer je van telefoon wisselt.\n• Heb je geen toegang meer tot de app, neem dan contact op met Skipily-support – we resetten 2FA zodat je het opnieuw kunt instellen."
  }
}$json$::jsonb)
ON CONFLICT (category, question) DO UPDATE
  SET answer       = EXCLUDED.answer,
      translations = EXCLUDED.translations,
      sort_order   = EXCLUDED.sort_order,
      is_published = true;
