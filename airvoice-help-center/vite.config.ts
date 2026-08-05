import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:3000'
  const isProd = mode === 'production'

  return {
    plugins: [react()],
    // In production, served under /help/ via nginx reverse proxy
    base: isProd ? '/help/' : '/',
    server: {
      port: 5174,
      proxy: {
        '/chat': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/auth': {
          target: apiUrl,
          changeOrigin: true,
        }
      }
    }
  }
})
