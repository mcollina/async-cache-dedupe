'use strict'

const t = require('tap')
const sinon = require('sinon')
const createStorage = require('../storage')
const { promisify } = require('util')
const Redis = require('ioredis')

const sleep = promisify(setTimeout)

const redisClient = new Redis()
// TODO const redisSubscription = new Redis()

const { test, before, beforeEach, teardown } = t

function assertInclude (t, array0, array1) {
  t.equal(array0.length, array1.length)
  for (const a of array0) {
    t.ok(array1.includes(a), `${a} should be in ${array1}`)
  }
}

before(async () => {
  await redisClient.flushall()
})

teardown(async () => {
  await redisClient.quit()
})

test('storage redis', async (t) => {
  test('should get an instance with default options', async (t) => {
    const storage = await createStorage('redis', { client: redisClient })

    t.ok(typeof storage.get === 'function')
    t.ok(typeof storage.set === 'function')
    t.ok(typeof storage.remove === 'function')
    t.ok(typeof storage.invalidate === 'function')
    t.ok(typeof storage.refresh === 'function')
  })

  test('get', async (t) => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should get a value by a key previously stored', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 100)

      t.equal(await storage.get('foo'), 'bar')
    })

    test('should get undefined retrieving a non stored key', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 100)

      t.equal(await storage.get('no-foo'), undefined)
    })

    test('should get undefined retrieving an expired value', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 1)
      await sleep(2000)

      t.equal(await storage.get('foo'), undefined)
    })

    test('should not throw on error', async (t) => {
      t.plan(3)
      const storage = await createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            t.equal(error.msg, 'acd/storage/redis.get error')
            t.equal(error.key, 'foo')
          }
        }
      })

      t.equal(await storage.get('foo'), undefined)
    })
  })

  test('set', async (t) => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should set a value, with ttl', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 100)

      const value = await storage.store.get('foo')
      t.equal(JSON.parse(value), 'bar')

      const ttl = await storage.store.ttl('foo')
      t.equal(ttl, 100)
    })

    test('should not set a value with ttl < 1', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar', 0)

      t.equal(await storage.get('foo'), undefined)
    })

    test('should set a value with references', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 100, ['fooers'])

      const value = await storage.store.get('foo')
      t.equal(JSON.parse(value), 'bar')

      const references = await storage.store.smembers('r:fooers')
      t.same(references, ['foo'])
    })

    test('should not set a references twice', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 100, ['fooers'])
      await storage.set('foo', 'new-bar', 100, ['fooers'])

      const value = await storage.store.get('foo')
      t.equal(JSON.parse(value), 'new-bar')

      const references = await storage.store.smembers('r:fooers')
      t.same(references, ['foo'])
    })

    test('should add a key to an existing reference', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo1', 'bar1', 100, ['fooers'])
      await storage.set('foo2', 'bar2', 100, ['fooers'])

      const references = await storage.store.smembers('r:fooers')
      t.equal(references.length, 2)
      t.ok(references.includes('foo1'))
      t.ok(references.includes('foo2'))
    })

    test('should update the key references, full replace', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      await storage.set('foo', 'bar2', 100, ['booers', 'tooers'])

      t.equal((await storage.store.smembers('r:fooers')).length, 0)
      t.equal((await storage.store.smembers('r:mooers')).length, 0)
      t.same(await storage.store.smembers('r:booers'), ['foo'])
      t.same(await storage.store.smembers('r:tooers'), ['foo'])
    })

    test('should update the key references, partial replace', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      await storage.set('foo', 'bar2', 100, ['mooers', 'tooers'])

      t.equal((await storage.store.smembers('r:fooers')).length, 0)
      t.same(await storage.store.smembers('r:mooers'), ['foo'])
      t.same(await storage.store.smembers('r:tooers'), ['foo'])
      assertInclude(t, await storage.store.smembers('k:foo'), ['mooers', 'tooers'])
    })

    test('should update the key references, partial replace adding more references', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('foo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      t.equal((await storage.store.smembers('r:a')).length, 0)
      t.same(await storage.store.smembers('r:b'), ['foo'])
      t.same(await storage.store.smembers('r:d'), ['foo'])
      t.same(await storage.store.smembers('r:z'), ['foo'])
      assertInclude(t, await storage.store.smembers('k:foo'), ['b', 'd', 'z'])
    })

    test('should update the key references, partial replace with shared reference', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })

      await storage.set('boo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      t.same(await storage.store.smembers('r:a'), ['boo'])
      assertInclude(t, await storage.store.smembers('r:b'), ['foo', 'boo'])
      t.same(await storage.store.smembers('r:d'), ['foo'])
      t.same(await storage.store.smembers('r:z'), ['foo'])

      assertInclude(t, await storage.store.smembers('k:foo'), ['z', 'd', 'b'])
    })

    test('should not throw on error', async (t) => {
      t.plan(3)
      const storage = await createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            t.equal(error.msg, 'acd/storage/redis.set error')
            t.equal(error.key, 'foo')
          }
        }
      })

      t.doesNotThrow(() => storage.set('foo', 'bar', 1))
    })
  })

  test('remove', async (t) => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should remove an existing key', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10, ['fooers'])

      await storage.remove('foo')

      t.equal(await storage.get('foo'), undefined)
    })

    test('should remove an non existing key', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10, ['fooers'])

      await storage.remove('fooz')

      t.equal(await storage.get('foo'), 'bar')
      t.equal(await storage.get('fooz'), undefined)
    })

    test('should remove a key but not references if still active', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('a', 1, 10, ['fooers', 'vowels'])
      await storage.set('b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('d', 1, 10, ['consonantes'])
      await storage.set('e', 1, 10, ['vowels'])

      await storage.remove('a')

      t.equal(await storage.get('a'), undefined)
      t.equal(await storage.get('b'), 1)
      t.equal(await storage.get('c'), 1)
      t.equal(await storage.get('d'), 1)
      t.equal(await storage.get('e'), 1)

      assertInclude(t, await storage.store.smembers('r:fooers'), ['b', 'c'])
      assertInclude(t, await storage.store.smembers('r:consonantes'), ['b', 'c', 'd'])
      t.same(await storage.store.smembers('r:vowels'), ['e'])

      t.equal((await storage.store.smembers('k:a')).length, 0)
      assertInclude(t, await storage.store.smembers('k:b'), ['fooers', 'consonantes'])
      assertInclude(t, await storage.store.smembers('k:c'), ['fooers', 'consonantes'])
      assertInclude(t, await storage.store.smembers('k:d'), ['consonantes'])
      t.same(await storage.store.smembers('k:e'), ['vowels'])
    })

    test('should not throw on error', async (t) => {
      t.plan(3)
      const storage = await createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            t.equal(error.msg, 'acd/storage/redis.remove error')
            t.equal(error.key, 'foo')
          }
        }
      })

      t.doesNotThrow(() => storage.remove('foo'))
    })
  })

  test('invalidate', async (t) => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should remove storage keys by references', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate(['fooers'])

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('foo~2'), undefined)
      t.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should not remove storage keys by not existing reference', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate(['buzzers'])

      t.equal(await storage.get('foo~1'), 'bar')
      t.equal(await storage.get('foo~2'), 'baz')
      t.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should invalide more than one reference at once', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      await storage.invalidate(['fooers', 'booers'])

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('foo~2'), undefined)
      t.equal(await storage.get('boo~1'), undefined)
    })

    test('should remove storage keys by references, but not the ones still alive', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~boo', 'baz', 1, ['fooers', 'booers'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = await storage.invalidate(['fooers'])

      assertInclude(t, removed, ['foo~1', 'foo~boo'])

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('foo~boo'), undefined)
      t.equal(await storage.get('boo~1'), 'fiz')

      t.equal((await storage.store.smembers('r:fooers')).length, 0)
      t.equal((await storage.store.smembers('r:foo:1')).length, 0)
      t.same(await storage.store.smembers('r:booers'), ['boo~1'])

      t.equal((await storage.store.smembers('k:foo~1')).length, 0)
      t.equal((await storage.store.smembers('k:foo~boo')).length, 0)
      assertInclude(t, await storage.store.smembers('k:boo~1'), ['booers', 'boo:1'])
    })

    test('should remove a keys and references and also linked ones', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('a', 1, 10, ['fooers', 'vowels', 'empty'])
      await storage.set('b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('d', 1, 10, ['consonantes'])
      await storage.set('e', 1, 10, ['vowels'])

      await storage.invalidate(['fooers'])

      t.equal(await storage.get('a'), undefined)
      t.equal(await storage.get('b'), undefined)
      t.equal(await storage.get('c'), undefined)
      t.equal(await storage.get('d'), 1)
      t.equal(await storage.get('e'), 1)

      t.equal((await storage.store.smembers('r:fooers')).length, 0)
      t.equal((await storage.store.smembers('r:empty')).length, 0)
      t.same(await storage.store.smembers('r:consonantes'), ['d'])
      t.same(await storage.store.smembers('r:vowels'), ['e'])

      t.equal((await storage.store.smembers('k:a')).length, 0)
      t.equal((await storage.store.smembers('k:b')).length, 0)
      t.equal((await storage.store.smembers('k:c')).length, 0)
      t.same(await storage.store.smembers('k:d'), ['consonantes'])
      t.same(await storage.store.smembers('k:e'), ['vowels'])
    })

    test('should not throw on error', async (t) => {
      t.plan(3)
      const storage = await createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            t.equal(error.msg, 'acd/storage/redis.invalidate error')
            t.same(error.references, ['pizzers'])
          }
        }
      })

      t.doesNotThrow(() => storage.invalidate(['pizzers']))
    })
  })

  test('clear', async (t) => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should clear the whole storage', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10, ['fooers'])
      await storage.set('baz', 'buz', 10, ['bazers'])

      await storage.clear()

      t.equal(await storage.store.dbsize(), 0)
    })

    test('should clear only keys with common name', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo~1', 'bar', 10, ['fooers'])
      await storage.set('foo~2', 'baz', 10, ['bazers'])
      await storage.set('boo~1', 'fiz', 10, ['booers'])

      await storage.clear('foo~')

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('foo~2'), undefined)
      t.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should clear a keys and their references', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('a-a', 1, 10, ['fooers', 'vowels', 'empty'])
      await storage.set('a-b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('a-c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('b-d', 1, 10, ['consonantes'])
      await storage.set('b-e', 1, 10, ['vowels'])

      await storage.clear('a-')

      t.equal(await storage.get('a-a'), undefined)
      t.equal(await storage.get('a-b'), undefined)
      t.equal(await storage.get('a-c'), undefined)
      t.equal(await storage.get('b-d'), 1)
      t.equal(await storage.get('b-e'), 1)

      t.equal((await storage.store.smembers('r:fooers')).length, 0)
      t.equal((await storage.store.smembers('r:empty')).length, 0)
      t.same(await storage.store.smembers('r:consonantes'), ['b-d'])
      t.same(await storage.store.smembers('r:vowels'), ['b-e'])

      t.equal((await storage.store.smembers('k:a-a')).length, 0)
      t.equal((await storage.store.smembers('k:a-b')).length, 0)
      t.equal((await storage.store.smembers('k:a-c')).length, 0)
      t.same(await storage.store.smembers('k:b-d'), ['consonantes'])
      t.same(await storage.store.smembers('k:b-e'), ['vowels'])
    })

    test('should not throw on error', async (t) => {
      t.plan(3)
      const storage = await createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            t.equal(error.msg, 'acd/storage/redis.clear error')
            t.equal(error.name, 'foo')
          }
        }
      })

      t.doesNotThrow(() => storage.clear('foo'))
    })
  })

  test('refresh', async (t) => {
    beforeEach(async () => {
      await redisClient.flushall()
    })

    test('should start a new storage', async (t) => {
      const storage = await createStorage('redis', { client: redisClient })
      await storage.set('foo', 'bar', 10, ['fooers'])

      await storage.refresh()

      t.equal(await storage.store.dbsize(), 0)
    })

    test('should not throw on error', async (t) => {
      t.plan(2)
      const storage = await createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            t.equal(error.msg, 'acd/storage/redis.refresh error')
          }
        }
      })

      t.doesNotThrow(() => storage.refresh())
    })
  })

  test('listen', async (t) => {
    test('should listen for events on second connection', async (t) => {
      t.plan(3)

      const listener = {
        options: { db: 1 },
        subscribe: async (channel) => {
          t.equal(channel, '__keyevent@1__:expire')
          return 1
        },
        on: (event, cb) => {
          t.equal(event, 'message')
          t.ok(typeof cb === 'function')
        }
      }

      await createStorage('redis', { client: redisClient, listener })
    })

    test('should use the db 0 as default #1', async (t) => {
      t.plan(3)

      const listener = {
        subscribe: async (channel) => {
          t.equal(channel, '__keyevent@0__:expire')
          return 1
        },
        on: (event, cb) => {
          t.equal(event, 'message')
          t.ok(typeof cb === 'function')
        }
      }

      await createStorage('redis', { client: redisClient, listener })
    })

    test('should use the db 0 as default #2', async (t) => {
      t.plan(3)

      const listener = {
        options: {},
        subscribe: async (channel) => {
          t.equal(channel, '__keyevent@0__:expire')
          return 1
        },
        on: (event, cb) => {
          t.equal(event, 'message')
          t.ok(typeof cb === 'function')
        }
      }

      await createStorage('redis', { client: redisClient, listener })
    })

    test('should throw error if cant subscribe for listen #1', async (t) => {
      const listener = {
        options: { db: 0 },
        subscribe: async (channel) => { throw new Error('cant listen') }
      }

      try {
        await createStorage('redis', { client: redisClient, listener })
        t.fail('must throw error')
      } catch (err) {
        t.equal(err.message, 'cant listen')
      }
    })

    test('should throw error if cant subscribe for listen #2', async (t) => {
      const listener = {
        options: { db: 0 },
        subscribe: async (channel) => { return 0 }
      }

      try {
        await createStorage('redis', { client: redisClient, listener })
        t.fail('must throw error')
      } catch (err) {
        t.equal(err.message, 'cant subscribe to redis')
      }
    })

    test('should call "clearReferences" on expire event', async (t) => {
      let event
      const listener = {
        options: {},
        subscribe: async (channel) => 1,
        on: (_event, cb) => {
          event = cb
        }
      }

      const storage = await createStorage('redis', { client: redisClient, listener })
      sinon.spy(storage, 'clearReferences')

      event('the-channel', 'the-key')
      t.ok(storage.clearReferences.calledOnceWith(['the-key']))
    })
  })

  test('clearReferences', async (t) => {
    // TODO

    test('should not throw on error', async (t) => {
      t.plan(2)
      const storage = await createStorage('redis', {
        client: {},
        log: {
          debug: () => { },
          error: (error) => {
            t.equal(error.msg, 'acd/storage/redis.clearReference error')
          }
        }
      })

      t.doesNotThrow(() => storage.clearReferences('the-key'))
    })
  })
})
