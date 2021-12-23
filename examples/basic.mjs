import { createCache } from 'async-cache-dedupe'

const cache = createCache({
  ttl: 5, // default ttl, in seconds
  storage: { type: 'memory', options: {
    size: 2048, // entries to store for each defined function
  }},
  onDedupe: (key) => {
    console.log('deduped', key)
  },
  onHit: (key) => {
    console.log('hit', key)
  },
  onMiss: (key) => {
    console.log('miss', key)
  }
})

cache.define('fetchSomething', async (k) => {
  console.log('query', k)
  // query 42
  // query 24

  return { k }
})

let p1 = cache.fetchSomething(42)
let p2 = cache.fetchSomething(24)
let p3 = cache.fetchSomething(42)

let res = await Promise.all([p1, p2, p3])

console.log(res)
// [
//   { k: 42 },
//   { k: 24 }
//   { k: 42 }
// ]

p1 = cache.fetchSomething(42)
p2 = cache.fetchSomething(24)
p3 = cache.fetchSomething(42)

res = await Promise.all([p1, p2, p3])

console.log(res)
