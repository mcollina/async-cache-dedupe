'use strict'

const { hrtime } = require('process')
const Redis = require('ioredis')
const createStorage = require('../storage')

// NOTE: this is a very basic benchmarks for tweaking
// performance is effected by keys and references size

function ms (ns) {
  return Number(ns) / 1e6
}

async function main () {
  let [,, type, ttl, entries, references, retry, invalidate] = process.argv

  ttl = Number(ttl)
  references = Boolean(references)
  retry = Boolean(retry)
  invalidate = Boolean(invalidate)

  console.log(`
    type: ${type}
    ttl: ${ttl}
    entries: ${entries}
    references: ${references}
    retry: ${retry}
    invalidate: ${invalidate}
  `)

  const options = {}

  if (type === 'redis') {
    options.client = new Redis()
  }

  let start = hrtime.bigint()
  const storage = await createStorage(type, options)
  let end = hrtime.bigint()
  console.log(`storage created in ${ms(end - start)} ms`)

  start = hrtime.bigint()
  for (let i = 0; i < entries; i++) {
    await storage.set(`key-${i}`, `value-${i}`, ttl, references ? [`reference-key-${i}`] : null)
  }
  end = hrtime.bigint()
  console.log(`set ${entries} entries (ttl: ${!!ttl}, references: ${!!references}) in ${ms(end - start)} ms`)

  if (retry) {
    start = hrtime.bigint()
    for (let i = 0; i < entries; i++) {
      await storage.get(`key-${i}`)
    }
    end = hrtime.bigint()
    console.log(`get ${entries} entries (ttl: ${!!ttl}, references: ${!!references}) in ${ms(end - start)} ms`)
  }

  if (invalidate) {
    start = hrtime.bigint()
    for (let i = 0; i < entries; i++) {
      await storage.invalidate([`reference-key-${i}`])
    }
    end = hrtime.bigint()
    console.log(`invalidate ${entries} entries (ttl: ${!!ttl}, references: ${!!references}) in ${ms(end - start)} ms`)
  }

  options.client && options.client.disconnect()
}

main()
