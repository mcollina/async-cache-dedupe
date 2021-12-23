'use strict'

const kValues = Symbol('values')
const kStorage = Symbol('kStorage')
const kTTL = Symbol('kTTL')
const kOnDedupe = Symbol('kOnDedupe')
const kOnHit = Symbol('kOnHit')
const kOnMiss = Symbol('kOnMiss')

module.exports = { kValues, kStorage, kTTL, kOnDedupe, kOnHit, kOnMiss }
