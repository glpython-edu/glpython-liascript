<!--

author:   Cedric Vogel
version:  0.1.0
language: en

comment:  Embed the glpython editor, execution visualizer, and turtle graphics
          in LiaScript courses.

@GLPython.eval: @GLPython.embed(@uid,eval,@0,@1,@2,@3,@4,@5,@6,@7)

@GLPython.turtle: @GLPython.embed(@uid,turtle)

@GLPython.visual: @GLPython.embed(@uid,visual,@0,@1,@2,@3,@4,@5,@6,@7)

@onload
// The channel: "dev" is glpython's test version, for the instructor only,
// chosen per browser by a flag for the course's origin:
// localStorage.glpythonChannel = "dev" (README «The dev channel»).
// "#glpython=dev" at the end of the course's address sets it,
// "#glpython=live" clears it - read when the course loads, before LiaScript
// replaces the hash with a slide's (a query would become part of the
// course's own address), and when only the hash changes in an open course:
// then the page reloads, so that every block loads the other embed.
const switchGlpythonChannel = () => {
  try {
    const requested = window.location.hash.match(/(?:#|&)glpython=(dev|live)(?=&|$)/)?.[1]
    if (!requested) return false
    const before = localStorage.getItem("glpythonChannel")
    if (requested === "dev") localStorage.setItem("glpythonChannel", "dev")
    if (requested === "live") localStorage.removeItem("glpythonChannel")
    return localStorage.getItem("glpythonChannel") !== before
  } catch {
    // No storage: always live.
    return false
  }
}
switchGlpythonChannel()
window.addEventListener("hashchange", () => {
  if (switchGlpythonChannel()) window.location.reload()
})
// The shared code of every glpython block, defined once per course. The
// macro's own run-once block only passes its arguments: LiaScript expands a
// macro into the slide, and the whole code in every block made slides so long
// that Chrome failed on them (LiaScript then builds a regular expression from
// a wrong column; it happened when a slide with several blocks and a choice
// quiz was opened directly). Blocks that run before this code wait in
// window.__glpythonPending.
window.__glpythonMount = (args, send) => {
  const protocolVersion = 4
  const embedOrigin = "https://glpython-edu.github.io"
  // The channel: "live", or "dev" when this browser's flag is set
  // (see above). The dev embed and the dev IDE show a «DEV» badge. Without
  // the flag nothing changes.
  const channel = (() => {
    try {
      return localStorage.getItem("glpythonChannel") === "dev" ? "dev" : "live"
    } catch {
      return "live"
    }
  })()
  const embedUrl = channel === "dev" ? `${embedOrigin}/glpython-editor/dev/index.html` : `${embedOrigin}/glpython-editor/index.html`
  const [sessionId, mode, ...optionArguments] = args
  // Optional per block, separated by spaces in any order: "box",
  // "substitution" or "tree" presets the visualizer's mode ("tree" only with
  // the feature "tree"), and URLs of shared Python
  // files to load as libraries, e.g. @GLPython.eval(box https://…/parser.py).
  // LiaScript splits macro arguments at commas, so "features=run,repl" arrives
  // as several arguments: they are joined back together here. Arguments that
  // weren't given stay literal ("@3") and are left out.
  const options = optionArguments
    .filter((argument) => !/^@[0-9]$/.test(argument))
    .join(",")
    .split(/\s+/)
    .filter(Boolean)
  const visualizerMode = options.find((option) => option === "box" || option === "substitution" || option === "tree") ?? null
  const libraryUrls = options.filter((option) => /^https?:\/\//.test(option))
  // "features=run,repl,…" shows only these parts (the course builds its
  // profiles from it); without it, everything shows - except "coverage"
  // (after Tests, the lines no example executed), "listtree" (lists such
  // as ["+", 2, 3] also drawn as a tree) and "tree" (the visualizer's mode
  // «Baum»), which a course switches on explicitly. "large" enlarges the code and the visualizer, e.g. for a demo
  // on the projector.
  const featureNames = ["run", "tests", "visualize", "reset", "repl", "export", "ide", "coverage", "listtree", "tree"]
  const featuresOption = options.find((option) => option.startsWith("features="))
  const requestedFeatures = featuresOption ? featuresOption.slice("features=".length).split(",").map((name) => name.trim()).filter(Boolean) : featureNames.filter((name) => name !== "coverage" && name !== "listtree" && name !== "tree")
  const unknownFeatures = requestedFeatures.filter((name) => !featureNames.includes(name))
  const hasFeature = (name) => requestedFeatures.includes(name)
  const large = options.includes("large")
  // The embed's height: the height its content needs (its glpython:resize),
  // at most 80% of the height the course shows right now - that of the
  // element that scrolls the course's content (LiaScript's
  // .lia-slide__container, else the window) - so that the whole block with
  // its buttons fits into view, with some text around it. That height
  // changes with the window, fullscreen, an iPad's rotation, the
  // presentation mode and LiaScript's top bar, so it is measured anew on
  // every change (fitHeight). A taller step scrolls the visualizer's code
  // inside the embed, between its step bar and its footer. "large": while
  // visualizing, the embed is as tall as it may be. A visualization-only
  // block starts at the height a short visualization ends up with (with
  // "large": its maximum), and never gets smaller: until its trace arrives,
  // the embed reports only its loading state (160px), so the iframe would
  // first shrink and then grow again - in a course e.g. right when a quiz's
  // solution opens.
  const visibleShare = 0.8
  let contentHeight = null
  let visualizing = mode === "visual"
  let observedScroller
  const heightObserver = new ResizeObserver(() => fitHeight())
  const scrollingAncestor = (element) => {
    for (let ancestor = element?.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (/(auto|scroll|overlay)/.test(getComputedStyle(ancestor).overflowY)) return ancestor
    }
    return null
  }
  const fitHeight = () => {
    // The block (LiaScript wraps its inner part in a paragraph of its own).
    const box = frame?.closest(".glpython-embed") ?? frame?.parentElement
    if (!box) return
    const scroller = scrollingAncestor(box)
    if (scroller !== observedScroller) {
      observedScroller = scroller
      heightObserver.disconnect()
      if (scroller) heightObserver.observe(scroller)
      heightObserver.observe(box)
    }
    const visible = scroller ? scroller.clientHeight : window.innerHeight
    // A hidden slide has no height; it is measured when it shows.
    if (visible === 0 || (contentHeight === null && mode !== "visual")) return
    // The block's own rows above the iframe (buttons, libraries, notes)
    // count in - unless one opened there (a library's file, the IDE link)
    // would leave the iframe less than half of the visible height.
    const rows = box.getBoundingClientRect().height - frame.getBoundingClientRect().height
    const maxHeight = Math.round(Math.max(visible * visibleShare - rows, visible * 0.5))
    const minHeight = Math.min(maxHeight, large && visualizing ? maxHeight : mode === "visual" ? 190 : 170)
    const height = `${Math.max(minHeight, Math.min(contentHeight ?? minHeight, maxHeight))}px`
    if (frame.style.height !== height) frame.style.height = height
  }
  window.addEventListener("resize", () => fitHeight())
  // The course's own language (its "language:" header, which LiaScript sets
  // as the page's lang attribute), else the browser's, else English. Only the
  // primary subtag counts ("de-CH" -> "de"); an unsupported language such as
  // "fr" falls through to the next step. A course without a header counts as
  // English, as LiaScript reports it.
  const primaryLanguage = (tag) => (tag || "").toLowerCase().split("-")[0]
  const language = [primaryLanguage(document.documentElement.lang), primaryLanguage(navigator.language)]
    .find((candidate) => ["de", "en"].includes(candidate)) ?? "en"
  const strings = {
    de: {
      run: "Ausführen",
      stop: "Stoppen",
      reset: "Zurücksetzen",
      visualize: "Visualisieren",
      tests: "Tests",
      frameTitle: "glpython-Laufzeit",
      sourceUnreadable: "Der LiaScript-Quelltext konnte nicht gelesen werden.",
      inputUnavailable: "input() funktioniert hier nicht: Diese Seite kann nicht auf eine Eingabe warten.",
      inputInIde: "Programme mit input() laufen in der IDE, dort fragt die Konsole nach der Eingabe.",
      embedError: "Die glpython-Einbettung hat einen Fehler gemeldet.",
      runFile: (name) => `${name} ausführen`,
      chooseFile: "Datei zum Ausführen wählen",
      library: "Bibliothek",
      viewFile: "Datei ansehen",
      hideFile: "Datei ausblenden",
      libraryFailed: (name, reason) => `Die Bibliothek ${name} konnte nicht geladen werden (${reason}).`,
      networkError: "Netzwerkfehler",
      timeout: "Zeitüberschreitung",
      filesUnsupported: "Diese glpython-Version kann nur eine Datei laden; es wird nur die gewählte Datei ausgeführt.",
      unknownFeatures: (names) => `Unbekannt in features=: ${names} (möglich: ${featureNames.join(", ")})`,
      openInIde: "In IDE öffnen",
      openInIdeTitle: "Öffnet eine Kopie in der IDE – Änderungen dort wirken nicht hierher zurück.",
      ideMenu: "Weitere Aktionen zur IDE",
      copyIdeLink: "IDE-Link kopieren",
      copyIdeLinkTitle: "Kopiert einen Link zu einer Kopie dieses Codes in der IDE, z. B. für die Abgabe.",
      linkCopied: "Link kopiert ✓",
      copyByHand: "Link zum Kopieren:",
      longLink: (length) => `Dieser Link ist sehr lang (${length} Zeichen). Manche Programme, z. B. OneNote, kürzen solche Links. Für eine Abgabe «In IDE öffnen» wählen und das Projekt dort herunterladen.`,
      ideProject: "Aus dem Kurs",
    },
    en: {
      run: "Run",
      stop: "Stop",
      reset: "Reset",
      visualize: "Visualize",
      tests: "Tests",
      frameTitle: "glpython runtime",
      sourceUnreadable: "The LiaScript source block could not be read.",
      inputUnavailable: "input() doesn't work here: this page can't wait for an answer.",
      inputInIde: "Programs with input() run in the IDE, where the console asks for the input.",
      embedError: "The glpython embed reported an error.",
      runFile: (name) => `Run ${name}`,
      chooseFile: "Choose the file to run",
      library: "Library",
      viewFile: "View file",
      hideFile: "Hide file",
      libraryFailed: (name, reason) => `Could not load library ${name} (${reason}).`,
      networkError: "network error",
      timeout: "timeout",
      filesUnsupported: "This glpython version can only load one file; only the chosen file runs.",
      unknownFeatures: (names) => `Unknown in features=: ${names} (possible: ${featureNames.join(", ")})`,
      openInIde: "Open in IDE",
      openInIdeTitle: "Opens a copy in the IDE – changes there don't come back here.",
      ideMenu: "More IDE actions",
      copyIdeLink: "Copy IDE link",
      copyIdeLinkTitle: "Copies a link to a copy of this code in the IDE, e.g. to hand it in.",
      linkCopied: "Link copied ✓",
      copyByHand: "Link to copy:",
      longLink: (length) => `This link is very long (${length} characters). Some programs, e.g. OneNote, shorten such links. For a hand-in, choose «Open in IDE» and download the project there.`,
      ideProject: "From the course",
    },
  }[language]
  // glpython's look (the course design): the frame, the button row and its
  // states. Injected once per page, first in <head>, so a course's @style
  // can override any rule; every value is a --glp-* variable with glpython's
  // default as fallback, so a course can also set the variables. The block
  // stays light in LiaScript's dark mode, like LiaScript's own code editor.
  if (!document.getElementById("glpython-macro-style")) {
    const defaults = {
      bg: "#FFFFFF", surface: "#F3F4F6", border: "#D1D5DB", "border-control": "#6B7280",
      text: "#1A1A1A", "text-muted": "#4B5563", accent: "#1F3A5F", "on-accent": "#FFFFFF",
      error: "#B42318", warning: "#8A4B00", info: "#1D5B9A", "info-bg": "#E3EEFA", radius: "4px",
      "font-ui": "system-ui, sans-serif", "font-code": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    }
    const token = (name) => `var(--glp-${name}, ${defaults[name]})`
    const style = document.createElement("style")
    style.id = "glpython-macro-style"
    style.textContent = `
.glpython-embed { color: ${token("text")}; background: ${token("bg")}; border: 1px solid ${token("border")}; border-radius: ${token("radius")}; overflow: hidden; font: 14px/1.4 ${token("font-ui")}; }
.glpython-embed .glp-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-start; align-items: center; padding: 12px; }
.glpython-embed .glp-button { margin: 0; padding: 8px 12px; border: 1px solid ${token("border-control")}; border-radius: ${token("radius")}; color: ${token("text")}; background: ${token("bg")}; font: 600 14px/1.2 ${token("font-ui")}; cursor: pointer; }
.glpython-embed .glp-button:hover:not(:disabled) { border-color: ${token("accent")}; color: ${token("accent")}; }
.glpython-embed .glp-button:focus-visible { outline: 2px solid ${token("accent")}; outline-offset: 2px; }
.glpython-embed .glp-button:disabled { opacity: .5; cursor: not-allowed; }
.glpython-embed .glp-button--primary, .glpython-embed .glp-button--run-menu { border-color: ${token("accent")}; color: ${token("on-accent")}; background: ${token("accent")}; }
.glpython-embed .glp-button--primary:hover:not(:disabled), .glpython-embed .glp-button--run-menu:hover:not(:disabled) { border-color: color-mix(in srgb, ${token("accent")} 88%, black); color: ${token("on-accent")}; background: color-mix(in srgb, ${token("accent")} 88%, black); }
.glpython-embed .glp-run-split { position: relative; }
.glpython-embed .glp-run-split--menu .glp-button--run { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.glpython-embed .glp-run-split--menu .glp-button--run-menu { border-top-left-radius: 0; border-bottom-left-radius: 0; border-left-color: ${token("on-accent")}; padding-left: 6px; padding-right: 8px; }
.glpython-embed .glp-run-list { position: absolute; top: 100%; left: 0; z-index: 10; min-width: 180px; margin-top: 4px; padding: 4px 0; background: ${token("bg")}; border: 1px solid ${token("border")}; border-radius: ${token("radius")}; box-shadow: 0 8px 20px rgba(0, 0, 0, .12); }
.glpython-embed .glp-run-list button { display: block; width: 100%; padding: 6px 12px; border: 0; color: ${token("text")}; background: none; text-align: left; font: inherit; cursor: pointer; }
.glpython-embed .glp-run-list button:hover { color: ${token("accent")}; background: ${token("surface")}; }
.glpython-embed .glp-ide-split { position: relative; }
.glpython-embed .glp-button--ide { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.glpython-embed .glp-button--ide-menu { border-top-left-radius: 0; border-bottom-left-radius: 0; border-left-width: 0; padding-left: 6px; padding-right: 8px; }
.glpython-embed .glp-ide-status { color: ${token("text-muted")}; }
.glpython-embed .glp-ide-link { margin: 0; padding: 0 12px 12px; }
.glpython-embed .glp-ide-note { margin: 0 12px 12px; padding: 6px 10px; color: ${token("text")}; background: ${token("info-bg")}; border-left: 3px solid ${token("info")}; border-radius: ${token("radius")}; font-size: 13px; }
.glpython-embed .glp-ide-link input { box-sizing: border-box; width: 100%; margin-top: 4px; padding: 6px 8px; color: ${token("text")}; background: ${token("surface")}; border: 1px solid ${token("border-control")}; border-radius: ${token("radius")}; font: 13px/1.4 ${token("font-code")}; }
.glpython-embed .glpython-warning { margin: 0; padding: 0 12px 12px; color: ${token("warning")}; }
.glpython-embed .glpython-error { margin: 0; padding: 0 12px 12px; color: ${token("error")}; }
.glpython-embed .glp-files { padding: 0 12px 12px; }
.glpython-embed .glp-file { margin: 4px 0; }
.glpython-embed .glp-file code { padding: 1px 5px; background: ${token("surface")}; border-radius: ${token("radius")}; font-family: ${token("font-code")}; }
.glpython-embed .glp-file .glp-button { margin-left: 8px; padding: 4px 10px; font-size: 13px; }
.glpython-embed .glp-file .glpython-error { padding: 0; }
.glpython-embed .glp-file pre { max-height: 320px; overflow: auto; margin: 6px 0; padding: 12px; color: ${token("text")}; background: ${token("surface")}; border: 1px solid ${token("border")}; border-radius: ${token("radius")}; font: 15px/1.6 ${token("font-code")}; }
.glpython-embed iframe { display: block; width: 100%; height: 220px; border: 0; border-top: 1px solid ${token("border")}; border-radius: 0; background: ${token("bg")}; }
.glpython-embed--visual iframe { border-top: 0; }
.glpython-embed--large .glp-button { padding: 10px 14px; font-size: 16px; }
`
    document.head.prepend(style)
  }

  // «IDE-Link kopieren» (and «In IDE öffnen») hand the block's code to the
  // glpython IDE as a copy, as a share link of the IDE: its compact form ?p=
  // (the JSON's UTF-8 bytes in raw deflate, base64url without padding, as
  // the IDE's «Teilen» writes it), or - where fflate doesn't load - the old
  // ?project= (lz-string), which the IDE reads too. The link is built while
  // the learner taps, without waiting: iPad Safari allows the clipboard and a
  // new tab only inside the tap's own handler. So fflate and lz-string (the
  // IDE's versions) are loaded once per page in advance.
  const ideUrl = channel === "dev" ? "https://glpython-edu.github.io/dev/" : "https://glpython-edu.github.io/"
  window.__glpythonLzString ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    // "\u0040" is "@": LiaScript would replace "@1" with the macro's argument.
    script.src = "https://cdn.jsdelivr.net/npm/lz-string\u00401.5.0/libs/lz-string.min.js"
    script.integrity = "sha384-0d+Gr7vM4Drod8E3hXKgciWJSWbjD/opKLLygI9ktiWbuvlDwQLzU46wJ9s5gsp7"
    script.crossOrigin = "anonymous"
    script.onload = () => window.LZString ? resolve(window.LZString) : reject(new Error("lz-string"))
    script.onerror = reject
    document.head.append(script)
  })
  window.__glpythonFflate ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://cdn.jsdelivr.net/npm/fflate\u00400.8.3/umd/index.js"
    script.integrity = "sha384-ETfVLWAUsU3zp3SpnQsPDbAyrF6jYv2w8aNYo6KtY2JuyxXhzYLOL7e0ATbLSIHP"
    script.crossOrigin = "anonymous"
    // A page with an AMD loader (define.amd) gets no global: then lz-string.
    script.onload = () => window.fflate?.deflateSync ? resolve(window.fflate) : reject(new Error("fflate"))
    script.onerror = reject
    document.head.append(script)
  })

  const sessions = window.__glpythonSessions ??= new Map()
  const existingSession = sessions.get(sessionId)
  if (existingSession) {
    existingSession.attach()
    return
  }

  let frame = null
  let error = null
  let codeBlock = null
  let inputAvailable = false
  let filesSupported = false
  let testsSupported = false
  // Version 4: the embed can stop Python, and says while it is busy - then
  // ▶ Run is ■ Stop.
  let stopSupported = false
  let pythonBusy = false
  // The newest protocol version both understand.
  const embedVersion = () => stopSupported ? protocolVersion : testsSupported ? 3 : filesSupported ? 2 : 1
  let runtimeReady = false
  let pendingRun = false
  // The code file chosen in the split button's menu; null runs the last one.
  let chosenFile = null
  // Filled once loaded, for building an IDE link without waiting.
  let lzString = null
  // fflate once loaded; whether it failed (then lz-string writes the link).
  let fflate = null
  let fflateFailed = false

  const showError = (message) => {
    if (!error) return
    error.textContent = message
    error.hidden = false
  }

  // A block's file name (its header, e.g. ```python parser.py) as a Python
  // module file, so "from parser import parse" finds it.
  const moduleFileName = (name, fallback) => {
    const stem = (name || "").trim().replace(/\.py$/i, "").replace(/[^A-Za-z0-9_]/g, "_")
    if (!stem) return fallback
    return `${/^[0-9]/.test(stem) ? "_" : ""}${stem}.py`
  }

  // LiaScript's editor indents with real tabs, 2 wide (tabSize 2, useSoftTabs
  // False), so Tab in a block indented with 4 spaces mixes the two and Python
  // stops with TabError. The block's editors indent with 4 spaces instead,
  // unless the course chose otherwise with data-tabsize or data-ace-options
  // (which LiaScript puts on the editor as attributes). LiaScript sets these
  // options only for a new editor or when its own value changes, and
  // attach() runs on every re-render, so a new editor gets them again. An
  // editor that isn't upgraded to LiaScript's element yet is left for the
  // next attach(): setting a property on it now would hide the setter.
  const indentWithSpaces = (editor) => {
    if (!("tabSize" in editor) || !("useSoftTabs" in editor)) return
    const aceOptions = (editor.getAttribute("data-ace-options") ?? "").split(/[\s,]+/).map((entry) => entry.split("=")[0])
    if (!editor.hasAttribute("data-tabsize") && !aceOptions.includes("tabSize") && editor.tabSize !== 4) editor.tabSize = 4
    if (!aceOptions.includes("useSoftTabs") && editor.useSoftTabs !== true) editor.useSoftTabs = true
    // Since LiaScript 2.1.1 every executable block completes as one types and
    // expands snippets: a word like "if" + Enter, or + Tab, became a whole
    // statement, also in a docstring. Off in glpython blocks, the same way and
    // with the same exceptions as above. Ctrl+Space still completes a name on
    // request (keywords and the block's words, no snippets).
    for (const option of ["enableLiveAutocompletion", "enableSnippets"]) {
      if (option in editor && !aceOptions.includes(option) && editor[option] !== false) editor[option] = false
    }
  }

  // Every code block right before the iframe (LiaScript groups consecutive
  // blocks into one project), with its file name and its current text.
  const readCodeFiles = () => {
    const editors = [...(codeBlock?.querySelectorAll("lia-editor") ?? [])]
    const files = editors.map((editor, index) => ({
      path: moduleFileName(
        editor.closest(".lia-accordion__item")?.querySelector(".lia-accordion__headline")?.textContent,
        editors.length === 1 ? "main.py" : `datei${index + 1}.py`,
      ),
      source: editor.value,
    }))
    if (files.some((file) => typeof file.source !== "string")) return null
    return files.filter((file, index) => files.findIndex((other) => other.path === file.path) === index)
  }

  // Shared files loaded by URL, fetched once per block. A file that can't be
  // loaded is reported and left out, so Python's own ModuleNotFoundError
  // follows when the program imports it.
  const fileNameOfUrl = (url) => decodeURIComponent(new URL(url).pathname.split("/").pop() || "")
  const libraries = Promise.all(libraryUrls.map(async (url) => {
    const path = moduleFileName(fileNameOfUrl(url), "bibliothek.py")
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) return { path, url, failure: `HTTP ${response.status}` }
      return { path, url, source: await response.text() }
    } catch (fetchError) {
      return { path, url, failure: fetchError?.name === "AbortError" ? strings.timeout : strings.networkError }
    } finally {
      window.clearTimeout(timer)
    }
  }))

  // Lists the libraries below the buttons: each can be opened read-only, and
  // one that failed to load says so.
  const showLibraries = (list) => {
    const container = document.getElementById(`glpython-files-${sessionId}`)
    if (!container || container.dataset.filled === "true" || list.length === 0) return
    container.dataset.filled = "true"
    container.hidden = false
    for (const library of list) {
      const row = document.createElement("div")
      row.className = "glp-file"
      const label = document.createElement("span")
      label.textContent = `${strings.library}: `
      const name = document.createElement("code")
      name.textContent = library.path
      row.append(label, name)
      if (library.failure) {
        const failure = document.createElement("span")
        failure.className = "glpython-error"
        failure.textContent = ` ${strings.libraryFailed(library.path, library.failure)}`
        row.append(failure)
      } else {
        const toggle = document.createElement("button")
        toggle.type = "button"
        toggle.className = "glp-button"
        toggle.textContent = strings.viewFile
        const view = document.createElement("pre")
        view.hidden = true
        view.textContent = library.source
        toggle.onclick = () => {
          view.hidden = !view.hidden
          toggle.textContent = view.hidden ? strings.viewFile : strings.hideFile
        }
        row.append(toggle, view)
      }
      container.append(row)
    }
  }
  libraries.then(showLibraries)
  window.__glpythonLzString.then((library) => { lzString = library; attach() }, () => {})
  window.__glpythonFflate.then((library) => { fflate = library; attach() }, () => { fflateFailed = true; attach() })
  // Ready to build a link: the compact form, or the old one without fflate.
  const linkReady = () => fflate !== null || (fflateFailed && lzString !== null)
  const base64Url = (bytes) => {
    let binary = ""
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }

  // A program with input() where the embed can't wait for an answer (no
  // cross-origin isolation, as in LiaScript): with "ide", the way to the
  // IDE, whose console asks for the input.
  const reportInputCapability = (source) => {
    if (!error) return
    if (!inputAvailable && /(^|[^\w])input\s*\(/.test(source)) {
      if (mode === "visual" || !hasFeature("ide")) {
        showError(strings.inputUnavailable)
        return
      }
      const open = document.createElement("button")
      open.type = "button"
      open.className = "glp-button glp-button--ide"
      open.textContent = strings.openInIde
      open.onclick = openInIde
      error.replaceChildren(`${strings.inputInIde} `, open)
      error.hidden = false
    } else {
      error.hidden = true
    }
  }

  // The program to send: the libraries plus the block's files, and which one
  // runs - the chosen file, else the last block (materials put the file to
  // run last). Without readable blocks, LiaScript's own text of the block.
  const programOf = (codeFiles, libraryList) => {
    const mainFile = codeFiles.some((file) => file.path === chosenFile) ? chosenFile : codeFiles[codeFiles.length - 1].path
    const loaded = libraryList.filter((library) => library.source !== undefined && !codeFiles.some((file) => file.path === library.path))
    return { mainFile, files: [...loaded.map(({ path, source }) => ({ path, source })), ...codeFiles] }
  }
  const readProgram = async (fallbackSource) => {
    const codeFiles = readCodeFiles() ?? (typeof fallbackSource === "string" ? [{ path: "main.py", source: fallbackSource }] : null)
    if (!codeFiles || codeFiles.length === 0) {
      showError(strings.sourceUnreadable)
      return null
    }
    return programOf(codeFiles, await libraries)
  }

  // The IDE link for the program as it is now: every file of the block and
  // the file that runs, and the libraries by their URL (the IDE's link
  // version 2), not their code - the IDE fetches them as the block does, read-
  // only there too. So a block with a course's parser keeps a short link. A
  // block file with a library's name replaces it. As in the IDE's own share
  // links, a link too long for GitHub Pages (more than 8192 characters of
  // path and query: "414 URI Too Long") carries the project in the fragment,
  // which is never sent to the server.
  const ideLink = () => {
    const codeFiles = readCodeFiles()
    if (!linkReady() || !codeFiles || codeFiles.length === 0) return null
    const program = programOf(codeFiles, [])
    const libraries = libraryUrls
      .map((url) => ({ path: moduleFileName(fileNameOfUrl(url), "bibliothek.py"), url }))
      .filter((library) => !codeFiles.some((file) => file.path === library.path))
    const files = Object.fromEntries([
      ...libraries.map(({ path, url }) => [path, { path, url, readOnly: true }]),
      ...codeFiles.map(({ path, source }) => [path, { path, label: path, kind: /\.py$/i.test(path) ? "python" : "text", code: source }]),
    ])
    const heading = frame?.closest(".lia-slide__content")?.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim()
    // The block's own features= (what it shows) set the IDE's parts too; a
    // block without features= leaves the IDE as it is.
    const features = featuresOption ? requestedFeatures.filter((name) => featureNames.includes(name)) : null
    const json = JSON.stringify({ v: libraries.length > 0 ? 2 : 1, name: heading || document.title || strings.ideProject, mainFile: program.mainFile, ...(features ? { features } : {}), files })
    const [param, encoded] = fflate
      ? ["p", base64Url(fflate.deflateSync(new TextEncoder().encode(json), { level: 9 }))]
      : ["project", lzString.compressToEncodedURIComponent(json)]
    const url = new URL(ideUrl)
    url.searchParams.set(param, encoded)
    if (url.pathname.length + url.search.length <= 8192) return url.toString()
    url.search = ""
    url.hash = new URLSearchParams({ [param]: encoded }).toString()
    return url.toString()
  }

  // "Link kopiert ✓" for a moment, or - without a clipboard (e.g. not
  // allowed) - the link in a field to copy by hand. writeText is called right
  // in the tap's handler, which iPad Safari requires. A link longer than
  // 2,083 characters (OneNote cuts links there) is copied too, with a note.
  let statusTimer = null
  const copyIdeLink = () => {
    const link = ideLink()
    const status = document.getElementById(`glpython-ide-status-${sessionId}`)
    const field = document.getElementById(`glpython-ide-link-${sessionId}`)
    const note = document.getElementById(`glpython-ide-note-${sessionId}`)
    if (!link || !status || !field) return
    if (note) {
      note.hidden = link.length <= 2083
      note.textContent = note.hidden ? "" : strings.longLink(link.length)
    }
    const copied = () => {
      field.hidden = true
      status.textContent = strings.linkCopied
      window.clearTimeout(statusTimer)
      statusTimer = window.setTimeout(() => { status.textContent = "" }, 3000)
    }
    const byHand = () => {
      status.textContent = ""
      const input = field.querySelector("input")
      field.querySelector("span").textContent = strings.copyByHand
      input.value = link
      field.hidden = false
      input.focus()
      input.setSelectionRange(0, link.length)
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard")
      navigator.clipboard.writeText(link).then(copied, byHand)
    } catch {
      byHand()
    }
  }

  const openInIde = () => {
    const link = ideLink()
    if (link) window.open(link, "_blank", "noopener")
  }

  // The split button: «IDE-Link kopieren» in front - the learners' hand-in -
  // and «In IDE öffnen» in its ▾ menu. Both act right in the tap's handler.
  const updateIdeButton = () => {
    const split = document.getElementById(`glpython-ide-split-${sessionId}`)
    const copyButton = document.getElementById(`glpython-ide-${sessionId}`)
    const menuButton = document.getElementById(`glpython-ide-menu-${sessionId}`)
    const menu = document.getElementById(`glpython-ide-list-${sessionId}`)
    if (!split || !copyButton || !menuButton || !menu) return
    setShown(split, mode !== "visual" && hasFeature("ide"), "inline-flex")
    const disabled = !linkReady()
    if (copyButton.disabled !== disabled) copyButton.disabled = disabled
    if (menuButton.disabled !== disabled) menuButton.disabled = disabled
    if (copyButton.textContent !== strings.copyIdeLink) copyButton.textContent = strings.copyIdeLink
    if (copyButton.title !== strings.copyIdeLinkTitle) copyButton.title = strings.copyIdeLinkTitle
    if (menuButton.title !== strings.ideMenu) {
      menuButton.title = strings.ideMenu
      menuButton.setAttribute("aria-label", strings.ideMenu)
    }
    const closeMenu = () => {
      menu.hidden = true
      menuButton.setAttribute("aria-expanded", "false")
    }
    copyButton.onclick = () => {
      closeMenu()
      copyIdeLink()
    }
    menuButton.onclick = () => {
      menu.hidden = !menu.hidden
      menuButton.setAttribute("aria-expanded", String(!menu.hidden))
    }
    let item = menu.querySelector("button")
    if (!item) {
      item = document.createElement("button")
      item.type = "button"
      item.setAttribute("role", "menuitem")
      menu.append(item)
    }
    if (item.textContent !== strings.openInIde) item.textContent = strings.openInIde
    if (item.title !== strings.openInIdeTitle) item.title = strings.openInIdeTitle
    item.onclick = () => {
      closeMenu()
      openInIde()
    }
  }

  // Every program sent counts, so a first program still waiting for the
  // block's text (see sendOnceBlockHasText) knows it was overtaken.
  let programsSent = 0
  const postProgram = async (type, fallbackSource) => {
    programsSent += 1
    const program = await readProgram(fallbackSource)
    if (!program || !frame?.contentWindow) return
    const main = program.files.find((file) => file.path === program.mainFile)
    reportInputCapability(main.source)
    if (filesSupported) {
      // Version 3 ("glpython:test") only with embeds that understand it.
      frame.contentWindow.postMessage({ type, version: embedVersion(), source: main.source, mode, files: program.files, mainFile: program.mainFile }, embedOrigin)
    } else {
      if (program.files.length > 1) showError(strings.filesUnsupported)
      frame.contentWindow.postMessage({ type, version: 1, source: main.source, mode }, embedOrigin)
    }
  }

  const sendCommand = (type, fallbackSource) => {
    if (!frame?.contentWindow) return
    if (type === "glpython:stop") {
      if (stopSupported) frame.contentWindow.postMessage({ type, version: protocolVersion }, embedOrigin)
      return
    }
    if (type === "glpython:reset") {
      frame.contentWindow.postMessage({ type, version: embedVersion() }, embedOrigin)
      return
    }
    postProgram(type, fallbackSource)
  }

  // The first program, sent on "ready", may find the block without its text:
  // when a LiaScript fragment appears, LiaScript creates the block's editor
  // and this iframe together, and fills the editor a few milliseconds later
  // (once its Ace editor exists), while a cached embed can be ready sooner.
  // So while all of the block's editors are still empty, it waits for their
  // text: for Ace's change event (LiaScript's own editorUpdate doesn't come
  // for the text it sets itself) and for attach(), which runs on every DOM
  // change (an editor not yet connected). At most editorTextTimeout ms, as
  // a block may be empty on purpose. Nothing else waits: a program sent
  // meanwhile (▶, Tests, a file chosen) carries the block as it is then, and
  // the first one is dropped.
  const editorTextTimeout = 2000
  let textWait = null
  const blockHasText = () => (readCodeFiles() ?? []).some((file) => file.source !== "")
  const sendOnceBlockHasText = (type) => {
    textWait?.stop()
    const sentBefore = programsSent
    const listeners = []
    const stop = () => {
      window.clearTimeout(timer)
      for (const remove of listeners) remove()
      if (textWait === wait) textWait = null
    }
    const check = () => {
      if (programsSent !== sentBefore) return stop()
      if (blockHasText()) {
        stop()
        sendCommand(type)
        return
      }
      for (const editor of codeBlock?.querySelectorAll("lia-editor") ?? []) {
        const ace = editor.env?.editor
        if (!ace || listeners.some((listener) => listener.ace === ace)) continue
        ace.on("change", check)
        const remove = () => ace.off("change", check)
        remove.ace = ace
        listeners.push(remove)
      }
    }
    const timer = window.setTimeout(() => {
      stop()
      if (programsSent === sentBefore) sendCommand(type)
    }, editorTextTimeout)
    const wait = { check, stop }
    textWait = wait
    check()
  }

  // The command a button asked for when it went through LiaScript's run (see
  // throughLiaScript): LiaScript's per-run script then calls run, which sends
  // that command instead of a run - so Python runs once. A request older than
  // 10 seconds (LiaScript didn't run the block) is dropped.
  let commandAfterLiaRun = null
  const run = (fallbackSource) => {
    attach()
    const requested = commandAfterLiaRun
    commandAfterLiaRun = null
    if (requested && Date.now() - requested.at < 10000) {
      if (runtimeReady) sendCommand(requested.type, fallbackSource)
      return
    }
    if (runtimeReady) {
      sendCommand("glpython:run", fallbackSource)
    } else {
      pendingRun = true
    }
  }

  const onMessage = (event) => {
    if (!frame || event.origin !== embedOrigin || event.source !== frame.contentWindow) return
    const message = event.data
    // The embed answers in the version this macro last used (1 until it knows
    // what the embed understands, see embedVersion).
    if (!message || ![1, 2, 3, 4].includes(message.version)) return

    if (message.type === "glpython:ready") {
      runtimeReady = true
      inputAvailable = message.capabilities?.input === true
      filesSupported = message.capabilities?.files === true
      testsSupported = message.capabilities?.tests === true
      stopSupported = message.capabilities?.stop === true
      pythonBusy = false
      frame.dataset.inputAvailable = String(inputAvailable)
      // A run asked for before (pendingRun) carries the program itself.
      sendOnceBlockHasText(pendingRun ? "glpython:run" : mode === "visual" ? "glpython:visualize" : "glpython:load")
      pendingRun = false
      for (const id of ["visualize", "reset", "run", "run-menu", "tests"]) {
        const button = document.getElementById(`glpython-${id}-${sessionId}`)
        if (button) button.disabled = false
      }
      attach()
      send.lia("LIA: stop")
    } else if (message.type === "glpython:busy") {
      pythonBusy = message.busy === true
      attach()
    } else if (message.type === "glpython:resize" && Number.isFinite(message.height)) {
      // Since glpython-editor v0.1.35 it also says whether it visualizes
      // (for "large"); an older embed visualizes only as "visual".
      contentHeight = message.height
      if (typeof message.visualizing === "boolean") visualizing = message.visualizing
      fitHeight()
    } else if (message.type === "glpython:error") {
      showError(message.message || strings.embedError)
    }
  }

  // Shows or hides an element through its display (the hidden attribute loses
  // against a display set by CSS), writing only when it changes - attach()
  // runs on every DOM change, and a write is one.
  const setShown = (element, shown, display = "") => {
    if (!element) return
    const value = shown ? display : "none"
    if (element.style.display !== value) element.style.display = value
  }

  // LiaScript's own run button (</>) of the block. It stays hidden: the macro's
  // ▶, «Tests» and «Visualisieren» click it, so LiaScript stores the block -
  // a new entry in its code history, kept across a reload (from a course's
  // version 1.0.0 on also across closing the tab) - exactly as with its own
  // button. For «Tests» and «Visualisieren», run then sends their command
  // instead of a run. Without LiaScript's button (no code block), the command
  // goes to glpython directly.
  const liaScriptRunButton = () => codeBlock?.querySelector(".lia-code-control__action button") ?? null
  const throughLiaScript = (type) => {
    const button = liaScriptRunButton()
    if (!button) {
      if (type) sendCommand(type)
      else run()
      return
    }
    commandAfterLiaRun = type ? { type, at: Date.now() } : null
    button.click()
  }
  const runThroughLiaScript = () => throughLiaScript(null)

  // The run button (▶ Run), and for blocks of several files its ▾ menu: ▶ runs
  // the chosen file (the last one until another is chosen).
  const updateRunButton = (codeFiles) => {
    const split = document.getElementById(`glpython-run-split-${sessionId}`)
    const runButton = document.getElementById(`glpython-run-${sessionId}`)
    const menuButton = document.getElementById(`glpython-run-menu-${sessionId}`)
    const menu = document.getElementById(`glpython-run-list-${sessionId}`)
    if (!split || !runButton || !menuButton || !menu) return
    // While Python is busy (only embeds of protocol version 4 say so), the same
    // button stops it: Python restarts, the code stays.
    runButton.onclick = pythonBusy ? () => sendCommand("glpython:stop") : runThroughLiaScript
    // The run button whenever "run" is on; its ▾ menu only for several files.
    const show = mode !== "visual" && hasFeature("run")
    setShown(split, show, "inline-flex")
    if (!show) return
    const severalFiles = codeFiles.length > 1
    setShown(menuButton, severalFiles)
    split.classList.toggle("glp-run-split--menu", severalFiles)
    const label = pythonBusy ? `■ ${strings.stop}` : `▶ ${strings.run}`
    if (runButton.textContent !== label) {
      // ■ Stop keeps ▶ Run's width, so the buttons beside it don't move.
      runButton.style.minWidth = pythonBusy ? `${runButton.offsetWidth}px` : ""
      runButton.textContent = label
    }
    const mainFile = codeFiles.length === 0 ? null : codeFiles.some((file) => file.path === chosenFile) ? chosenFile : codeFiles[codeFiles.length - 1].path
    const title = pythonBusy ? strings.stop : severalFiles && mainFile ? strings.runFile(mainFile) : strings.run
    if (runButton.title !== title) runButton.title = title
    if (!severalFiles) return
    if (menuButton.title !== strings.chooseFile) {
      menuButton.title = strings.chooseFile
      menuButton.setAttribute("aria-label", strings.chooseFile)
    }
    menuButton.onclick = () => {
      menu.hidden = !menu.hidden
      menuButton.setAttribute("aria-expanded", String(!menu.hidden))
    }
    const names = codeFiles.map((file) => file.path).join("\n")
    if (menu.dataset.files === names && menu.dataset.chosen === mainFile) return
    menu.dataset.files = names
    menu.dataset.chosen = mainFile
    menu.replaceChildren(...codeFiles.map((file) => {
      const item = document.createElement("button")
      item.type = "button"
      item.setAttribute("role", "menuitemradio")
      item.setAttribute("aria-checked", String(file.path === mainFile))
      item.textContent = `${file.path === mainFile ? "✓ " : ""}${file.path}`
      item.onclick = () => {
        chosenFile = file.path
        menu.hidden = true
        menuButton.setAttribute("aria-expanded", "false")
        updateRunButton(codeFiles)
        if (runtimeReady) sendCommand("glpython:load")
      }
      return item
    }))
  }

  const attach = () => {
    const nextFrame = document.getElementById(`glpython-frame-${sessionId}`)
    if (!nextFrame) return
    if (frame !== nextFrame) {
      runtimeReady = false
      pythonBusy = false
      // The new iframe says "ready" again, and reports its height.
      textWait?.stop()
      contentHeight = null
      visualizing = mode === "visual"
    }
    frame = nextFrame
    error = document.getElementById(`glpython-error-${sessionId}`)
    const controls = document.getElementById(`glpython-controls-${sessionId}`)
    const visualizeButton = document.getElementById(`glpython-visualize-${sessionId}`)
    const resetButton = document.getElementById(`glpython-reset-${sessionId}`)
    const codeBlocks = [
      ...(frame.closest(".lia-slide__content")?.querySelectorAll(".lia-code--block") ?? []),
    ]
    codeBlock = codeBlocks.findLast((block) =>
      block.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING
    ) ?? null
    if (codeBlock && codeBlock.hidden !== (mode === "visual")) codeBlock.hidden = mode === "visual"
    frame.parentElement?.classList.toggle("glpython-embed--large", large)
    setShown(liaScriptRunButton(), false)
    setShown(controls, mode !== "visual", "flex")
    // Only when it differs: attach() runs on every DOM change (see the
    // MutationObserver below), and replacing a text is such a change.
    if (resetButton && resetButton.textContent !== strings.reset) resetButton.textContent = strings.reset
    setShown(resetButton, hasFeature("reset"))
    if (visualizeButton) {
      if (visualizeButton.textContent !== strings.visualize) visualizeButton.textContent = strings.visualize
      setShown(visualizeButton, mode === "eval" && hasFeature("visualize"))
      visualizeButton.onclick = () => throughLiaScript("glpython:visualize")
    }
    if (resetButton) resetButton.onclick = () => sendCommand("glpython:reset")
    // Runs the doctests of the file that would run; shown once the embed
    // says it understands them.
    const testsButton = document.getElementById(`glpython-tests-${sessionId}`)
    if (testsButton) {
      if (testsButton.textContent !== strings.tests) testsButton.textContent = strings.tests
      setShown(testsButton, testsSupported && mode !== "visual" && hasFeature("tests"))
      testsButton.onclick = () => throughLiaScript("glpython:test")
    }
    // An unknown name in features= is shown instead of ignored silently.
    const warning = document.getElementById(`glpython-warning-${sessionId}`)
    const warningText = unknownFeatures.length > 0 ? strings.unknownFeatures(unknownFeatures.join(", ")) : ""
    if (warning && warning.textContent !== warningText) warning.textContent = warningText
    setShown(warning, warningText !== "")
    for (const editor of codeBlock?.querySelectorAll("lia-editor") ?? []) indentWithSpaces(editor)
    updateRunButton(readCodeFiles() ?? [])
    updateIdeButton()
    textWait?.check()
    libraries.then(showLibraries)
    if (frame.dataset.glpythonInitialized === "true") return
    frame.dataset.glpythonInitialized = "true"
    fitHeight()
    frame.title = `${strings.frameTitle} (${mode})`
    const query = new URLSearchParams({ parentOrigin: window.location.origin, mode, lang: language })
    if (visualizerMode) query.set("visualizer", visualizerMode)
    if (featuresOption) query.set("features", requestedFeatures.filter((name) => featureNames.includes(name)).join(","))
    if (large) query.set("size", "large")
    frame.src = `${embedUrl}?${query}`
  }

  const session = { attach, run }
  sessions.set(sessionId, session)
  window.addEventListener("message", onMessage)
  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true })
  attach()
}
for (const mount of window.__glpythonPending ?? []) mount()
window.__glpythonPending = []
@end

