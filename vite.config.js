import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

if (
  process.env.NETLIFY === 'true' &&
  (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY)
) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify before deploying.')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
