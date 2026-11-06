# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The LiaScript macro that embeds glpython in courses. `README.md` is both the documentation and the macro itself: its header comment defines `@GLPython.eval`, `@GLPython.turtle` and `@GLPython.visual` and holds the session logic in `@onload` (`window.__glpythonMount`, run once per course) plus two `<script>` blocks (the per-run block and a short `run-once` block that only passes the block's arguments to `__glpythonMount`). Keep the code in `@onload`, not in the macro: LiaScript expands a macro into every slide that uses it, and long expansions break slides in Chrome (`Regular expression too large`, when a slide with a choice quiz is opened directly; cause: the column LiaScript's parser computes after a macro expansion). Courses import it from `main`:

```
import: https://raw.githubusercontent.com/glpython-edu/glpython-liascript/main/README.md
```

So **merging to `main` reaches every course immediately** (e.g. `../programmieren-mit-funktionen`).

The macro renders a button row below the block's LiaScript code editor and an iframe with the glpython embed (`https://glpython-edu.github.io/glpython-editor/index.html`, built from `../glpython-editor`, which also deploys on merge). It talks to the embed through the versioned `postMessage` protocol defined in glpython-editor's `src/embedProtocol.ts` (`protocolVersion` here; read that repo's CLAUDE.md). LiaScript stays the editor: Run sends the current source of every code block of the project.

`examples/profiles.md` is a test course for the `features=` / `large` options and a program of several files.

## Commands and CI

```bash
node scripts/check-macro.mjs   # node --check on every <script> block of README.md
npm ci && npm run check:ready  # in Chrome, @onload on a test page (stand-in lia-editor, stub embed): the first program on "ready"; «IDE-Link kopieren» writes ?p= (raw deflate, base64url), ?project= without fflate
npm run check:player [visits]  # the same with the real LiaScript player and the live embed (scripts/player/course.md); not in CI
```

CI runs `check-macro` and `check:ready` on pull requests and on `main`. LiaScript replaces placeholders (`@0`, `@'input`, …) before running a block, so keep every placeholder inside a string literal, or the check fails, as it would in most courses. `check:ready` serves everything through Playwright routes, so it needs no external site; add cases for what the macro sends there. `check:player` depends on liascript.github.io, the embed and the CDNs, so it must never block a merge; run it before a release.

## Testing in LiaScript

Nothing runs LiaScript automatically, so test a change in the hosted player:
- **Serve the files locally:** put the macro and a small test course (`import: http://localhost:PORT/macro.md`) on a local server that sends `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Private-Network: true`. Open `https://liascript.github.io/course/?http://localhost:PORT/course.md`.
- **Chrome's local network check:** it blocks that request. For a headless test, launch Chrome with `--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights`.
- **Before/after:** compare with `git show main:README.md` served next to it.
- **Selecting the editors:** use `.lia-code--block lia-editor`. LiaScript also has a hidden chat `lia-editor`. Ace is reachable as `element.env.editor`.
- **Re-renders:** LiaScript recreates a slide's editors when the slide is shown again (next slide and back).
- **A new editor's text arrives late:** Elm sets `value` on a new `lia-editor`, which waits for its Ace editor (`getSession`, polling every 100 ms) and sets the text with its own events blocked: no `editorUpdate` for it, only Ace's `change`. The embed's iframe (`loading="lazy"`) loads when its fragment appears, and a cached embed says `ready` in a few milliseconds, before the text. So the first program waits while the block's editors are all empty (`sendOnceBlockHasText`).
- **Without hosting:** the README's «Development» section has the LiveEditor link. For a local embed, point `embedOrigin`/`embedUrl` at glpython-editor's `npm run build:embed && npm run preview:embed`. That README still says `dev:embed`, which 404s (see glpython-editor's CLAUDE.md).

## How LiaScript behaves (source: github.com/LiaScript/LiaScript)

`../liascript` is an empty folder. Read the sources with `gh api repos/LiaScript/LiaScript/contents/<path> -H "Accept: application/vnd.github.raw"`.
- **The code editor** is the `lia-editor` web component (`src/typescript/webcomponents/editor.ts`). Its options (`tabSize`, `useSoftTabs`, `aceOptions`, …) are properties with setters that pass them on to Ace. Elm sets them from `src/elm/Lia/Markdown/Code/View.elm` (defaults there, e.g. tab size 2 and hard tabs). It re-sets one only when its own value changes or the element is new. Since LiaScript 2.1.1 it turns on `enableBasicAutocompletion`, `enableLiveAutocompletion` and `enableSnippets` for every executable block; the macro switches the last two off (`indentWithSpaces`).
- **Storing code:** LiaScript stores a block (a new version, if the code differs from the active one) when its run button is clicked (`Eval` in `Code/Update.elm`), before the result. The run's script runs inside that click, so the macro's `commandAfterLiaRun` is used up before a second click.
- **Block options:** a block's `<!-- data-… -->` options end up as attributes on its `lia-editor`. A course's own `data-*` options must keep winning over the macro.
- **`attach()`** in the run-once block runs on every DOM change (MutationObserver). Everything it does must be idempotent and must compare before it writes, or it loops. Don't set properties on a `lia-editor` that isn't upgraded yet (`"tabSize" in editor`), or they would hide the setters.

## Conventions

- Work on a branch from `main`, one PR per package of work, `check-macro` green and tested in LiaScript before handing over.
- A protocol change belongs in glpython-editor first (version bump, `check-embed-protocol.mjs`). The macro keeps working with an embed that only speaks an earlier version.
- Texts follow the course's `language:` (de/en) via the macro's `strings`. German uses Swiss spelling (ss, no ß) and never addresses the learner as «du» or «Sie».
- Behaviour must match CPython.
- Report follow-ups instead of fixing them silently.
- Document user-visible options in the README's sections, for course authors.
