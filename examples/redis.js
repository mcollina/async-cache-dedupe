'use strict'

const createStorage = require('../storage')
const { Cache } = require('../')
const Redis = require('ioredis')

// TODO

async function main () {
  const redisClient = new Redis()
  const redisListener = new Redis()

  const cache = new Cache({
    ttl: 2, // default ttl, in seconds
    storage: createStorage('redis', { client: redisClient, log: console }),
    listener: redisListener,
    onDedupe: (key) => {
      console.log('deduped', key)
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