@GLPython.embed
<script>
(() => {
  const session = window.__glpythonSessions?.get("@0")
  const source = "@'input"
  if (!session) {
    const primary = (tag) => (tag || "").toLowerCase().split("-")[0]
    const german = [primary(document.documentElement.lang), primary(navigator.language)].find((language) => ["de", "en"].includes(language)) === "de"
    const message = german
      ? "Die glpython-Laufzeit ist noch nicht bereit."
      : "The glpython runtime is not ready."
    send.lia(`HTML: <pre style='color:red'>${message}</pre>`)
    return
  }
  session.run(source)
  window.setTimeout(() => send.lia("LIA: stop"), 0)
})()

"LIA: wait"
</script>

<script run-once>
(() => {
  // The code itself is in @onload, see there.
  const mount = () => window.__glpythonMount(["@0", "@1", "@2", "@3", "@4", "@5", "@6", "@7", "@8", "@9"], send)
  if (window.__glpythonMount) mount()
  else (window.__glpythonPending ??= []).push(mount)
})()

"LIA: wait"
</script>

<div class="glpython-embed glpython-embed--@1">
  <div id="glpython-controls-@0" class="glp-buttons">
    <span id="glpython-run-split-@0" class="glp-run-split" style="display:none">
      <button id="glpython-run-@0" class="glp-button glp-button--primary glp-button--run" type="button" disabled>▶ Run</button>
      <button id="glpython-run-menu-@0" class="glp-button glp-button--run-menu" type="button" disabled aria-haspopup="true" aria-expanded="false" style="display:none">▾</button>
      <span id="glpython-run-list-@0" class="glp-run-list" role="menu" hidden></span>
    </span>
    <button id="glpython-tests-@0" class="glp-button glp-button--tests" type="button" disabled style="display:none">Tests</button>
    <button id="glpython-visualize-@0" class="glp-button glp-button--visualize" type="button" disabled>Visualize</button>
    <button id="glpython-reset-@0" class="glp-button glp-button--reset" type="button" disabled>Reset</button>
    <span id="glpython-ide-split-@0" class="glp-ide-split" style="display:none">
      <button id="glpython-ide-@0" class="glp-button glp-button--ide" type="button" disabled>Copy IDE link</button>
      <button id="glpython-ide-menu-@0" class="glp-button glp-button--ide-menu" type="button" disabled aria-haspopup="true" aria-expanded="false">▾</button>
      <span id="glpython-ide-list-@0" class="glp-run-list" role="menu" hidden></span>
    </span>
    <span id="glpython-ide-status-@0" class="glp-ide-status" role="status"></span>
  </div>
  <p id="glpython-ide-link-@0" class="glp-ide-link" hidden><label><span></span><input type="text" readonly></label></p>
  <p id="glpython-ide-note-@0" class="glp-ide-note" role="status" hidden></p>
  <p id="glpython-warning-@0" class="glpython-warning" style="display:none"></p>
  <div id="glpython-files-@0" class="glp-files" hidden></div>
  <p id="glpython-error-@0" class="glpython-error" hidden></p>
  <iframe
    id="glpython-frame-@0"
    title="glpython @1 runtime"
    loading="lazy"
    referrerpolicy="strict-origin"
    allow="clipboard-read; clipboard-write"
  ></iframe>
