import commonjs from '@rollup/plugin-commonjs'
import inject from '@rollup/plugin-inject'
import nodeResolve from '@rollup/plugin-node-resolve'
import { resolve } from 'path'
import nodePolyfill from 'rollup-plugin-polyfill-node'

export default {
  input: ['test/browser/test-browser.js'],
  external: ['./src/storage/redis.js'],
  output: {
    file: 'tmp/rollup/suite.browser.js',
    format: 'iife',
    name: 'asyncDedupeStorageTestSuite'
  },
  plugins: [
    commonjs(),
    nodePolyfill(),
    inject({
      process: resolve('node_modules/process/browser.js')
    }),
    nodeResolve({
      browser: true,
      preferBuiltins: false
    })
  ]
}
