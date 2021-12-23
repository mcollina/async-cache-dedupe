'use strict'

const { test } = require('tap')
const { bsearchIndex, randomSubset } = require('../src/util')

test('bsearchIndex', async t => {
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

test('randomSubset', async t => {
  let cases = [
    { array: [1, 2, 3, 4, 5], size: 1 },
    { array: [1, 2, 3, 4, 5], size: 2 },
    { array: [1, 2, 3, 4, 5], size: 3 },
    { array: [1, 2, 3, 4, 5], size: 4 },
    { array: [1, 2, 3, 4, 5], size: 5 }
  ]

  for (const case_ of cases) {
    const result = randomSubset(case_.array, case_.size)
    t.ok(result.length > 0)
    t.ok(result.length <= case_.size)
  }

  cases = [
    { array: [], size: 100, resultLength: 0 },
    { array: [1, 2, 3, 4, 5], size: 0, resultLength: 0 }
  ]

  for (const case_ of cases) {
    const result = randomSubset(case_.array, case_.size)
    t.equal(result.length, case_.resultLength)
  }
})
