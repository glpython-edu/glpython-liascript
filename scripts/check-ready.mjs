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
]

const escape = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>glpython ready check</title></head>
<body>
${blocks.map((block) => `<div class="lia-slide__content" data-block="${block.id}">
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
${onload}
for (const block of document.querySelectorAll('.lia-slide__content')) {
  const id = block.dataset.block
  window.__glpythonMount([id, block.querySelector('.glpython-embed').className.split('--')[1], '@0', '@1', '@2', '@3', '@4', '@5', '@6', '@7'], { lia: () => {} })
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
  await check('▶ and «Tests» usable while the first program waits', async () => {
    assert.equal(await runButton.isEnabled(), true, '▶ is disabled')
    const clickedAt = Date.now()
    await runButton.click()
    await tab.locator('#glpython-tests-click').click()
    await tab.waitForTimeout(300)
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
} finally {
  await browser.close()
}
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('Ready check passed.')
