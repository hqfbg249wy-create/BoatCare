import { useCallback, useEffect, useState } from 'react'
import { listAnnouncements, markAnnouncementRead, dismissAnnouncement } from '../lib/announcements'

// Lädt die für den Nutzer sichtbaren Plattform-Ankündigungen inkl. Lesestatus.
export function useAnnouncements() {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const rows = await listAnnouncements()
    setItems(rows)
    setLoaded(true)
  }, [])

  useEffect(() => { reload() }, [reload])

  const markRead = useCallback(async (id) => {
    setItems(prev => prev.map(a => a.id === id ? { ...a, read_at: a.read_at || new Date().toISOString() } : a))
    await markAnnouncementRead(id)
  }, [])

  const dismiss = useCallback(async (id) => {
    setItems(prev => prev.map(a => a.id === id ? { ...a, dismissed_at: new Date().toISOString(), read_at: a.read_at || new Date().toISOString() } : a))
    await dismissAnnouncement(id)
  }, [])

  const unread = items.filter(a => !a.read_at).length
  return { items, loaded, unread, reload, markRead, dismiss }
}
