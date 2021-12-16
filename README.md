# async-cache-dedupe

`async-cache-dedupe` is a cache for asynchronous fetching of resources
with full deduplication, i.e. the same resource is only asked once at any given time.

## Install

```bash
npm i async-cache-dedupe
```

## Example

```js
import { Cache, createStorage } from 'async-cache-dedupe'

const cache = new Cache({
  ttl: 5, // seconds
  storage: createStorage('memory'),
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

### `new Cache(opts)`

Creates a new cache.

Options:

* `tll`: the maximum time a cache entry can live, default `0`; if `0`, an element is removed from the cache as soon as as the promise resolves.
* `storage`: the storage to use, `memory` or `redis`, created with `createStorage`.
* `onDedupe`: a function that is called every time there is a defined function is deduped.
* `onHit`: a function that is called every time there is a hit in the cache.
* `onMiss`: a function that is called every time the result is not in the cache.

### `createStorage(type, options)`

default cache is in `memory`, but a `redis` storage can be used for a larger and shared cache.  
Storage options are:

* `type`: `memory` (default) or `redis`
* `options`: by storage type
  * for `memory` type
    * `size`: maximum number of items to store in the cache _per resolver_. Default is `1024`.
    * `invalidation`: enable invalidation, TODO see [documentation](#invalidation). Default is disabled.
    * `log`: logger instance `pino` compatible, default is disabled.

    Example  

    ```js
    createStorage('memory', { size: 2048 })
    ```

  * for `redis` type
    * `client`: a redis client instance, mandatory. Should be an `ioredis` client or compatible.
    * `invalidation`: enable invalidation, TODO see [documentation](#invalidation). Default is disabled.
    * `invalidation.referencesTTL`: references TTL in seconds.  
    * `log`: logger instance `pino` compatible, default is disabled.

    Example

    ```js
    createStorage('redis', { client: new Redis(), invalidation: { referencesTTL: 60 } })
    ```

### `cache.define(name[, opts], original(arg, cacheKey))`

Define a new function to cache of the given `name`.

Options:

* `tll`: the maximum time a cache entry can live, default as defined in the cache.
* `storage`: the storage to use, `memory` or `redis`, created with `createStorage`.
* `serialize`: a function to convert the given argument into a serializable object (or string).
* `onDedupe`: a function that is called every time there is a defined function is deduped.
* `onHit`: a function that is called every time there is a hit in the cache.
* `onMiss`: a function that is called every time the result is not in the cache.

TODO references: can be sync or async function

TODO storage, use different storages

TODO redis options referencesTTL

TODO redis gc

* report
* info: a good strategy is 1 strict gc every N lazy gc
* conseguences of dirty references (measure slowdown?)

The `define` method adds a `cache[name]` function that will call the `original` function if the result is not present
in the cache. The cache key for `arg` is computed using [`safe-stable-stringify`](https://www.npmjs.com/package/safe-stable-stringify)
and it is passed as the `cacheKey` argument to the original function.

### `cache.clear([name], [arg])`

Clear the cache. If `name` is specified, all the cache entries from the function defined with that name are cleared.
If `arg` is specified, only the elements cached with the given `name` and `arg` are cleared.

TODO? Breaking Changes

* cacheSize->storage

## License

MIT
