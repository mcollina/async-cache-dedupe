'use strict'

function createDeferredPromise () {
  let _resolve
  let _reject

  const promise = new Promise((resolve, reject) => {
    _resolve = resolve
    _reject = reject
  })
  return {
    promise,
    resolve: _resolve,
    reject: _reject
  }
}

function highlightFile (file) {
  return `\x1b[33m${file.replace(process.cwd() + '/', '')}\x1b[0m`
}

function info (message) {
  console.info(`\x1b[34m[INFO]\x1b[0m ${message}`)
}

function error (message) {
  console.info(`\x1b[31m[ERROR]\x1b[0m ${message}`)
}

module.exports = { createDeferredPromise, highlightFile, info, error }
