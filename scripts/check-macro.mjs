process.exit(1) // Test: a red check must block the merge (P55); this PR is closed, never merged.
// Syntax check of the macro: every <script> block in README.md, as LiaScript
// runs it, goes through `node --check`. LiaScript replaces the placeholders
// (@0, @1, @'input, …) before running a block; they all sit inside string
// literals, so the blocks are checked as written - a placeholder outside a
// string would be a syntax error here, as it would be in most courses.
//
//   node scripts/check-macro.mjs
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const blocks = [...readme.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => ({
  code: match[1],
  line: readme.slice(0, match.index).split('\n').length,
}))
// The shared code in @onload, which LiaScript runs once per course as written.
// Its first line is the one with @onload, like <script> above.
for (const match of readme.matchAll(/^@onload\n([\s\S]*?)\n@end$/gm)) {
  blocks.push({ code: `\n${match[1]}`, line: readme.slice(0, match.index).split('\n').length })
}
if (blocks.length === 0) {
  console.error('No <script> blocks found in README.md.')
  process.exit(1)
}

const folder = mkdtempSync(join(tmpdir(), 'glpython-macro-'))
let failed = 0
for (const [index, block] of blocks.entries()) {
  // LiaScript replaces "@1" wherever it appears, also inside a URL such as
  // ".../lz-string@1.5.0/..."; a placeholder the macro means stands on its
  // own ("@0"), never right after a letter, digit or "-./". Write "\u0040".
  block.code.split('\n').forEach((text, offset) => {
    if (!/[\w.\/-]@[0-9]/.test(text)) return
    failed += 1
    console.error(`README.md line ${block.line + offset}: LiaScript replaces the "@<digit>" in ${JSON.stringify(text.trim())} with a macro argument; write "\\u0040" for a literal "@".`)
  })
  const file = join(folder, `block-${index + 1}.js`)
  writeFileSync(file, block.code)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    failed += 1
    // node reports the line within the block; the block's first line is the
    // one with <script>.
    const blockLine = Number(result.stderr.match(/\.js:(\d+)/)?.[1] ?? 1)
    console.error(`README.md line ${block.line + blockLine - 1}: syntax error in the <script> block starting at line ${block.line}:\n${result.stderr}`)
  }
}
if (failed > 0) process.exit(1)
console.log(`Macro check passed: ${blocks.length} blocks (<script> and @onload).`)
