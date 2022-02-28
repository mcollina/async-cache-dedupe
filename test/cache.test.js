'use strict'

const t = require('tap')
const { Cache } = require('../src/cache')
const createStorage = require('../src/storage')
const { kStorages } = require('../src/symbol')

const { test } = t

test('Cache', async (t) => {
  test('should get an instance with default options', async (t) => {
    const cache = new Cache({ storage: createStorage() })

    t.ok(typeof cache.define === 'function')
    t.ok(typeof cache.clear === 'function')
    t.ok(typeof cache.get === 'function')
    t.ok(typeof cache.set === 'function')
    t.ok(typeof cache.invalidate === 'function')
  })

  test('get', async (t) => {
    test('should use storage to get a value', async (t) => {
      t.plan(1)
      const cache = new Cache({
        storage: {
          async get (key) {
            t.equal(key, 'foo')
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.get('f', 'foo')
    })

    test('should get an error trying to use get of not defined name', async (t) => {
      t.plan(1)
      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.get('fiiii', 'key').catch((err) => {
        t.equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })

  test('set', async (t) => {
    test('should use storage to set a value', async (t) => {
      t.plan(4)
      const cache = new Cache({
        storage: {
          async set (key, value, ttl, references) {
            t.equal(key, 'foo')
            t.equal(value, 'bar')
            t.equal(ttl, 9)
            t.same(references, ['fooers'])
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.set('f', 'foo', 'bar', 9, ['fooers'])
    })

    test('should get an error trying to use set of not defined name', async (t) => {
      t.plan(1)
      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.set('fiiii', 'key', 'value').catch((err) => {
        t.equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })

  test('invalidate', async (t) => {
    test('should use storage to get a value', async (t) => {
      t.plan(1)
      const cache = new Cache({
        storage: {
          async invalidate (references) {
            t.same(references, ['foo'])
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.invalidate('f', ['foo'])
    })

    test('should get an error trying to invalidate of not defined name', async (t) => {
      t.plan(1)
      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.invalidate('fiiii', ['references']).catch((err) => {
        t.equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })

  test('invalidateAll', async (t) => {
    test('should call invalidate on default storage', async (t) => {
      t.plan(1)
      const cache = new Cache({
        storage: {
          async invalidate (references) {
            t.same(references, ['foo'])
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.invalidateAll(['foo'])
    })

    test('should call invalidate on specific storage', async (t) => {
      t.plan(1)
      const cache = new Cache({
        storage: {
          async invalidate () {
            t.fail('should not call default storage')
          }
        }
      })

      cache.define('f', { storage: {} }, () => 'the-value')
      cache[kStorages].get('f').invalidate = async (references) => {
        t.equal(references, 'foo')
      }

      await cache.invalidateAll('foo', 'f')
    })

    test('should rejectes invalidating on non-existing storage', async (t) => {
      t.plan(1)

      const cache = new Cache({
        storage: {
          async invalidate () {
            t.fail('should not call default storage')
          }
        }
      })

      cache.define('f',
        { storage: { type: 'memory', options: { size: 1 } } },
        () => 'the-value')

      await t.rejects(cache.invalidateAll('foo', 'not-a-storage'), 'not-a-storage storage is not defined in the cache')
    })
  })

  test('clear', async (t) => {
    test('should use storage to clear a value by name', async (t) => {
      t.plan(1)
      const cache = new Cache({
        storage: {
          async remove (value) {
            t.same(value, 'f~foo')
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.clear('f', 'foo')
    })

    test('should get an error trying to clear of not defined name', async (t) => {
      t.plan(1)
      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.clear('fiiii').catch((err) => {
        t.equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })
})
