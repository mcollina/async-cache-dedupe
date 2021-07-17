'use strict'

const t = require('tap')
const { Cache } = require('..')
const { promisify } = require('util')

const sleep = promisify(setTimeout)

const { test } = t

t.jobs = 3

test('ttl', async (t) => {
  t.plan(5)

  const cache = new Cache({
    ttl: 1 // seconds
  })

  cache.define('fetchSomething', async (query) => {
    t.equal(query, 42)
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })
  t.same(await cache.fetchSomething(42), { k: 42 })

  await sleep(2500)

  t.same(await cache.fetchSomething(42), { k: 42 })
})

test('ttl expires', async (t) => {
  t.plan(5)

  const cache = new Cache({
    ttl: 2 // seconds
  })

  cache.define('fetchSomething', async (query) => {
    t.equal(query, 42)
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })

  await sleep(1000)

  t.same(await cache.fetchSomething(42), { k: 42 })

  await sleep(3000)

  t.same(await cache.fetchSomething(42), { k: 42 })
})
