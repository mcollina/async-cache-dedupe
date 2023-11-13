'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { bsearchIndex, randomSubset, wildcardMatch } = require('../src/util')

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
    assert.equal(result, case_.output)
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
    assert.ok(result.length > 0)
    assert.ok(result.length <= case_.size)
  }

  cases = [
    { array: [], size: 100, resultLength: 0 },
    { array: [1, 2, 3, 4, 5], size: 0, resultLength: 0 }
  ]

  for (const case_ of cases) {
    const result = randomSubset(case_.array, case_.size)
    assert.equal(result.length, case_.resultLength)
  }
})

test('wildcardMatch', async t => {
  const cases = [
    { value: '*', content: '123', result: true },
    { value: 'foo:*', content: 'boo:1', result: false },
    { value: 'abcd', content: 'abcd', result: true },
    { value: '12*', content: '123', result: true },
    { value: '12*', content: '123456', result: true },
    { value: '1*6', content: '123456', result: true },
    { value: '1*6', content: '12345', result: false },
    { value: '1*7', content: '123456', result: false },
    { value: '*7', content: '123456', result: false },
    { value: '*6', content: '123456', result: true },
    { value: '12*6', content: '123456', result: true },
    { value: '1*2*6', content: '123456', result: true },
    { value: '1*4*', content: '123456', result: true },
    { value: '1*45*', content: '123456', result: true },
    { value: '**', content: '123456', result: false }
  ]

  for (const case_ of cases) {
    assert.equal(wildcardMatch(case_.value, case_.content), case_.result, `${case_.value} ${case_.content} => ${case_.result}`)
  }
})
