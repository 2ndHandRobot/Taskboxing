import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifestTemplate from './manifest.template.json'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const manifest = {
    ...manifestTemplate,
    oauth2: {
      ...manifestTemplate.oauth2,
      client_id: env.OAUTH_CLIENT_ID ?? manifestTemplate.oauth2.client_id,
    },
  } as typeof manifestTemplate

  return {
    plugins: [
      react(),
      crx({ manifest }),
    ],
    build: {
      rollupOptions: {
        input: {
          sidepanel: 'src/sidepanel/sidepanel.html',
          popup: 'src/popup/popup.html',
        },
      },
    },
  }
})
