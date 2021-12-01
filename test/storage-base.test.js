'use strict'

const t = require('tap')
const createStorage = require('../storage')
const StorageInterface = require('../storage/interface')

const { test } = t

test('storage', async (t) => {
  test('should get an instance with default options', async (t) => {
    const storage = createStorage()

    t.ok(typeof storage.get === 'function')
    t.ok(typeof storage.set === 'function')
    t.ok(typeof storage.remove === 'function')
    t.ok(typeof storage.invalidate === 'function')
    t.ok(typeof storage.refresh === 'function')
  })

  test('should get an error implementing storage interfaces without get method', async (t) => {
    class BadStorage extends StorageInterface { }

    const badStorage = new BadStorage()

    for (const method of ['get', 'set', 'remove', 'invalidate', 'clear', 'refresh']) {
      try {
        await badStorage[method]()
        t.fail(`should throw an error on method ${method}`)
      } catch (err) {
        t.equal(err.message, `storage ${method} method not implemented`)
      }
    }
  })
})
