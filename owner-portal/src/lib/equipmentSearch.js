// Shared helper functions for equipment-based searches (Shop, Service, AI)

const categoryLabels = {
  engine: 'Motor & Antrieb', electrical: 'Elektrik & Batterie', navigation: 'Navigation & Elektronik',
  safety: 'Sicherheit', communication: 'Kommunikation', rigging: 'Rigg & Takelage',
  sails: 'Segel', rope: 'Tauwerk',
  hull: 'Rumpf & Unterwasser', deck: 'Deck & Beschläge', anchor: 'Anker & Kette', other: 'Sonstiges'
}

// Stichworte, mit denen die Provider-Textsuche die PASSENDEN Betriebe findet
// (nicht der Geräte-Name!). Spiegelt die Zuordnung der iOS-App.
// Bewusst je Domäne dedizierte Begriffe: bei Tauwerk NUR Rigger/Laufendes Gut,
// damit nicht alle Segelmacher/Werften getroffen werden.
const serviceKeywords = {
  engine: 'Motor Antrieb Diesel',
  electrical: 'Elektrik Batterie Elektronik',
  navigation: 'Navigation Elektronik Instrumente',
  safety: 'Sicherheit Rettung',
  communication: 'Elektronik Funk Navigation',
  rigging: 'Rigg Takelage Laufendes',
  sails: 'Segelmacher Segel',
  rope: 'Tauwerk Rigg Laufendes',
  hull: 'Lackierer Osmose Antifouling Bootsbau Taucher Unterwasser',
  deck: 'Beschläge Deck',
  anchor: 'Anker Kette',
  other: '',
}

// Build shop search query: name + manufacturer + model + dimensions
export function buildShopQuery(item) {
  const parts = [item.name?.trim()]
  if (item.manufacturer) parts.push(item.manufacturer.trim())
  if (item.model) parts.push(item.model.trim())
  if (item.dimensions) parts.push(item.dimensions.trim())
  return parts.filter(Boolean).join(' ')
}

// Betriebe zu einer Ausrüstung: primäre Kategorie (category_allow, exakt) ODER
// kuratierter Service-Tag (service_terms, Teilstring). Deckt für Tauwerk Rigger,
// Segelmacher UND Zubehörhändler (Chandler) ab, ohne greedy Teilstring-Treffer.
// Mehrsprachige Erkennung (Tauwerk = rope = cordage …). Gespiegelt aus iOS.
export function providerQueryForItem(item) {
  const c = `${item?.category || ''} ${item?.name || ''}`.toLowerCase()
  const any = (ks) => ks.some(k => c.includes(k))

  if (any(['rope', 'tauwerk', 'tauw', 'leine', 'festmacher', 'schot', 'fall', 'spleiß', 'spleiss', 'cordage', 'cordame', 'cabo', 'touw', 'gréement', 'line']))
    return { category_allow: ['rigg', 'rigger', 'segelmacher', 'sailmaker', 'zubehör', 'takelage'],
             service_terms: ['laufendes gut', 'tauwerk', 'takelage', 'rigg'] }
  if (any(['sail', 'segel', 'voile', 'vela', 'zeil', 'genua', 'gennaker', 'spinnaker', 'fock', 'code 0']))
    return { category_allow: ['segelmacher', 'sailmaker', 'zubehör'],
             service_terms: ['segel', 'großsegel', 'genua', 'fock', 'persenning'] }
  if (any(['rigg', 'rigging', 'mast', 'spar', 'stag', 'want', 'shroud', 'takel']))
    return { category_allow: ['rigg', 'rigger', 'segelmacher', 'takelage'],
             service_terms: ['laufendes gut', 'takelage', 'bäume & masten', 'rigg'] }
  if (any(['engine', 'motor', 'moteur', 'motore', 'diesel', 'propeller', 'welle', 'getriebe', 'außenborder', 'innenborder', 'outboard', 'inboard', 'antrieb']))
    return { category_allow: ['motorservice', 'werkstatt', 'zubehör'],
             service_terms: ['motor', 'diesel', 'antrieb', 'getriebe', 'welle', 'propeller', 'außenbord', 'innenbord', 'e-antrieb'] }
  if (any(['electr', 'elektr', 'instrument', 'navigation', 'vhf', 'radar', 'gps', 'battery', 'batterie', 'solar', 'electronic', 'plotter']))
    return { category_allow: ['instrumente', 'elektronik', 'elektrik', 'zubehör'],
             service_terms: ['elektr', 'navigation', 'instrument', 'chartplotter', 'bordnetz', 'radar'] }
  if (any(['hull', 'rumpf', 'gelcoat', 'osmose', 'antifouling', 'lack', 'paint', 'unterwasser', 'taucher', 'reinig', 'diver', 'cleaning']))
    return { category_allow: ['lackiererei', 'bootsbauer', 'werft'],
             service_terms: ['osmose', 'antifouling', 'gelcoat', 'lack', 'gfk', 'teak', 'rumpf', 'taucher', 'unterwasser'] }
  if (any(['anchor', 'anker', 'kette', 'chain']))
    return { category_allow: ['zubehör'], service_terms: ['anker', 'kette'] }
  if (any(['heiz', 'klima', 'heating']))
    return { category_allow: ['heizung/klima', 'zubehör'], service_terms: ['heizung', 'klima'] }
  return { category_allow: ['zubehör'], service_terms: ['schiffszubehör', 'decksausrüstung'] }
}

