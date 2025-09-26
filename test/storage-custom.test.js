'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const proxyquire = require('proxyquire')
const createStorage = require('../src/storage')
const { createCache, StorageInterface } = require('..')
const { default: tspl } = require('@matteo.collina/tspl')

const dummyStorage = {
  async get (key) { },
  async set (key, value, ttl, references) { },
  async remove (key) { },
  async invalidate (references) { },
  async clear () { },
  async refresh () { },
  async getTTL () { }
}

describe('storage custom', async () => {
  test('should get an instance with default options', async () => {
    const storage = createStorage('custom', { storage: dummyStorage })

    assert.ok(typeof storage.get === 'function')
    assert.ok(typeof storage.set === 'function')
    assert.ok(typeof storage.remove === 'function')
    assert.ok(typeof storage.invalidate === 'function')
    assert.ok(typeof storage.refresh === 'function')
    assert.ok(typeof storage.getTTL === 'function')
  })

  test('should throw if storage not defined', async (t) => {
    const createStorage = proxyquire('../src/storage/index.js', {
      '../util': { isServerSide: false }
    })

    assert.throws(() => createStorage('custom', { }), {
      message: 'Storage is required for custom storage type'
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
