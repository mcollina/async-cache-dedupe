'use strict'

const { test } = require('tap')
const { Cache } = require('..')
const stringify = require('safe-stable-stringify')

const { kValues } = require('../symbol')
const createStorage = require('../storage')

const dummyStorage = {
  async get (key) { },
  async set (key, value, ttl, references) { },
  async remove (key) { },
  async invalidate (references) { },
  async clear () { },
  async refresh () { }
}

test('create a Cache that dedupes', async (t) => {
  t.plan(6)

  let dedupes = 0
  const cache = new Cache({
    storage: dummyStorage,
    onDedupe () {
      dedupes++
    }
  })

  const expected = [42, 24]

  cache.define('fetchSomething', async (value, key) => {
    t.equal(value, expected.shift())
    t.equal(stringify(value), key)
    return { k: value }
  })

  const p1 = cache.fetchSomething(42)
  const p2 = cache.fetchSomething(24)
  const p3 = cache.fetchSomething(42)

  const res = await Promise.all([p1, p2, p3])

  t.same(res, [
    { k: 42 },
    { k: 24 },
    { k: 42 }
  ])
  t.equal(dedupes, 1)
})

test('create a Cache that dedupes full signature', async (t) => {
  t.plan(3)

  const cache = new Cache({ storage: dummyStorage })

  const expected = [42, 24]

  cache.define('fetchSomething', undefined, async (query) => {
    t.equal(query, expected.shift())
    return { k: query }
  })

  const p1 = cache.fetchSomething(42)
  const p2 = cache.fetchSomething(24)
  const p3 = cache.fetchSomething(42)

  const res = await Promise.all([p1, p2, p3])

  t.same(res, [
    { k: 42 },
    { k: 24 },
    { k: 42 }
  ])
})

test('missing function', async (t) => {
  const cache = new Cache({ storage: createStorage() })
  t.throws(function () {
    cache.define('something', null)
  })
  t.throws(function () {
    cache.define('something', 42)
  })
  t.throws(function () {
    cache.define('something', 'a string')
  })
})

test('works with custom serialize', async (t) => {
  t.plan(2)

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

  const res = await Promise.all([p1, p2])

  t.same(res, [
    { k: 42 },
    { k: 24 }
  ])

  t.same([...cache[kValues].fetchSomething.dedupes.keys()], ['42', '24'])
})

test('constructor - options', async (t) => {
  test('missing storage', async (t) => {
    t.throws(function () {
      // eslint-disable-next-line no-new
      new Cache()
    })
  })
})

test('define - options', async (t) => {
  test('wrong serialize', async (t) => {
    const cache = new Cache({ storage: createStorage() })
    t.throws(function () {
      cache.define('something', {
        serialize: 42
      }, async () => { })
    })
  })

  test('wrong references', async (t) => {
    const cache = new Cache({ storage: createStorage() })
    t.throws(function () {
      cache.define('something', {
        references: 42
      }, async () => { })
    })
  })
})

test('safe stable serialize', async (t) => {
  t.plan(5)

  const cache = new Cache({ storage: createStorage() })

  const expected = [
    { foo: 'bar', bar: 'foo' },
    { hello: 'world' }
  ]

  cache.define('fetchSomething', async (query, cacheKey) => {
    t.same(query, expected.shift())
    t.equal(stringify(query), cacheKey)

    return { k: query }
  })

  const p1 = cache.fetchSomething({ foo: 'bar', bar: 'foo' })
  const p2 = cache.fetchSomething({ hello: 'world' })
  const p3 = cache.fetchSomething({ bar: 'foo', foo: 'bar' })

  const res = await Promise.all([p1, p2, p3])

  t.same(res, [
    { k: { foo: 'bar', bar: 'foo' } },
    { k: { hello: 'world' } },
    { k: { foo: 'bar', bar: 'foo' } }
  ])
})

test('strings', async (t) => {
  t.plan(3)

  const cache = new Cache({ storage: createStorage() })

  const expected = ['42', '24']

  cache.define('fetchSomething', async (query) => {
    t.equal(query, expected.shift())
    return { k: query }
  })

  const p1 = cache.fetchSomething('42')
  const p2 = cache.fetchSomething('24')
  const p3 = cache.fetchSomething('42')

  const res = await Promise.all([p1, p2, p3])

  t.same(res, [
    { k: '42' },
    { k: '24' },
    { k: '42' }
  ])
})

test('do not cache failures', async (t) => {
  t.plan(4)

  const cache = new Cache({ storage: createStorage() })

  let called = false
  cache.define('fetchSomething', async (query) => {
    t.pass('called')
    if (!called) {
      called = true
      throw new Error('kaboom')
    }
    return { k: query }
  })

  await t.rejects(cache.fetchSomething(42))
  t.same(await cache.fetchSomething(42), { k: 42 })
})

test('clear the full cache', async (t) => {
  t.plan(7)

  const cache = new Cache({ ttl: 1, storage: createStorage() })

  cache.define('fetchA', async (query) => {
    t.pass('a called')
    return { k: query }
  })

  cache.define('fetchB', async (query) => {
    t.pass('b called')
    return { j: query }
  })

  t.same(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  t.same(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  await cache.clear()

  t.same(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])
})

test('clears only one method', async (t) => {
  t.plan(6)

  const cache = new Cache({ ttl: 1, storage: createStorage() })

  cache.define('fetchA', async (query) => {
    t.pass('a called')
    return { k: query }
  })

  cache.define('fetchB', async (query) => {
    t.pass('b called')
    return { j: query }
  })

  t.same(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  t.same(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  await cache.clear('fetchA')

  t.same(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])
})

test('clears only one method with one value', async (t) => {
  t.plan(5)

  const cache = new Cache({ ttl: 10, storage: createStorage() })

  cache.define('fetchA', async (query) => {
    t.pass('a called')
    return { k: query }
  })

  t.same(await Promise.all([
    cache.fetchA(42),
    cache.fetchA(24)
  ]), [
    { k: 42 },
    { k: 24 }
  ])

  await cache.clear('fetchA', 42)

  t.same(await Promise.all([
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
    t.throws(() => {
      cache.define(key, () => { })
    })
  }
})

test('should cache with references', async function (t) {
  t.plan(1)

  const cache = new Cache({ ttl: 60, storage: createStorage() })

  cache.define('run', {
    references: (args, key, result) => {
      t.pass('references called')
      return ['some-reference']
    }
  }, () => 'something')

  await cache.run(1)
})

test('automatically expires with no TTL', async (t) => {
  // plan verifies that fetchSomething is called only once
  t.plan(10)

  let dedupes = 0
  const cache = new Cache({
    storage: createStorage(),
    onDedupe () {
      dedupes++
    }
  })

  const expected = [42, 24, 42]

  cache.define('fetchSomething', async (query, cacheKey) => {
    t.equal(query, expected.shift())
    t.equal(stringify(query), cacheKey)
    return { k: query }
  })

  const p1 = cache.fetchSomething(42)
  const p2 = cache.fetchSomething(24)
  const p3 = cache.fetchSomething(42)

  const res = await Promise.all([p1, p2, p3])

  t.same(res, [
    { k: 42 },
    { k: 24 },
    { k: 42 }
  ])
  t.equal(dedupes, 1)

  t.same(await cache.fetchSomething(42), { k: 42 })
  t.equal(dedupes, 1)
})
