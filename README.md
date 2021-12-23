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
* `onDedupe`: a function that is called every time it is defined is deduped.
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

### `cache.define(name[, opts], original(arg, cacheKey))`

Define a new function to cache of the given `name`.

The `define` method adds a `cache[name]` function that will call the `original` function if the result is not present
in the cache. The cache key for `arg` is computed using [`safe-stable-stringify`](https://www.npmjs.com/package/safe-stable-stringify) and it is passed as the `cacheKey` argument to the original function.

Options:

* `ttl`: the maximum time a cache entry can live, default as defined in the cache; default is zero, so cache is disabled, the function will be only the deduped.
* `serialize`: a function to convert the given argument into a serializable object (or string).
* `onDedupe`: a function that is called every time there is defined is deduped.
* `onHit`: a function that is called every time there is a hit in the cache.
* `onMiss`: a function that is called every time the result is not in the cache.
* `storage`: the storage to use, same as above. It's possible to specify different storages for each defined function for fine-tuning.
* `references`: sync or async function to generate references, it receives `(args, key, result)` from the defined function call and must return an array of strings or falsy; see [invalidation](#invalidation) to know how to use them.
  Example

  ```js
    const cache = createCache({ ttl: 60 })

    cache.define('fetchUser', {
      references: (args, key, result) => result ? [`user~${result.id}`] : null
    }, 
    (id) => database.find({ table: 'users', where: { id }}))

    await cache.fetchUser(1)
  ```

### `cache.clear([name], [arg])`

Clear the cache. If `name` is specified, all the cache entries from the function defined with that name are cleared.
If `arg` is specified, only the elements cached with the given `name` and `arg` are cleared.

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

See [mercurius-cache-example](https://github.com/mercurius/mercurius-cache-example) for a complete example.

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
  const report = await storage.gc('lazy', { lazy: { cursor }})
  if(report.error) {
    console.error('error on redis gc', error)
    return
  }
  console.log('gc report (lazy)', report)
  cursor = report.cursor
}, 60e3).unref()

setInterval(() => {
  const report = await storage.gc('strict', chunk: 128})
  if(report.error) {
    console.error('error on redis gc', error)
    return
  }
  console.log('gc report (strict)', report)
}, 10 * 60e3).unref()

```

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
