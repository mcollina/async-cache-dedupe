'use strict'

const { describe, test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { Cache } = require('../src/cache')
const createStorage = require('../src/storage')
const { kValues } = require('../src/symbol')

test('clear the full cache', async (t) => {
  const { ok, deepStrictEqual } = tspl(t, { plan: 7 })

  const cache = new Cache({ ttl: 42, storage: createStorage() })

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

  cache.clear()

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

  const cache = new Cache({ ttl: 42, storage: createStorage() })

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

  cache.clear('fetchA')

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

  const cache = new Cache({ ttl: 42, storage: createStorage() })

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

  cache.clear('fetchA', 42)

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchA(24)
  ]), [
    { k: 42 },
    { k: 24 }
  ])
})

describe('clear should cleanup dedupes and staleDedupes', async () => {
  test('should clear dedupes and staleDedupes for specific function and key', async (t) => {
    const { ok } = tspl(t, { plan: 10 })

    const cache = new Cache({ ttl: 42, storage: createStorage(), })

    cache.define('test1', async () => {})
    cache.define('test2', async () => {})

    // Populate dedupes and staleDedupes artificially
    const wrapper1 = cache[kValues].test1
    const wrapper2 = cache[kValues].test2

    // Add some entries to dedupes
    wrapper1.dedupes.set('key1', Promise.resolve('value1'))
    wrapper1.dedupes.set('key2', Promise.resolve('value2'))
    wrapper2.dedupes.set('key1', Promise.resolve('value3'))

    // Add some entries to staleDedupes
    wrapper1.staleDedupes.add('key1')
    wrapper1.staleDedupes.add('key2')
    wrapper2.staleDedupes.add('key1')

    // Verify they are populated
    ok(wrapper1.dedupes.size === 2, 'wrapper1 dedupes should be populated')
    ok(wrapper1.staleDedupes.size === 2, 'wrapper1 staleDedupes should be populated')
    ok(wrapper2.dedupes.size === 1, 'wrapper2 dedupes should be populated')
    ok(wrapper2.staleDedupes.size === 1, 'wrapper2 staleDedupes should be populated')

    // Clear specific function and key
    await cache.clear('test1', 'key1')

    // Verify only the specific key was cleared from test1, others remain
    ok(wrapper1.dedupes.size === 1, 'wrapper1 dedupes should have one entry')
    ok(wrapper1.staleDedupes.size === 1, 'wrapper1 staleDedupes should have one entry')
    ok(wrapper1.dedupes.has('key2'), 'wrapper1 dedupes should contain key2')
    ok(wrapper1.staleDedupes.has('key2'), 'wrapper1 staleDedupes should contain key2')
    ok(wrapper2.dedupes.size === 1, 'wrapper2 dedupes should have one entry')
    ok(wrapper2.staleDedupes.size === 1, 'wrapper2 staleDedupes should have one entry')
  })

  test('should clear all dedupes and staleDedupes when called without parameters', async (t) => {
    const { ok } = tspl(t, { plan: 8 })

    const cache = new Cache({ ttl: 42, storage: createStorage(), })

    cache.define('test1', async () => {})
    cache.define('test2', async () => {})

    // Populate dedupes and staleDedupes artificially
    const wrapper1 = cache[kValues].test1
    const wrapper2 = cache[kValues].test2

    // Add some entries to dedupes
    wrapper1.dedupes.set('key1', Promise.resolve('value1'))
    wrapper1.dedupes.set('key2', Promise.resolve('value2'))
    wrapper2.dedupes.set('key3', Promise.resolve('value3'))

    // Add some entries to staleDedupes
    wrapper1.staleDedupes.add('key1')
    wrapper1.staleDedupes.add('key2')
    wrapper2.staleDedupes.add('key3')

    // Verify they are populated
    ok(wrapper1.dedupes.size === 2, 'wrapper1 dedupes should be populated')
    ok(wrapper1.staleDedupes.size === 2, 'wrapper1 staleDedupes should be populated')
    ok(wrapper2.dedupes.size === 1, 'wrapper2 dedupes should be populated')
    ok(wrapper2.staleDedupes.size === 1, 'wrapper2 staleDedupes should be populated')

    // Clear all
    await cache.clear()

    // Verify all dedupes and staleDedupes are cleared
    ok(wrapper1.dedupes.size === 0, 'wrapper1 should be completely cleared')
    ok(wrapper1.staleDedupes.size === 0, 'wrapper1 should be completely cleared')
    ok(wrapper2.dedupes.size === 0, 'wrapper2 should be completely cleared')
    ok(wrapper2.staleDedupes.size === 0, 'wrapper2 should be completely cleared')
  })
})
