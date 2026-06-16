import { expect } from 'tstyche'
import { createCache, Cache, createStorage, StorageInterface } from './index.js'
import type { StorageCustomOptions, StorageMemoryOptions } from './index.js'

// Testing internal types

const storageOptions: StorageMemoryOptions = {
  size: 1000,
}

const cache = createCache()
expect(cache).type.toBe<Cache>()
expect(cache.exists('fetchSomething', 'key')).type.toBe<Promise<boolean>>()

const storage = createStorage('memory', storageOptions)
expect(storage).type.toBe<StorageInterface>()
expect(storage.exists('key')).type.toBe<Promise<boolean>>()

const memoryCache = createCache({
  storage: {
    type: 'memory',
    options: storageOptions,
  },
})
expect(memoryCache).type.toBe<Cache>()

const cacheWithTtlAndStale = createCache({
  ttl: 1000,
  stale: 1000,
})
expect(cacheWithTtlAndStale).type.toBe<Cache>()

const cacheClass = new Cache({
  ttl: 1000,
  stale: 1000,
  storage: createStorage('memory', {})
})
expect(cacheClass).type.toBe<Cache>()

// Testing Union Types

const fetchSomething = async (k: any) => {
  console.log('query', k)
  return { k }
}

export type CachedFunctions = {
  fetchSomething: typeof fetchSomething;
  fetchSomethingElse: typeof fetchSomething;
  fetchSomethingElseWithTtlFunction: typeof fetchSomething;
}

const unionMemoryCache = createCache({
  storage: {
    type: 'memory',
    options: storageOptions,
  },
})
expect(unionMemoryCache).type.toBe<Cache>()
const currentCacheInstance = unionMemoryCache
  .define('fetchSomething', fetchSomething)
  .define(
    'fetchSomethingElse',
    { ttl: 1000, stale: 1000, references: (args, key, result) => result.k },
    fetchSomething
  )
  .define(
    'fetchSomethingElseWithTtlFunction',
    { ttl: (result) => (result.k ? 1000 : 5), stale: 1000 },
    fetchSomething
  )
  .define(
    'fetchSomethingElseWithCustomStorage',
    { storage: { type: 'memory', options: { size: 10 } }, stale: 1000 },
    fetchSomething
  )
expect(currentCacheInstance.fetchSomething).type.toBe<typeof fetchSomething>()
expect(currentCacheInstance.fetchSomethingElse).type.toBe<typeof fetchSomething>()
expect(currentCacheInstance.fetchSomethingElseWithTtlFunction).type.toBe<typeof fetchSomething>()
expect(currentCacheInstance.fetchSomethingElseWithCustomStorage).type.toBe<typeof fetchSomething>()

expect(cache.clear()).type.toBe<Promise<void>>()

;(async () => {
  const result = await currentCacheInstance.fetchSomething('test')
  expect(result).type.toBe<{ k: any }>()

  await unionMemoryCache.invalidateAll('test:*')
})()

// Testing define.func only accepts one argument
const fetchFuncSingleArgument = async (args: { k1: string, k2: string }) => {
  console.log('query', args.k1, args.k2)
  return { k1: args.k1, k2: args.k2 }
}

const fetchFuncMultipleArguments = async (k1: string, k2:string) => {
  console.log('query', k1, k2)
  return { k1, k2 }
}

const singleArgTuple: [string, typeof fetchFuncSingleArgument] = ['fetchFuncSingleArgument', fetchFuncSingleArgument]
const multipleArgTuple: [string, typeof fetchFuncMultipleArguments] = ['fetchFuncMultipleArguments', fetchFuncMultipleArguments]
expect(singleArgTuple).type.toBeAssignableTo<Parameters<typeof unionMemoryCache.define>>()
expect(multipleArgTuple).type.not.toBeAssignableTo<Parameters<typeof unionMemoryCache.define>>()

// Testing define.opts.references
memoryCache.define('fetchFuncSingleArgument', {
  references: (args, key, result) => {
    expect(args).type.toBe<{ k1: string; k2: string }>()
    return []
  }
}, fetchFuncSingleArgument)

class CustomStorage extends StorageInterface { }

// createStorage with valid custom storage
const custom = new CustomStorage({})
const storageCustom = createStorage('custom', { storage: custom } as StorageCustomOptions)
expect(storageCustom).type.toBe<StorageInterface>()

const customCache = createCache({
  storage: {
    type: 'custom',
    options: { storage: custom },
  },
})
expect(customCache).type.toBe<Cache>()
