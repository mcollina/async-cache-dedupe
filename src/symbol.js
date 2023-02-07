'use strict'

const kValues = Symbol('values')
const kStorage = Symbol('kStorage')
const kStorages = Symbol('kStorages')
const kTransfromer = Symbol('kTransformer')
const kTTL = Symbol('kTTL')
const kOnDedupe = Symbol('kOnDedupe')
const kOnError = Symbol('kOnError')
const kOnHit = Symbol('kOnHit')
const kOnMiss = Symbol('kOnMiss')
const kStale = Symbol('kStale')

module.exports = { kValues, kStorage, kStorages, kTransfromer, kTTL, kOnDedupe, kOnError, kOnHit, kOnMiss, kStale }
