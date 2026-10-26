import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ'

// x-skipily-platform: markiert alle Requests als Web-App (fuer KI-/App-Nutzungs-Analytics).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { headers: { 'x-skipily-platform': 'web' } },
})

/**
 * Stellt vor kritischen Schreib-/KI-Aktionen sicher, dass eine gueltige Session
 * vorliegt. Laeuft das Access-Token bald ab (oder ist es weg), wird es aktiv
 * erneuert. Gibt true zurueck, wenn danach eine Session besteht, sonst false
 * (dann war der Nutzer tatsaechlich ausgeloggt -> Aufrufer zeigt klare Meldung,
 * statt dass der Request anonym losgeht und an RLS/401 scheitert).
 */
export async function ensureSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const msLeft = (session.expires_at ? session.expires_at * 1000 : 0) - Date.now()
      if (msLeft > 60000) return true          // noch > 60 s gueltig
      const { data } = await supabase.auth.refreshSession()
      return !!data?.session
    }
    const { data } = await supabase.auth.refreshSession()
    return !!data?.session
  } catch {
    return false
  }
}
