'use strict'

const createStorage = require('../../src/storage')
const { kAsyncCacheDedupeSuiteName, kAsyncCacheDedupeSuiteHasMultipleTests } = require('./helpers/symbols.js')

module.exports = async function (test) {
  test('should fail when using redis storage in the browser', async (t) => {
    t.plan(1)

    t.throws(() => {
      createStorage('redis', { client: {} })
    }, { message: 'Redis storage is not supported in the browser' })
  })
}

module.exports[kAsyncCacheDedupeSuiteName] = 'storage-base browser suite'
module.exports[kAsyncCacheDedupeSuiteHasMultipleTests] = true
