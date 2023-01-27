import { supportedBrowsers } from './supported-browsers.js'
import { supportedBundlers } from './supported-bundlers.js'
import { chromium, firefox } from 'playwright'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import Parser from 'tap-parser'
import Reporter from 'tap-mocha-reporter'

function parseEnvironment () {
  const headless = process.env.HEADLESS !== 'false'
  const reporter = process.env.REPORTER !== 'true'

  let [browser, bundler] = process.argv.slice(2, 4)
  if (!browser) browser = process.env.BROWSER
  if (!bundler) bundler = process.env.BUNDLER

  if (!supportedBrowsers.includes(browser) || !supportedBundlers.includes(bundler)) {
    console.error(`Usage: node await runner-browser.mjs [${supportedBrowsers.join('|')}] [${supportedBundlers.join('|')}]`)
    console.error('You can also use the BROWSER and BUNDLER environment variables.')
    process.exit(1)
  }

  return { browser, bundler, headless, reporter }
}

function createBrowser ({ browser, headless }) {
  switch (browser) {
    case 'edge':
      return chromium.launch({ headless, channel: 'msedge' })
    case 'firefox':
      return firefox.launch({ headless })
    default:
      return chromium.launch({ headless })
  }
}

function setupTape (page, config) {
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
        console.log(line.replace(/\n$/, ''))
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
      console.error(`\x1b[31m\x1b[1mconsole.error:\x1b[0m ${msg.text()}\n`)
      return
    }

    output.push(msg.text() + '\n')
  })

  // Firefox in headless mode is showing an error even if onerror caught it. Disable in that case
  if (!config.headless || config.browser !== 'firefox') {
    page.on('pageerror', (err) => {
      console.log('\x1b[31m\x1b[1m--- The browser thrown an uncaught error ---\x1b[0m')
      console.log(err)

      if (config.headless) {
        console.log('\x1b[31m\x1b[1m--- Exiting with exit code 1 ---\x1b[0m')
        process.exit(1)
      } else {
        process.exitCode = 1
      }
    })
  }
}

const config = parseEnvironment()
const browser = await createBrowser(config)
const page = await browser.newPage()
setupTape(page, config)

// Run the test suite
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const url = `file://${resolve(__dirname, `../../../tmp/${config.bundler}/index.html`)}`
await page.goto(url).catch((err) => {
  console.log(err)
})
