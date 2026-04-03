import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (normalizedId.includes('/node_modules/react')) {
            return 'react-vendor'
          }
          if (normalizedId.includes('/node_modules/katex')) {
            return 'katex-rendering'
          }
          if (normalizedId.includes('/mathjax-full/js/output/svg/fonts/tex/')) {
            const fontKey = normalizedId.split('/mathjax-full/js/output/svg/fonts/tex/')[1]?.split('.')[0] || ''
            if (fontKey === 'normal') {
              return 'mathjax-fonts-normal'
            }
            if (fontKey === 'bold') {
              return 'mathjax-fonts-bold'
            }
            if (fontKey === 'italic') {
              return 'mathjax-fonts-italic'
            }
            if (fontKey === 'bold-italic') {
              return 'mathjax-fonts-bold-italic'
            }
            if (
              ['largeop', 'smallop', 'tex-size3', 'tex-size4', 'tex-variant', 'tex-mathit'].includes(fontKey)
            ) {
              return 'mathjax-fonts-symbols'
            }
            if (
              [
                'fraktur',
                'fraktur-bold',
                'double-struck',
                'script',
                'script-bold',
                'tex-calligraphic',
                'tex-calligraphic-bold',
                'tex-oldstyle',
                'tex-oldstyle-bold',
              ].includes(fontKey)
            ) {
              return 'mathjax-fonts-style'
            }
            return 'mathjax-fonts-alt'
          }
          if (normalizedId.includes('/mathjax-full/js/output/common/fonts/tex/')) {
            const fontKey = normalizedId.split('/mathjax-full/js/output/common/fonts/tex/')[1]?.split('.')[0] || ''
            if (['normal', 'bold', 'italic', 'bold-italic'].includes(fontKey)) {
              return 'mathjax-common-basic'
            }
            if (
              ['largeop', 'smallop', 'tex-size3', 'tex-size4', 'tex-variant', 'tex-mathit'].includes(fontKey)
            ) {
              return 'mathjax-common-symbols'
            }
            if (
              [
                'fraktur',
                'fraktur-bold',
                'double-struck',
                'script',
                'script-bold',
                'tex-calligraphic',
                'tex-calligraphic-bold',
                'tex-oldstyle',
                'tex-oldstyle-bold',
              ].includes(fontKey)
            ) {
              return 'mathjax-common-style'
            }
            return 'mathjax-common-alt'
          }
          if (normalizedId.includes('/mathjax-full/js/input/tex/AllPackages')) {
            return 'mathjax-packages'
          }
          if (normalizedId.includes('/mathjax-full/js/input/')) {
            return 'mathjax-input'
          }
          if (normalizedId.includes('/mathjax-full/js/output/svg/Wrappers/')) {
            return 'mathjax-svg-wrappers'
          }
          if (normalizedId.includes('/mathjax-full/js/output/svg/')) {
            return 'mathjax-svg'
          }
          if (normalizedId.includes('/mathjax-full/js/output/common/')) {
            return 'mathjax-common'
          }
          if (normalizedId.includes('/mathjax-full/js/output/')) {
            return 'mathjax-output'
          }
          if (
            normalizedId.includes('/mathjax-full/js/adaptors/') ||
            normalizedId.includes('/mathjax-full/js/handlers/') ||
            normalizedId.includes('/mathjax-full/js/mathjax.js')
          ) {
            return 'mathjax-core'
          }
          if (normalizedId.includes('/node_modules/mathjax-full')) {
            return 'mathjax-runtime'
          }
          if (normalizedId.includes('/node_modules/dexie') || normalizedId.includes('/node_modules/flexsearch')) {
            return 'memory-vendor'
          }
          return undefined
        },
      },
    },
  },
})
