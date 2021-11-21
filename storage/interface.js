'use strict'

class StorageInterface {
  constructor (options) {
    this.options = options
  }

  /**
   * @param {string} key
   * @returns {undefined|*} undefined if key not found
   */
  async get (key) { throw new Error('storage get method not implemented') }
  /**
   * @param {string} key
   * @param {*} value
   * @param {number} ttl - ttl in seconds; zero means key will not be stored
   * @param {?string[]} references
   */
  async set (key, value, ttl, references) { throw new Error('storage set method not implemented') }
  /**
   * @param {string} key
   */
  async remove (key) { throw new Error('storage remove method not implemented') }
  /**
   * @param {string[]} references
   */
  async invalidate (references) { throw new Error('storage invalidate method not implemented') }
  /**
   * @param {string} name
   */
  async clear (name) { throw new Error('storage clear method not implemented') }
  async refresh () { throw new Error('storage refresh method not implemented') }
}

module.exports = StorageInterface
