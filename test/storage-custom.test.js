'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const createStorage = require('../src/storage')
const { createCache, StorageInterface } = require('..')
const { default: tspl } = require('@matteo.collina/tspl')

describe('storage custom', async () => {
  test('should get an instance with default options', async () => {
    class CustomStorage extends StorageInterface {
      async get (key) { }
      async set (key, value, ttl, references) { }
      async remove (key) { }
      async invalidate (references) { }
      async clear () { }
      async refresh () { }
      async getTTL () { }
    }
    const storage = createStorage('custom', { storage: new CustomStorage() })

    assert.ok(typeof storage.get === 'function')
    assert.ok(typeof storage.set === 'function')
    assert.ok(typeof storage.remove === 'function')
    assert.ok(typeof storage.invalidate === 'function')
    assert.ok(typeof storage.refresh === 'function')
    assert.ok(typeof storage.getTTL === 'function')
  })

  test('should throw if storage not defined', async (t) => {
    assert.throws(() => createStorage('custom', { }), {
      message: 'Storage is required for custom storage type'
    })
  })

  test('should throw if storage is not instance of interface', async (t) => {
    class CustomStorage {}

    assert.throws(() => createStorage('custom', { storage: new CustomStorage() }), {
      message: 'Custom storage must be instance of interface'
    })
  })

  test('should throw if get function not defined', async (t) => {
    const { strictEqual } = tspl(t, { plan: 1 })
    class CustomStorage extends StorageInterface {}
    const cache = createCache({
      ttl: 100,
      storage: {
        type: 'custom',
        options: {
          storage: new CustomStorage()
        }
      }
    })

    cache.define('test', () => 'test-cache-2')

    cache.test().catch((err) => {
      strictEqual(err.message, 'storage get method not implemented')
    })
  })
})
