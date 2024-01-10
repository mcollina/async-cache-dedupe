# async-cache-dedupe

`async-cache-dedupe` is a cache for asynchronous fetching of resources
with full deduplication, i.e. the same resource is only asked once at any given time.

## Install

```bash
npm i async-cache-dedupe
```

## Example

```js
import { createCache } from 'async-cache-dedupe'

const cache = createCache({
  ttl: 5, // seconds
  stale: 5, // number of seconds to return data after ttl has expired
  storage: { type: 'memory' },
})

cache.define('fetchSomething', async (k) => {
  console.log('query', k)
  // query 42
  // query 24

  return { k }
})

const p1 = cache.fetchSomething(42)
const p2 = cache.fetchSomething(24)
const p3 = cache.fetchSomething(42)

const res = await Promise.all([p1, p2, p3])

console.log(res)
// [
//   { k: 42 },
//   { k: 24 }
//   { k: 42 }
// ]
```

Commonjs/`require` is also supported.

## API

### `createCache(opts)`

Creates a new cache.

Options:

* `ttl`: the maximum time a cache entry can live, default `0`; if `0`, an element is removed from the cache as soon as the promise resolves.
* `stale`: the time after which the value is served from the cache after the ttl has expired. This can be a number in seconds or a function that accepts the data and returns the stale value.
* `onDedupe`: a function that is called every time it is defined is deduped.
* `onError`: a function that is called every time there is a cache error.
* `onHit`: a function that is called every time there is a hit in the cache.
* `onMiss`: a function that is called every time the result is not in the cache.
* `storage`: the storage options; default is `{ type: "memory" }`
  Storage options are:
  * `type`: `memory` (default) or `redis`
  * `options`: by storage type
    * for `memory` type
      * `size`: maximum number of items to store in the cache _per resolver_. Default is `1024`.
      * `invalidation`: enable invalidation, see [invalidation](#invalidation). Default is disabled.
      * `log`: logger instance `pino` compatible, default is disabled.

      Example  

      ```js
      createCache({ storage: { type: 'memory', options: { size: 2048 } } })
      ```

    * for `redis` type
      * `client`: a redis client instance, mandatory. Should be an `ioredis` client or compatible.
      * `invalidation`: enable invalidation, see [invalidation](#invalidation). Default is disabled.
      * `invalidation.referencesTTL`: references TTL in seconds, it means how long the references are alive; it should be set at the maximum of all the caches ttl.
      * `log`: logger instance `pino` compatible, default is disabled.

      Example

      ```js
      createCache({ storage: { type: 'redis', options: { client: new Redis(), invalidation: { referencesTTL: 60 } } } })
      ```
* `transformer`: the transformer to used to serialize and deserialize the cache entries. 
  It must be an object with the following methods:
  * `serialize`: a function that receives the result of the original function and returns a serializable object.
  * `deserialize`: a function that receives the serialized object and returns the original result.

  * Default is `undefined`, so the default transformer is used.

    Example

    ```js
    import superjson from 'superjson';

    const cache = createCache({
      transformer: {
        serialize: (result) => superjson.serialize(result),
        deserialize: (serialized) => superjson.deserialize(serialized),
      }
    })
    ```

### `cache.define(name[, opts], original(arg, cacheKey))`

Define a new function to cache of the given `name`.

The `define` method adds a `cache[name]` function that will call the `original` function if the result is not present
in the cache. The cache key for `arg` is computed using [`safe-stable-stringify`](https://www.npmjs.com/package/safe-stable-stringify) and it is passed as the `cacheKey` argument to the original function.

Options:

* `ttl`: a number or a function that returns a number of the maximum time a cache entry can live, default as defined in the cache; default is zero, so cache is disabled, the function will be only the deduped. The first argument of the function is the result of the original function.
* `stale`: the time after which the value is served from the cache after the ttl has expired. This can be a number in seconds or a function that accepts the data and returns the stale value.
* `serialize`: a function to convert the given argument into a serializable object (or string).
* `onDedupe`: a function that is called every time there is defined is deduped.
* `onError`: a function that is called every time there is a cache error.
* `onHit`: a function that is called every time there is a hit in the cache.
* `onMiss`: a function that is called every time the result is not in the cache.
* `storage`: the storage to use, same as above. It's possible to specify different storages for each defined function for fine-tuning.
* `transformer`: the transformer to used to serialize and deserialize the cache entries. It's possible to specify different transformers for each defined function for fine-tuning.
* `references`: sync or async function to generate references, it receives `(args, key, result)` from the defined function call and must return an array of strings or falsy; see [invalidation](#invalidation) to know how to use them.

  Example 1

  ```js
    const cache = createCache({ ttl: 60 })

    cache.define('fetchUser', {
      references: (args, key, result) => result ? [`user~${result.id}`] : null
    }, 
    (id) => database.find({ table: 'users', where: { id }}))

    await cache.fetchUser(1)
  ```

  Example 2 - dynamically set `ttl` based on result.
  
  ```js
  const cache = createCache()

  cache.define('fetchAccessToken', {
    ttl: (result) => result.expiresInSeconds
  }, async () => {
    
    const response = await fetch("https://example.com/token");
    const result = await response.json();
    // => { "token": "abc", "expiresInSeconds": 60 }
    
    return result;
  })

  await cache.fetchAccessToken()
  ```

  Example 3 - dynamically set `stale` value based on result.

  ```js
  const cache = createCache()

  cache.define('fetchUserProfile', {
    ttl: 60,
    stale: (result) => result.staleWhileRevalidateInSeconds
  }, async () => {
    
    const response = await fetch("https://example.com/token");
    const result = await response.json();
    // => { "username": "MrTest", "staleWhileRevalidateInSeconds": 5 }
    
    return result;
  })

  await cache.fetchUserProfile()
  ```

### `cache.clear([name], [arg])`

Clear the cache. If `name` is specified, all the cache entries from the function defined with that name are cleared.
If `arg` is specified, only the elements cached with the given `name` and `arg` are cleared.

### `cache.invalidateAll(references, [storage])`

`cache.invalidateAll` perform invalidation over the whole storage; if `storage` is not specified - using the same `name` as the defined function, invalidation is made over the default storage.

`references` can be:

* a single reference
* an array of references (without wildcard)
* a matching reference with wildcard, same logic for `memory` and `redis`

Example

```js
const cache = createCache({ ttl: 60 })

cache.define('fetchUser', {
  references: (args, key, result) => result ? [`user:${result.id}`] : null
}, (id) => database.find({ table: 'users', where: { id }}))

cache.define('fetchCountries', {
  storage: { type: 'memory', size: 256 },
  references: (args, key, result) => [`countries`]
}, (id) => database.find({ table: 'countries' }))

// ...

// invalidate all users from default storage
cache.invalidateAll('user:*')

// invalidate user 1 from default storage
cache.invalidateAll('user:1')

// invalidate user 1 and user 2 from default storage
cache.invalidateAll(['user:1', 'user:2'])

// note "fetchCountries" uses a different storage
cache.invalidateAll('countries', 'fetchCountries')
```

See below how invalidation and references work.

## Invalidation

Along with `time to live` invalidation of the cache entries, we can use invalidation by keys.  
The concept behind invalidation by keys is that entries have an auxiliary key set that explicitly links requests along with their own result. These auxiliary keys are called here `references`.  
A scenario. Let's say we have an entry _user_ `{id: 1, name: "Alice"}`, it may change often or rarely, the `ttl` system is not accurate:

* it can be updated before `ttl` expiration, in this case the old value is shown until expiration by `ttl`.  
* it's not been updated during `ttl` expiration, so in this case, we don't need to reload the value, because it's not changed

To solve this common problem, we can use `references`.  
We can say that the result of defined function `getUser(id: 1)` has reference `user~1`, and the result of defined function `findUsers`, containing `{id: 1, name: "Alice"},{id: 2, name: "Bob"}` has references `[user~1,user~2]`.
So we can find the results in the cache by their `references`, independently of the request that generated them, and we can invalidate by `references`.

So, when a writing event involving `user {id: 1}` happens (usually an update), we can remove all the entries in the cache that have references to `user~1`, so the result of `getUser(id: 1)` and `findUsers`, and they will be reloaded at the next request with the new data - but not the result of `getUser(id: 2)`.

Explicit invalidation is `disabled` by default, you have to enable it in `storage` settings.

See [mercurius-cache-example](https://github.com/mercurius-js/mercurius-cache-example) for a complete example.

### Redis

Using a `redis` storage is the best choice for a shared and/or large cache.  
All the `references` entries in redis have `referencesTTL`, so they are all cleaned at some time.
`referencesTTL` value should be set at the maximum of all the `ttl`s, to let them be available for every cache entry, but at the same time, they expire, avoiding data leaking.  
Anyway, we should keep `references` up-to-date to be more efficient on writes and invalidation, using the `garbage collector` function, that prunes the expired references: while expired references do not compromise the cache integrity, they slow down the I/O operations.  
Storage `memory` doesn't have `gc`.

### Redis garbage collector

As said, While the garbage collector is optional, is highly recommended to keep references up to date and improve performances on setting cache entries and invalidation of them.  

### `storage.gc([mode], [options])`

* `mode`: `lazy` (default) or `strict`.
  In `lazy` mode, only a chunk of the `references` are randomly checked, and probably freed; running `lazy` jobs tend to eventually clear all the expired `references`.
  In `strict` mode, all the `references` are checked and freed, and after that, `references` and entries are perfectly clean.
  `lazy` mode is the light heuristic way to ensure cached entries and `references` are cleared without stressing too much `redis`, `strict` mode at the opposite stress more `redis` to get a perfect result.
  The best strategy is to combine them both, running often `lazy` jobs along with some `strict` ones, depending on the size of the cache.

Options:

* `chunk`: the chunk size of references analyzed per loops, default `64`
* `lazy~chunk`: the chunk size of references analyzed per loops in `lazy` mode, default `64`; if both `chunk` and `lazy.chunk` is set, the maximum one is taken
* `lazy~cursor`: the cursor offset, default zero; cursor should be set at `report.cursor` to continue scanning from the previous operation

Return `report` of the `gc` job, as follows

```json
"report":{
  "references":{
      "scanned":["r:user:8", "r:group:11", "r:group:16"],
      "removed":["r:user:8", "r:group:16"]
  },
  "keys":{
      "scanned":["users~1"],
      "removed":["users~1"]
  },
  "loops":4,
  "cursor":0,
  "error":null
}
```

Example

```js
import { createCache, createStorage } from 'async-cache-dedupe'

const cache = createCache({
  ttl: 5,
  storage: { type: 'redis', options: { client: redisClient, invalidation: true } },
})
// ... cache.define('fetchSomething'

const storage = createStorage('redis', { client: redisClient, invalidation: true })

let cursor
setInterval(() => {
  const report = await storage.gc('lazy', { lazy: { cursor } })
  if(report.error) {
    console.error('error on redis gc', error)
    return
  }
  console.log('gc report (lazy)', report)
  cursor = report.cursor
}, 60e3).unref()

setInterval(() => {
  const report = await storage.gc('strict', { chunk: 128 })
  if(report.error) {
    console.error('error on redis gc', error)
    return
  }
  console.log('gc report (strict)', report)
}, 10 * 60e3).unref()

```

---

## TypeScript

This module provides a basic type definition for TypeScript.  
As the library does some meta-programming and magic stuff behind the scenes, your compiler could yell at you when defining functions using the `define` property.  
To avoid this, chain all defined functions in a single invocation:

```ts
import { createCache, Cache } from "async-cache-dedupe";

const fetchSomething = async (k: any) => {
  console.log("query", k);
  return { k };
};

const cache = createCache({
  ttl: 5, // seconds
  storage: { type: "memory" },
});

const cacheInstance = cache
  .define("fetchSomething", fetchSomething)
  .define("fetchSomethingElse", fetchSomething);

const p1 = cacheInstance.fetchSomething(42); // <--- TypeScript doesn't argue anymore here!
const p2 = cacheInstance.fetchSomethingElse(42); // <--- TypeScript doesn't argue anymore here!
```

---

## Browser

All the major browser are supported; only `memory` storage type is supported, `redis` storage can't be used in a browser env.

This is a very simple example of how to use this module in a browser environment:

```html
<script src="https://unpkg.com/async-cache-dedupe"></script>

<script>
  const cache = asyncCacheDedupe.createCache({
    ttl: 5, // seconds
    storage: { type: 'memory' },
  })

  cache.define('fetchSomething', async (k) => {
    console.log('query', k)
    return { k }
  })

  const p1 = cache.fetchSomething(42)
  const p2 = cache.fetchSomething(42)
  const p3 = cache.fetchSomething(42)

  Promise.all([p1, p2, p3]).then((values) => {
    console.log(values)
  })
</script>
```

You can also use the module with a bundler. The supported bundlers are `webpack`, `rollup`, `esbuild` and `browserify`.

---

## Maintainers

* [__Matteo Collina__](https://github.com/mcollina), <https://twitter.com/matteocollina>, <https://www.npmjs.com/~matteo.collina>
* [__Simone Sanfratello__](https://github.com/simone-sanfratello), <https://twitter.com/simonesanfradev>, <https://www.npmjs.com/~simone.sanfra>

---

## Breaking Changes

* version `0.5.0` -> `0.6.0`
  * `options.cacheSize` is dropped in favor of `storage`

## License

MIT
