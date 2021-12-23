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
  if (type === StorageOptionsType.redis) {
    return new StorageRedis(options)
  }
  return new StorageMemory(options)
}

module.exports = createStorage
