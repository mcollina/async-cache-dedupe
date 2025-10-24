'use strict'

const { isServerSide, validateCustomStorage } = require('../util')

let StorageRedis
if (isServerSide) {
  StorageRedis = require('./redis')
}
const StorageMemory = require('./memory')

/**
 * @typedef {StorageInterface} Storage
 */

/**
 * @enum {string}
 */
const StorageOptionsType = {
  redis: 'redis',
  memory: 'memory',
  custom: 'custom'
}

/**
 * @typedef StorageCustomOptions
 * @property {StorageInterface} storage
 */

/**
 * @typedef {Object} StorageOptions
 * @property {StorageOptionsType} type
 */

/**
 * factory for storage, depending on type
 * @param {StorageOptionsType} type
 * @param {StorageMemoryOptions|StorageRedisOptions|StorageCustomOptions} options
 * @returns {StorageMemory|StorageRedis}
 */
function createStorage (type, options) {
  if (!isServerSide && type === StorageOptionsType.redis) {
    throw new Error('Redis storage is not supported in the browser')
  }

  if (type === StorageOptionsType.redis) {
    return new StorageRedis(options)
  }

  if (type === 'custom') {
    if (!options.storage) {
      throw new Error('Storage is required for custom storage type')
    }

    if (!validateCustomStorage(options.storage)) {
      throw new Error('Custom storage is invalid. It must define all required methods: get, set, invalidate, remove, clear, getTTL, and exists.')
    }

    return options.storage
  }

  return new StorageMemory(options)
}

module.exports = createStorage
