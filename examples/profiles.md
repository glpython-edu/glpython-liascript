<!--
author:   Cedric Vogel
language: de

comment:  Test page for the glpython macro's features= / large options: one
          block per course profile, two blocks with the same profile, a
          program of two files, and a wrong option.

import:   https://raw.githubusercontent.com/glpython-edu/glpython-liascript/main/README.md

@Code.erkunden: @GLPython.eval(features=run,repl,visualize,ide @0)

@Code.rezept: @GLPython.eval(features=run,repl,visualize,tests,ide @0)

@Code.rezept3: @GLPython.eval(features=run,repl,visualize,tests,ide,coverage @0)

@Code.pruefung: @GLPython.eval(features=run @0)

@Code.voll: @GLPython.eval(@0)

@Code.baum: @GLPython.eval(features=run,repl,visualize,ide,listtree @0)

@Code.demo: @GLPython.visual(large @0)
-->

# glpython-Profile

Jede Folie zeigt ein Profil des Kurses. Die Profile sind Makros des Kurses, die
`@GLPython.eval` bzw. `@GLPython.visual` mit festen Optionen aufrufen:

| Profil   | Optionen                                       |
|----------|------------------------------------------------|
| erkunden | `features=run,repl,visualize,ide`              |
| rezept   | `features=run,repl,visualize,tests,ide`        |
| rezept3  | `features=run,repl,visualize,tests,ide,coverage` |
| pruefung | `features=run`                                 |
| voll     | (alles)                                        |
| baum     | `features=run,repl,visualize,ide,listtree`     |
| demo     | `@GLPython.visual(large)`                      |

## erkunden

Ausführen, REPL, Visualisieren, IDE-Link - keine Tests, kein Export.

```python
def quadrat(x):
    return x * x

print(quadrat(7))
```
@Code.erkunden

## rezept

Wie erkunden, zusätzlich Tests (Doctests).

```python
def quadrat(x):
    """
    Gibt das Quadrat von x zurück.

    >>> quadrat(3)
    9
    """
    return x * x
```
@Code.rezept

## rezept3

Wie rezept, dazu nach «Tests» (wenn alle Beispiele bestehen): die Zeilen, die
kein Beispiel ausgeführt hat. Erwartet: keine Zeile, aber der Hinweis auf die
Grenzfälle (4 fehlt als Beispiel).

```python
def ist_genuegend(note):
    """
    >>> ist_genuegend(5.5)
    True
    >>> ist_genuegend(3.5)
    False
    """
    return note >= 4
```
@Code.rezept3

Erwartet: Zeile 11, `return "ungenügend"`.

```python
def bewertung(note):
    """
    >>> bewertung(5)
    'genügend'
    >>> bewertung(6)
    'genügend'
    """
    if note >= 4:
        return "genügend"
    else:
        return "ungenügend"
```
@Code.rezept3

Erwartet: Zeile 12, `return 0` (der Fall 0).

```python
def vorzeichen(x):
    """
    >>> vorzeichen(3)
    1
    >>> vorzeichen(-2)
    -1
    """
    if x > 0:
        return 1
    elif x < 0:
        return -1
    return 0
```
@Code.rezept3

Mit einer Bibliothek als zweiter Datei: nichts aus `noten.py`, obwohl kein
Beispiel `runde(0.5)` erreicht. Erwartet: der Hinweis auf die Grenzfälle.

```python -noten.py
def runde(note):
    if note < 1:
        return 1
    return round(note * 2) / 2
```
```python +main.py
from noten import runde

def schnitt(a, b):
    """
    >>> schnitt(4, 5)
    4.5
    """
    return runde((a + b) / 2)
```
@Code.rezept3

Ein Beispiel schlägt fehl: nur der Fehler, nichts zur Abdeckung.

```python
def bewertung(note):
    """
    >>> bewertung(5)
    'genügend'
    >>> bewertung(3)
    'genügend'
    """
    if note >= 4:
        return "genügend"
    else:
        return "ungenügend"
```
@Code.rezept3

Dasselbe wie oben mit dem Profil rezept: keine Abdeckung.

```python
def bewertung(note):
    """
    >>> bewertung(5)
    'genügend'
    >>> bewertung(6)
    'genügend'
    """
    if note >= 4:
        return "genügend"
    else:
        return "ungenügend"
```
@Code.rezept

## pruefung

Nur Ausführen - wie in einer Prüfung.

```python
def quadrat(x):
    return x * x

print(quadrat(7))
```
@Code.pruefung

## voll

Ohne `features=`: alles wie bisher, ohne Abdeckung und ohne Bäume.

```python
def quadrat(x):
    """
    >>> quadrat(3)
    9
    """
    return x * x

print(quadrat(7))
```
@Code.voll

## baum

Listen wie `["+", 2, 3]` auch als Baum: in den Variablen des Visualisierers, im
Fenster des ganzen Werts und in der Konsole (Knopf «Baum», z. B. nach
`ausdruck` in der Eingabezeile).

```python
ausdruck = ["+", 2, ["*", 3, 4]]
zahlen = [1, 2, 3]
breit = ["f", ["g", "erstes", "zweites"], ["h", "drittes", "viertes"], ["k", "fünftes"]]
print(ausdruck)
```
@Code.baum

## demo

Nur der Visualisierer, gross - für den Projektor.

```python
def quadrat(x):
    return x * x

quadrat(2 + 3)
```
@Code.demo

## Zwei Blöcke

Zweimal dasselbe Profil auf einer Folie; die Blöcke sind unabhängig.

```python
print("erster Block")
```
@Code.erkunden

```python
print("zweiter Block")
```
@Code.erkunden

## Zwei Dateien

```python -helpers.py
def doppelt(x):
    return 2 * x

if __name__ == "__main__":
    print("helpers.py direkt ausgeführt")
```
```python +main.py
from helpers import doppelt

print(doppelt(21))
```
@Code.erkunden

## Falsche Option

`features=` mit einem Tippfehler zeigt eine Warnung.

```python
print("hallo")
```
@GLPython.eval(features=run,rpl)
