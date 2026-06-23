// Deutsche Quell-Strings (Single Source of Truth) für das Provider-Portal.
// Neue UI-Texte NUR hier ergänzen, dann `node scripts/i18n-autotranslate.mjs`
// laufen lassen — das füllt die übrigen Sprachen in generated.js.
//
// Key-Konvention: <bereich>.<name>  (z.B. login.signIn)
export default {
  // Allgemein
  'common.email': 'E-Mail',
  'common.password': 'Passwort',
  'common.emailPlaceholder': 'ihre@email.de',
  'app.providerPortal': 'Provider-Portal',

  // Login
  'login.signingIn': 'Wird angemeldet…',
  'login.signIn': 'Anmelden',
  'login.forgot': 'Passwort vergessen?',
  'login.noAccount': 'Noch kein Konto?',
  'login.register': 'Jetzt als Provider registrieren',
  'login.privacy': 'Datenschutzerklärung',
  'login.badCreds': 'E-Mail oder Passwort falsch.',
}
