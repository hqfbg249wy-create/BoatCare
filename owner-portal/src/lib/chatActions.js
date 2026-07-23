// Parst den maschinenlesbaren Aktions-Block, den die ai-chat Edge Function
// am Ende einer Antwort liefert:
//   [[skipily-actions]]{"shop":["Impeller",…],"equipment_checklist":true}[[/skipily-actions]]
// Der Block wird immer aus dem sichtbaren Text entfernt (auch bei kaputtem
// JSON), damit der Nutzer nie Rohmarker sieht. Pendant zu iOS ChatActionParser.

const OPEN = '[[skipily-actions]]'
const CLOSE = '[[/skipily-actions]]'

export function parseChatActions(raw) {
  const text = typeof raw === 'string' ? raw : ''
  const openIdx = text.indexOf(OPEN)
  if (openIdx === -1) {
    return { text, shopSearchTerms: [], equipmentChecklist: false }
  }

  const visible = text.slice(0, openIdx).trim()

  const afterOpen = text.slice(openIdx + OPEN.length)
  const closeIdx = afterOpen.indexOf(CLOSE)
  const jsonStr = (closeIdx === -1 ? afterOpen : afterOpen.slice(0, closeIdx)).trim()

  let shopSearchTerms = []
  let equipmentChecklist = false
  try {
    const obj = JSON.parse(jsonStr)
    if (Array.isArray(obj?.shop)) {
      const seen = new Set()
      for (const s of obj.shop) {
        if (typeof s !== 'string') continue
        const term = s.trim()
        if (term.length < 2 || term.length > 40) continue
        const key = term.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        shopSearchTerms.push(term)
        if (shopSearchTerms.length >= 5) break
      }
    }
    if (obj?.equipment_checklist === true) equipmentChecklist = true
  } catch {
    // Kaputtes JSON → Block trotzdem entfernt, keine Aktionen.
  }

  return { text: visible || text, shopSearchTerms, equipmentChecklist }
}