// Build service search query: liefert Stichworte, mit denen die Provider-Suche
// die PASSENDEN Betriebe findet. Bei Tauwerk/Segel/Rigg bewusst OHNE Gerätename
// (z. B. "Genuaschot"), der sonst gar nichts oder das Falsche trifft.
export function buildServiceQuery(item) {
  const kw = serviceKeywords[item.category] ?? (categoryLabels[item.category] || '')
  if (item.category === 'rope' || item.category === 'sails' || item.category === 'rigging') {
    return kw
  }
  const parts = [item.name?.trim(), kw]
  if (item.manufacturer) parts.push(item.manufacturer.trim())
  return parts.filter(Boolean).join(' ')
}

// Build a detailed AI question with all equipment context
export function buildAIQuestion(item, boatName) {
  let q = `Was muss ich bei meinem ${item.name?.trim()}`
  if (item.manufacturer) q += ` von ${item.manufacturer.trim()}`
  if (item.model) q += ` (Modell: ${item.model.trim()})`
  q += ' beachten?'

  const details = []
  if (item.dimensions) details.push(`Abmessungen: ${item.dimensions.trim()}`)
  if (item.item_description) details.push(`Beschreibung: ${item.item_description.trim()}`)
  if (item.part_number) details.push(`Teilenummer: ${item.part_number.trim()}`)
  if (item.location_on_boat) details.push(`Einbauort: ${item.location_on_boat.trim()}`)
  if (item.installation_date) details.push(`Eingebaut am: ${new Date(item.installation_date).toLocaleDateString('de-DE')}`)
  if (item.last_maintenance_date) details.push(`Letzte Wartung: ${new Date(item.last_maintenance_date).toLocaleDateString('de-DE')}`)
  if (item.next_maintenance_date) details.push(`Nächste Wartung: ${new Date(item.next_maintenance_date).toLocaleDateString('de-DE')}`)
  if (item.maintenance_cycle_years) details.push(`Wartungsintervall: ${item.maintenance_cycle_years} Jahre`)
  if (item.notes) details.push(`Notizen: ${item.notes.trim()}`)
  if (item.category) details.push(`Kategorie: ${categoryLabels[item.category] || item.category}`)
  if (boatName) details.push(`Boot: ${boatName}`)

  if (details.length > 0) q += '\n\nDetails:\n' + details.join('\n')
  return q
}

// Build inquiry subject + message from equipment data (für Service-Anfragen)
export function buildInquirySubject(item) {
  const parts = []
  if (item.manufacturer) parts.push(item.manufacturer.trim())
  if (item.model) parts.push(item.model.trim())
  parts.push(item.name?.trim() || '')
  return `Anfrage: ${parts.filter(Boolean).join(' ')}`
}

export function buildInquiryMessage(item, boatName) {
  const lines = []
  lines.push('Hallo,')
  lines.push('')
  lines.push(`ich suche Service für folgende Ausrüstung${boatName ? ` auf meinem Boot "${boatName}"` : ''}:`)
  lines.push('')
  if (item.name)          lines.push(`Bezeichnung: ${item.name.trim()}`)
  if (item.manufacturer)  lines.push(`Hersteller: ${item.manufacturer.trim()}`)
  if (item.model)         lines.push(`Modell: ${item.model.trim()}`)
  if (item.part_number)   lines.push(`Teilenummer: ${item.part_number.trim()}`)
  if (item.serial_number) lines.push(`Seriennummer: ${item.serial_number.trim()}`)
  if (item.dimensions)    lines.push(`Maße: ${item.dimensions.trim()}`)
  if (item.installation_date) lines.push(`Eingebaut: ${new Date(item.installation_date).toLocaleDateString('de-DE')}`)
  if (item.last_maintenance_date) lines.push(`Letzte Wartung: ${new Date(item.last_maintenance_date).toLocaleDateString('de-DE')}`)
  if (item.notes)         lines.push(`Notizen: ${item.notes.trim()}`)
  lines.push('')
  lines.push('Bitte um Rückmeldung mit Terminvorschlag und Kostenvoranschlag.')
  lines.push('')
  lines.push('Vielen Dank!')
  return lines.join('\n')
}

// Build a maintenance-specific AI question
export function buildMaintenanceAIQuestion(item, boatName) {
  let q = `Wie warte ich meinen ${item.name?.trim()}`
  if (item.manufacturer) q += ` von ${item.manufacturer.trim()}`
  if (item.model) q += ` (Modell: ${item.model.trim()})`
  q += ' richtig?'

  const details = []
  if (item.dimensions) details.push(`Abmessungen: ${item.dimensions.trim()}`)
  if (item.item_description) details.push(`Beschreibung: ${item.item_description.trim()}`)
  if (item.part_number) details.push(`Teilenummer: ${item.part_number.trim()}`)
  if (item.location_on_boat) details.push(`Einbauort: ${item.location_on_boat.trim()}`)
  if (item.installation_date) details.push(`Eingebaut am: ${new Date(item.installation_date).toLocaleDateString('de-DE')}`)
  if (item.last_maintenance_date) details.push(`Letzte Wartung: ${new Date(item.last_maintenance_date).toLocaleDateString('de-DE')}`)
  if (item.next_maintenance_date) details.push(`Nächste Wartung: ${new Date(item.next_maintenance_date).toLocaleDateString('de-DE')}`)
  if (item.maintenance_cycle_years) details.push(`Wartungsintervall: ${item.maintenance_cycle_years} Jahre`)
  if (item.notes) details.push(`Notizen: ${item.notes.trim()}`)
  if (item.category) details.push(`Kategorie: ${categoryLabels[item.category] || item.category}`)
  if (boatName) details.push(`Boot: ${boatName}`)

  if (details.length > 0) q += '\n\nDetails:\n' + details.join('\n')
  return q
}
