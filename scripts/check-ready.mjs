// Browser check of the first program the macro sends, on the embed's
// "ready": it must carry the block's text, also when LiaScript fills the
// editor only after "ready" (a block in a fragment, with the embed cached).
// A test page runs the macro's @onload code with blocks as LiaScript renders
// them, but with a stand-in for LiaScript's editor (<lia-editor>) that, like
// LiaScript's, takes the text it is given a little later and then signals
// Ace's change event (element.env.editor). The embed is a stub that says
// "ready" and records what it receives. Everything is served by Playwright's
// routes: no external sites, no timing of real loads.
//
//   npm run check:ready      (needs Chrome installed, as on GitHub's runners)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import lz from 'lz-string'
import { chromium } from 'playwright-core'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const onload = readme.match(/^@onload\n([\s\S]*?)\n@end$/m)[1]
const template = readme.match(/\n(<div class="glpython-embed[\s\S]*?<\/div>)\n@end/)[1]
const courseOrigin = 'https://course.example'
const embedOrigin = 'https://glpython-edu.github.io'
// How long the macro waits at most for a block's text (editorTextTimeout).
const textTimeout = 2000

// The blocks: an id, the macro's mode, the editors' texts, and when each
// editor gets its text - "start" (before "ready"), a number of milliseconds
// after "ready", or never (null).
const blocks = [
  { id: 'late', mode: 'visual', editors: [{ text: 'x = 1\nprint(x)', fill: 300 }] },
  { id: 'early', mode: 'visual', editors: [{ text: 'y = 2', fill: 'start' }] },
  { id: 'empty', mode: 'visual', editors: [{ text: '', fill: null }] },
  { id: 'files', mode: 'eval', editors: [{ text: '', fill: 'start' }, { text: 'import datei1\nz = 3', fill: 'start' }] },
  { id: 'click', mode: 'eval', editors: [{ text: 'w = 4', fill: 1000 }] },
  // A block with features= (LiaScript splits the argument at its commas).
  { id: 'feat', mode: 'eval', options: ['features=run', 'repl', 'visualize', 'tests', 'ide', 'coverage', 'listtree', 'tree'], editors: [{ text: 'v = 5', fill: 'start' }] },
]

const escape = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>glpython ready check</title></head>
<body>
${blocks.map((block) => `<div class="lia-slide__content" data-block="${block.id}" data-options="${escape(JSON.stringify(block.options ?? []))}">
  <div class="lia-code--block">${block.editors.map((editor) => `<lia-editor data-text="${escape(editor.text)}" data-fill="${editor.fill}"></lia-editor>`).join('')}</div>
  ${template.replaceAll('@0', block.id).replaceAll('@1', block.mode)}
</div>`).join('\n')}
<script>
// LiaScript's editor, as far as the macro uses it: "value" set from outside
// arrives a moment later (LiaScript waits for its Ace editor), then Ace's
// change event; LiaScript's own events don't come for it.
customElements.define('lia-editor', class extends HTMLElement {
  constructor() {
    super()
    this.model = { value: this.dataset.fill === 'start' ? this.dataset.text : '' }
    this.changeListeners = new Set()
  }
  connectedCallback() {
    this.env = { editor: { on: (name, listener) => this.changeListeners.add(listener), off: (name, listener) => this.changeListeners.delete(listener) } }
  }
  get value() { return this.model.value }
  set value(text) {
    window.setTimeout(() => {
      this.model.value = text
      for (const listener of [...this.changeListeners]) listener({ action: 'insert' })
    }, 10)
  }
})
window.readyAt = {}
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'glpython:ready') return
  const content = [...document.querySelectorAll('.lia-slide__content')].find((element) => element.querySelector('iframe').contentWindow === event.source)
  const id = content.dataset.block
  window.readyAt[id] = Date.now()
  for (const editor of content.querySelectorAll('lia-editor')) {
    const fill = Number(editor.dataset.fill)
    if (editor.dataset.fill !== 'start' && editor.dataset.fill !== 'null') window.setTimeout(() => { editor.value = editor.dataset.text }, fill)
  }
})
</script>
<script>
// As LiaScript renders the template: the buttons after the first in a
// paragraph of their own.
for (const row of document.querySelectorAll('.glp-buttons')) {
  const paragraph = document.createElement('p')
  paragraph.className = 'lia-paragraph'
  paragraph.append(...[...row.children].slice(1))
  row.append(paragraph)
}
</script>
<script>
${onload}
for (const block of document.querySelectorAll('.lia-slide__content')) {
  const id = block.dataset.block
  const options = JSON.parse(block.dataset.options)
  window.__glpythonMount([id, block.querySelector('.glpython-embed').className.split('--')[1], ...['@0', '@1', '@2', '@3', '@4', '@5', '@6', '@7'].map((placeholder, index) => options[index] ?? placeholder)], { lia: () => {} })
}
</script>
</body></html>`

// The embed: "ready" with every capability the macro asks about, and a log
// of what arrives.
const stub = `<!doctype html><meta charset="utf-8"><script>
window.received = []
window.addEventListener('message', (event) => { window.received.push({ ...event.data, at: Date.now() }) })
parent.postMessage({ type: 'glpython:ready', version: 1, capabilities: { input: false, files: true, tests: true, stop: true } }, '${courseOrigin}')
</script>`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const failures = []
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 4000 } })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin === courseOrigin) return route.fulfill({ contentType: 'text/html', body: page })
    if (url.origin === embedOrigin) return route.fulfill({ contentType: 'text/html', body: stub })
    return route.abort()
  })
  const tab = await context.newPage()
  tab.on('pageerror', (error) => failures.push(`page error: ${error.message}`))
  await tab.goto(`${courseOrigin}/`)
  await tab.waitForFunction((count) => Object.keys(window.readyAt).length === count, blocks.length, { timeout: 10000 })
  const embed = (id) => tab.frameLocator(`#glpython-frame-${id}`).locator('html')
  const received = async (id) => (await embed(id).evaluate(() => window.received)).filter((message) => message.type !== 'glpython:reset')
  const readyAt = (id) => tab.evaluate((block) => window.readyAt[block], id)

  // Nothing waits for the text but the first program: right after "ready",
  // ▶ and «Tests» work, and a program sent meanwhile replaces the first one.
  const runButton = tab.locator('#glpython-run-click')
  await runButton.waitFor({ state: 'visible' })
  const check = async (label, test) => {
    try {
      await test()
      console.log(`${label}: ok`)
    } catch (error) {
      failures.push(`${label}: ${error.message}`)
    }
  }
  // What this catches: ▶ held back until the block's text arrives (1000 ms
  // after "ready" here) or until the macro stops waiting for it (2000 ms).
  // So the time counts from the click itself, in the page (Playwright's
  // click first waits for the button to be stable and scrolls it into view,
  // which took up to ~400 ms on a busy machine, P58), to the message's
  // arrival in the embed; 250 ms is far below either wait. The click must
  // come before the text, or the check would prove nothing.
  // What a button copies: the clipboard gets a mark first, then the click,
  // then we wait until the copy has replaced the mark (writing to the
  // clipboard is asynchronous; a fixed wait could read the mark, P58).
  const copiedLink = async (tab, button) => {
    await tab.evaluate(() => navigator.clipboard.writeText('(nothing copied)'))
    await button.click()
    await tab.waitForFunction(async () => (await navigator.clipboard.readText()) !== '(nothing copied)', null, { timeout: 5000, polling: 50 })
    return new URL(await tab.evaluate(() => navigator.clipboard.readText()))
  }
  await check('▶ and «Tests» usable while the first program waits', async () => {
    assert.equal(await runButton.isEnabled(), true, '▶ is disabled')
    await tab.evaluate(() => {
      window.clickedAt = null
      document.querySelector('#glpython-run-click').addEventListener('click', () => { window.clickedAt ??= Date.now() }, { capture: true, once: true })
    })
    await runButton.click()
    await tab.locator('#glpython-tests-click').click()
    await embed('click').evaluate(() => new Promise((resolve) => {
      const done = () => window.received.filter((message) => message.type !== 'glpython:reset').length >= 2
      if (done()) return resolve()
      const timer = setInterval(() => { if (done()) { clearInterval(timer); resolve() } }, 10)
    }))
    const clickedAt = await tab.evaluate(() => window.clickedAt)
    assert.ok(clickedAt - await readyAt('click') < 1000, `the click came ${clickedAt - await readyAt('click')} ms after "ready", after the text: the check can't tell`)
    const messages = await received('click')
    assert.deepEqual(messages.map((message) => message.type), ['glpython:run', 'glpython:test'])
    assert.ok(messages[0].at - clickedAt < 250, `the run came ${messages[0].at - clickedAt} ms after the click`)
  })

  // Past the longest wait: every first program has gone out (or not).
  await tab.waitForTimeout(textTimeout + 500)

  await check('text after "ready": sent as soon as it arrives', async () => {
    const messages = await received('late')
    assert.deepEqual(messages.map((message) => [message.type, message.source]), [['glpython:visualize', 'x = 1\nprint(x)']])
    const after = messages[0].at - await readyAt('late')
    assert.ok(after >= 300 && after < 800, `sent ${after} ms after "ready"`)
  })
  await check('text before "ready": sent right away', async () => {
    const messages = await received('early')
    assert.deepEqual(messages.map((message) => [message.type, message.source]), [['glpython:visualize', 'y = 2']])
    const after = messages[0].at - await readyAt('early')
    assert.ok(after < 250, `sent ${after} ms after "ready"`)
  })
  await check('a block empty on purpose: sent after the wait', async () => {
    const messages = await received('empty')
    assert.deepEqual(messages.map((message) => [message.type, message.source]), [['glpython:visualize', '']])
    const after = messages[0].at - await readyAt('empty')
    assert.ok(after >= textTimeout - 50 && after < textTimeout + 400, `sent ${after} ms after "ready"`)
  })
  await check('several files, one of them empty: no wait', async () => {
    const messages = await received('files')
    assert.deepEqual(messages.map((message) => [message.type, message.files?.map((file) => file.source)]), [['glpython:load', ['', 'import datei1\nz = 3']]])
    const after = messages[0].at - await readyAt('files')
    assert.ok(after < 250, `sent ${after} ms after "ready"`)
  })
  await check('a program sent meanwhile: the first one is dropped', async () => {
    const messages = await received('click')
    assert.deepEqual(messages.map((message) => message.type), ['glpython:run', 'glpython:test'])
  })

  // «IDE-Link kopieren»: the IDE's compact link (?p=, raw deflate in
  // base64url), read here with Node's zlib; where fflate doesn't load, the
  // old ?project= (lz-string). Both libraries come from node_modules, the
  // same bytes as on jsDelivr (their integrity hashes hold).
  const library = (name) => readFileSync(new URL(`../node_modules/${name}`, import.meta.url))
  for (const fflateLoads of [true, false]) {
    const label = fflateLoads ? '«IDE-Link kopieren» writes ?p=' : '«IDE-Link kopieren» without fflate writes ?project='
    const linkContext = await browser.newContext({ viewport: { width: 1000, height: 4000 }, permissions: ['clipboard-read', 'clipboard-write'] })
    await linkContext.route('**/*', (route) => {
      const url = new URL(route.request().url())
      const headers = { 'Access-Control-Allow-Origin': '*' }
      if (url.origin === courseOrigin) return route.fulfill({ contentType: 'text/html', body: page })
      if (url.origin === embedOrigin) return route.fulfill({ contentType: 'text/html', body: stub })
      if (url.href.endsWith('/lz-string@1.5.0/libs/lz-string.min.js')) return route.fulfill({ contentType: 'text/javascript', headers, body: library('lz-string/libs/lz-string.min.js') })
      if (fflateLoads && url.href.endsWith('/fflate@0.8.3/umd/index.js')) return route.fulfill({ contentType: 'text/javascript', headers, body: library('fflate/umd/index.js') })
      return route.abort()
    })
    const linkTab = await linkContext.newPage()
    linkTab.on('pageerror', (error) => failures.push(`page error: ${error.message}`))
    await linkTab.goto(`${courseOrigin}/`)
    await check(label, async () => {
      const button = linkTab.locator('#glpython-ide-files')
      await linkTab.waitForFunction(() => document.querySelector('#glpython-ide-files')?.disabled === false, null, { timeout: 10000 })
      const link = await copiedLink(linkTab, button)
      assert.equal(link.origin + link.pathname, `${embedOrigin}/`)
      const compact = link.searchParams.get('p')
      const old = link.searchParams.get('project')
      assert.equal(compact !== null, fflateLoads, `the link: ${link.search.slice(0, 12)}…`)
      if (compact !== null) assert.match(compact, /^[A-Za-z0-9_-]+$/, 'base64url without padding')
      const payload = JSON.parse(compact !== null ? inflateRawSync(Buffer.from(compact, 'base64url')).toString('utf8') : lz.decompressFromEncodedURIComponent(old))
      assert.equal(payload.mainFile, 'datei2.py')
      assert.equal(payload.features, undefined, 'a block without features= writes none')
      assert.deepEqual(Object.values(payload.files).map((file) => [file.path, file.code]), [['datei1.py', ''], ['datei2.py', 'import datei1\nz = 3']])
    })
    if (fflateLoads) {
      await check('«IDE-Link kopieren» carries the block\'s features=', async () => {
        await linkTab.waitForFunction(() => document.querySelector('#glpython-ide-feat')?.disabled === false, null, { timeout: 10000 })
        const link = await copiedLink(linkTab, linkTab.locator('#glpython-ide-feat'))
        const payload = JSON.parse(inflateRawSync(Buffer.from(link.searchParams.get('p'), 'base64url')).toString('utf8'))
        assert.deepEqual(payload.features, ['run', 'repl', 'visualize', 'tests', 'ide', 'coverage', 'listtree', 'tree'])
      })
    }
    await linkContext.close()
  }

  // The channel (P55): without the flag the live embed and IDE; with
  // localStorage.glpythonChannel = "dev" the dev embed and the dev IDE;
  // "#glpython=dev" in the course's address sets the flag, "#glpython=live"
  // clears it.
  for (const [label, flag, hash, dev] of [
    ['the channel: live without the flag', null, '', false],
    ['the channel: dev with the flag', 'dev', '', true],
    ['the channel: #glpython=dev sets the flag', null, '#glpython=dev', true],
    ['the channel: #glpython=live clears it', 'dev', '#glpython=live', false],
  ]) {
    const channelContext = await browser.newContext({ viewport: { width: 1000, height: 4000 }, permissions: ['clipboard-read', 'clipboard-write'] })
    await channelContext.route('**/*', (route) => {
      const url = new URL(route.request().url())
      const headers = { 'Access-Control-Allow-Origin': '*' }
      if (url.origin === courseOrigin) return route.fulfill({ contentType: 'text/html', body: page })
      if (url.origin === embedOrigin) return route.fulfill({ contentType: 'text/html', body: stub })
      if (url.href.endsWith('/lz-string@1.5.0/libs/lz-string.min.js')) return route.fulfill({ contentType: 'text/javascript', headers, body: library('lz-string/libs/lz-string.min.js') })
      if (url.href.endsWith('/fflate@0.8.3/umd/index.js')) return route.fulfill({ contentType: 'text/javascript', headers, body: library('fflate/umd/index.js') })
      return route.abort()
    })
    if (flag) await channelContext.addInitScript((value) => { if (window.top === window && !sessionStorage.getItem('flagged')) { localStorage.setItem('glpythonChannel', value); sessionStorage.setItem('flagged', '1') } }, flag)
    const channelTab = await channelContext.newPage()
    channelTab.on('pageerror', (error) => failures.push(`page error: ${error.message}`))
    await channelTab.goto(`${courseOrigin}/${hash}`)
    await check(label, async () => {
      const src = new URL(await channelTab.locator('#glpython-frame-files').getAttribute('src'))
      assert.equal(src.origin + src.pathname, dev ? `${embedOrigin}/glpython-editor/dev/index.html` : `${embedOrigin}/glpython-editor/index.html`, 'the embed')
      assert.equal(src.searchParams.get('channelBadge'), dev ? 'host' : null, 'the embed leaves the badge to the block')
      // The badge at the top of the block, next to its buttons; a
      // visualization-only block ("late") shows a row with only the badge.
      for (const id of ['files', 'late']) {
        assert.equal(await channelTab.locator(`#glpython-channel-${id}`).isVisible(), dev, `the badge of block ${id}`)
        assert.equal(await channelTab.locator(`#glpython-controls-${id}`).isVisible(), id === 'files' || dev, `the button row of block ${id}`)
      }
      if (dev) assert.equal(await channelTab.locator('#glpython-reset-late').isVisible(), false, 'no buttons in a visualization-only block')
      await channelTab.waitForFunction(() => document.querySelector('#glpython-ide-files')?.disabled === false, null, { timeout: 10000 })
      const link = await copiedLink(channelTab, channelTab.locator('#glpython-ide-files'))
      assert.equal(link.origin + link.pathname, dev ? `${embedOrigin}/dev/` : `${embedOrigin}/`, 'the IDE link')
      assert.equal(await channelTab.evaluate(() => localStorage.getItem('glpythonChannel')), dev ? 'dev' : null, 'the flag')
    })
    await channelContext.close()
  }

  // The embed's height (P53b): what its content needs (glpython:resize), at
  // most 80% of the visible height of the element that scrolls the course
  // (here a stand-in for LiaScript's .lia-slide__container) with the
  // block's buttons; measured anew when that element changes size. With
  // "large", while visualizing, that maximum.
  {
    const heightPage = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<div class="lia-slide__container" style="height:600px;overflow:auto">
${[['tall', 'eval', []], ['big', 'eval', ['large']]].map(([id, mode, options]) => `<div class="lia-slide__content" data-block="${id}" data-options="${escape(JSON.stringify(options))}">
  <div class="lia-code--block"><lia-editor data-text="x = 1" data-fill="start"></lia-editor></div>
  ${template.replaceAll('@0', id).replaceAll('@1', mode)}
  <p>Text</p>
</div>`).join('\n')}
</div>
${page.slice(page.indexOf('<script>'), page.lastIndexOf('</body>'))}
</body></html>`
    const heightContext = await browser.newContext({ viewport: { width: 1000, height: 800 } })
    await heightContext.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin === courseOrigin) return route.fulfill({ contentType: 'text/html', body: heightPage })
      if (url.origin === embedOrigin) return route.fulfill({ contentType: 'text/html', body: stub })
      return route.abort()
    })
    const heightTab = await heightContext.newPage()
    heightTab.on('pageerror', (error) => failures.push(`page error: ${error.message}`))
    await heightTab.goto(`${courseOrigin}/`)
    await heightTab.waitForFunction(() => Object.keys(window.readyAt).length === 2, null, { timeout: 10000 })
    const report = (id, height, visualizing) => heightTab.frameLocator(`#glpython-frame-${id}`).locator('html').evaluate((html, [height, visualizing, origin]) => parent.postMessage({ type: 'glpython:resize', version: 4, height, visualizing }, origin), [height, visualizing, courseOrigin])
    const sizes = (id) => heightTab.evaluate((id) => ({ frame: document.querySelector(`#glpython-frame-${id}`).clientHeight, block: document.querySelector(`#glpython-frame-${id}`).closest('.glpython-embed').getBoundingClientRect().height }), id)
    const settle = () => heightTab.waitForTimeout(150)
    await check('the embed\'s height: at most 80% of the visible height', async () => {
      await report('tall', 2000, true)
      await settle()
      let size = await sizes('tall')
      assert.ok(Math.abs(size.block - 480) <= 2, `the block 80% of 600px: ${JSON.stringify(size)}`)
      await report('tall', 300, true)
      await settle()
      size = await sizes('tall')
      assert.equal(size.frame, 300, 'a short content: its own height')
      await report('tall', 2000, true)
      await heightTab.evaluate(() => { document.querySelector('.lia-slide__container').style.height = '900px' })
      await settle()
      size = await sizes('tall')
      assert.ok(Math.abs(size.block - 720) <= 2, `a taller visible area: 80% of 900px (${JSON.stringify(size)})`)
      await heightTab.evaluate(() => { document.querySelector('.lia-slide__container').style.height = '600px' })
    })
    await check('the embed\'s height: "large" while visualizing', async () => {
      await report('big', 300, false)
      await settle()
      assert.equal((await sizes('big')).frame, 300, 'not visualizing: its own height')
      await report('big', 300, true)
      await settle()
      const size = await sizes('big')
      assert.ok(Math.abs(size.block - 480) <= 2, `visualizing: 80% of 600px (${JSON.stringify(size)})`)
    })
    await heightContext.close()
  }
} finally {
  await browser.close()
}
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('Ready check passed.')
