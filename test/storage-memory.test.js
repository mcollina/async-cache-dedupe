'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const createStorage = require('../src/storage')
const { promisify } = require('util')

const sleep = promisify(setTimeout)

describe('storage memory', async () => {
  test('should get an instance with default options', async () => {
    const storage = createStorage('memory')

    assert.ok(typeof storage.get === 'function')
    assert.ok(typeof storage.set === 'function')
    assert.ok(typeof storage.remove === 'function')
    assert.ok(typeof storage.invalidate === 'function')
    assert.ok(typeof storage.refresh === 'function')

    assert.equal(storage.store.capacity, 1024)
  })

  test('should get an error on invalid options', async () => {
    assert.throws(() => createStorage('memory', { size: -1 }), /size must be a positive integer greater than 0/)
  })

  test('should not initialize references containeres on invalidation disabled', async () => {
    const storage = createStorage('memory')

    assert.equal(storage.keysReferences, undefined)
    assert.equal(storage.referencesKeys, undefined)
  })

  test('should initialize references containeres on invalidation enabled', async () => {
    const storage = createStorage('memory', { invalidation: true })

    assert.ok(typeof storage.keysReferences === 'object')
    assert.ok(typeof storage.referencesKeys === 'object')
  })

  describe('get', async () => {
    test('should get a value by a key previously stored', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 100)

      assert.equal(storage.get('foo'), 'bar')
    })

    test('should get undefined retrieving a non stored key', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 100)

      assert.equal(storage.get('no-foo'), undefined)
    })

    test('should get undefined retrieving an expired value', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 1)
      await sleep(2000)

      assert.equal(storage.get('foo'), undefined)
    })
  })

  describe('getTTL', async () => {
    test('should get the TTL of a previously key stored', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 100)

      assert.equal(storage.getTTL('foo'), 100)

      await sleep(1000)

      assert.equal(storage.getTTL('foo'), 99)
    })

    test('should get the TTL of a a key without TTL', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 0)

      assert.equal(storage.getTTL('foo'), 0)
    })

    test('should get the TTL of a previously key stored', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 1)

      assert.equal(storage.getTTL('foo'), 1)

      await sleep(1000)

      assert.equal(storage.getTTL('foo'), 0)
    })

    test('no key', async () => {
      const storage = createStorage('memory')

      assert.equal(storage.getTTL('foo'), 0)
    })

    test('should get the TTL of a previously key stored', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 1)

      await sleep(2000)

      assert.equal(storage.getTTL('foo'), 0)
    })
  })

  describe('set', async () => {
    test('should set a value, with ttl', async () => {
      const storage = createStorage('memory')
      storage.set('foo', 'bar', 1)

      const stored = storage.store.get('foo')

      assert.equal(stored.value, 'bar')
      assert.equal(stored.ttl, 1)
      assert.ok(stored.start < Date.now())
    })

    test('should not set a value with ttl < 1', async () => {
      const storage = createStorage('memory')

      storage.set('foo', 'bar', 0)

      assert.equal(storage.get('foo'), undefined)
    })

    test('should set a value with references', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('foo', 'bar', 100, ['fooers'])

      const stored = storage.store.get('foo')
      assert.equal(stored.value, 'bar')
      assert.deepStrictEqual(storage.referencesKeys.get('fooers'), ['foo'])
      assert.deepStrictEqual(storage.keysReferences.get('foo'), ['fooers'])
    })

    test('should not set an empty references', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('foo', 'bar', 100, [])

      const stored = storage.store.get('foo')
      assert.equal(stored.value, 'bar')
      assert.deepStrictEqual(storage.referencesKeys.size, 0)
      assert.deepStrictEqual(storage.keysReferences.size, 0)
    })

    test('should get a warning setting references with invalidation disabled', async (t) => {
      const { equal } = tspl(t, { plan: 1 })

      const storage = createStorage('memory', {
        log: {
          debug: () => { },
          warn: (error) => {
            equal(error.msg, 'acd/storage/memory.set, invalidation is disabled, references are useless')
          }
        }
      })

      storage.set('foo', 'bar', 1, ['fooers'])
    })

    test('should not set a references twice', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo', 'bar', 1, ['fooers'])
      storage.set('foo', 'new-bar', 1, ['fooers'])

      const stored = storage.store.get('foo')
      assert.equal(stored.value, 'new-bar')
      assert.deepStrictEqual(storage.referencesKeys.get('fooers'), ['foo'])
      assert.deepStrictEqual(storage.keysReferences.get('foo'), ['fooers'])
    })

    test('should add a key to an existing reference', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('foo1', 'bar1', 1, ['fooers'])
      storage.set('foo2', 'bar2', 1, ['fooers'])

      assert.deepStrictEqual(storage.referencesKeys.get('fooers'), ['foo1', 'foo2'])
      assert.deepStrictEqual(storage.keysReferences.get('foo1'), ['fooers'])
      assert.deepStrictEqual(storage.keysReferences.get('foo2'), ['fooers'])
    })

    test('should update the key references, full replace', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      storage.set('foo', 'bar2', 100, ['booers', 'tooers'])

      assert.equal(storage.referencesKeys.get('fooers'), undefined)
      assert.equal(storage.referencesKeys.get('mooers'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('booers'), ['foo'])
      assert.deepStrictEqual(storage.referencesKeys.get('tooers'), ['foo'])

      assert.deepStrictEqual(storage.keysReferences.get('foo'), ['booers', 'tooers'])
    })

    test('should update the key references, partial replace', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('foo', 'bar1', 100, ['fooers', 'mooers'])
      storage.set('foo', 'bar2', 100, ['mooers', 'tooers'])

      assert.equal(storage.referencesKeys.get('fooers'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('mooers'), ['foo'])
      assert.deepStrictEqual(storage.referencesKeys.get('tooers'), ['foo'])

      assert.deepStrictEqual(storage.keysReferences.get('foo'), ['mooers', 'tooers'])
    })

    test('should update the key references, partial replace adding more references', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('foo', 'bar1', 100, ['a', 'b'])
      storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      assert.equal(storage.referencesKeys.get('a'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('b'), ['foo'])
      assert.deepStrictEqual(storage.referencesKeys.get('d'), ['foo'])
      assert.deepStrictEqual(storage.referencesKeys.get('z'), ['foo'])

      assert.deepStrictEqual(storage.keysReferences.get('foo'), ['b', 'd', 'z'])
    })

    test('should update the key references, partial replace with shared reference', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('boo', 'bar1', 100, ['a', 'b'])
      storage.set('foo', 'bar1', 100, ['a', 'b'])
      storage.set('foo', 'bar2', 100, ['z', 'b', 'd'])

      assert.deepStrictEqual(storage.referencesKeys.get('a'), ['boo'])
      assert.deepStrictEqual(storage.referencesKeys.get('b'), ['boo', 'foo'])
      assert.deepStrictEqual(storage.referencesKeys.get('d'), ['foo'])
      assert.deepStrictEqual(storage.referencesKeys.get('z'), ['foo'])

      assert.deepStrictEqual(storage.keysReferences.get('foo'), ['b', 'd', 'z'])
    })

    test('should update the key references, add reference to existing key without them', async () => {
      const storage = createStorage('memory', { invalidation: true })

      storage.set('key1', {}, 2)
      storage.set('key1', 'another value', 2, ['a', 'b', 'c'])

      assert.deepStrictEqual(storage.referencesKeys.get('a'), ['key1'])
      assert.deepStrictEqual(storage.referencesKeys.get('b'), ['key1'])
      assert.deepStrictEqual(storage.referencesKeys.get('c'), ['key1'])

      assert.deepStrictEqual(storage.keysReferences.get('key1'), ['a', 'b', 'c'])
    })

    test('should update references of evicted keys (removed by size)', async () => {
      const storage = createStorage('memory', { size: 2, invalidation: true })

      storage.set('foo1', 'a', 100, ['foo:1', 'fooers'])
      storage.set('foo2', 'b', 100, ['foo:2', 'fooers'])
      storage.set('foo3', 'c', 100, ['foo:3', 'fooers'])
      storage.set('foo4', 'd', 100, ['foo:4', 'fooers'])

      assert.equal(storage.store.get('foo1'), undefined)
      assert.equal(storage.store.get('foo2'), undefined)
      assert.equal(storage.store.get('foo3').value, 'c')
      assert.equal(storage.store.get('foo4').value, 'd')

      assert.deepStrictEqual(storage.referencesKeys.get('fooers'), ['foo3', 'foo4'])

      assert.deepStrictEqual(storage.keysReferences.get('foo1'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('foo2'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('foo3'), ['foo:3', 'fooers'])
      assert.deepStrictEqual(storage.keysReferences.get('foo4'), ['foo:4', 'fooers'])
    })
  })

  describe('remove', async () => {
    test('should remove an existing key', async () => {
      const storage = createStorage('memory')
      storage.set('foo', 'bar', 10)

      assert.equal(storage.remove('foo'), true)

      assert.equal(storage.get('foo'), undefined)
    })

    test('should remove an non existing key', async () => {
      const storage = createStorage('memory')
      storage.set('foo', 'bar', 10)

      assert.equal(storage.remove('fooz'), false)

      assert.equal(storage.get('foo'), 'bar')
      assert.equal(storage.get('fooz'), undefined)
    })

    test('should remove an existing key and references', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo', 'bar', 10, ['fooers'])

      assert.equal(storage.remove('foo'), true)

      assert.equal(storage.get('foo'), undefined)
    })

    test('should remove an non existing key (and references)', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo', 'bar', 10, ['fooers'])

      assert.equal(storage.remove('fooz'), false)

      assert.equal(storage.get('foo'), 'bar')
      assert.equal(storage.get('fooz'), undefined)
    })

    test('should remove a key but not references if still active', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('a', 1, 10, ['fooers', 'vowels'])
      storage.set('b', 1, 10, ['fooers', 'consonantes'])
      storage.set('c', 1, 10, ['fooers', 'consonantes'])
      storage.set('d', 1, 10, ['consonantes'])
      storage.set('e', 1, 10, ['vowels'])

      assert.equal(storage.remove('a'), true)

      assert.equal(storage.get('a'), undefined)
      assert.equal(storage.get('b'), 1)
      assert.equal(storage.get('c'), 1)
      assert.equal(storage.get('d'), 1)
      assert.equal(storage.get('e'), 1)

      assert.deepStrictEqual(storage.referencesKeys.get('fooers'), ['b', 'c'])
      assert.deepStrictEqual(storage.referencesKeys.get('consonantes'), ['b', 'c', 'd'])
      assert.deepStrictEqual(storage.referencesKeys.get('vowels'), ['e'])

      assert.deepStrictEqual(storage.keysReferences.get('a'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('b'), ['fooers', 'consonantes'])
      assert.deepStrictEqual(storage.keysReferences.get('c'), ['fooers', 'consonantes'])
      assert.deepStrictEqual(storage.keysReferences.get('d'), ['consonantes'])
      assert.deepStrictEqual(storage.keysReferences.get('e'), ['vowels'])
    })
  })

  describe('invalidate', async () => {
    test('should remove storage keys by references', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = storage.invalidate(['fooers'])

      assert.deepStrictEqual(removed, ['foo~1', 'foo~2'])

      assert.equal(storage.get('foo~1'), undefined)
      assert.equal(storage.get('foo~2'), undefined)
      assert.equal(storage.get('boo~1'), 'fiz')

      assert.equal(storage.referencesKeys.get('fooers'), undefined)
      assert.equal(storage.referencesKeys.get('foo:1'), undefined)
      assert.equal(storage.referencesKeys.get('foo:2'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('booers'), ['boo~1'])

      assert.equal(storage.keysReferences.get('foo~1'), undefined)
      assert.equal(storage.keysReferences.get('foo~2'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('boo~1'), ['booers', 'boo:1'])
    })

    test('should not remove storage keys by not existing reference', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = storage.invalidate(['buzzers'])

      assert.deepStrictEqual(removed, [])

      assert.equal(storage.get('foo~1'), 'bar')
      assert.equal(storage.get('foo~2'), 'baz')
      assert.equal(storage.get('boo~1'), 'fiz')
    })

    test('should invalide more than one reference at once', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = storage.invalidate(['fooers', 'booers'])

      assert.deepStrictEqual(removed, ['foo~1', 'foo~2', 'boo~1'])

      assert.equal(storage.get('foo~1'), undefined)
      assert.equal(storage.get('foo~2'), undefined)
      assert.equal(storage.get('boo~1'), undefined)
    })

    test('should remove storage keys by references, but not the ones still alive', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      storage.set('foo~boo', 'baz', 1, ['fooers', 'booers'])
      storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = storage.invalidate(['fooers'])

      assert.deepStrictEqual(removed, ['foo~1', 'foo~boo'])

      assert.equal(storage.get('foo~1'), undefined)
      assert.equal(storage.get('boo~1'), 'fiz')
      assert.equal(storage.get('foo~boo'), undefined)

      assert.equal(storage.referencesKeys.get('fooers'), undefined)
      assert.equal(storage.referencesKeys.get('foo:1'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('booers'), ['boo~1'])

      assert.equal(storage.keysReferences.get('foo~1'), undefined)
      assert.equal(storage.keysReferences.get('foo~boo'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('boo~1'), ['booers', 'boo:1'])
    })

    test('should remove a keys and references and also linked ones', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('a', 1, 10, ['fooers', 'vowels', 'empty'])
      storage.set('b', 1, 10, ['fooers', 'consonantes'])
      storage.set('c', 1, 10, ['fooers', 'consonantes'])
      storage.set('d', 1, 10, ['consonantes'])
      storage.set('e', 1, 10, ['vowels'])

      storage.invalidate(['fooers'])

      assert.equal(storage.get('a'), undefined)
      assert.equal(storage.get('b'), undefined)
      assert.equal(storage.get('c'), undefined)
      assert.equal(storage.get('d'), 1)
      assert.equal(storage.get('e'), 1)

      assert.deepStrictEqual(storage.referencesKeys.get('fooers'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('empty'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('consonantes'), ['d'])
      assert.deepStrictEqual(storage.referencesKeys.get('vowels'), ['e'])

      assert.deepStrictEqual(storage.keysReferences.get('a'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('b'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('c'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('d'), ['consonantes'])
      assert.deepStrictEqual(storage.keysReferences.get('e'), ['vowels'])
    })

    test('should invalidate by a string', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = storage.invalidate('fooers')

      assert.deepStrictEqual(removed, ['foo~1', 'foo~2'])

      assert.equal(storage.get('foo~1'), undefined)
      assert.equal(storage.get('foo~2'), undefined)
      assert.equal(storage.get('boo~1'), 'fiz')

      assert.equal(storage.referencesKeys.get('fooers'), undefined)
      assert.equal(storage.referencesKeys.get('foo:1'), undefined)
      assert.equal(storage.referencesKeys.get('foo:2'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('booers'), ['boo~1'])

      assert.equal(storage.keysReferences.get('foo~1'), undefined)
      assert.equal(storage.keysReferences.get('foo~2'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('boo~1'), ['booers', 'boo:1'])
    })

    test('should invalidate by an array of strings', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~1', 'bar', 1, ['fooers', 'foo:1'])
      storage.set('foo~2', 'baz', 1, ['fooers', 'foo:2'])
      storage.set('boo~1', 'fiz', 1, ['booers', 'boo:1'])

      const removed = storage.invalidate(['fooers', 'booers'])

      assert.deepStrictEqual(removed, ['foo~1', 'foo~2', 'boo~1'])

      assert.equal(storage.get('foo~1'), undefined)
      assert.equal(storage.get('foo~2'), undefined)
      assert.equal(storage.get('boo~1'), undefined)

      assert.equal(storage.referencesKeys.get('fooers'), undefined)
      assert.equal(storage.referencesKeys.get('foo:1'), undefined)
      assert.equal(storage.referencesKeys.get('foo:2'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('booers'), undefined)

      assert.equal(storage.keysReferences.get('foo~1'), undefined)
      assert.equal(storage.keysReferences.get('foo~2'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('boo~1'), undefined)
    })

    test('should invalidate with wildcard one asterisk', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~1', 'bar', 9, ['fooers', 'foo:1'])
      storage.set('foo~2', 'baz', 9, ['fooers', 'foo:2'])
      storage.set('boo~1', 'fiz', 9, ['booers', 'boo:1'])

      storage.invalidate('foo:*')

      assert.equal(storage.get('foo~1'), undefined)
      assert.equal(storage.get('foo~2'), undefined)
      assert.equal(storage.get('boo~1'), 'fiz')
    })

    test('should invalidate with wildcard two asterisk', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo~01', '0', 1, ['group', 'foo:0x'])
      storage.set('foo~02', '0', 1, ['group', 'foo:0x'])
      storage.set('foo~11', '1', 1, ['group', 'foo:1x'])
      storage.set('foo~12', '1', 1, ['group', 'foo:1x'])
      storage.set('boo~1', 'fiz', 1, ['group', 'boo:1x'])

      storage.invalidate('f*1*')

      assert.equal(storage.get('foo~01'), '0')
      assert.equal(storage.get('foo~02'), '0')
      assert.equal(storage.get('foo~11'), undefined)
      assert.equal(storage.get('foo~12'), undefined)
      assert.equal(storage.get('boo~1'), 'fiz')
    })

    test('should invalidate all with wildcard', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('a', '0', 1, ['a', 'a:01'])
      storage.set('b', '0', 1, ['b', 'b:01'])
      storage.set('c', '0', 1, ['c', 'c:01'])
      storage.set('d', '0', 1, ['d', 'd:01'])
      storage.set('e', '0', 1, ['e', 'e:01'])
      storage.set('f', '0', 1, ['f', 'f:01'])

      storage.invalidate('*')

      assert.equal(storage.get('a'), undefined)
      assert.equal(storage.get('b'), undefined)
      assert.equal(storage.get('c'), undefined)
      assert.equal(storage.get('d'), undefined)
      assert.equal(storage.get('e'), undefined)
      assert.equal(storage.get('f'), undefined)
    })

    test('should not invalidate anything with a non-existing reference', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('a', '0', 1, ['a', 'a:01'])
      storage.set('b', '0', 1, ['b', 'b:01'])
      storage.set('c', '0', 1, ['c', 'c:01'])
      storage.set('d', '0', 1, ['d', 'd:01'])
      storage.set('e', '0', 1, ['e', 'e:01'])
      storage.set('f', '0', 1, ['f', 'f:01'])

      assert.deepStrictEqual(storage.invalidate('zzz'), [])
    })

    test('should get a warning with invalidation disabled', async (t) => {
      const { equal, deepStrictEqual } = tspl(t, { plan: 2 })

      const storage = createStorage('memory', {
        log: {
          debug: () => { },
          warn: (error) => {
            equal(error.msg, 'acd/storage/memory.invalidate, exit due invalidation is disabled')
          }
        }
      })

      deepStrictEqual(storage.invalidate(['something']), [])
    })
  })

  describe('clear', async () => {
    test('should clear the whole storage (invalidation disabled)', async () => {
      const storage = createStorage('memory')
      storage.set('foo', 'bar', 10)
      storage.set('baz', 'buz', 10)

      storage.clear()

      assert.equal(storage.store.size, 0)
    })

    test('should clear the whole storage (invalidation enabled)', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo', 'bar', 10, ['fooers'])
      storage.set('baz', 'buz', 10, ['bazers'])

      storage.clear()

      assert.equal(storage.store.size, 0)
      assert.equal(storage.referencesKeys.size, 0)
      assert.equal(storage.keysReferences.size, 0)
    })

    test('should clear only keys with common name', async () => {
      const storage = createStorage('memory')
      storage.set('foo~1', 'bar', 10)
      storage.set('foo~2', 'baz', 10)
      storage.set('boo~1', 'fiz', 10)

      storage.clear('foo~')

      assert.equal(storage.get('foo~1'), undefined)
      assert.equal(storage.get('foo~2'), undefined)
      assert.equal(storage.get('boo~1'), 'fiz')
    })

    test('should clear a keys and their references', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('a-a', 1, 10, ['fooers', 'vowels', 'empty'])
      storage.set('a-b', 1, 10, ['fooers', 'consonantes'])
      storage.set('a-c', 1, 10, ['fooers', 'consonantes'])
      storage.set('b-d', 1, 10, ['consonantes'])
      storage.set('b-e', 1, 10, ['vowels'])

      storage.clear('a-')

      assert.equal(storage.get('a-a'), undefined)
      assert.equal(storage.get('a-b'), undefined)
      assert.equal(storage.get('a-c'), undefined)
      assert.equal(storage.get('b-d'), 1)
      assert.equal(storage.get('b-e'), 1)

      assert.deepStrictEqual(storage.referencesKeys.get('fooers'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('empty'), undefined)
      assert.deepStrictEqual(storage.referencesKeys.get('consonantes'), ['b-d'])
      assert.deepStrictEqual(storage.referencesKeys.get('vowels'), ['b-e'])

      assert.deepStrictEqual(storage.keysReferences.get('a-a'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('a-b'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('a-c'), undefined)
      assert.deepStrictEqual(storage.keysReferences.get('b-d'), ['consonantes'])
      assert.deepStrictEqual(storage.keysReferences.get('b-e'), ['vowels'])
    })
  })

  describe('refresh', async () => {
    test('should start a new storage', async () => {
      const storage = createStorage('memory')
      storage.set('foo', 'bar', 10)

      storage.refresh()
      assert.equal(storage.store.size, 0)
    })

    test('should start a new storage (invalidation enabled)', async () => {
      const storage = createStorage('memory', { invalidation: true })
      storage.set('foo', 'bar', 10, ['fooers'])

      storage.refresh()
      assert.equal(storage.store.size, 0)
      assert.equal(storage.referencesKeys.size, 0)
      assert.equal(storage.referencesKeys.size, 0)
    })
  })
})
