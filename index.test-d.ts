// Write a tsd file for the module
import { expectType } from "tsd";
import { createCache, Cache, createStorage } from ".";
import { StorageInterface, StorageMemoryOptions } from "./index.js";

// Testing internal types

const storageOptions: StorageMemoryOptions = {
  size: 1000,
};

const cache = createCache();
expectType<Cache>(cache);

const storage = createStorage("memory", storageOptions);
expectType<StorageInterface>(storage);

const memoryCache = createCache({
  storage: {
    type: "memory",
    options: storageOptions,
  },
});
expectType<Cache>(memoryCache);

// Testing Union Types

const fetchSomething = async (k: any) => {
  console.log("query", k);
  return { k };
};

export type CachedFunctions = {
  fetchSomething: typeof fetchSomething;
};

const unionMemoryCache = createCache({
  storage: {
    type: "memory",
    options: storageOptions,
  },
}) as Cache & CachedFunctions;
expectType<Cache & CachedFunctions>(unionMemoryCache);

unionMemoryCache.define("fetchSomething", fetchSomething);
expectType<typeof fetchSomething>(unionMemoryCache.fetchSomething);

const result = await unionMemoryCache.fetchSomething("test");
expectType<{ k: any }>(result);
