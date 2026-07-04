import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Sandbox — bewusst OHNE Supabase/Env. Alle Daten sind Mock-Daten.
export default defineConfig({
  plugins: [react()],
})
