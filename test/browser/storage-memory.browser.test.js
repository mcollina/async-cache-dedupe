'use strict'

const createStorage = require('../../src/storage')
const { kAsyncCacheDedupeSuiteName, kAsyncCacheDedupeSuiteHasMultipleTests } = require('./helpers/symbols.js')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = async function (test) {
  test('should get undefined retrieving an expired value', async (t) => {
    const storage = createStorage('memory')

    await storage.set('foo', 'bar', 1)
    await sleep(1500)

    t.equal(await storage.get('foo'), undefined)
  })

  test('should return the stored value if not expired', async (t) => {
    const storage = createStorage('memory')

    await storage.set('foo', 'bar', 1)
    await sleep(500)

    t.equal(await storage.get('foo'), 'bar')
  })
}

module.exports[kAsyncCacheDedupeSuiteName] = 'storage-memory browser suite'
module.exports[kAsyncCacheDedupeSuiteHasMultipleTests] = true
