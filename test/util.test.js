'use strict'

const { test } = require('tap')

const { bsearchIndex } = require('../util')

test('bsearch', async t => {
  const cases = [
    { input: [[1, 2, 3, 4, 5], 1], output: 0 },
    { input: [[1, 2, 3, 4, 5], 2], output: 1 },
    { input: [[1, 2, 3, 4, 5], 3], output: 2 },
    { input: [[1, 2, 3, 4, 5], 4], output: 3 },
    { input: [[1, 2, 3, 4, 5], 5], output: 4 },
    { input: [[1, 2, 3, 4, 5], 6], output: -1 },
    { input: [[1, 2, 3, 4], 1], output: 0 },
    { input: [[1, 2, 3, 4], -1], output: -1 }
  ]

  for (const case_ of cases) {
    const result = bsearchIndex(...case_.input)
    t.equal(result, case_.output)
  }
})
