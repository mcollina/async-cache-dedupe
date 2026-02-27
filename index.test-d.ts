// Write a tsd file for the module
import { expectType, expectNotAssignable, expectAssignable } from 'tsd'
import { createCache, Cache, createStorage, StorageInterface } from './index.js'
import type { StorageCustomOptions, StorageMemoryOptions } from './index.js'

// Testing internal types

const storageOptions: StorageMemoryOptions = {
  size: 1000,
}

const cache = createCache()
expectType<Cache>(cache)
expectType<Promise<boolean>>(cache.exists('fetchSomething', 'key'))

const storage = createStorage('memory', storageOptions)
expectType<StorageInterface>(storage)
expectType<Promise<boolean>>(storage.exists('key'))

const memoryCache = createCache({
  storage: {
    type: 'memory',
    options: storageOptions,
  },
})
expectType<Cache>(memoryCache)

const cacheWithTtlAndStale = createCache({
  ttl: 1000,
  stale: 1000,
})
expectType<Cache>(cacheWithTtlAndStale)

const cacheClass = new Cache({
  ttl: 1000,
  stale: 1000,
  storage: createStorage('memory', {})
})
expectType<Cache>(cacheClass)

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
expectType<Cache>(unionMemoryCache)
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
expectType<typeof fetchSomething>(currentCacheInstance.fetchSomething)
expectType<typeof fetchSomething>(currentCacheInstance.fetchSomethingElse)
expectType<typeof fetchSomething>(
  currentCacheInstance.fetchSomethingElseWithTtlFunction
)
expectType<typeof fetchSomething>(
  currentCacheInstance.fetchSomethingElseWithCustomStorage
)

expectType<Promise<void>>(cache.clear())

const result = await currentCacheInstance.fetchSomething('test')

expectType<{ k: any }>(result)

await unionMemoryCache.invalidateAll('test:*')

// Testing define.func only accepts one argument
const fetchFuncSingleArgument = async (args: { k1: string, k2: string }) => {
  console.log('query', args.k1, args.k2)
  return { k1: args.k1, k2: args.k2 }
}

const fetchFuncMultipleArguments = async (k1: string, k2:string) => {
  console.log('query', k1, k2)
  return { k1, k2 }
}

expectAssignable<Parameters<typeof unionMemoryCache.define>>(['fetchFuncSingleArgument', fetchFuncSingleArgument])
expectNotAssignable<Parameters<typeof unionMemoryCache.define>>(['fetchFuncMultipleArguments', fetchFuncMultipleArguments])

// Testing define.opts.references
memoryCache.define('fetchFuncSingleArgument', {
  references: (args, key, result) => {
    expectType<{ k1: string; k2: string }>(args)
    return []
  }
}, fetchFuncSingleArgument)

class CustomStorage extends StorageInterface { }

// createStorage with valid custom storage
const custom = new CustomStorage({})
const storageCustom = createStorage('custom', { storage: custom } as StorageCustomOptions)
expectType<StorageInterface>(storageCustom)

const customCache = createCache({
  storage: {
    type: 'custom',
    options: { storage: custom },
  },
})
expectType<Cache>(customCache)
