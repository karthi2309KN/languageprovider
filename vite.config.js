import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
function inlineAssets() {
  return {
    name: 'inline-assets',
    apply: 'build',
    async closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist')
      const indexPath = path.join(distDir, 'index.html')
      let html = await fs.readFile(indexPath, 'utf-8')

      const assetsDir = path.join(distDir, 'assets')
      let files = []
      try {
        files = await fs.readdir(assetsDir)
      } catch {
        files = []
      }

      const jsFiles = files.filter((file) => file.endsWith('.js'))
      const cssFiles = files.filter((file) => file.endsWith('.css'))

      for (const cssFile of cssFiles) {
        const cssPath = path.join(assetsDir, cssFile)
        const css = await fs.readFile(cssPath, 'utf-8')
        const cssB64 = Buffer.from(css).toString('base64')
        const linkTag = new RegExp(`<link[^>]+href="/assets/${cssFile}"[^>]*>`, 'g')
        html = html.replace(linkTag, `<link rel="stylesheet" href="data:text/css;base64,${cssB64}">`)
      }

      for (const jsFile of jsFiles) {
        const jsPath = path.join(assetsDir, jsFile)
        const js = await fs.readFile(jsPath, 'utf-8')
        const jsB64 = Buffer.from(js).toString('base64')
        const scriptTag = new RegExp(`<script[^>]+src="/assets/${jsFile}"[^>]*></script>`, 'g')
        html = html.replace(
          scriptTag,
          `<script type="module" src="data:text/javascript;base64,${jsB64}"></script>`
        )
      }

      html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '')

      await fs.writeFile(indexPath, html)

      for (const file of [...jsFiles, ...cssFiles]) {
        await fs.rm(path.join(assetsDir, file))
      }
    }
  }
}

export default defineConfig(() => ({
  plugins: [
    vue(),
    vueDevTools(),
    inlineAssets()
  ],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {}
}))
