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
