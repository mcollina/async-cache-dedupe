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

function sleep (ms) {
  return new Promise((resolve) => setInterval(resolve, ms))
}

module.exports = { createDeferredPromise, sleep }
