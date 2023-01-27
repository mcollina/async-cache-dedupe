'use strict'

const StorageRedis = require('./redis')
const StorageMemory = require('./memory')

/**
 * @typedef {StorageInterface} Storage
 */

/**
 * @enum {string}
 */
const StorageOptionsType = {
  redis: 'redis',
  memory: 'memory'
}

/**
 * @typedef {Object} StorageOptions
 * @property {StorageOptionsType} type
 */

/**
 * factory for storage, depending on type
 * @param {StorageOptionsType} type
 * @param {StorageMemoryOptions|StorageRedisOptions} options
 * @returns {StorageMemory|StorageRedis}
 */
function createStorage (type, options) {
  // istanbul ignore next 3
  if (typeof window !== 'undefined' && type === StorageOptionsType.redis) {
    throw new Error('Redis storage is not supported in the browser')
  }

  if (type === StorageOptionsType.redis) {
    return new StorageRedis(options)
  }
  return new StorageMemory(options)
}

module.exports = createStorage
