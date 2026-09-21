import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ'

// x-skipily-platform: markiert alle Requests als Web-App (fuer KI-/App-Nutzungs-Analytics).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { 'x-skipily-platform': 'web' } },
})
