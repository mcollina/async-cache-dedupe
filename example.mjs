import { Cache } from './index.js'

// TODO

const cache = new Cache({
  ttl: 5, // default ttl, in seconds
  storage: new MemoryStorage({
    size: 2048,
    log: pino() // ...
  }), // or new RedisStorage or AsyncLocalStorageWrapper
  onDedupe: (key) => {
    console.log('deduped', key)
  }
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
