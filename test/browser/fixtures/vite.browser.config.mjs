import { defineConfig } from 'vite'
import inject from '@rollup/plugin-inject'
import { resolve } from 'path'
import commonjs from '@rollup/plugin-commonjs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export default defineConfig({
  build: {
    outDir: 'tmp/vite',
    lib: {
      entry: 'test/browser/test-browser.js',
      name: 'suite',
      fileName: () => 'suite.browser.js',
      formats: ['iife']
    },
    rollupOptions: {
      external: ['./src/storage/redis.js']
    },
    emptyOutDir: false,
    commonjsOptions: {
      include: [/src/],
      transformMixedEsModules: true
    }
  },
  resolve: {
    alias: {
      path: require.resolve('path-browserify'),
      stream: require.resolve('stream-browserify')
    }
  },
  plugins: [
    commonjs({
      transformMixedEsModules: true
    }),
    inject({
      process: resolve('node_modules/process/browser.js')
    })
  ]
})
