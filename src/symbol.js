'use strict'

const kValues = Symbol('values')
const kStorage = Symbol('kStorage')
const kStorages = Symbol('kStorages')
const kTTL = Symbol('kTTL')
const kOnDedupe = Symbol('kOnDedupe')
const kOnError = Symbol('kOnError')
const kOnHit = Symbol('kOnHit')
const kOnMiss = Symbol('kOnMiss')

module.exports = { kValues, kStorage, kStorages, kTTL, kOnDedupe, kOnError, kOnHit, kOnMiss }