</div>
@end

-->

# glpython for LiaScript

Run and visualize Python directly in a LiaScript course with the browser-based
[glpython](https://github.com/glpython-edu/glpython-edu.github.io) editor.

The macros use LiaScript's native editor as the source of truth and a separately
hosted iframe for execution and visualization. Python runs locally in the learner's browser through Pyodide; the current source is sent for each action through an
origin-checked, versioned handshake.

## Import

Add the template to the header of a LiaScript course:

```text
import: https://raw.githubusercontent.com/glpython-edu/glpython-liascript/main/README.md
```

## Editor and visualizer

Attach `@GLPython.eval` to a Python code block:

```python
import sys

for i in range(5):
    print("Hello", "World #" + str(i))

sys.version
```
@GLPython.eval

LiaScript owns the visible editor and preserves its source through its course and PWA
state. The **▶ Run** button below the block runs the current source through glpython:
it triggers LiaScript's own run action, whose `</>` button is hidden, so LiaScript still
saves edits and keeps its code history (the version arrows stay). **Tests** and
**Visualize** go through LiaScript's run action too, so they store the block in the same
way - a new version only if the code changed - and then test or visualize it instead of
running it: Python runs once. The glpython runtime
provides output and the step-by-step visualizer without mounting a second editor. It
does not reserve space for turtle graphics.

The macro makes the block's editor indent with 4 spaces: Tab inserts spaces, not
LiaScript's default tab character, which would stop Python with a `TabError` in a block
indented with spaces. It also switches off the completion as one types and the
snippets LiaScript turns on since version 2.1.1, so Enter is always a new line and Tab
never expands a word (`if` + Enter became a whole `if` statement, also in a
docstring); Ctrl+Space still completes a name on request. A block's own
`data-tabsize` or `data-ace-options` (e.g. `<!-- data-ace-options="useSoftTabs=false" -->`
or `enableLiveAutocompletion=true`) still wins.

## State and navigation

The fenced source belongs to LiaScript. Edits therefore survive slide navigation and
leaving the course followed by browser Back in the same way as the official Pyodide
macro. A hard reload returns to the Markdown source baseline, which also matches the
official macro's behavior.

Each macro has an isolated runtime iframe. If LiaScript recreates that iframe, the
macro reattaches a clean worker and reloads the current LiaScript source; Python
globals, output, turtle state, and visualization position are intentionally not
serialized. **Reset** also terminates the current worker and creates a clean
one. The post-run REPL below the output uses this per-block worker lifecycle: Run
keeps the program's namespace while the worker survives, and Reset discards it
without changing LiaScript's source.

When the iframe is ready, the macro sends it the block's source - for
`@GLPython.visual` that starts the visualization. A block inside a fragment
(`{{1}}`) gets its editor only when the fragment appears, and LiaScript fills
the editor a moment later; so while the block's code is still empty, the macro
waits for it, at most 2 seconds (a block may be empty on purpose). Run, Tests
and the REPL don't wait.

## Turtle graphics

Use `@GLPython.turtle` for a graphics-focused layout:

```python
from gturtle import *

makeTurtle()
for _ in range(4):
    forward(100)
    right(90)
```
@GLPython.turtle

## Visualization only

Use `@GLPython.visual` when learners should explore a prepared program without
editing it. The fenced source is hidden and the visualization starts
automatically. The visualizer keeps its step buttons, scrubber, box/substitution
switch, options menu (animated steps), and synchronized output.

```python
total = 0
for value in range(1, 5):
    total += value
print(total)
```
@GLPython.visual

## Several files

Put consecutive code blocks with a file name in their header before the macro;
LiaScript shows them as one project, and glpython loads all of them, so one file
can import another. Start a file's name with `-` to show it collapsed (and `+`
to show it open):

