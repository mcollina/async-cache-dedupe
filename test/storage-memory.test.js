'use strict'

const t = require('tap')
const createStorage = require('../storage')
const { promisify } = require('util')

const sleep = promisify(setTimeout)

const { test } = t

test('storage memory', async (t) => {
  test('should get an instance with default options', async (t) => {
    const storage = await createStorage('memory')

    t.ok(typeof storage.get === 'function')
    t.ok(typeof storage.set === 'function')
    t.ok(typeof storage.remove === 'function')
    t.ok(typeof storage.invalidate === 'function')
    t.ok(typeof storage.refresh === 'function')

    t.equal(storage.store.capacity, 1024)
  })

  test('get', async (t) => {
    test('should get a value by a key previously stored', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar', 100)

      t.equal(await storage.get('foo'), 'bar')
    })

    test('should get undefined retrieving a non stored key', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar', 100)

      t.equal(await storage.get('no-foo'), undefined)
    })

    test('should get undefined retrieving an expired value', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar', 1)
      await sleep(2000)

      t.equal(await storage.get('foo'), undefined)
    })
  })

  test('set', async (t) => {
    test('should set a value, with ttl', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo', 'bar', 1)

      const stored = storage.store.get('foo')

      t.equal(stored.value, 'bar')
      t.equal(stored.ttl, 1)
      t.ok(stored.start < Date.now())
    })

    test('should not set a value with ttl < 1', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar', 0)

      t.equal(await storage.get('foo'), undefined)
    })

    test('should set a value with references', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar', 100, ['fooers'])

      const stored = storage.store.get('foo')
      t.equal(stored.value, 'bar')
      t.same(storage.referencesKeys.get('fooers'), ['foo'])
      t.same(storage.keysReferences.get('foo'), ['fooers'])
    })

    test('should not set a references twice', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo', 'bar', 1, ['fooers'])
      await storage.set('foo', 'new-bar', 1, ['fooers'])

      const stored = storage.store.get('foo')
      t.equal(stored.value, 'new-bar')
      t.same(storage.referencesKeys.get('fooers'), ['foo'])
      t.same(storage.keysReferences.get('foo'), ['fooers'])
    })

    test('should add a key to an existing reference', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo1', 'bar1', 1, ['fooers'])
      await storage.set('foo2', 'bar2', 1, ['fooers'])

      t.same(storage.referencesKeys.get('fooers'), ['foo1', 'foo2'])
      t.same(storage.keysReferences.get('foo1'), ['fooers'])
      t.same(storage.keysReferences.get('foo2'), ['fooers'])
    })

    test('should update the key references, full replace', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      await storage.set('foo', 'bar2', 100, ['booers', 'tooers'])

      t.equal(storage.referencesKeys.get('fooers'), undefined)
      t.equal(storage.referencesKeys.get('mooers'), undefined)
      t.same(storage.referencesKeys.get('booers'), ['foo'])
      t.same(storage.referencesKeys.get('tooers'), ['foo'])

      t.same(storage.keysReferences.get('foo'), ['booers', 'tooers'])
    })

    test('should update the key references, partial replace', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      await storage.set('foo', 'bar2', 100, ['mooers', 'tooers'])

      t.equal(storage.referencesKeys.get('fooers'), undefined)
      t.same(storage.referencesKeys.get('mooers'), ['foo'])
      t.same(storage.referencesKeys.get('tooers'), ['foo'])

      t.same(storage.keysReferences.get('foo'), ['mooers', 'tooers'])
    })

    test('should update the key references, partial replace adding more references', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('foo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      t.equal(storage.referencesKeys.get('a'), undefined)
      t.same(storage.referencesKeys.get('b'), ['foo'])
      t.same(storage.referencesKeys.get('d'), ['foo'])
      t.same(storage.referencesKeys.get('z'), ['foo'])

      t.same(storage.keysReferences.get('foo'), ['b', 'd', 'z'])
    })

    test('should update the key references, partial replace with shared reference', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('boo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar1', 100, ['a', 'b'])
      await storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      t.same(storage.referencesKeys.get('a'), ['boo'])
      t.same(storage.referencesKeys.get('b'), ['boo', 'foo'])
      t.same(storage.referencesKeys.get('d'), ['foo'])
      t.same(storage.referencesKeys.get('z'), ['foo'])

      t.same(storage.keysReferences.get('foo'), ['b', 'd', 'z'])
    })

    test('should update the key references, add reference to existing key without them', async (t) => {
      const storage = await createStorage('memory')

      await storage.set('key1', {}, 2)
      await storage.set('key1', 'another value', 2, ['a', 'b', 'c'])

      t.same(storage.referencesKeys.get('a'), ['key1'])
      t.same(storage.referencesKeys.get('b'), ['key1'])
      t.same(storage.referencesKeys.get('c'), ['key1'])

      t.same(storage.keysReferences.get('key1'), ['a', 'b', 'c'])
    })

    test('should update references of evicted keys (removed by size)', async (t) => {
      const storage = await createStorage('memory', { size: 2 })

      await storage.set('foo1', 'a', 100, ['foo:1', 'fooers'])
      await storage.set('foo2', 'b', 100, ['foo:2', 'fooers'])
      await storage.set('foo3', 'c', 100, ['foo:3', 'fooers'])
      await storage.set('foo4', 'd', 100, ['foo:4', 'fooers'])

      t.equal(storage.store.get('foo1'), undefined)
      t.equal(storage.store.get('foo2'), undefined)
      t.equal(storage.store.get('foo3').value, 'c')
      t.equal(storage.store.get('foo4').value, 'd')

      t.same(storage.referencesKeys.get('fooers'), ['foo3', 'foo4'])

      t.same(storage.keysReferences.get('foo1'), undefined)
      t.same(storage.keysReferences.get('foo2'), undefined)
      t.same(storage.keysReferences.get('foo3'), ['foo:3', 'fooers'])
      t.same(storage.keysReferences.get('foo4'), ['foo:4', 'fooers'])
    })
  })

  test('remove', async (t) => {
    test('should remove an existing key', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo', 'bar', 10, ['fooers'])

      t.equal(await storage.remove('foo'), true)

      t.equal(await storage.get('foo'), undefined)
    })

    test('should remove an non existing key', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo', 'bar', 10, ['fooers'])

      t.equal(await storage.remove('fooz'), false)

      t.equal(await storage.get('foo'), 'bar')
      t.equal(await storage.get('fooz'), undefined)
    })

    test('should remove a key but not references if still active', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('a', 1, 10, ['fooers', 'vowels'])
      await storage.set('b', 1, 10, ['fooers', 'consonantes'])
      await storage.set('c', 1, 10, ['fooers', 'consonantes'])
      await storage.set('d', 1, 10, ['consonantes'])
      await storage.set('e', 1, 10, ['vowels'])

      t.equal(await storage.remove('a'), true)

      t.equal(await storage.get('a'), undefined)
      t.equal(await storage.get('b'), 1)
      t.equal(await storage.get('c'), 1)
      t.equal(await storage.get('d'), 1)
      t.equal(await storage.get('e'), 1)

      t.same(storage.referencesKeys.get('fooers'), ['b', 'c'])
      t.same(storage.referencesKeys.get('consonantes'), ['b', 'c', 'd'])
      t.same(storage.referencesKeys.get('vowels'), ['e'])

      t.same(storage.keysReferences.get('a'), undefined)
      t.same(storage.keysReferences.get('b'), ['fooers', 'consonantes'])
      t.same(storage.keysReferences.get('c'), ['fooers', 'consonantes'])
      t.same(storage.keysReferences.get('d'), ['consonantes'])
      t.same(storage.keysReferences.get('e'), ['vowels'])
    })
  })

  test('invalidate', async (t) => {
    test('should remove storage keys by references', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = await storage.invalidate(['fooers'])

      t.same(removed, ['foo~1', 'foo~2'])

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('foo~2'), undefined)
      t.equal(await storage.get('boo~1'), 'fiz')

      t.equal(storage.referencesKeys.get('fooers'), undefined)
      t.equal(storage.referencesKeys.get('foo:1'), undefined)
      t.equal(storage.referencesKeys.get('foo:2'), undefined)
      t.same(storage.referencesKeys.get('booers'), ['boo~1'])

      t.equal(storage.keysReferences.get('foo~1'), undefined)
      t.equal(storage.keysReferences.get('foo~2'), undefined)
      t.same(storage.keysReferences.get('boo~1'), ['booers', 'boo:1'])
    })

    test('should not remove storage keys by not existing reference', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = await storage.invalidate(['buzzers'])

      t.same(removed, [])

      t.equal(await storage.get('foo~1'), 'bar')
      t.equal(await storage.get('foo~2'), 'baz')
      t.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should invalide more than one reference at once', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = await storage.invalidate(['fooers', 'booers'])

      t.same(removed, ['foo~1', 'foo~2', 'boo~1'])

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('foo~2'), undefined)
      t.equal(await storage.get('boo~1'), undefined)
    })

    test('should remove storage keys by references, but not the ones still alive', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      await storage.set('foo~boo', 'baz', 1, ['fooers', 'booers'])
      await storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = await storage.invalidate(['fooers'])

      t.same(removed, ['foo~1', 'foo~boo'])

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('boo~1'), 'fiz')
      t.equal(await storage.get('foo~boo'), undefined)

      t.equal(storage.referencesKeys.get('fooers'), undefined)
      t.equal(storage.referencesKeys.get('foo:1'), undefined)
      t.same(storage.referencesKeys.get('booers'), ['boo~1'])

      t.equal(storage.keysReferences.get('foo~1'), undefined)
      t.equal(storage.keysReferences.get('foo~boo'), undefined)
      t.same(storage.keysReferences.get('boo~1'), ['booers', 'boo:1'])
    })

    test('should remove a keys and references and also linked ones', async (t) => {
      const storage = await createStorage('memory')
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

      t.same(storage.referencesKeys.get('fooers'), undefined)
      t.same(storage.referencesKeys.get('empty'), undefined)
      t.same(storage.referencesKeys.get('consonantes'), ['d'])
      t.same(storage.referencesKeys.get('vowels'), ['e'])

      t.same(storage.keysReferences.get('a'), undefined)
      t.same(storage.keysReferences.get('b'), undefined)
      t.same(storage.keysReferences.get('c'), undefined)
      t.same(storage.keysReferences.get('d'), ['consonantes'])
      t.same(storage.keysReferences.get('e'), ['vowels'])
    })
  })

  test('clear', async (t) => {
    test('should clear the whole storage', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo', 'bar', 10, ['fooers'])
      await storage.set('baz', 'buz', 10, ['bazers'])

      await storage.clear()

      t.equal(storage.store.size, 0)
      t.equal(storage.referencesKeys.size, 0)
    })

    test('should clear only keys with common name', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo~1', 'bar', 10, ['fooers'])
      await storage.set('foo~2', 'baz', 10, ['bazers'])
      await storage.set('boo~1', 'fiz', 10, ['booers'])

      await storage.clear('foo~')

      t.equal(await storage.get('foo~1'), undefined)
      t.equal(await storage.get('foo~2'), undefined)
      t.equal(await storage.get('boo~1'), 'fiz')
    })

    test('should clear a keys and their references', async (t) => {
      const storage = await createStorage('memory')
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

      t.same(storage.referencesKeys.get('fooers'), undefined)
      t.same(storage.referencesKeys.get('empty'), undefined)
      t.same(storage.referencesKeys.get('consonantes'), ['b-d'])
      t.same(storage.referencesKeys.get('vowels'), ['b-e'])

      t.same(storage.keysReferences.get('a-a'), undefined)
      t.same(storage.keysReferences.get('a-b'), undefined)
      t.same(storage.keysReferences.get('a-c'), undefined)
      t.same(storage.keysReferences.get('b-d'), ['consonantes'])
      t.same(storage.keysReferences.get('b-e'), ['vowels'])
    })
  })

  test('refresh', async (t) => {
    test('should start a new storage', async (t) => {
      const storage = await createStorage('memory')
      await storage.set('foo', 'bar', 10, ['fooers'])

      await storage.refresh()
      t.equal(storage.store.size, 0)
      t.equal(storage.referencesKeys.size, 0)
    })
  })
})
