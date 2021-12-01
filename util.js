'use strict'

/**
 * arrays must be sorted and unique
 * @param {*} arrayA
 * @param {*} arrayB
 * @returns {number[]} matching indexes of arrayB
 */
function findMatchingIndexes (arrayA, arrayB) {
  const found = []

  let lastIndexB = 0
  for (let indexA = 0; indexA < arrayA.length; indexA++) {
    for (let indexB = lastIndexB; indexB < arrayB.length; indexB++) {
      if (arrayA[indexA] === arrayB[indexB]) {
        found.push(indexB)
        lastIndexB = indexB + 1
      }
    }
  }
  return found
}

/**
 * arrays must be sorted and unique
 * @param {*} arrayA
 * @param {*} arrayB
 * @returns {number[]} values of arrayB not in arrayA
 */
function findNotMatching (arrayA, arrayB) {
  const found = []

  let lastIndexB = 0
  for (let indexA = 0; indexA < arrayA.length; indexA++) {
    for (let indexB = lastIndexB; indexB < arrayB.length; indexB++) {
      if (arrayA[indexA] !== arrayB[indexB]) {
        found.push(arrayB[indexB])
        lastIndexB = indexB + 1
      }
    }
  }
  return found
}

/**
 * @param {*} array
 * @param {*} value
 * @return {number} index of value in array, -1 if not found
 */
function bsearchIndex (array, value) {
  let start = 0
  let end = array.length - 1

  while (start <= end) {
    const index = ((start + end) / 2) | 0

    if (array[index] === value) {
      return index
    }

    if (array[index] < value) {
      start = index + 1
    } else {
      end = index - 1
    }
  }

  return -1
}

function randomNumber (max) {
  return (max * Math.random()) | 0
}

function randomInRange (min, max) {
  min = Math.floor(min)
  max = Math.floor(max)
  return min + randomNumber(1 + max - min)
}

function randomSubset (array, size) {
  if (array.length < 1 || size < 1) return []

  const limit = Math.min(array.length, size)
  const n = randomInRange(1, limit)
  const indexes = new Set()
  for (let i = 0; i < n; i++) {
    indexes.add(randomNumber(array.length))
  }
  const result = []
  for (const i of indexes) {
    result.push(array[i])
  }

  return result
}
module.exports = {
  findNotMatching,
  findMatchingIndexes,
  bsearchIndex,

  randomSubset
}
