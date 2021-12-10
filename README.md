# async-cache-dedupe

`async-cache-dedupe` is a cache for asynchronous fetching of resources
with full deduplication, i.e. the same resource is only asked once at any given time.

## Install

```bash
npm i async-cache-dedupe
```

## Example

```js
import { Cache } from 'async-cache-dedupe'

const cache = new Cache({
  ttl: 5 // seconds
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
* `cacheSize`: the maximum amount of entries to fit in the cache for each defined method, default `1024`.

### `cache.define(name[, opts], original(arg, cacheKey))`

Define a new function to cache of the given `name`.

Options:

TODO

* `tll`: the maximum time a cache entry can live, default as defined in the cache.
* `cacheSize`: the maximum amount of entries to fit in the cache for each defined method, default as defined in the cache.
* `serialize`: a function to convert the given argument into a serializable object (or string).
* `onHit`: a function that is called every time there is a hit in the cache.

TODO storage, use multiple storages

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

TODO?

cacheSize->storage
## Breaking Change 

## License

MIT
