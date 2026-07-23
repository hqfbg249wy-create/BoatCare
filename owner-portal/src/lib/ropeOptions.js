// Standardisierter Options-Katalog für den Tauwerk-Konfigurator.
// EXAKT diese Werte nutzen iOS, Web und (Phase 2) das Provider-Produkt im
// Vendorshop → 1:1-Matching. Muss mit database/109 + RopeEndOption (iOS)
// synchron bleiben.

export const ROPE_END_OPTIONS = [
  'glatt_abgeschnitten',
  'takling',
  'augspleiss_indiv_mit_schamfil',
  'augspleiss_indiv_ohne_schamfil',
  'augspleiss_3_5',
  'augspleiss_6_8',
  'augspleiss_9_12',
  'augspleiss_low_friction',
  'augspleiss_kausch_edelstahl',
  'augspleiss_kausch_verzinkt',
  'augspleiss_zubehoer',
]

export const ROPE_MATERIALS = [
  'geschlagen',
  'kern_mantel',
  'squareline',
  'pes_dyneema',
  'dyneema_hohlgeflecht',
]

// Enden mit individuellem Augspleiß → Auglänge (cm) relevant.
export const ROPE_EYE_ENDS = new Set([
  'augspleiss_indiv_mit_schamfil',
  'augspleiss_indiv_ohne_schamfil',
])
