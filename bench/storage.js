'use strict'

const { hrtime } = require('process')
const path = require('path')
const Redis = require('ioredis')
const createStorage = require(path.resolve(__dirname, '../src/storage/index.js'))

// NOTE: this is a very basic benchmarks for tweaking
// performance is effected by keys and references size

function ms (ns) {
  return Number(ns) / 1e6
}

async function main () {
  let [,, type, ttl, entries, references, set, invalidate] = process.argv

  ttl = Number(ttl)
  references = Number(references)
  set = set === 'true' || set === '1'
  invalidate = invalidate === 'true' || invalidate === '1'

  console.log(`
    type: ${type}
    ttl: ${ttl}
    entries: ${entries}
    references: ${references}
    set: ${set}
    invalidate: ${invalidate}
  `)

  const options = {
    invalidation: invalidate
  }

  if (type === 'redis') {
    options.client = new Redis()
  }

  let start = hrtime.bigint()
  const storage = createStorage(type, options)
  let end = hrtime.bigint()
  console.log(`storage created in ${ms(end - start)} ms`)

  start = hrtime.bigint()
  for (let i = 0; i < entries; i++) {
    const r = []
    for (let j = 0; j < references; j++) {
      r.push(`reference-${i + j}`)
    }
    await storage.set(`key-${i}`, `value-${i}`, ttl, r)
  }
  end = hrtime.bigint()
  console.log(`set ${entries} entries (ttl: ${!!ttl}, references: ${references}) in ${ms(end - start)} ms`)

  if (set) {
    start = hrtime.bigint()
    for (let i = 0; i < entries; i++) {
      await storage.get(`key-${i}`)
    }
    end = hrtime.bigint()
    console.log(`get ${entries} entries (ttl: ${!!ttl}, references: ${references}) in ${ms(end - start)} ms`)
  }

  if (invalidate) {
    start = hrtime.bigint()
    for (let i = 0; i < entries; i++) {
      await storage.invalidate([`reference-${i}`])
    }
    end = hrtime.bigint()
    console.log(`invalidate ${entries} entries (ttl: ${!!ttl}, references: ${references}) in ${ms(end - start)} ms`)
  }

  options.client && options.client.disconnect()
}

main()
