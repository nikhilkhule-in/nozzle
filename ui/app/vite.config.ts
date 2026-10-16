import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/app/',
  build: {
    // Built in place so the prerender server resolves node_modules;
    // `npm run dist` copies the static output to ui/dist/ for serving.
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        maskPath: '/app',
        prerender: {
          crawlLinks: true,
        },
      },
    }),
    viteReact(),
  ],
})
