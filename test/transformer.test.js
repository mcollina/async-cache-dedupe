'use strict'

const { test, before, teardown } = require('tap')
const Redis = require('ioredis')

const createStorage = require('../src/storage')
const { Cache } = require('../')

let redisClient
before(async (t) => {
  redisClient = new Redis()
})

teardown(async (t) => {
  await redisClient.quit()
})

test('should handle a custom transformer to store and get data per cache', async function (t) {
  const cache = new Cache({
    ttl: 1000,
    storage: createStorage(),
    transformer: {
      serialize: (value) => {
        t.pass('serialize called')
        return JSON.stringify(value)
      },
      deserialize: (value) => {
        t.pass('deserialize called')
        return JSON.parse(value)
      }
    }
  })

  cache.define('fetchSomething', async (query, cacheKey) => {
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })
  t.same(await cache.fetchSomething(42), { k: 42 })
})

test('should handle a custom transformer to store and get data per define', async function (t) {
  const cache = new Cache({
    storage: createStorage()
  })

  cache.define('fetchSomething', {
    ttl: 1000,
    transformer: {
      serialize: (value) => {
        t.pass('serialize called')
        return JSON.stringify(value)
      },
      deserialize: (value) => {
        t.pass('deserialize called')
        return JSON.parse(value)
      }
    }
  }, async (query, cacheKey) => {
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })
  t.same(await cache.fetchSomething(42), { k: 42 })
})

test('should handle a custom transformer and references function to store and get data per cache', async function (t) {
  const cache = new Cache({
    ttl: 1000,
    storage: createStorage(),
    transformer: {
      serialize: (value) => {
        t.pass('serialize called')
        return JSON.stringify(value)
      },
      deserialize: (value) => {
        t.pass('deserialize called')
        return JSON.parse(value)
      }
    }
  })

  cache.define('fetchSomething', {
    references: (args, key, result) => {
      t.pass('references called')
      return ['some-reference']
    }
  }, async (query, cacheKey) => {
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })
  t.same(await cache.fetchSomething(42), { k: 42 })
})

test('should handle a custom transformer and references function to store and get data per define', async function (t) {
  const cache = new Cache({
    storage: createStorage()
  })

  cache.define('fetchSomething', {
    ttl: 1000,
    references: (args, key, result) => {
      t.pass('references called')
      return ['some-reference']
    },
    transformer: {
      serialize: (value) => {
        t.pass('serialize called')
        return JSON.stringify(value)
      },
      deserialize: (value) => {
        t.pass('deserialize called')
        return JSON.parse(value)
      }
    }
  }, async (query, cacheKey) => {
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })
  t.same(await cache.fetchSomething(42), { k: 42 })
})