```python -helpers.py
def doppelt(x):
    return 2 * x
```
```python +main.py
from helpers import doppelt

print(doppelt(21))
```
@GLPython.eval

The **last** file runs. **▶ Run** runs it, and for several files it gets a ▾ menu
that chooses another file to run; **Visualize** and **Tests** follow that choice. Only the file that runs is visualized step by
step; imported files run as a black box.

Shared files that live elsewhere, e.g. a parser used in several lessons, are
loaded by URL: list them in the macro's argument, separated by spaces and
together with `box`/`substitution` if needed. The file name of the URL is the
module name, e.g. for `from parser import parse`:

```text
@GLPython.eval(https://raw.githubusercontent.com/<user>/<repo>/main/materials/00-auswerter/parser.py)
@GLPython.eval(box https://…/parser.py https://…/auswerter.py)
```

A working example, loading Python's own `colorsys.py` from GitHub:

```python
from colorsys import rgb_to_hsv

print(rgb_to_hsv(1, 0, 0))
```
@GLPython.eval(https://raw.githubusercontent.com/python/cpython/main/Lib/colorsys.py)

Such a library is listed below the buttons with **View file** to read it. If it
can't be loaded (e.g. HTTP 404, no network, or a server without CORS), the list
says so and the program runs without it, so Python reports the missing module.
Raw GitHub URLs work; URLs must not contain parentheses.

## Tests

The **Tests** button runs the examples written as doctests in the docstrings of
the file that would run (with several files: the chosen one), as
`python -m doctest` does. It shows how many examples passed and each failing
example in doctest's own words (`Expected:` / `Got:`), with a button to
visualize that example step by step. An example that only printed the expected
value while the function returned `None` passes, as in doctest, with a hint
that it probably should `return` instead.

```python
def quadrat(x):
    """
    Gibt das Quadrat von x zurück.

    >>> quadrat(3)
    9
    >>> quadrat(-2)
    4
    """
    return x * x
```
@GLPython.eval

## Box or substitution

The visualizer shows a call to a function whose body is a single `return` either
as a box or replaced by its return expression (substitution, the default), and
learners can switch with the toggle in its toolbar. To preset the mode for one
block, pass `box` or `substitution` (or, with the feature `tree`, `tree`) to
`@GLPython.eval` or `@GLPython.visual`:

```python
def quadrat(x):
    return x * x

quadrat(7)
```
@GLPython.visual(box)

Without an argument the block uses the mode the learner last chose, and
substitution at first.

## Buttons and profiles

Below each block sits one row of buttons, left to right **▶ Run · Tests ·
Visualize · Reset · Copy IDE link ▾** («Ausführen · Tests · Visualisieren ·
Zurücksetzen · IDE-Link kopieren ▾» in German courses), framed together with the
output panel. Every button has a text label and the classes `glp-button` plus
one per function (`glp-button--run`, `glp-button--tests`,
`glp-button--visualize`, `glp-button--reset`, `glp-button--ide`); ▶ Run also
has `glp-button--primary`, its ▾ menu `glp-button--run-menu`, and Copy IDE
link's ▾ menu `glp-button--ide-menu`. The row has
`glp-buttons`, so a course can restyle all of it with `@style`.

While Python is busy (a program, a REPL input or Tests that run for more than
a moment, e.g. `while True:`), ▶ Run becomes **■ Stop** («■ Stoppen») in the
same place and width: it restarts Python, the code stays, and the console notes
it. This needs an embed of protocol version 4; with an older embed ▶ Run stays
as it was.

The block has glpython's own look (the course design: white, light grey code
areas, ink accent, the system's fonts) without any `@style`: ▶ Run is filled,
the other buttons are outlined, and the block stays light in LiaScript's dark
mode, like LiaScript's own code editor. The macro adds its rules once per page
as the first stylesheet, so any `@style` rule overrides them, and every value is
a `--glp-*` variable (see glpython-editor's README) that a course may set on the
page for the button row. The frame is the rule `.glpython-embed { border: … }`.
To draw one frame around LiaScript's code block, its history row and the
glpython block together:

```css
.lia-code--block:has(+ p.lia-paragraph:empty + .glpython-embed) {
  border: 1px solid var(--glp-border, #D1D5DB); border-bottom: none;
  border-radius: var(--glp-radius, 4px) var(--glp-radius, 4px) 0 0;
  margin-bottom: 0; padding: 8px 8px 0;
  background: var(--glp-bg, #FFFFFF);
}
p.lia-paragraph:empty:has(+ .glpython-embed) { display: none; }
.lia-code--block + p.lia-paragraph:empty + .glpython-embed {
  border: 1px solid var(--glp-border, #D1D5DB); border-top: none;
  border-radius: 0 0 var(--glp-radius, 4px) var(--glp-radius, 4px);
  margin-bottom: 20px; padding: 0 8px 8px;
}
```

This depends on LiaScript's internal classes and should be checked after
LiaScript updates.

**Copy IDE link** («IDE-Link kopieren») is the hand-in: it copies a link to a
copy of the block's current code in the glpython IDE
(<https://glpython-edu.github.io/>) and confirms with «Link kopiert ✓», or,
where the browser doesn't allow copying, shows the link in a field to copy by
hand. Its ▾ menu has **Open in IDE** («In IDE öffnen»), which opens the same
link in a new tab; its tooltip says that changes there don't come back to the
course. The link is an IDE
share link: every file of the block and the file that runs, and the block's
libraries by their URL - the IDE fetches them, so a block with a library keeps
a short link (an Etappe 4 hand-in measured 1,980 characters in the IDE's old
form and 1,185 in the compact one).
Libraries are read-only in the IDE (a lock, no editing, renaming or deleting),
as they are here. A block with `features=` passes them on: the IDE then shows
the same parts (▶, Tests, Visualisieren, the console's input line, the →
chain export, coverage, `listtree`, «Baum»; `ide` and `reset` mean nothing
there), as the starting state of that IDE tab - its ⋮ «Optionen» can switch
each part, e.g. for a teacher looking at a hand-in. A block without
`features=` passes nothing, and the IDE shows what it always does. A link longer than 2,083 characters - OneNote, for one, cuts
links there - is still copied, with a note to choose «In IDE öffnen» and
download the project there for a hand-in.
A link longer than GitHub Pages accepts (8192 characters of path and query, a
program of roughly 5,000 to 30,000 characters) carries the project after `#`
instead of `?`. The link is the IDE's compact form (`?p=`: raw deflate in
base64url, about 40 % shorter than before), for which the macro loads
[fflate](https://github.com/101arrowz/fflate) 0.8.3 from jsDelivr; where that
can't load, it writes the IDE's older form (`?project=`, with
[lz-string](https://github.com/pieroxy/lz-string) 1.5.0), which the IDE reads
as well. Until one of them has loaded, the button stays disabled.

`features=` in the macro's argument shows only the listed parts: `run`, `tests`,
`visualize`, `reset`, `repl` (the input line below the output), `export` (the
visualizer's «→-Kette kopieren») and `ide` (Copy IDE link ▾). Without it, everything shows. Hidden parts are
not rendered at all. An unknown name shows a short warning below the buttons.

`coverage` is the one name that isn't part of «everything»: only a block that
lists it gets it. After **Tests**, when all examples pass, the report then
lists the lines of the block's functions that no example executed, each with
its code («Von keinem Beispiel ausgeführt: Zeile 11: `return "ungenügend"`»),
or, when every line ran, a neutral note that this doesn't show whether the
examples check the edge cases. Coverage finds untested code, not wrong code:
`return note > 4` is fully covered by `5.5` and `3.5`. Only the file that runs
counts, not libraries or other files, and only lines in function bodies (not
`def` lines, docstrings or code outside functions). Nothing is marked in the
block's code editor; the report gives the line and its code.

`listtree` isn't part of «everything» either. It draws a list whose first
element is a string, such as `["+", 2, ["*", 3, 4]]`, also as a tree: in the
visualizer's variables (a wide tree behind «Baum zeigen»), in the full value's
window, and in the console, where such a value gets a «Baum» button next to
«Visualisieren». The visualizer's ⋮ menu can switch the trees off («Listen als
Baum zeigen»). Each tree is described by the list's own text for screen
readers.

`tree` isn't part of «everything» either. It gives the visualizer a third
mode, **Baum**, next to «Kasten» and «Ersetzung»: an expression is shown as
its tree while Python evaluates it. One step replaces the expression by its
tree, then each step of «Ersetzung» turns a subtree into its value, and one
step puts the value back in the line - `x = 2 + 3 * 4` takes 5 steps instead
of 3. A function with a single `return <expression>` is replaced by that
expression's tree; any other call keeps its box below the tree, which says why
(«`notenschnitt` hat lokale Variablen – der Aufruf wird als Kasten gezeigt.»,
also in «Ersetzung»). Labels are Python's (`+`, `quadrat`, `[ ]`), with no
parentheses. Without `tree` there's no «Baum» button. To start a block in
«Baum», pass `tree` too: `@GLPython.visual(tree features=visualize,tree)`.
`large` makes the code 20px (line height 1.6) and, while visualizing, the
block as tall as it may be (see below), e.g. for the projector in presentation
mode.

The block is as tall as its content, but at most 80% of the height the course
shows right now (LiaScript's content area, without its top bar; in fullscreen,
after a rotation or with the top bar hidden in LiaScript's settings, it adapts
at once). So the whole block, with its buttons, fits into view with some text
around it. A taller visualization scrolls its code inside the visualizer,
following the current step, while the step bar above and the global variables
below stay in view; a taller output scrolls the console. Scrolling past the
end of the code goes on with the page. While stepping through a
visualization, the block keeps one height, so the course page doesn't move:
the visualizer is as tall as the tallest step from the start, and the console
as tall as the output at the last step.

A course builds its own profiles from these options as macros in its header,
passing `@0` on so a block can add more options (a mode or library URLs):

```text
@Code.erkunden: @GLPython.eval(features=run,repl,visualize,ide @0)
@Code.rezept:   @GLPython.eval(features=run,repl,visualize,tests,ide @0)
@Code.rezept3:  @GLPython.eval(features=run,repl,visualize,tests,ide,coverage @0)
@Code.pruefung: @GLPython.eval(features=run @0)
@Code.demo:     @GLPython.visual(large @0)
```

All options can be combined in any order, separated by spaces; LiaScript's
commas between macro arguments are fine. `examples/profiles.md` shows each of
these profiles.

## Language

The buttons and the embed follow the course's `language:` header: German for
`de` (including regional variants such as `de-CH`), English for `en`. For a
language glpython doesn't support (e.g. `fr`), they follow the browser's
language instead, and English if that isn't supported either. LiaScript reports
a course without a `language:` header as English, so such a course is shown in
English. Python's own values and error messages are never translated.

## Hosting and compatibility

The template currently targets:

```text
https://glpython-edu.github.io/glpython-editor/
```

The embed protocol is versioned independently of the course template.
Synchronous Python `input()` depends on cross-origin isolation in the complete
top-level LiaScript embedding context. The iframe reports that capability during
its handshake. LiaScript's player isn't isolated, so there `input()` doesn't
work: the program stops with `RuntimeError: input() is not available here` and a
hint below it. If a snippet uses `input()` where the capability is unavailable,
the macro also says that such programs run in the glpython IDE, whose console
asks for the input, with an «In IDE öffnen» button when the block has the
`ide` feature (else only that `input()` doesn't work here). Editing, normal
execution, visualization, and turtle graphics remain available.

## The dev channel (for the instructor)

glpython has a test version next to the live one: the embed at
<https://glpython-edu.github.io/glpython-editor/dev/index.html> and the IDE at
<https://glpython-edu.github.io/dev/>, each built from its repo's `dev`
branch. Both show a «DEV» badge. A course keeps loading the live embed; a
browser loads the dev embed in every course instead, and its IDE links
(«In der IDE öffnen», «IDE-Link kopieren») open the dev IDE, once the flag is
set for the course's origin (e.g. liascript.github.io):

- **Set it:** open any course with `#glpython=dev` at the end of its address,
  e.g. `https://liascript.github.io/course/?<course URL>#glpython=dev`, or in
  the browser's console on a course page:
  `localStorage.glpythonChannel = "dev"`, then reload.
- **Clear it:** `#glpython=live` at the end of the address, or
  `localStorage.removeItem("glpythonChannel")` in the console, then reload.

The flag only lives in that browser, so learners never get the dev channel,
and a link copied with the flag set points to the dev IDE (the badge says
so) - don't share it. To try a change to the macro itself, a test course
imports `https://raw.githubusercontent.com/glpython-edu/glpython-liascript/dev/README.md`
instead of `main`; with the flag it also loads the dev embed.

## Development

Open this file through the LiaScript LiveEditor to exercise the real macro
environment:

```text
https://liascript.github.io/LiveEditor/?/show/file/https://raw.githubusercontent.com/glpython-edu/glpython-liascript/main/README.md
```

`node scripts/check-macro.mjs` checks the syntax of the template's `<script>`
blocks with `node --check`. `npm run check:ready` (after `npm ci`; it needs
Chrome) runs the `@onload` code on a test page with stand-ins for LiaScript's
editor and the embed, and checks the first program sent on "ready": with text
that arrives after "ready", with an empty block, with several files. CI runs
both on every pull request and on `main` and `dev`, since a merge to `main`
reaches every course.

`npm run check:player` checks the same with the real LiaScript player, the live
embed and a small course (`scripts/player/course.md`: a visualization in a
fragment, visited several times so the embed comes from the cache). It needs
those sites, so it isn't part of CI; run it before a release.

For local embed development, change `embedOrigin` and `embedUrl` in the template
header to the origin printed by `npm run dev:embed` in `glpython-editor`.

## Lizenz / License

MIT – see [LICENSE](https://github.com/glpython-edu/glpython-liascript/blob/main/LICENSE).
The macro includes no third-party code; it loads the glpython embed (MIT),
[fflate](https://github.com/101arrowz/fflate) and
[lz-string](https://github.com/pieroxy/lz-string) (both MIT, for the IDE
links) when a course runs. The checks install both as devDependencies.
