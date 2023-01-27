import { promises } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { supportedBundlers } from './supported-bundlers.js'
import { createDeferredPromise } from './util.js'
import { exec } from 'child_process'

const { copyFile, mkdir, rmdir } = promises

function highlightFile (file) {
  return `\x1b[33m${file.replace(process.cwd() + '/', '')}\x1b[0m`
}

function info (message) {
  console.info(`\x1b[34m[INFO]\x1b[0m ${message}`)
}

function error (message) {
  console.info(`\x1b[31m[ERROR]\x1b[0m ${message}`)
}

async function run (command) {
  info(`Executing \x1b[33m${command}\x1b[0m ...`)
  const { promise, reject, resolve } = createDeferredPromise()

  let hasOutput = false
  function logOutput (chunk) {
    if (!hasOutput) {
      hasOutput = true
      console.log('')
    }

    console.log(chunk.toString('utf-8').trim().replace(/^/gm, '       '))
  }

  try {
    const process = exec(command, { stdio: 'pipe' }, (error) => {
      if (error) {
        return reject(error)
      }

      resolve(error)
    })

    process.stdout.on('data', logOutput)
    process.stderr.on('data', logOutput)

    await promise

    if (hasOutput) {
      console.log('')
    }
  } catch (err) {
    if (hasOutput) {
      console.log('')
    }

    error(`Command \x1b[33m${command}\x1b[0m failed with exit code ${err.code}.`)
    process.exit(1)
  }
}

async function main () {
  const bundler = process.argv[2] || process.env.BUNDLER

  if (!supportedBundlers.includes(bundler)) {
    error(`Usage: node await runner-prepare.mjs [${supportedBundlers.join('|')}]`)
    error('You can also use the BUNDLER environment variable.')
    process.exit(1)
  }

  const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), `../../../tmp/${bundler}`)
  const sourceIndex = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../test/browser/fixtures/index.html')
  const targetIndex = resolve(rootDir, 'index.html')

  info(`Emptying directory ${highlightFile(rootDir)} ...`)
  try {
    await rmdir(rootDir, { recursive: true })
  } catch (err) {
    // noop
  }

  await mkdir(rootDir, { recursive: true })
  info(`Copying ${highlightFile(sourceIndex)} to ${highlightFile(targetIndex)} ...`)
  await copyFile(sourceIndex, targetIndex)

  switch (bundler) {
    case 'esbuild': {
      await run('node test/browser/fixtures/esbuild.browser.config.mjs')
      break
    }
    case 'rollup': {
      await run('rollup -c test/browser/fixtures/rollup.browser.config.mjs')
      break
    }
  }
}

main().catch((err) => {
  error(err)
  process.exit(1)
})
