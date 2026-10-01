// Plattform-Ankündigungen (Broadcast vom Admin) – Datenzugriff fürs Web.
import { supabase } from './supabase'

export const ANNOUNCEMENT_ACCENT = {
  blue:   '#2563eb',
  green:  '#16a34a',
  orange: '#f97316',
  purple: '#7c3aed',
  red:    '#dc2626',
}
export function accentColor(a) {
  return ANNOUNCEMENT_ACCENT[(a || 'blue').toLowerCase()] || ANNOUNCEMENT_ACCENT.blue
}

// Titel/Text in der aktuellen Sprache (Fallback: Originaltext).
export function localizedAnnouncement(a, lang) {
  const tr = a?.translations && a.translations[lang]
  return {
    title: (tr && tr.title) || a?.title || '',
    body: (tr && tr.body) || a?.body || '',
  }
}

export async function listAnnouncements() {
  const { data, error } = await supabase.rpc('list_my_announcements')
  if (error) { console.warn('list_my_announcements', error); return [] }
  return data || []
}

export async function markAnnouncementRead(id) {
  try { await supabase.rpc('mark_announcement_read', { p_id: id }) }
  catch (e) { console.warn('mark_announcement_read', e) }
}

export async function dismissAnnouncement(id) {
  try { await supabase.rpc('dismiss_announcement', { p_id: id }) }
  catch (e) { console.warn('dismiss_announcement', e) }
}
