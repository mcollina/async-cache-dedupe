'use strict'

const { describe, test, before, after } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const Redis = require('ioredis')
const stringify = require('safe-stable-stringify')

const { kValues, kStorage } = require('../src/symbol')
const createStorage = require('../src/storage')
const { Cache, createCache } = require('../')

const dummyStorage = {
  async get (key) { },
  async set (key, value, ttl, references) { },
  async remove (key) { },
  async invalidate (references) { },
  async clear () { },
  async refresh () { }
}

let redisClient

describe('base', async () => {
  before(async () => {
    redisClient = new Redis()
  })

  after(async () => {
    await redisClient.quit()
  })

  test('create a Cache that dedupes', async (t) => {
    const { deepStrictEqual, equal } = tspl(t, { plan: 6 })

    let dedupes = 0
    const cache = new Cache({
      storage: dummyStorage,
      onDedupe () {
        dedupes++
      }
    })

    const expected = [42, 24]

    cache.define('fetchSomething', async (value, key) => {
      equal(value, expected.shift())
      equal(stringify(value), key)
      return { k: value }
    })

    const p1 = cache.fetchSomething(42)
    const p2 = cache.fetchSomething(24)
    const p3 = cache.fetchSomething(42)

    const res = await Promise.all([p1, p2, p3])

    deepStrictEqual(res, [
      { k: 42 },
      { k: 24 },
      { k: 42 }
    ])
    equal(dedupes, 1)
  })

  test('create a Cache that dedupes full signature', async (t) => {
    const { deepStrictEqual, equal } = tspl(t, { plan: 3 })

    const cache = new Cache({ storage: dummyStorage })

    const expected = [42, 24]

    cache.define('fetchSomething', undefined, async (query) => {
      equal(query, expected.shift())
      return { k: query }
    })

    const p1 = cache.fetchSomething(42)
    const p2 = cache.fetchSomething(24)
    const p3 = cache.fetchSomething(42)

    const res = await Promise.all([p1, p2, p3])

    deepStrictEqual(res, [
      { k: 42 },
      { k: 24 },
      { k: 42 }
    ])
  })

  test('create a cache with the factory function, default options', async t => {
    const cache = createCache()

    assert.ok(cache[kStorage])

    cache.define('plusOne', async (value, key) => value + 1)

    assert.equal(await cache.plusOne(42), 43)
    assert.equal(await cache.plusOne(24), 25)
    assert.equal(await cache.plusOne(42), 43)
  })

  test('create a cache with the factory function, with default storage', async t => {
    let hits = 0
    const cache = createCache({
      ttl: 1,
      onHit () { hits++ }
    })

    assert.ok(cache[kStorage].get)
    assert.ok(cache[kStorage].set)

    cache.define('plusOne', async (value, key) => value + 1)

    assert.equal(await cache.plusOne(42), 43)
    assert.equal(await cache.plusOne(24), 25)
    assert.equal(await cache.plusOne(42), 43)

    assert.equal(hits, 1)
  })

  test('create a cache with the factory function, with storage', async t => {
    let hits = 0
    const cache = createCache({
      ttl: 1,
      storage: { type: 'memory', options: { size: 9 } },
      onHit () { hits++ }
    })

    assert.equal(cache[kStorage].size, 9)

    cache.define('plusOne', async (value, key) => value + 1)

    assert.equal(await cache.plusOne(42), 43)
    assert.equal(await cache.plusOne(24), 25)
    assert.equal(await cache.plusOne(42), 43)

    assert.equal(hits, 1)
  })

  test('missing function', async (t) => {
    const cache = new Cache({ storage: createStorage() })
    assert.throws(function () {
      cache.define('something', null)
    })
    assert.throws(function () {
      cache.define('something', 42)
    })
    assert.throws(function () {
      cache.define('something', 'a string')
    })
  })

  test('works with custom serialize', async (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 3 })

    const cache = new Cache({ storage: createStorage() })

    cache.define(
      'fetchSomething',
      {
        serialize (args) { return args.k }
      },
      async (queries) => {
        return queries
      }
    )

    const p1 = cache.fetchSomething({ k: 42 })
    const p2 = cache.fetchSomething({ k: 24 })

    deepStrictEqual([...cache[kValues].fetchSomething.dedupes.keys()], ['42', '24'])
    const res = await Promise.all([p1, p2])

    deepStrictEqual(res, [
      { k: 42 },
      { k: 24 }
    ])

    // Ensure we clean up dedupes
    deepStrictEqual([...cache[kValues].fetchSomething.dedupes.keys()], [])
  })

  describe('constructor - options', async () => {
    test('missing storage', async () => {
      assert.throws(function () {
        // eslint-disable-next-line no-new
        new Cache()
      })
    })

    test('invalid ttl', async () => {
      assert.throws(function () {
        // eslint-disable-next-line no-new
        new Cache({ storage: createStorage(), ttl: -1 })
      })
    })

    test('invalid onDedupe', async () => {
      assert.throws(function () {
        // eslint-disable-next-line no-new
        new Cache({ storage: createStorage(), onDedupe: -1 })
      })
    })

    test('invalid onError', async () => {
      assert.throws(function () {
        // eslint-disable-next-line no-new
        new Cache({ storage: createStorage(), onError: {} })
      })
    })

    test('invalid onHit', async () => {
      assert.throws(function () {
        // eslint-disable-next-line no-new
        new Cache({ storage: createStorage(), onHit: -1 })
      })
    })

    test('invalid onMiss', async () => {
      assert.throws(function () {
        // eslint-disable-next-line no-new
        new Cache({ storage: createStorage(), onMiss: -1 })
      })
    })
  })

  describe('define - options', async () => {
    test('wrong serialize', async () => {
      const cache = new Cache({ storage: createStorage() })
      assert.throws(function () {
        cache.define('something', {
          serialize: 42
        }, async () => { })
      })
    })

    test('wrong references', async () => {
      const cache = new Cache({ storage: createStorage() })
      assert.throws(function () {
        cache.define('something', {
          references: 42
        }, async () => { })
      })
    })

    test('custom storage', async () => {
      const cache = new Cache({ storage: createStorage() })
      cache.define('foo', {
        storage: { type: 'memory', options: { size: 9 } }
      }, () => true)

      assert.ok(cache.foo())
    })
  })

  test('safe stable serialize', async (t) => {
    const { deepStrictEqual, equal } = tspl(t, { plan: 5 })

    const cache = new Cache({ storage: createStorage() })

    const expected = [
      { foo: 'bar', bar: 'foo' },
      { hello: 'world' }
    ]

    cache.define('fetchSomething', async (query, cacheKey) => {
      deepStrictEqual(query, expected.shift())
      equal(stringify(query), cacheKey)

      return { k: query }
    })

    const p1 = cache.fetchSomething({ foo: 'bar', bar: 'foo' })
    const p2 = cache.fetchSomething({ hello: 'world' })
    const p3 = cache.fetchSomething({ bar: 'foo', foo: 'bar' })

    const res = await Promise.all([p1, p2, p3])

    deepStrictEqual(res, [
      { k: { foo: 'bar', bar: 'foo' } },
      { k: { hello: 'world' } },
      { k: { foo: 'bar', bar: 'foo' } }
    ])
  })

  test('strings', async (t) => {
    const { deepStrictEqual, equal } = tspl(t, { plan: 3 })

    const cache = new Cache({ storage: createStorage() })

    const expected = ['42', '24']

    cache.define('fetchSomething', async (query) => {
      equal(query, expected.shift())
      return { k: query }
    })

    const p1 = cache.fetchSomething('42')
    const p2 = cache.fetchSomething('24')
    const p3 = cache.fetchSomething('42')

    const res = await Promise.all([p1, p2, p3])

    deepStrictEqual(res, [
      { k: '42' },
      { k: '24' },
      { k: '42' }
    ])
  })

  test('do not cache failures', async (t) => {
    const { deepStrictEqual, ok, rejects } = tspl(t, { plan: 4 })

    const cache = new Cache({ storage: createStorage() })

    let called = false
    cache.define('fetchSomething', async (query) => {
      ok('called')
      if (!called) {
        called = true
        throw new Error('kaboom')
      }
      return { k: query }
    })

    await rejects(cache.fetchSomething(42))
    deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  })

  test('do not cache failures async', async (t) => {
    const { ok, rejects, deepStrictEqual } = tspl(t, { plan: 5 })

    const storage = createStorage()
    storage.remove = async () => {
      ok('async remove called')
      throw new Error('kaboom')
    }
    const cache = new Cache({ storage })

    let called = false
    cache.define('fetchSomething', async (query) => {
      ok('called')
      if (!called) {
        called = true
        throw new Error('kaboom')
      }
      return { k: query }
    })

    await rejects(cache.fetchSomething(42))
    deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  })

  test('clear the full cache', async (t) => {
    const { ok, deepStrictEqual } = tspl(t, { plan: 7 })

    const cache = new Cache({ ttl: 1, storage: createStorage() })

    cache.define('fetchA', async (query) => {
      ok('a called')
      return { k: query }
    })

    cache.define('fetchB', async (query) => {
      ok('b called')
      return { j: query }
    })

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    await cache.clear()

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])
  })

  test('clears only one method', async (t) => {
    const { ok, deepStrictEqual } = tspl(t, { plan: 6 })

    const cache = new Cache({ ttl: 1, storage: createStorage() })

    cache.define('fetchA', async (query) => {
      ok('a called')
      return { k: query }
    })

    cache.define('fetchB', async (query) => {
      ok('b called')
      return { j: query }
    })

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    await cache.clear('fetchA')

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])
  })

  test('clears only one method with one value', async (t) => {
    const { ok, deepStrictEqual } = tspl(t, { plan: 5 })

    const cache = new Cache({ ttl: 10, storage: createStorage() })

    cache.define('fetchA', async (query) => {
      ok('a called')
      return { k: query }
    })

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchA(24)
    ]), [
      { k: 42 },
      { k: 24 }
    ])

    await cache.clear('fetchA', 42)

    deepStrictEqual(await Promise.all([
      cache.fetchA(42),
      cache.fetchA(24)
    ]), [
      { k: 42 },
      { k: 24 }
    ])
  })

  test('throws for methods in the property chain', async function (t) {
    const cache = new Cache({ storage: createStorage() })

    const keys = [
      'toString',
      'hasOwnProperty',
      'define',
      'clear'
    ]

    for (const key of keys) {
      assert.throws(() => {
        cache.define(key, () => { })
      })
    }
  })

  test('should cache with references', async function (t) {
    const { ok } = tspl(t, { plan: 1 })

    const cache = new Cache({ ttl: 60, storage: createStorage() })

    cache.define('run', {
      references: (args, key, result) => {
        ok('references called')
        return ['some-reference']
      }
    }, () => 'something')

    await cache.run(1)
  })

  test('should handle references function (sync) throwing an error', async function (t) {
    const { equal } = tspl(t, { plan: 4 })

    const cache = new Cache({ ttl: 60, storage: createStorage() })

    cache.define('references', {
      onError: (err) => { equal(err.message, 'boom') },
      references: (args, key, result) => { throw new Error('boom') }
    }, () => 'the-result')

    equal(await cache.references(1), 'the-result')
    equal(await cache.references(1), 'the-result')
  })

  test('should handle references function (async) throwing an error', async function (t) {
    const { equal } = tspl(t, { plan: 4 })

    const cache = new Cache({ ttl: 60, storage: createStorage() })

    cache.define('references', {
      onError: (err) => { equal(err.message, 'boom') },
      references: async (args, key, result) => { throw new Error('boom') }
    }, () => 'the-result')

    equal(await cache.references(1), 'the-result')
    equal(await cache.references(1), 'the-result')
  })

  test('should cache with async references', async function (t) {
    const { ok } = tspl(t, { plan: 1 })

    const cache = new Cache({ ttl: 60, storage: createStorage() })

    cache.define('run', {
      references: async (args, key, result) => {
        ok('references called')
        return ['some-reference']
      }
    }, () => 'something')

    await cache.run(1)
  })

  test('should cache with async storage (redis)', async function () {
    const cache = new Cache({ ttl: 60, storage: createStorage('redis', { client: redisClient }) })
    cache.define('run', () => 'something')
    await cache.run(1)

    assert.deepStrictEqual(await cache.run(2), 'something')
  })

  test('automatically expires with no TTL', async (t) => {
    // plan verifies that fetchSomething is called only once
    const { deepStrictEqual, equal } = tspl(t, { plan: 10 })

    let dedupes = 0
    const cache = new Cache({
      storage: createStorage(),
      onDedupe () {
        dedupes++
      }
    })

    const expected = [42, 24, 42]

    cache.define('fetchSomething', async (query, cacheKey) => {
      deepStrictEqual(query, expected.shift())
      equal(stringify(query), cacheKey)
      return { k: query }
    })

    const p1 = cache.fetchSomething(42)
    const p2 = cache.fetchSomething(24)
    const p3 = cache.fetchSomething(42)

    const res = await Promise.all([p1, p2, p3])

    deepStrictEqual(res, [
      { k: 42 },
      { k: 24 },
      { k: 42 }
    ])
    equal(dedupes, 1)

    deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
    equal(dedupes, 1)
  })

  test('calls onError listener', async (t) => {
    const { equal } = tspl(t, { plan: 2 })

    let onError

    const promise = new Promise((resolve, reject) => {
      onError = reject
    })

    const cache = new Cache({ storage: createStorage(), onError })

    cache.define('willDefinitelyWork', async (query, cacheKey) => {
      throw new Error('whoops')
    })

    try {
      await cache.willDefinitelyWork(42)
      throw new Error('Should throw')
    } catch (err) {
      equal(err.message, 'whoops')
    }

    try {
      await promise
      throw new Error('Should throw')
    } catch (err) {
      equal(err.message, 'whoops')
    }
  })

  test('should call onError when serialize throws exception', async (t) => {
    const { equal } = tspl(t, { plan: 1 })

    const serialize = () => {
      throw new Error('error serializing')
    }

    const onError = err => equal(err.message, 'error serializing')

    const cache = new Cache({ storage: createStorage(), onError })
    cache.define('serializeWithError', { serialize }, async k => k)

    await cache.serializeWithError(1)
  })
})
