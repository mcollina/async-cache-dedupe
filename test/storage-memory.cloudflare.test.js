'use strict'

const assert = require('node:assert')
const { after, before, describe, test } = require('node:test')
const { unstable_dev } = require('wrangler') // eslint-disable-line camelcase
const { promisify } = require('util')

const sleep = promisify(setTimeout)

describe('storage memory (cloudflare)', { skip: process.version < 20 }, async () => {
  let worker

  before(async () => {
    worker = await unstable_dev('test/cloudflare/helpers/worker.mjs')
  })

  after(async () => {
    await worker.stop()
  })

  test('does not throw an error when invalidating', async () => {
    let resp = await worker.fetch()
    assert.equal(resp.status, 200)
    sleep(2500)
    resp = await worker.fetch()
    assert.equal(resp.status, 200)
  })
})
