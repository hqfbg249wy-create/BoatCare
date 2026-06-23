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

  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.products': 'Produkte',
  'nav.orders': 'Bestellungen',
  'nav.promotions': 'Angebote',
  'nav.messages': 'Nachrichten',
  'nav.insights': 'Marktanalyse',
  'nav.help': 'Hilfe & FAQ',
  'nav.profile': 'Stammdaten',

  // Layout / Menü
  'layout.activeBusiness': 'Aktiver Betrieb',
  'layout.roleOwner': 'Inhaber',
  'layout.roleAdmin': 'Admin',
  'layout.roleMember': 'Mitglied',
  'layout.logout': 'Abmelden',
  'layout.privacyShort': 'Datenschutz',
  'layout.language': 'Sprache',

  // Login
  'login.signingIn': 'Wird angemeldet…',
  'login.signIn': 'Anmelden',
  'login.forgot': 'Passwort vergessen?',
  'login.noAccount': 'Noch kein Konto?',
  'login.register': 'Jetzt als Provider registrieren',
  'login.privacy': 'Datenschutzerklärung',
  'login.badCreds': 'E-Mail oder Passwort falsch.',

  // Claim-Profil (öffentliche Übernahme-Seite)
  'common.error': 'Fehler',
  'claim.invalidLink': 'Dieser Link ist ungültig oder abgelaufen.',
  'claim.pwTooShort': 'Passwort muss mindestens 8 Zeichen haben.',
  'claim.pwMismatch': 'Die Passwörter stimmen nicht überein.',
  'claim.loading': 'Lade Profil …',
  'claim.linkInvalidTitle': 'Link ungültig',
  'claim.toLogin': 'Zur Anmeldung',
  'claim.linkedTitle': 'Profil verknüpft',
  'claim.linkedBody': 'Du wirst zur Anmeldung weitergeleitet …',
  'claim.heroBadge': 'PROFIL BEANSPRUCHEN',
  'claim.alreadyTitle': 'Bereits beansprucht',
  'claim.alreadyBody': 'Das Profil {name} wurde schon übernommen. Bitte über die normale Anmeldung einloggen.',
  'claim.bonusTitle': '🎁 Frühstarter-Bonus aktiv',
  'claim.bonusBody': 'Beim Beanspruchen erhalten Sie automatisch 6 Monate Pro gratis und — solange Sie unter den ersten 100 Shops sind — dauerhaft 7 % Marketplace-Provision statt 10 %.',
  'claim.intro': 'Ist das Ihr Betrieb? Setzen Sie ein Passwort und Sie übernehmen Ihr bereits vorbereitetes Skipily-Profil.',
  'claim.loginWith': 'Anmeldung erfolgt mit:',
  'claim.choosePw': 'Passwort wählen',
  'claim.min8': 'Mindestens 8 Zeichen',
  'claim.confirmPw': 'Passwort bestätigen',
  'claim.repeatPw': 'Passwort wiederholen',
  'claim.submitting': 'Wird übernommen …',
  'claim.submit': '⚓ Profil jetzt übernehmen',
  'claim.acceptPre': 'Mit der Übernahme akzeptieren Sie die',
  'claim.and': 'und',
  'claim.terms': 'AGB',
}
