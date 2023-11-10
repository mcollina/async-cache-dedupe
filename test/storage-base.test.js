'use strict'

const { test, describe } = require('node:test')
const assert = require('assert')
const createStorage = require('../src/storage')
const StorageInterface = require('../src/storage/interface')

describe('storage', async (t) => {
  test('should get an instance with default options', async (t) => {
    const storage = createStorage()

    assert.ok(typeof storage.get === 'function')
    assert.ok(typeof storage.set === 'function')
    assert.ok(typeof storage.remove === 'function')
    assert.ok(typeof storage.invalidate === 'function')
    assert.ok(typeof storage.refresh === 'function')
  })

  test('should get an error implementing storage interfaces without get method', async (t) => {
    class BadStorage extends StorageInterface { }

    const badStorage = new BadStorage()

    for (const method of ['get', 'set', 'remove', 'invalidate', 'clear', 'refresh']) {
      try {
        await badStorage[method]()
        assert.fail(`should throw an error on method ${method}`)
      } catch (err) {
        assert.equal(err.message, `storage ${method} method not implemented`)
      }
    }
  })
})
