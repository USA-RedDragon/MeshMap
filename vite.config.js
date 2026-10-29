import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * preloadMap asks the browser for MapLibre, the basemap style code and MapLibre's stylesheet while it is still reading
 * the page, instead of after the app's own code has loaded and asked for them.
 */
function preloadMap() {
  let base = '/'
  return {
    name: 'preload-map',
    apply: 'build',
    configResolved(config) {
      base = config.base || '/'
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags = []
        for (const [file, out] of Object.entries(ctx.bundle ?? {})) {
          if (out.type === 'chunk' && out.isDynamicEntry && /^(maplibre-gl|style)$/.test(out.name)) {
            tags.push({ tag: 'link', attrs: { rel: 'modulepreload', href: base + file }, injectTo: 'head' })
          } else if (out.type === 'asset' && /^assets\/maplibre-gl-[^/]*\.css$/.test(file)) {
            tags.push({ tag: 'link', attrs: { rel: 'preload', as: 'style', crossorigin: '', href: base + file }, injectTo: 'head' })
          }
        }
        return tags
      },
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "",
  plugins: [react(), preloadMap()],
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
