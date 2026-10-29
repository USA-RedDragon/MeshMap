import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: "",
  plugins: [react()],
  define: {
    _global: ({}),
  },
  build: {
    rollupOptions: {
      output: {
        // uhttpd on AREDN nodes has no MIME type for .mjs and sends it as application/octet-stream, which browsers
        // refuse to run as a worker. Ship the MapLibre worker as .js.
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? info.name ?? '';
          return name.endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
})
