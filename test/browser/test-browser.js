'use strict'

const logger = globalThis.logger || console.log
const { createDeferredPromise } = require('./helpers/util.js')
const tape = require('tape')
const { kAsyncCacheDedupeSuiteName, kAsyncCacheDedupeSuiteHasMultipleTests } = require('./helpers/symbols.js')

let totalTests = 0
let completed = 0
let failed = 0

async function test (rootName, fn) {
  // Gather all tests in the file
  const tests = {}
  function addTests (name, fn) {
    tests[`${rootName} - ${name}`] = fn
  }
  if (fn[kAsyncCacheDedupeSuiteHasMultipleTests]) {
    fn(addTests)
  } else {
    tests[rootName] = fn
  }

  // Execute each test in a separate harness and then output overall results
  for (const [name, subtest] of Object.entries(tests)) {
    const currentIndex = ++totalTests
    const harness = tape.createHarness()
    const { promise, resolve } = createDeferredPromise()
    const messages = [`# Subtest: ${name}`]

    harness.createStream().on('data', function (row) {
      if (row.startsWith('TAP version') || row.match(new RegExp(`^# (?:${name})`))) {
        return
      }
      messages.push(row.trim().replace(/^/gm, '    '))
    })

    harness.onFinish(() => {
      const success = harness._exitCode === 0
      messages.push(`${success ? 'ok' : 'not ok'} ${currentIndex} - ${name}`)
      logger(messages.join('\n'))
      completed++
      if (!success) {
        failed++
      }
      resolve()
    })

    harness(name, subtest)
    await promise
  }
}

async function runTests (suites) {
  // Setup an interval
  const interval = setInterval(() => {
    if (completed < totalTests) {
      return
    }
    clearInterval(interval)

    logger(`1..${totalTests}`)
    logger(`# tests ${totalTests}`)
    logger(`# pass  ${completed - failed}`)
    logger(`# fail  ${failed}`)
    logger(`# ${failed === 0 ? 'ok' : 'not ok'}`)

    // This line is used by the playwright script to detect we're done
    logger('# async-cache-dedupe-finished')
  }, 100)

  // Execute each test serially, to avoid side-effects errors when dealing with global error handling
  for (const suite of suites) {
    await test(suite[kAsyncCacheDedupeSuiteName], suite)
  }
}

runTests([
  require('./storage-base.browser.test.js'),
  require('./storage-memory.browser.test.js')
]).catch((err) => {
  console.error(err)
  process.exit(1)
})
