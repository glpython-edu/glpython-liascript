// Check with the real LiaScript player (not in CI: it needs
// liascript.github.io, the live embed and the CDNs, which can fail for
// reasons outside this repo). Run it before a macro release:
//
//   npm run check:player [visits]      (needs Chrome installed)
//
// The course (scripts/player/course.md) has a visualization-only block in a
// fragment, which is hidden when its slide opens. In presentation mode
// LiaScript creates the block's editor and the embed's iframe only when the
// fragment appears, and fills the editor a few milliseconds later; once the
// embed is cached, its "ready" can come first. Every visit must still show
// the program, the first one (embed loaded from the network) and the later
// ones (cached). The macro is this repo's README.md, served in place of the
// course's import.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const visits = Number(process.argv[2] ?? 5)
const courseOrigin = 'https://course.example'
const course = readFileSync(new URL('player/course.md', import.meta.url), 'utf8')
const macro = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const player = `https://liascript.github.io/course/?${courseOrigin}/course.md`
// The slide with the block, and its program (as LiaScript's editor has it).
const slide = 3
const programLength = course.match(/```python\n([\s\S]*?)\n```/)[1].length

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.route(`${courseOrigin}/**`, (route) => {
    const body = new URL(route.request().url()).pathname === '/macro.md' ? macro : course
    route.fulfill({ contentType: 'text/plain; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body })
  })
  await context.addInitScript(() => {
    // In the embed: the length of each program it gets.
    if (location.origin === 'https://glpython-edu.github.io') {
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'glpython:visualize') console.log(`glpython-check: visualize ${(event.data.source ?? '').length}`)
      })
      return
    }
    // The player in presentation mode, where fragments start hidden.
    if (window.top === window && !localStorage.getItem('settings')) localStorage.setItem('settings', JSON.stringify({ mode: 'Presentation', table_of_contents: false }))
  })
  const page = await context.newPage()
  let lengths = []
  page.on('console', (message) => {
    const match = message.text().match(/^glpython-check: visualize (\d+)$/)
    if (match) lengths.push(Number(match[1]))
  })
  await page.goto(`${player}#1`)
  await page.waitForSelector('.lia-slide__content', { timeout: 60000 })
  for (let visit = 0; visit < visits; visit++) {
    lengths = []
    await page.evaluate((hash) => { location.hash = hash }, `#${slide - 1}`)
    await page.waitForTimeout(1500)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(1000)
    await page.keyboard.press('ArrowRight')
    // The visualizer, once Pyodide has traced the program (the first visit
    // loads it).
    let steps = null
    for (let tries = 0; tries < 120 && steps === null; tries++) {
      await page.waitForTimeout(500)
      for (const frame of page.frames().filter((frame) => frame.url().startsWith('https://glpython-edu.github.io/'))) {
        const count = await frame.evaluate(() => document.querySelector('.visualizer-view') ? document.querySelector('.visualizer-step-count')?.textContent ?? '' : null).catch(() => null)
        if (count !== null) steps = count
      }
    }
    const ok = lengths.length === 1 && lengths[0] === programLength && steps !== null && !/Keine Schritte|No steps/.test(steps)
    results.push(ok)
    console.log(`visit ${visit + 1}${visit === 0 ? ' (embed not cached)' : ''}: program sent ${JSON.stringify(lengths)} characters, visualizer «${steps ?? 'none'}»: ${ok ? 'ok' : 'FAILED'}`)
  }
} finally {
  await browser.close()
}
if (results.includes(false)) {
  console.error(`Player check failed: ${results.filter((ok) => !ok).length} of ${results.length} visits.`)
  process.exit(1)
}
console.log(`Player check passed: ${results.length} visits.`)
