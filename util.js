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
  let start = 0; let end = array.length - 1

  while (start <= end) {
    const index = Math.floor((start + end) / 2)

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

module.exports = {
  findNotMatching,
  findMatchingIndexes,
  bsearchIndex
}
