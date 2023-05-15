import { supportedBrowsers } from './supported-browsers.js'
import { supportedBundlers } from './supported-bundlers.js'
import { chromium, firefox, webkit } from 'playwright'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { info, error, highlightFile, createDeferredPromise } from './util.js'
import { Parser } from 'tap-parser'
import Reporter from 'tap-mocha-reporter'

async function runCommand (command) {
  info(`Executing \x1b[33m${command}\x1b[0m ...`)
  const { promise, reject, resolve } = createDeferredPromise()

  let hasOutput = false
  function logOutput (chunk) {
    if (!hasOutput) {
      hasOutput = true
      info('')
    }

    info(chunk.toString('utf-8').trim().replace(/^/gm, '       '))
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
      info('')
    }
  } catch (err) {
    if (hasOutput) {
      info('')
    }

    error(`Command \x1b[33m${command}\x1b[0m failed with exit code ${err.code}.`)
    process.exit(1)
  }
}

function createConfiguration () {
  let [browser, bundler] = process.argv.slice(2, 4)
  if (!browser) browser = process.env.BROWSER
  if (!bundler) bundler = process.env.BUNDLER

  if (!supportedBrowsers.includes(browser) || !supportedBundlers.includes(bundler)) {
    error(`Usage: npm run test:browser [${supportedBrowsers.join('|')}] [${supportedBundlers.join('|')}]`)
    error('You can also use the BROWSER and BUNDLER environment variables.')
    process.exit(1)
  }

  const headless = process.env.HEADLESS !== 'false'
  const reporter = process.env.REPORTER !== 'true'

  return { browser, bundler, headless, reporter }
}

async function setupTest ({ bundler }) {
  const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), `../../../tmp/${bundler}`)
  const sourceIndex = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../test/browser/fixtures/index.html')
  const targetIndex = resolve(rootDir, 'index.html')

  info(`Emptying directory ${highlightFile(rootDir)} ...`)
  try {
    await rm(rootDir, { recursive: true })
  } catch (err) {
    // noop
  }

  await mkdir(rootDir, { recursive: true })
  info(`Copying ${highlightFile(sourceIndex)} to ${highlightFile(targetIndex)} ...`)
  await copyFile(sourceIndex, targetIndex)

  switch (bundler) {
    case 'browserify': {
      await runCommand('browserify test/browser/test-browser.js -o tmp/browserify/suite.browser.js -u ./src/storage/redis.js')
      break
    }
    case 'esbuild': {
      await runCommand('node test/browser/fixtures/esbuild.browser.config.mjs')
      break
    }
    case 'rollup': {
      await runCommand('rollup -c test/browser/fixtures/rollup.browser.config.mjs')
      break
    }
    case 'vite': {
      await runCommand('vite build --config test/browser/fixtures/vite.browser.config.mjs')
      break
    }
    case 'webpack': {
      await runCommand('webpack -c test/browser/fixtures/webpack.browser.config.mjs')
      break
    }
  }
}

function createBrowser ({ browser, headless }) {
  switch (browser) {
    case 'edge':
      return chromium.launch({ headless, channel: 'msedge' })
    case 'firefox':
      return firefox.launch({ headless })
    case 'safari':
      return webkit.launch({ headless })
    default:
      return chromium.launch({ headless })
  }
}

function setupTape (browser, page, config) {
  const output = new Readable({ read () {} })
  const parser = new Parser({ strict: true })

  output.pipe(parser)

  if (config.reporter) {
    output.pipe(Reporter('spec'))
  }

  parser.on('line', (line) => {
    if (line !== '# async-cache-dedupe-finished\n') {
      if (line.startsWith('# not ok')) {
        process.exitCode = 1
      }

      if (!config.reporter) {
        info(line.replace(/\n$/, ''))
      }

      return
    }

    output.push(null)

    if (config.headless) {
      browser.close()
    }
  })

  // Catching console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      error(`\x1b[31m\x1b[1mconsole.error:\x1b[0m ${msg.text()}\n`)
      return
    }

    output.push(msg.text() + '\n')
  })

  // Firefox in headless mode is showing an error even if onerror caught it. Disable in that case
  if (!config.headless || config.browser !== 'firefox') {
    page.on('pageerror', (err) => {
      error('\x1b[31m\x1b[1m--- The browser thrown an uncaught error ---\x1b[0m')
      error(err)

      if (config.headless) {
        error('\x1b[31m\x1b[1m--- Exiting with exit code 1 ---\x1b[0m')
        process.exit(1)
      } else {
        process.exitCode = 1
      }
    })
  }
}

async function main () {
  const config = createConfiguration()

  // Generate the bundles
  await setupTest(config).catch(err => {
    error(err)
  })

  // Creating the browser and configuring the pagew with Tape
  const browser = await createBrowser(config)
  const page = await browser.newPage()
  setupTape(browser, page, config)

  // Run the test suite
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const url = `file://${resolve(__dirname, `../../../tmp/${config.bundler}/index.html`)}`
  await page.goto(url).catch((err) => {
    error(err)
  })
}

await main().catch(err => {
  error(err)
  process.exit(1)
})
