'use strict'

const { createCache } = require('../../../')

const cache = createCache({ ttl: 1 })
cache.define('something', async () => { })

export default {
  async fetch (request) {
    await cache.something()
    return new Response('')
  }
}
