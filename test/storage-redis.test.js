'use strict'

const { test, describe, before, beforeEach, after } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { promisify } = require('util')
const Redis = require('ioredis')
const proxyquire = require('proxyquire')
const createStorage = require('../src/storage')
const StorageRedis = proxyquire('../src/storage/redis', {
  '../util': {
    randomSubset: (array, size) => array.slice(0, size)
  }
})

const sleep = promisify(setTimeout)

const redisClient = new Redis()

function assertInclude (t, array0, array1) {
  assert.deepStrictEqual(array0.length, array1.length)
  for (const a of array0) {
    assert.ok(array1.includes(a), `${a} should be in ${array1}`)
  }
}

describe('storage redis', async () => {
  before(async () => {
    await redisClient.flushall()
  })

  after(async () => {
    redisClient.quit()
  })

  test('should get an instance with default options', async (t) => {
    const storage = createStorage('redis', { client: redisClient })

    assert.ok(typeof storage.get === 'function')
    assert.ok(typeof storage.set === 'function')
    assert.ok(typeof storage.remove === 'function')
    assert.ok(typeof storage.invalidate === 'function')
    assert.ok(typeof storage.refresh === 'function')
  })

  test('should throw on missing options', async (t) => {
    assert.throws(() => createStorage('redis'))
  })

  test('should throw on invalid options, missing client', async (t) => {
    assert.throws(() => createStorage('redis', { client: -1 }))
  })

  test('should throw on invalid options, invalid referenceTTL', async (t) => {
    assert.throws(() => createStorage('redis', { client: {}, invalidation: { referencesTTL: -1 } }))
  })

  describe('get', async () => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should get a value by a key previously stored', async (t) => {
      const storage = createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 100)

      assert.equal(await storage.get('foo'), 'bar')
    })

    test('should get undefined retrieving a non stored key', async (t) => {
      const storage = createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 100)

      assert.equal(await storage.get('no-foo'), undefined)
    })

    test('should get undefined retrieving an expired value', async (t) => {
      const storage = createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 1)
      await sleep(2000)

      assert.equal(await storage.get('foo'), undefined)
    })

    test('should not throw on error', async (t) => {
      const { equal } = tspl(t, { plan: 3 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.get error')
            equal(error.key, 'foo')
          }
        }
      })

      equal(await storage.get('foo'), undefined)
    })
  })

  describe('set', async () => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should set a value, with ttl', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 100)

      const value = await storage.store.get('foo')
      assert.equal(JSON.parse(value), 'bar')

      const ttl = await storage.store.ttl('foo')
      assert.equal(ttl, 100)
    })

    test('should not set a value with ttl < 1', async (t) => {
      const storage = createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 0)

      assert.equal(await storage.get('foo'), undefined)
    })

    test('should set a value with references', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo', 'bar', 100, ['fooers'])

      const value = await storage.store.get('foo')
      assert.equal(JSON.parse(value), 'bar')

      assert.deepStrictEqual(await storage.store.smembers('r:fooers'), ['foo'])
    })

    test('should not set an empty references', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo', 'bar', 100, [])

      const value = await storage.store.get('foo')
      assert.equal(JSON.parse(value), 'bar')

      assert.deepStrictEqual((await storage.store.keys('r:*')).length, 0)
    })

    test('should set a custom references ttl', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: { referencesTTL: 10 } })
      await storage.set('foo', 'bar', 100, ['fooers'])

      const value = await storage.store.get('foo')
      assert.equal(JSON.parse(value), 'bar')

      assert.deepStrictEqual(await storage.store.smembers('r:fooers'), ['foo'])
      assert.deepStrictEqual(await storage.store.ttl('r:fooers'), 10)
    })

    test('should get a warning setting references with invalidation disabled', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const storage = createStorage('redis', {
        client: redisClient,
        log: {
          debug: () => { },
          warn: (error) => {
            equal(error.msg, 'acd/storage/redis.set, invalidation is disabled, references are useless')
          }
        }
      })

      await storage.set('foo', 'bar', 1, ['fooers'])
    })

    test('should not set a references twice', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo', 'bar', 100, ['fooers'])
      await storage.set('foo', 'new-bar', 100, ['fooers'])

      const value = await storage.store.get('foo')
      assert.equal(JSON.parse(value), 'new-bar')

      const references = await storage.store.smembers('r:fooers')
      assert.deepStrictEqual(references, ['foo'])
    })

    test('should add a key to an existing reference', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })

      await storage.set('foo1', 'bar1', 100, ['fooers'])
      await storage.set('foo2', 'bar2', 100, ['fooers'])

      const references = await storage.store.smembers('r:fooers')
      assert.equal(references.length, 2)
      assert.ok(references.includes('foo1'))
      assert.ok(references.includes('foo2'))
    })

    test('should update the key references, full replace', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })

      await storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      await storage.set('foo', 'bar2', 100, ['booers', 'tooers'])

      assert.equal((await storage.store.smembers('r:fooers')).length, 0)
      assert.equal((await storage.store.smembers('r:mooers')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('r:booers'), ['foo'])
      assert.deepStrictEqual(await storage.store.smembers('r:tooers'), ['foo'])
    })

    test('should update the key references, partial replace', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })

      await storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      await storage.set('foo', 'bar2', 100, ['mooers', 'tooers'])

      assert.equal((await storage.store.smembers('r:fooers')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('r:mooers'), ['foo'])
      assert.deepStrictEqual(await storage.store.smembers('r:tooers'), ['foo'])
      assertInclude(t, await storage.store.smembers('k:foo'), ['mooers', 'tooers'])
    })

    test('should update the key references, partial replace adding more references', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })

      await storage.set('foo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      assert.equal((await storage.store.smembers('r:a')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('r:b'), ['foo'])
      assert.deepStrictEqual(await storage.store.smembers('r:d'), ['foo'])
      assert.deepStrictEqual(await storage.store.smembers('r:z'), ['foo'])
      assertInclude(t, await storage.store.smembers('k:foo'), ['b', 'd', 'z'])
    })

    test('should update the key references, partial replace with shared reference', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })

      await storage.set('boo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      assert.deepStrictEqual(await storage.store.smembers('r:a'), ['boo'])
      assertInclude(t, await storage.store.smembers('r:b'), ['foo', 'boo'])
      assert.deepStrictEqual(await storage.store.smembers('r:d'), ['foo'])
      assert.deepStrictEqual(await storage.store.smembers('r:z'), ['foo'])

      assertInclude(t, await storage.store.smembers('k:foo'), ['z', 'd', 'b'])
    })

    test('should not throw on error', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 3 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.set error')
            equal(error.key, 'foo')
          }
        }
      })

      doesNotThrow(() => storage.set('foo', 'bar', 1))
    })
  })

  describe('remove', async () => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should remove an existing key', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10)

      await storage.remove('foo')

      assert.equal(await storage.get('foo'), undefined)
    })

    test('should remove an non existing key', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10)

      await storage.remove('fooz')

      assert.equal(await storage.get('foo'), 'bar')
      assert.equal(await storage.get('fooz'), undefined)
    })

    test('should remove an existing key and references', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo', 'bar', 10, ['fooers'])

      await storage.remove('foo')

      assert.equal(await storage.get('foo'), undefined)

      assert.deepStrictEqual((await storage.store.smembers('r:fooers')).length, 0)
      assert.deepStrictEqual((await storage.store.smembers('k:foo')).length, 0)
    })

    test('should remove an non existing key (and references)', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo', 'bar', 10, ['fooers'])

      await storage.remove('fooz')

      assert.equal(await storage.get('foo'), 'bar')
      assert.equal(await storage.get('fooz'), undefined)

      assert.deepStrictEqual(await storage.store.smembers('k:foo'), ['fooers'])
      assert.deepStrictEqual(await storage.store.smembers('r:fooers'), ['foo'])
    })

    test('should remove a key but not references if still active', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('a', 1, 10, ['fooers', 'vowels'])
      await storage.set('b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('d', 1, 10, ['consonantes'])
      await storage.set('e', 1, 10, ['vowels'])

      await storage.remove('a')

      assert.equal(await storage.get('a'), undefined)
      assert.equal(await storage.get('b'), 1)
      assert.equal(await storage.get('c'), 1)
      assert.equal(await storage.get('d'), 1)
      assert.equal(await storage.get('e'), 1)

      assertInclude(t, await storage.store.smembers('r:fooers'), ['b', 'c'])
      assertInclude(t, await storage.store.smembers('r:consonantes'), ['b', 'c', 'd'])
      assert.deepStrictEqual(await storage.store.smembers('r:vowels'), ['e'])

      assert.equal((await storage.store.smembers('k:a')).length, 0)
      assertInclude(t, await storage.store.smembers('k:b'), ['fooers', 'consonantes'])
      assertInclude(t, await storage.store.smembers('k:c'), ['fooers', 'consonantes'])
      assertInclude(t, await storage.store.smembers('k:d'), ['consonantes'])
      assert.deepStrictEqual(await storage.store.smembers('k:e'), ['vowels'])
    })

    test('should not throw on error', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 3 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.remove error')
            equal(error.key, 'foo')
          }
        }
      })

      doesNotThrow(() => storage.remove('foo'))
    })
  })

  describe('invalidate', async () => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should remove storage keys by references', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate(['fooers'])

      assert.equal(await storage.get('foo~1'), undefined)
      assert.equal(await storage.get('foo~2'), undefined)
      assert.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should not remove storage keys by not existing reference', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate(['buzzers'])

      assert.equal(await storage.get('foo~1'), 'bar')
      assert.equal(await storage.get('foo~2'), 'baz')
      assert.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should invalide more than one reference at once', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate(['fooers', 'booers'])

      assert.equal(await storage.get('foo~1'), undefined)
      assert.equal(await storage.get('foo~2'), undefined)
      assert.equal(await storage.get('boo~1'), undefined)
    })

    test('should remove storage keys by references, but not the ones still alive', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~boo', 'baz', 1, ['fooers', 'booers'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = await storage.invalidate(['fooers'])

      assertInclude(t, removed, ['foo~1', 'foo~boo'])

      assert.equal(await storage.get('foo~1'), undefined)
      assert.equal(await storage.get('foo~boo'), undefined)
      assert.equal(await storage.get('boo~1'), 'fiz')

      assert.equal((await storage.store.smembers('r:fooers')).length, 0)
      assert.equal((await storage.store.smembers('r:foo:1')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('r:booers'), ['boo~1'])

      assert.equal((await storage.store.smembers('k:foo~1')).length, 0)
      assert.equal((await storage.store.smembers('k:foo~boo')).length, 0)
      assertInclude(t, await storage.store.smembers('k:boo~1'), ['booers', 'boo:1'])
    })

    test('should remove a keys and references and also linked ones', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('a', 1, 10, ['fooers', 'vowels', 'empty'])
      await storage.set('b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('d', 1, 10, ['consonantes'])
      await storage.set('e', 1, 10, ['vowels'])

      await storage.invalidate(['fooers'])

      assert.equal(await storage.get('a'), undefined)
      assert.equal(await storage.get('b'), undefined)
      assert.equal(await storage.get('c'), undefined)
      assert.equal(await storage.get('d'), 1)
      assert.equal(await storage.get('e'), 1)

      assert.equal((await storage.store.smembers('r:fooers')).length, 0)
      assert.equal((await storage.store.smembers('r:empty')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('r:consonantes'), ['d'])
      assert.deepStrictEqual(await storage.store.smembers('r:vowels'), ['e'])

      assert.equal((await storage.store.smembers('k:a')).length, 0)
      assert.equal((await storage.store.smembers('k:b')).length, 0)
      assert.equal((await storage.store.smembers('k:c')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('k:d'), ['consonantes'])
      assert.deepStrictEqual(await storage.store.smembers('k:e'), ['vowels'])
    })

    test('should invalidate by a string', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate('fooers')

      assert.equal(await storage.get('foo~1'), undefined)
      assert.equal(await storage.get('foo~2'), undefined)
      assert.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should invalidate by an array of strings', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate(['fooers', 'booers'])

      assert.equal(await storage.get('foo~1'), undefined)
      assert.equal(await storage.get('foo~2'), undefined)
      assert.equal(await storage.get('boo~1'), undefined)
    })

    test('should invalidate with wildcard one asterisk', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate('foo:*')

      assert.equal(await storage.get('foo~1'), undefined)
      assert.equal(await storage.get('foo~2'), undefined)
      assert.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should invalidate with wildcard two asterisk', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo~01', '0', 1, ['group', 'foo:0x'])
      await storage.set('foo~02', '0', 1, ['group', 'foo:0x'])
      await storage.set('foo~11', '1', 1, ['group', 'foo:1x'])
      await storage.set('foo~12', '1', 1, ['group', 'foo:1x'])
      await storage.set('boo~1', 'fiz', 1, ['group', 'boo:1x'])

      await storage.invalidate('f*1*')

      assert.equal(await storage.get('foo~01'), '0')
      assert.equal(await storage.get('foo~02'), '0')
      assert.equal(await storage.get('foo~11'), undefined)
      assert.equal(await storage.get('foo~12'), undefined)
      assert.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should invalidate all with wildcard', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('a', '0', 1, ['a', 'a:01'])
      await storage.set('b', '0', 1, ['b', 'b:01'])
      await storage.set('c', '0', 1, ['c', 'c:01'])
      await storage.set('d', '0', 1, ['d', 'd:01'])
      await storage.set('e', '0', 1, ['e', 'e:01'])
      await storage.set('f', '0', 1, ['f', 'f:01'])

      await storage.invalidate('*')

      assert.equal(await storage.get('a'), undefined)
      assert.equal(await storage.get('b'), undefined)
      assert.equal(await storage.get('c'), undefined)
      assert.equal(await storage.get('d'), undefined)
      assert.equal(await storage.get('e'), undefined)
      assert.equal(await storage.get('f'), undefined)
    })

    test('should get a warning with invalidation disabled', async (t) => {
      const { equal, deepStrictEqual } = tspl(t, { plan: 2 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          warn: (error) => {
            equal(error.msg, 'acd/storage/redis.invalidate, exit due invalidation is disabled')
          }
        }
      })

      deepStrictEqual(await storage.invalidate(['something']), [])
    })

    test('should not throw on error', async (t) => {
      const { equal, deepStrictEqual, doesNotThrow } = tspl(t, { plan: 3 })

      const storage = createStorage('redis', {
        client: {},
        invalidation: true,
        log: {
          debug: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.invalidate error')
            deepStrictEqual(error.references, ['pizzers'])
          }
        }
      })

      doesNotThrow(() => storage.invalidate(['pizzers']))
    })

    test('should not throw invalidating non-existing references', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await redisClient.set('r:model:1', 'value')

      assert.doesNotThrow(() => storage.invalidate(['model:1', 'model:2']))
    })
  })

  describe('clear', async () => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should clear the whole storage (invalidation disabled)', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10)
      await storage.set('baz', 'buz', 10)

      await storage.clear()

      assert.equal(await storage.store.dbsize(), 0)
    })

    test('should clear the whole storage (invalidation enabled)', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('foo', 'bar', 10, ['fooers'])
      await storage.set('baz', 'buz', 10, ['bazers'])

      await storage.clear()

      assert.equal(await storage.store.dbsize(), 0)
    })

    test('should clear only keys with common name', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      await storage.set('foo~1', 'bar', 10)
      await storage.set('foo~2', 'baz', 10)
      await storage.set('boo~1', 'fiz', 10)

      await storage.clear('foo~')

      assert.equal(await storage.get('foo~1'), undefined)
      assert.equal(await storage.get('foo~2'), undefined)
      assert.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should clear a keys and their references', async (t) => {
      const storage = createStorage('redis', { client: redisClient, invalidation: true })
      await storage.set('a-a', 1, 10, ['fooers', 'vowels', 'empty'])
      await storage.set('a-b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('a-c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('b-d', 1, 10, ['consonantes'])
      await storage.set('b-e', 1, 10, ['vowels'])

      await storage.clear('a-')

      assert.equal(await storage.get('a-a'), undefined)
      assert.equal(await storage.get('a-b'), undefined)
      assert.equal(await storage.get('a-c'), undefined)
      assert.equal(await storage.get('b-d'), 1)
      assert.equal(await storage.get('b-e'), 1)

      assert.equal((await storage.store.smembers('r:fooers')).length, 0)
      assert.equal((await storage.store.smembers('r:empty')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('r:consonantes'), ['b-d'])
      assert.deepStrictEqual(await storage.store.smembers('r:vowels'), ['b-e'])

      assert.equal((await storage.store.smembers('k:a-a')).length, 0)
      assert.equal((await storage.store.smembers('k:a-b')).length, 0)
      assert.equal((await storage.store.smembers('k:a-c')).length, 0)
      assert.deepStrictEqual(await storage.store.smembers('k:b-d'), ['consonantes'])
      assert.deepStrictEqual(await storage.store.smembers('k:b-e'), ['vowels'])
    })

    test('should not throw on error', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 3 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.clear error')
            equal(error.name, 'foo')
          }
        }
      })

      doesNotThrow(() => storage.clear('foo'))
    })
  })

  describe('refresh', async () => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should start a new storage', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10, ['fooers'])

      await storage.refresh()

      assert.equal(await storage.store.dbsize(), 0)
    })

    test('should not throw on error', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 2 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.refresh error')
          }
        }
      })

      doesNotThrow(() => storage.refresh())
    })
  })

  describe('clearReferences', async () => {
    test('should clear keys references', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      await storage.set('a', 1, 10, ['fooers', 'vowels', 'empty'])
      await storage.set('b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('d', 1, 10, ['consonantes'])
      await storage.set('e', 1, 10, ['vowels'])

      await storage.clearReferences(['a', 'b', 'c', 'd', 'e'])

      assert.equal((await storage.store.smembers('r:fooers')).length, 0)
      assert.equal((await storage.store.smembers('r:empty')).length, 0)
      assert.equal((await storage.store.smembers('r:vowels')).length, 0)
      assert.equal((await storage.store.smembers('r:consonantes')).length, 0)
    })

    test('should clear a key references when expires', async (t) => {
      const storage = createStorage('redis', { client: redisClient })
      const ttl = 1
      await storage.set('ttl-a', -1, ttl, ['1', '2', '3'])
      await storage.set('ttl-b', -1, ttl, ['1', '4'])
      await storage.set('ttl-c', -1, ttl, ['1', '4'])
      await storage.set('ttl-d', -1, ttl, ['4'])
      await storage.set('ttl-e', -1, ttl, ['2'])

      await sleep(ttl * 1000 + 500)

      assert.equal((await storage.store.smembers('r:1')).length, 0)
      assert.equal((await storage.store.smembers('r:2')).length, 0)
      assert.equal((await storage.store.smembers('r:3')).length, 0)
      assert.equal((await storage.store.smembers('r:4')).length, 0)
    })

    test('should get a warning calling with empty key', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          warn: (error) => {
            equal(error.msg, 'acd/storage/redis.clearReferences invalid call due to empty key')
          }
        }
      })

      storage.clearReferences('')
    })

    test('should not throw on error', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 2 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.clearReferences error')
          }
        }
      })

      doesNotThrow(() => storage.clearReferences('the-key'))
    })
  })

  describe('gc', async () => {
    test('should get a warning calling on disabled invalidation', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const storage = createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          warn: (error) => {
            equal(error.msg, 'acd/storage/redis.gc does not run due to invalidation is disabled')
          }
        }
      })

      storage.gc()
    })

    test('should not throw on error', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 2 })

      const storage = createStorage('redis', {
        client: {},
        invalidation: true,
        log: {
          debug: () => { },
          warn: () => { },
          error: (error) => {
            equal(error.msg, 'acd/storage/redis.gc error')
          }
        }
      })

      doesNotThrow(() => storage.gc())
    })

    test('should not throw on invalid options, chunk', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 2 })

      const storage = createStorage('redis', { client: {}, invalidation: true })

      doesNotThrow(async () => {
        const report = await storage.gc('zzz', { chunk: -1 })
        equal(report.error.message, 'chunk must be a positive integer greater than 1')
      })
    })

    test('should not throw on invalid options, lazy.chunk', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 2 })

      const storage = createStorage('redis', { client: {}, invalidation: true })

      doesNotThrow(async () => {
        const report = await storage.gc('zzz', { lazy: { chunk: -1 } })
        equal(report.error.message, 'lazy.chunk must be a positive integer greater than 1')
      })
    })

    test('should not throw on invalid options, lazy.cursor', async (t) => {
      const { equal, doesNotThrow } = tspl(t, { plan: 2 })

      const storage = createStorage('redis', { client: {}, invalidation: true })

      doesNotThrow(async () => {
        const report = await storage.gc('zzz', { lazy: { cursor: -1 } })
        equal(report.error.message, 'lazy.cursor must be a positive integer greater than 0')
      })
    })

    test('should get error in report', async (t) => {
      const storage = createStorage('redis', {
        client: {},
        invalidation: true
      })

      assert.ok((await storage.gc()).error instanceof Error)
    })

    describe('strict mode', async () => {
      beforeEach(async () => {
        await redisClient.flushall()
      })

      test('should remove expired keys references', async (t) => {
        const storage = createStorage('redis', { client: redisClient, invalidation: true })
        await storage.set('a', 'value', 1, ['fooers', 'vowels', 'empty'])
        await storage.set('b', 'value', 1, ['fooers', 'consonantes'])
        await storage.set('c', 'value', 1, ['fooers', 'consonantes'])
        await storage.set('d', 'value', 1, ['consonantes'])
        await storage.set('e', 'value', 9, ['vowels'])

        await sleep(1500)

        await storage.gc('strict')

        assert.deepStrictEqual(await storage.store.smembers('k:e'), ['vowels'])
        assert.equal((await storage.store.smembers('k:a')).length, 0)
        assert.equal((await storage.store.smembers('k:b')).length, 0)
        assert.equal((await storage.store.smembers('k:c')).length, 0)
        assert.equal((await storage.store.smembers('k:d')).length, 0)

        assert.deepStrictEqual((await storage.store.smembers('r:vowels')), ['e'])
        assert.equal(await storage.store.exists('r:fooers'), 0)
        assert.equal(await storage.store.exists('r:empty'), 0)
        assert.equal(await storage.store.exists('r:consonantes'), 0)
      })

      test('should run a gc without cleaning', async (t) => {
        const storage = createStorage('redis', { client: redisClient, invalidation: true })
        await storage.set('a', 'value', 60, ['fooers', 'vowels', 'empty'])
        await storage.set('b', 'value', 60, ['fooers', 'consonantes'])
        await storage.set('c', 'value', 60, ['fooers', 'consonantes'])
        await storage.set('d', 'value', 60, ['consonantes'])
        await storage.set('e', 'value', 60, ['vowels'])

        await sleep(500)

        await storage.gc('strict')

        assertInclude(t, await storage.store.smembers('k:a'), ['fooers', 'vowels', 'empty'])
        assertInclude(t, await storage.store.smembers('k:b'), ['fooers', 'consonantes'])
        assertInclude(t, await storage.store.smembers('k:c'), ['fooers', 'consonantes'])
        assert.deepStrictEqual(await storage.store.smembers('k:d'), ['consonantes'])
        assert.deepStrictEqual(await storage.store.smembers('k:e'), ['vowels'])

        assertInclude(t, await storage.store.smembers('r:vowels'), ['a', 'e'])
        assertInclude(t, await storage.store.smembers('r:fooers'), ['a', 'b', 'c'])
        assertInclude(t, await storage.store.smembers('r:consonantes'), ['b', 'c', 'd'])
        assert.deepStrictEqual(await storage.store.smembers('r:empty'), ['a'])
      })

      test('should get stats on full gc', async (t) => {
        const storage = createStorage('redis', { client: redisClient, invalidation: true })
        for (let i = 0; i < 100; i++) {
          const references = ['keys', `key${i}`]
          if (i % 2) {
            references.push('odds')
          } else {
            references.push('evens')
          }
          await storage.set(`key${i}`, 'value', 1, references)
        }

        await sleep(1500)

        const report = await storage.gc('strict', { chunk: 10 })

        assert.equal(report.references.scanned.length, 103)
        assert.equal(report.references.removed.length, 103)
        assert.equal(report.keys.scanned.length, 100)
        assert.equal(report.keys.removed.length, 100)
        assert.equal(report.cursor, 0)
        assert.ok(report.loops > 2)
        assert.equal(report.error, null)
      })

      test('should run on an empty storage', async (t) => {
        const storage = createStorage('redis', { client: redisClient, invalidation: true })

        const report = await storage.gc('strict', { chunk: 10 })

        assert.equal(report.references.scanned.length, 0)
        assert.equal(report.references.removed.length, 0)
        assert.equal(report.keys.scanned.length, 0)
        assert.equal(report.keys.removed.length, 0)
        assert.equal(report.cursor, 0)
        assert.ok(report.loops > 0)
        assert.equal(report.error, null)
      })
    })

    describe('lazy mode', async () => {
      beforeEach(async () => {
        await redisClient.flushall()
      })

      test('should run on an empty storage', async (t) => {
        const storage = createStorage('redis', { client: redisClient, invalidation: true })

        const report = await storage.gc('lazy')

        assert.equal(report.references.scanned.length, 0)
        assert.equal(report.references.removed.length, 0)
        assert.equal(report.keys.scanned.length, 0)
        assert.equal(report.keys.removed.length, 0)
        assert.equal(report.cursor, 0)
        assert.ok(report.loops > 0)
        assert.equal(report.error, null)
      })

      test('should get stats on lazy run', async (t) => {
        const storage = new StorageRedis({ client: redisClient, invalidation: true })

        for (let i = 0; i < 100; i++) {
          const references = ['keys', `key${i}`]
          if (i % 2) {
            references.push('odds')
          } else {
            references.push('evens')
          }
          await storage.set(`key${i}`, 'value', 1, references)
        }

        await sleep(1500)
        const chunk = 20

        const report = await storage.gc('lazy', { lazy: { chunk } })

        assert.ok(report.references.scanned.length > 1)
        assert.ok(report.references.removed.length > 1)
        assert.ok(report.keys.scanned.length > 1)
        assert.ok(report.keys.removed.length > 1)
        assert.ok(report.cursor > 1)
        assert.ok(report.loops > 0)
        assert.equal(report.error, null)
      })

      test('should clean the whole storage in some cycles', async (t) => {
        const storage = new StorageRedis({ client: redisClient, invalidation: true })

        for (let i = 0; i < 100; i++) {
          const references = ['keys', `key${i}`]
          if (i % 2) {
            references.push('odds')
          } else {
            references.push('evens')
          }
          await storage.set(`key${i}`, 'value', 1, references)
        }

        await sleep(1500)

        let cursor
        for (let i = 0; i < 10; i++) {
          const report = await storage.gc('lazy', { lazy: { chunk: 20, cursor } })
          cursor = report.cursor
        }

        assert.equal((await storage.store.keys('*')).length, 0)
      })
    })
  })

  describe('getTTL', async () => {
    test('should get the TTL of a previously key stored', async (t) => {
      t.after(async () => {
        await redisClient.flushall()
      })

      const storage = new StorageRedis({ client: redisClient, invalidation: false })

      storage.set('foo', 'bar', 100)

      assert.equal(await storage.getTTL('foo'), 100)

      await sleep(1000)

      assert.equal(await storage.getTTL('foo'), 99)
    })

    test('should get the TTL of a a key without TTL', async (t) => {
      t.after(async () => {
        await redisClient.flushall()
      })

      const storage = new StorageRedis({ client: redisClient, invalidation: false })

      storage.set('foo', 'bar', 0)

      assert.equal(await storage.getTTL('foo'), 0)
    })

    test('should get the TTL of a previously key stored', async (t) => {
      t.after(async () => {
        await redisClient.flushall()
      })

      const storage = new StorageRedis({ client: redisClient, invalidation: false })

      storage.set('foo', 'bar', 1)

      assert.equal(await storage.getTTL('foo'), 1)

      await sleep(1000)

      assert.equal(await storage.getTTL('foo'), 0)
    })

    test('no key', async (t) => {
      const storage = new StorageRedis({ client: redisClient, invalidation: false })

      assert.equal(await storage.getTTL('foo'), 0)
    })
  })

  test('should throw if is not server side and storage is redis', async (t) => {
    const createStorage = proxyquire('../src/storage/index.js', {
      '../util': { isServerSide: false }
    })

    assert.throws(() => createStorage('redis', { client: redisClient }), {
      message: 'Redis storage is not supported in the browser'
    })
  })
})
