'use strict'

const { test, describe, after, before } = require('node:test')
const assert = require('assert')
const Redis = require('ioredis')

const createStorage = require('../src/storage')
const { Cache } = require('../')

let redisClient

describe('transformer', async function () {
  before(async () => {
    redisClient = new Redis()
  })

  after(async () => {
    await redisClient.quit()
  })

  test('should handle a custom transformer to store and get data per cache', async function (t) {
    const cache = new Cache({
      ttl: 1000,
      storage: createStorage(),
      transformer: {
        serialize: (value) => {
          assert.ok('serialize called')
          return JSON.stringify(value)
        },
        deserialize: (value) => {
          assert.ok('deserialize called')
          return JSON.parse(value)
        }
      }
    })

    cache.define('fetchSomething', async (query, cacheKey) => {
      return { k: query }
    })

    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  })

  test('should handle a custom transformer to store and get data per define', async function (t) {
    const cache = new Cache({
      storage: createStorage()
    })

    cache.define('fetchSomething', {
      ttl: 1000,
      transformer: {
        serialize: (value) => {
          assert.ok('serialize called')
          return JSON.stringify(value)
        },
        deserialize: (value) => {
          assert.ok('deserialize called')
          return JSON.parse(value)
        }
      }
    }, async (query, cacheKey) => {
      return { k: query }
    })

    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  })

  test('should handle a custom transformer and references function to store and get data per cache', async function (t) {
    const cache = new Cache({
      ttl: 1000,
      storage: createStorage(),
      transformer: {
        serialize: (value) => {
          assert.ok('serialize called')
          return JSON.stringify(value)
        },
        deserialize: (value) => {
          assert.ok('deserialize called')
          return JSON.parse(value)
        }
      }
    })

    cache.define('fetchSomething', {
      references: (args, key, result) => {
        assert.ok('references called')
        return ['some-reference']
      }
    }, async (query, cacheKey) => {
      return { k: query }
    })

    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  })

  test('should handle a custom transformer and references function to store and get data per define', async function (t) {
    const cache = new Cache({
      storage: createStorage()
    })

    cache.define('fetchSomething', {
      ttl: 1000,
      references: (args, key, result) => {
        assert.ok('references called')
        return ['some-reference']
      },
      transformer: {
        serialize: (value) => {
          assert.ok('serialize called')
          return JSON.stringify(value)
        },
        deserialize: (value) => {
          assert.ok('deserialize called')
          return JSON.parse(value)
        }
      }
    }, async (query, cacheKey) => {
      return { k: query }
    })

    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
    assert.deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  })
})
