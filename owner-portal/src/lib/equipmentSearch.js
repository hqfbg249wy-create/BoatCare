// Shared helper functions for equipment-based searches (Shop, Service, AI)

const categoryLabels = {
  engine: 'Motor & Antrieb', electrical: 'Elektrik & Batterie', navigation: 'Navigation & Elektronik',
  safety: 'Sicherheit', communication: 'Kommunikation', rigging: 'Rigg & Takelage',
  hull: 'Rumpf & Unterwasser', deck: 'Deck & Beschläge', anchor: 'Anker & Kette', other: 'Sonstiges'
}

// Build shop search query: name + manufacturer + model + dimensions
export function buildShopQuery(item) {
  const parts = [item.name?.trim()]
  if (item.manufacturer) parts.push(item.manufacturer.trim())
  if (item.model) parts.push(item.model.trim())
  if (item.dimensions) parts.push(item.dimensions.trim())
  return parts.filter(Boolean).join(' ')
}

// Build service search query: name + category + manufacturer
export function buildServiceQuery(item) {
  const parts = [item.name?.trim()]
  if (item.category) parts.push(categoryLabels[item.category] || '')
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
