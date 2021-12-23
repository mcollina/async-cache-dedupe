'use strict'

const { createCache } = require('async-cache-dedupe')
const Redis = require('ioredis')

async function main () {
  const cache = createCache({
    ttl: 2, // default ttl, in seconds
    storage: { type: 'redis', options: { client: new Redis(), log: console } },
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

  cache.define('fetchSomething', {
    references: (args, key, result) => ['somethings', `some-${result}`]
  }, async (k) => {
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
}
// [
//   { k: 42 },
//   { k: 24 }
//   { k: 42 }
// ]

main()
