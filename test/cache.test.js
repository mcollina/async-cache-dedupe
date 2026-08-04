'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { Cache } = require('../src/cache')
const createStorage = require('../src/storage')
const { kStorage, kStorages } = require('../src/symbol')

describe('Cache', async (t) => {
  test('should get an instance with default options', async () => {
    const cache = new Cache({ storage: createStorage() })

    assert.ok(typeof cache.define === 'function')
    assert.ok(typeof cache.clear === 'function')
    assert.ok(typeof cache.get === 'function')
    assert.ok(typeof cache.set === 'function')
    assert.ok(typeof cache.invalidate === 'function')
  })

  describe('define', async () => {
    test('should define an instance with storage options', async () => {
      const cache = new Cache({ storage: createStorage() })

      cache.define('different-storage', { storage: createStorage('memory', { invalidation: true }) }, () => {})
      assert.equal(cache[kStorages].get('different-storage').invalidation, true)
    })
  })

  describe('get', async () => {
    test('should use storage to get a value', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: {
          async get (key) {
            equal(key, 'foo')
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.get('f', 'foo')
    })

    test('should get an error trying to use get of not defined name', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.get('fiiii', 'key').catch((err) => {
        equal(err.message, 'fiiii is not defined in the cache')
      })
    })

    test('should bypass storage when ttl is 0', async (t) => {
      const { equal, fail } = tspl(t, { plan: 1 })
      const cache = new Cache({ storage: createStorage() })
      cache[kStorage].get = () => {
        fail('should bypass storage')
      }
      cache[kStorage].set = () => {
        fail('should bypass storage')
      }
      cache.define('f', { ttl: 0 }, async (k) => {
        equal(k, 'foo')

        return { k }
      })

      await cache.f('foo')
    })
  })

  describe('getSync', async () => {
    test('should return the value from a memory cache hit without await', async (t) => {
      const { equal } = tspl(t, { plan: 2 })
      const cache = new Cache({ storage: createStorage('memory', {}) })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      await cache.f('foo')

      // getSync auto-prefixes the storage key, so the user passes the
      // same key the wrapped function saw.
      const value = cache.getSync('f', 'foo')
      equal(value.k, 'foo')
      // calling getSync must not return a Promise; it must return the value
      equal(typeof value, 'object')
    })

    test('should return undefined on a cache miss', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({ storage: createStorage('memory', {}) })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      const value = cache.getSync('f', 'nope')
      equal(value, undefined)
    })

    test('should return undefined when storage does not implement getSync', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: {
          async get (key) { return 'the-value' }
          // intentionally no getSync
        }
      })
      cache.define('f', () => 'the-value')

      const value = cache.getSync('f', 'foo')
      equal(value, undefined)
    })

    test('should throw trying to use getSync of not defined name', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      try {
        cache.getSync('fiiii', 'key')
      } catch (err) {
        equal(err.message, 'fiiii is not defined in the cache')
      }
    })

    test('should apply the transformer.deserialize synchronously when transformer is sync', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: createStorage('memory', {}),
        transformer: {
          serialize: (data) => ({ wrapped: data }),
          deserialize: (data) => data.wrapped
        }
      })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      await cache.f('foo')
      const value = cache.getSync('f', 'foo')
      equal(value.k, 'foo')
    })

    test('should return undefined when transformer is async', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: createStorage('memory', {}),
        transformer: {
          serialize: (data) => data,
          deserialize: async (data) => data
        }
      })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      await cache.f('foo')
      const value = cache.getSync('f', 'foo')
      equal(value, undefined)
    })

    test('should call onError and return undefined when transformer.deserialize throws', async (t) => {
      const { equal } = tspl(t, { plan: 3 })
      let onErrorCalled = false
      const cache = new Cache({
        storage: createStorage('memory', {}),
        onError: (err) => {
          onErrorCalled = true
          equal(err.message, 'deserialize boom')
        }
      })
      cache.define('f', {
        ttl: 60,
        transformer: {
          serialize: (data) => data,
          deserialize: () => { throw new Error('deserialize boom') }
        }
      }, async (k) => ({ k }))

      await cache.f('foo')
      const value = cache.getSync('f', 'foo')
      equal(value, undefined)
      // onError assertion fires inside the callback; if it didn't run,
      // surface the missing call.
      equal(onErrorCalled, true)
    })
  })

  describe('syncCache', async () => {
    test('should return the value from the sync LRU after a prior async get', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: createStorage('memory', {}),
        syncCache: { size: 10, ttl: 60000 }
      })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      await cache.f('foo')
      const v = cache.getSync('f', 'foo')
      equal(v.k, 'foo')
    })

    test('should return undefined on a sync-cache miss when the underlying storage is async (custom)', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      // Custom storage that does not implement getSync; only async get.
      const cache = new Cache({
        storage: {
          async get (key) { return 'from-async-storage' }
        },
        syncCache: { size: 10, ttl: 60000 }
      })
      cache.define('f', async (k) => ({ k }))

      // never called cache.f, so the sync LRU is empty
      const v = cache.getSync('f', 'nope')
      equal(v, undefined)
    })

    test('should return undefined when the LRU entry is older than syncCache.ttl', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: createStorage('memory', {}),
        syncCache: { size: 10, ttl: 50 } // 50ms staleness
      })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      await cache.f('foo')
      await new Promise(resolve => setTimeout(resolve, 80))
      const v = cache.getSync('f', 'foo')
      equal(v, undefined)
    })

    test('should clear matching entries from the sync LRU on cache.invalidate', async (t) => {
      const { equal } = tspl(t, { plan: 2 })
      const cache = new Cache({
        storage: createStorage('memory', { invalidation: true }),
        syncCache: { size: 10, ttl: 60000 }
      })
      cache.define('f', {
        ttl: 60,
        references: (args, key, result) => ['user:1']
      }, async (k) => ({ k }))

      await cache.f('foo')
      equal(cache.getSync('f', 'foo').k, 'foo')

      await cache.invalidate('f', ['user:1'])
      equal(cache.getSync('f', 'foo'), undefined)
    })

    test('should clear the sync LRU entries for a name on cache.clear(name, value)', async (t) => {
      const { equal } = tspl(t, { plan: 2 })
      const cache = new Cache({
        storage: createStorage('memory', {}),
        syncCache: { size: 10, ttl: 60000 }
      })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      await cache.f('foo')
      equal(cache.getSync('f', 'foo').k, 'foo')

      await cache.clear('f', 'foo')
      equal(cache.getSync('f', 'foo'), undefined)
    })

    test('should clear all sync LRU entries for a name on cache.clear(name)', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: createStorage('memory', {}),
        syncCache: { size: 10, ttl: 60000 }
      })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))

      await cache.f('foo')
      await cache.f('bar')

      await cache.clear('f')
      // sync LRU was cleared, so getSync now misses for both keys
      equal(cache.getSync('f', 'foo'), undefined)
    })

    test('should support per-define syncCache override that does not leak between defines', async (t) => {
      const { equal, notEqual } = tspl(t, { plan: 2 })
      const cache = new Cache({ storage: createStorage('memory', {}) })

      cache.define('a', {
        ttl: 60,
        syncCache: { size: 10, ttl: 60000 }
      }, async (k) => ({ k }))
      cache.define('b', { ttl: 60 }, async (k) => ({ k }))

      await cache.a('1')
      await cache.b('2')

      // 'a' has syncCache -> getSync hits
      const aHit = cache.getSync('a', '1')
      equal(aHit.k, '1')
      // 'b' does not have syncCache -> getSync falls through to
      // StorageMemory.getSync, which also hits, so the assertion
      // for 'b' is that it has the value (not undefined).
      notEqual(cache.getSync('b', '2'), undefined)
    })

    test('should inherit the cache-level syncCache to all defines when no per-define override', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: createStorage('memory', {}),
        syncCache: { size: 10, ttl: 60000 }
      })
      cache.define('f', { ttl: 60 }, async (k) => ({ k }))
      await cache.f('foo')
      equal(cache.getSync('f', 'foo').k, 'foo')
    })

    test('should throw when syncCache.size is invalid', async (t) => {
      const { ok } = tspl(t, { plan: 1 })
      try {
        // eslint-disable-next-line no-new
        new Cache({ storage: createStorage(), syncCache: { size: 0, ttl: 1000 } })
      } catch (err) {
        ok(err.message.includes('syncCache.size'))
      }
    })

    test('should throw when syncCache.ttl is invalid', async (t) => {
      const { ok } = tspl(t, { plan: 1 })
      try {
        // eslint-disable-next-line no-new
        new Cache({ storage: createStorage(), syncCache: { size: 10, ttl: -1 } })
      } catch (err) {
        ok(err.message.includes('syncCache.ttl'))
      }
    })
  })

  describe('exists', async () => {
    test('should use storage to check if a value exists', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({
        storage: {
          async exists (key) {
            equal(key, 'foo')
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.exists('f', 'foo')
    })

    test('should get an error trying to use exists of not defined name', async (t) => {
      const { equal } = tspl(t, { plan: 1 })
      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.exists('fiiii', 'key').catch((err) => {
        equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })

  test('should bypass setting value in storage if ttl function returns 0', async (t) => {
    const { equal, fail } = tspl(t, { plan: 1 })

    const cache = new Cache({ storage: createStorage() })
    cache[kStorage].set = () => {
      fail('should bypass storage')
    }
    cache.define('f', { ttl: (_data) => { return 0 } }, async (k) => {
      equal(k, 'foo')

      return { k }
    })

    await cache.f('foo')
  })

  test('should set value in storage if ttl function returns > 0', async (t) => {
    const { equal } = tspl(t, { plan: 4 })

    const cache = new Cache({ storage: createStorage() })
    cache[kStorage].set = (key, value, ttl) => {
      equal(key, 'f~foo')
      equal(value.k, 'foo')
      equal(ttl, 1)
    }
    cache.define('f', { ttl: (data) => { return 1 } }, async (k) => {
      equal(k, 'foo')

      return { k }
    })

    await cache.f('foo')
  })

  test('should call onError and bypass storage if ttl fn returns non-integer', async (t) => {
    const { equal, fail } = tspl(t, { plan: 2 })

    const cache = new Cache({ storage: createStorage() })
    cache[kStorage].set = () => {
      fail('should bypass storage')
    }
    const onError = (err) => {
      equal(err.message, 'ttl must be an integer')
    }
    cache.define('f', { ttl: (data) => { return 3.14 }, onError }, async (k) => {
      equal(k, 'foo')

      return { k }
    })

    await cache.f('foo')
  })

  test('should call onError and bypass storage if ttl fn returns undefined', async (t) => {
    const { equal, fail } = tspl(t, { plan: 2 })

    const cache = new Cache({ storage: createStorage() })
    cache[kStorage].set = () => {
      fail('should bypass storage')
    }
    const onError = (err) => {
      equal(err.message, 'ttl must be an integer')
    }
    cache.define('f', { ttl: (data) => { return undefined }, onError }, async (k) => {
      equal(k, 'foo')

      return { k }
    })

    await cache.f('foo')
  })

  test('should call onError and bypass storage if ttl fn returns non-number', async (t) => {
    const { equal, fail } = tspl(t, { plan: 2 })

    const cache = new Cache({ storage: createStorage() })
    cache[kStorage].set = () => {
      fail('should bypass storage')
    }
    const onError = (err) => {
      equal(err.message, 'ttl must be an integer')
    }
    cache.define('f', { ttl: (data) => { return '3' }, onError }, async (k) => {
      equal(k, 'foo')

      return { k }
    })

    await cache.f('foo')
  })

  describe('set', async (t) => {
    test('should use storage to set a value', async (t) => {
      const { equal, deepStrictEqual } = tspl(t, { plan: 4 })

      const cache = new Cache({
        storage: {
          async set (key, value, ttl, references) {
            equal(key, 'foo')
            equal(value, 'bar')
            equal(ttl, 9)
            deepStrictEqual(references, ['fooers'])
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.set('f', 'foo', 'bar', 9, ['fooers'])
    })

    test('should get an error trying to use set of not defined name', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.set('fiiii', 'key', 'value').catch((err) => {
        equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })

  describe('invalidate', async (t) => {
    test('should use storage to get a value', async (t) => {
      const { deepStrictEqual } = tspl(t, { plan: 1 })

      const cache = new Cache({
        storage: {
          async invalidate (references) {
            deepStrictEqual(references, ['foo'])
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.invalidate('f', ['foo'])
    })

    test('should get an error trying to invalidate of not defined name', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.invalidate('fiiii', ['references']).catch((err) => {
        equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })

  describe('invalidateAll', async (t) => {
    test('should call invalidate on default storage', async (t) => {
      const { deepStrictEqual } = tspl(t, { plan: 1 })

      const cache = new Cache({
        storage: {
          async invalidate (references) {
            deepStrictEqual(references, ['foo'])
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.invalidateAll(['foo'])
    })

    test('should call invalidate on specific storage', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const cache = new Cache({
        storage: {
          async invalidate () {
            t.fail('should not call default storage')
          }
        }
      })

      cache.define('f', { storage: {} }, () => 'the-value')
      cache[kStorages].get('f').invalidate = async (references) => {
        equal(references, 'foo')
      }

      await cache.invalidateAll('foo', 'f')
    })

    test('should rejects invalidating on non-existing storage', async () => {
      const cache = new Cache({
        storage: {
          async invalidate () {
            assert.fail('should not call default storage')
          }
        }
      })

      cache.define('f',
        { storage: { type: 'memory', options: { size: 1 } } },
        () => 'the-value')

      await assert.rejects(cache.invalidateAll('foo', 'not-a-storage'), {
        message: 'not-a-storage storage is not defined in the cache'
      })
    })
  })

  describe('clear', async (t) => {
    test('should use storage to clear a value by name', async (t) => {
      const { deepStrictEqual } = tspl(t, { plan: 1 })

      const cache = new Cache({
        storage: {
          async remove (value) {
            deepStrictEqual(value, 'f~foo')
          }
        }
      })
      cache.define('f', () => 'the-value')

      await cache.clear('f', 'foo')
    })

    test('should get an error trying to clear of not defined name', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const cache = new Cache({ storage: createStorage() })
      cache.define('f', () => 'the-value')

      cache.clear('fiiii').catch((err) => {
        equal(err.message, 'fiiii is not defined in the cache')
      })
    })
  })
})
