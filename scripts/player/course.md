<!--
author:   glpython
version:  0.0.1
language: de
narrator: Deutsch Female

import: https://course.example/macro.md
-->

# glpython: Blöcke in Fragmenten

Kurs für `npm run check:player`: ein Visualisieren-Block in einem Fragment, das
beim Öffnen der Folie verborgen ist.

## Davor

Eine Folie ohne glpython, von der aus die nächste geöffnet wird.

## Im Fragment

Erst nach einem Klick erscheint der Block:

    {{1}}
<div>

```python
def doppelt(zahl):
    ergebnis = 2 * zahl
    return ergebnis

doppelt(21)
```
@GLPython.visual

</div>

## Danach

Ende.
