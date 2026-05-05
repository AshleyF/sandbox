# Brief Language Specification

## Overview

**Brief** is a concatenative, pure-functional programming language inspired by [Forth](https://www.forth.com/forth/), [Joy](https://www.kevinalbrecht.com/code/joy-mirror/index.html), and [Factor](https://factorcode.org/). It operates on a stack and uses quotations and combinators as its primary abstraction mechanisms.

## Key Characteristics

- **Concatenative**: Programs are composed by concatenating (sequencing) functions.
- **Stack-based**: All operations consume and produce values on an implicit stack.
- **Pure functional**: No side effects outside of the stack — no mutable variables, no assignments, no shared state.
- **Quotations**: Anonymous blocks of code represented as first-class values (`[...]`).
- **Combinators**: Higher-order operations that consume quotations to control flow and abstraction.

## Notation: Prefix with Right-to-Left Evaluation

Unlike most concatenative languages (Forth, Joy, Factor) which use **postfix** notation, Brief uses **prefix** notation.

However, evaluation proceeds **right-to-left** (and bottom-to-top for multi-line programs). This means the code *reads* as prefix but *executes* in the same effective order as a postfix language.

### Comparison with Joy

| Operation            | Joy (postfix)                | Brief (prefix)               |
|----------------------|------------------------------|------------------------------|
| Square               | `dup *`                      | `* dup`                      |
| Area of circle       | `dup * 3.14159 *`            | `* 3.14159 * dup`            |
| Increment            | `1 +`                        | `+ 1`                        |
| Negate               | `0 swap -`                   | `- swap 0`                   |
| Is even?             | `2 mod 0 =`                  | `= 0 mod 2`                  |
| Conditional          | `[0 =] [pop 1] [dup *] ifte` | `if [* dup] [1 drop] = 0`    |

Both columns produce the same stack effect. Joy reads as a sequence of steps; Brief reads as a nested expression with the outermost operation first.

### Rationale

In an impure language, side effects impose ordering — postfix matches this naturally because you read left to right and effects happen in that order. Because Brief is pure, there is no implied ordering. Any sub-expression can be reduced independently and the results composed, like simplifying a math expression. Prefix or postfix is just a notational choice; Brief chooses prefix because it reads as a declaration — "multiply pi and the square of _" (`* pi sq`) — rather than a sequence of steps.

## Syntax

### Literals

| Type    | Example          | Description                    |
|---------|------------------|--------------------------------|
| Integer | `42`, `-7`       | Whole numbers                  |
| Float   | `3.14`, `-0.5`   | Floating-point numbers         |
| String  | `"hello"`        | Double-quoted string literals  |
| Symbol  | `'foo`, `'area`  | Atomic named value (like Lisp symbols) |
| Boolean | `true`, `false`  | Integer constants: `true` = `-1`, `false` = `0` |

### Quotations

Quotations are anonymous blocks of code enclosed in square brackets. They are pushed onto the stack as values without being evaluated.

```
[* dup]
```

Quotations may be nested:

```
[apply [* dup] 5]
```

### Words

Bare words are looked up in the dictionary and executed:

```
dup
```

### Comments

```
( This is an inline comment )
\ This is a line comment — from the backslash to end of line
```

Inline comments are enclosed in parentheses `( ... )`, Forth-style. Line comments begin with `\` and run to the end of the line.

## Definitions

Every line of code is a definition. The **first word** on the line is the name, and the **rest of the line** is the body. The structure of the line *is* the definition.

**Syntax:**

```
name body...
name value
```

**Examples:**

```
sq * dup
pi 3.14159
```

`sq` is defined as `* dup`. `pi` is defined as the constant `3.14159`. (Both are actually standard secondaries — see Glossary — but are defined here for illustration.)

This encourages factoring code into small, single-line definitions.

### Line Continuation

If a definition must span multiple lines, a `..` at the end of a line indicates a soft line break — the next line continues the current definition.

```
fact if [* fact dec dup] ..
     [1 drop] = 0 dup
```

### Indentation and Scope

Whitespace is significant, similar to Python or F#. Indented lines beneath a definition create **scoped sub-definitions** visible only within the parent.

The parser processes indented (inner) definitions *before* compiling the parent's body. This means sub-definitions are always available when the parent is compiled, even though they appear below it in the source. Since evaluation proceeds **right-to-left** and **bottom-to-top**, dependencies are naturally defined before their dependents.

```
area * pi sq
  sq * dup
  pi 3.14159
```

Here `sq` and `pi` are scoped inside `area` and not visible outside it. (In practice, `sq` and `pi` are standard secondaries and wouldn't need to be redefined — this example illustrates scoping.)

Reading top-to-bottom gives you a **top-down design** view: the high-level definition first, then the details. Reading bottom-to-top gives you the **foundational** view: primitives first, then composition.

#### Walkthrough: `area 5`

1. The parser sees `area` with two indented children. It processes `sq` and `pi` first, then compiles `area`'s body.
2. Evaluate `area 5` right-to-left:
   - `5` → push `5`. Stack: `[5]`
   - `area` → expand `* pi sq`, evaluate right-to-left:
     - `sq` → expand `* dup`:
       - `dup` → Stack: `[5 5]`
       - `*` → Stack: `[25]`
     - `pi` → push `3.14159`. Stack: `[25 3.14159]`
     - `*` → Stack: `[78.53975]`

Result: `78.53975`

## Built-in Words

### Stack Operations

| Word   | Effect              | Description                          |
|--------|---------------------|--------------------------------------|
| `dup`  | `( a -- a a )`      | Duplicate top of stack               |
| `drop` | `( a -- )`          | Remove top of stack                  |
| `swap` | `( a b -- b a )`    | Swap top two elements                |
| `over` | `( a b -- a b a )`  | Copy second element to top           |
| `rot`  | `( a b c -- b c a )`| Rotate third element to top          |

### Arithmetic

| Word  | Effect                | Description       |
|-------|-----------------------|-------------------|
| `+`   | `( a b -- a+b )`     | Addition          |
| `-`   | `( a b -- a-b )`     | Subtraction       |
| `*`   | `( a b -- a*b )`     | Multiplication    |
| `/`   | `( a b -- a/b )`     | Division          |
| `mod` | `( a b -- a%b )`     | Modulo            |

### Comparison

| Word  | Effect                  | Description            |
|-------|-------------------------|------------------------|
| `=`   | `( a b -- bool )`       | Equality               |
| `<`   | `( a b -- bool )`       | Less than              |
| `>`   | `( a b -- bool )`       | Greater than           |
| `<=`  | `( a b -- bool )`       | Less than or equal     |
| `>=`  | `( a b -- bool )`       | Greater than or equal  |

### Logic

Booleans are integers: `true` = `-1`, `false` = `0`. Because `-1` is all bits set, `and`, `or`, and `not` are bitwise operations that also work as logical operators.

| Word  | Effect                  | Description      |
|-------|-------------------------|------------------|
| `and` | `( a b -- n )`          | Bitwise/logical AND |
| `or`  | `( a b -- n )`          | Bitwise/logical OR  |
| `not` | `( a -- n )`            | Bitwise/logical NOT |

### Combinators

| Word      | Effect                              | Description                                      |
|-----------|--------------------------------------|--------------------------------------------------|
| `apply`   | `( quot -- ... )`                    | Execute a quotation                              |
| `dip`     | `( a quot -- ... a )`                | Stash top, execute quotation, restore top        |
| `keep`    | `( a quot -- ... a )`                | Apply quotation to a copy of top, keep original  |
| `if`      | `( bool then-quot else-quot -- ... )`| Conditional execution                            |
| `when`    | `( bool quot -- ... )`               | Execute quotation if true, else do nothing       |
| `unless`  | `( bool quot -- ... )`               | Execute quotation if false, else do nothing      |
| `map`     | `( list quot -- list )`              | Apply quotation to each element                  |
| `fold`    | `( list init quot -- result )`       | Reduce a list with an accumulator                |
| `filter`  | `( list quot -- list )`              | Keep elements where quotation returns true       |
| `compose` | `( quot quot -- quot )`              | Concatenate two quotations into one              |
| `each`    | `( list quot -- ... )`               | Execute quotation for each element               |
| `any`     | `( list quot -- bool )`              | True if quotation returns true for any element   |

### List Operations

| Word     | Effect                    | Description                                  |
|----------|---------------------------|----------------------------------------------|
| `first`  | `( list -- a )`           | First element of a list                      |
| `rest`   | `( list -- list )`        | All elements except the first                |
| `nth`    | `( list n -- a )`         | Element at index n (0-based)                 |
| `append` | `( list a -- list )`      | Add an element to the end of a list          |
| `put`    | `( list n a -- list' )`   | New list with element at index n replaced    |
| `concat` | `( list list -- list )`   | Concatenate two lists (or two strings)       |
| `length` | `( list -- n )`           | Number of elements in a list                 |
| `range`  | `( a b -- list )`         | List of integers from a to b inclusive       |

## Glossary

A complete dictionary of all words — both **primitives** (built into the language) and **secondaries** (defined in terms of other words).

### Primitives

These are built into the language and cannot be defined in Brief itself.

| Word      | Effect                              | Description                                           |
|-----------|--------------------------------------|-------------------------------------------------------|
| `dup`     | `( a -- a a )`                       | Duplicate top of stack                                |
| `drop`    | `( a -- )`                           | Remove top of stack                                   |
| `swap`    | `( a b -- b a )`                     | Swap top two elements                                 |
| `over`    | `( a b -- a b a )`                   | Copy second element to top                            |
| `rot`     | `( a b c -- b c a )`                 | Rotate third element to top                           |
| `+`       | `( a b -- a+b )`                     | Addition (numbers) or concatenation (strings)         |
| `-`       | `( a b -- a-b )`                     | Subtraction                                           |
| `*`       | `( a b -- a*b )`                     | Multiplication                                        |
| `/`       | `( a b -- a/b )`                     | Division                                              |
| `mod`     | `( a b -- a%b )`                     | Modulo                                                |
| `=`       | `( a b -- bool )`                    | Equality                                              |
| `<`       | `( a b -- bool )`                    | Less than                                             |
| `>`       | `( a b -- bool )`                    | Greater than                                          |
| `<=`      | `( a b -- bool )`                    | Less than or equal                                    |
| `>=`      | `( a b -- bool )`                    | Greater than or equal                                 |
| `and`     | `( a b -- n )`                       | Bitwise/logical AND                                   |
| `or`      | `( a b -- n )`                       | Bitwise/logical OR                                    |
| `not`     | `( a -- n )`                         | Bitwise/logical NOT                                   |
| `if`      | `( bool then-q else-q -- ... )`      | Conditional execution                                 |
| `when`    | `( bool quot -- ... )`               | Execute quotation if true, else do nothing            |
| `unless`  | `( bool quot -- ... )`               | Execute quotation if false, else do nothing           |
| `apply`   | `( quot -- ... )`                    | Execute a quotation                                   |
| `dip`     | `( a quot -- ... a )`                | Stash top, execute quotation on rest, restore top     |
| `keep`    | `( a quot -- ... a )`                | Apply quotation to a copy of top, keep original on top|
| `map`     | `( list quot -- list )`              | Apply quotation to each element                       |
| `fold`    | `( list init quot -- result )`       | Reduce a list with an accumulator                     |
| `filter`  | `( list quot -- list )`              | Keep elements where quotation returns true            |
| `compose` | `( quot quot -- quot )`              | Concatenate two quotations into one                   |
| `each`    | `( list quot -- ... )`               | Execute quotation for each element                    |
| `any`     | `( list quot -- bool )`              | True if quotation returns true for any element        |
| `first`   | `( list -- a )`                      | First element of a list                               |
| `rest`    | `( list -- list )`                   | All elements except the first                         |
| `nth`     | `( list n -- a )`                    | Element at index n (0-based)                          |
| `append`  | `( list a -- list )`                 | Add an element to the end of a list                   |
| `put`     | `( list n a -- list' )`              | New list with element at index n replaced by a        |
| `concat`  | `( list list -- list )`              | Concatenate two lists or strings                      |
| `length`  | `( list -- n )`                      | Number of elements                                    |
| `range`   | `( a b -- list )`                    | List of integers from a to b inclusive                |

### Secondaries

Defined in Brief itself. These could live in a standard prelude.

| Word         | Definition                              | Effect                     | Description                              |
|--------------|-----------------------------------------|----------------------------|------------------------------------------|
| `dec`        | `- 1`                                   | `( n -- n-1 )`             | Decrement by 1                           |
| `inc`        | `+ 1`                                   | `( n -- n+1 )`             | Increment by 1                           |
| `sq`         | `* dup`                                 | `( n -- n² )`              | Square a number                          |
| `double`     | `+ dup`                                 | `( n -- 2n )`              | Double a number                          |
| `negate`     | `- swap 0`                              | `( n -- -n )`              | Negate a number                          |
| `abs`        | `when [negate] < 0 dup`                 | `( n -- |n| )`             | Absolute value                           |
| `max`        | `if [drop swap] [drop] > over over`     | `( a b -- max )`           | Maximum of two values                    |
| `min`        | `if [drop swap] [drop] < over over`     | `( a b -- min )`           | Minimum of two values                    |
| `even?`      | `= 0 mod 2`                             | `( n -- bool )`            | Is the number even?                      |
| `odd?`       | `not even?`                             | `( n -- bool )`            | Is the number odd?                       |
| `2drop`      | `drop drop`                             | `( a b -- )`               | Drop top two elements                    |
| `3drop`      | `drop drop drop`                        | `( a b c -- )`             | Drop top three elements                  |
| `2dup`       | `over over`                             | `( a b -- a b a b )`       | Duplicate top two elements               |
| `sum`        | `fold [+] 0`                            | `( list -- n )`            | Sum all elements of a list               |
| `product`    | `fold [*] 1`                            | `( list -- n )`            | Product of all elements of a list        |
| `pi`         | `3.14159265358979`                      | `( -- π )`                 | The constant π                           |
| `e`          | `2.71828182845905`                      | `( -- e )`                 | The constant e (Euler's number)          |

## Multi-line Programs

Since every line is a definition, a program is a sequence of definitions. The parser processes sub-definitions (indented) before their parent.

The top-level entry point is the first (topmost) definition. All definitions below it are available to it.

```
main area 5
area * pi sq
  sq * dup
  pi 3.14159
```

Evaluated bottom-to-top: `pi` and `sq` are defined (scoped inside `area`), then `area` is defined, then `main` runs. The result is left on the stack.

## Examples

### Area of a Circle

`sq` and `pi` are standard secondaries, but are defined locally here to illustrate scoping.

```
area * pi sq
  sq * dup
  pi 3.14159
```

Usage: `area 5` leaves `78.53975` on the stack.

### Double a Number

```
double + dup
```

### Factorial

```
fact if [* fact dec dup] [1 drop] = 0 dup
  dec - 1
```

Or with a main entry point:

```
main fact 5
fact if [* fact dec dup] [1 drop] = 0 dup
  dec - 1
```

#### Walkthrough: `fact 3`

In Brief's `if [ELSE] [THEN] cond`, the first quotation is the else-branch (false) and the second is the then-branch (true). For factorial, the condition is `= 0 dup` (is n zero?), so: ELSE = `[* fact dec dup]` (recursive case, n≠0), THEN = `[1 drop]` (base case, n=0).

```
fact 3
→ 3, dup → [3 3], 0 → [3 3 0], = → [3 false]
→ if takes false, runs else-branch:
  [* fact dec dup] on [3]    (postfix: dup dec fact *)
  → dup → [3 3], dec → [3 2], fact → recurse...
    → dup → [2 2], 0 → [2 2 0], = → [2 false]
    → [* fact dec dup] on [2]
      → dup → [2 2], dec → [2 1], fact → recurse...
        → dup → [1 1], 0 → [1 1 0], = → [1 false]
        → [* fact dec dup] on [1]
          → dup → [1 1], dec → [1 0], fact → recurse...
            → dup → [0 0], 0 → [0 0 0], = → [0 true]
            → if takes true, runs then-branch:
              [1 drop] on [0] → drop → [], push 1 → [1]
          → * → [1 * 1] = [1]
        → * → [1 * 1] = [1]
      → * → [2 * 1] = [2]
    → * → [3 * 2] = [6]
```

Result: `6`

### Fibonacci

```
fib if [+ fib - 2 swap fib dec dup] [] <= 1 dup
```

### Palindrome Detection

```
palindrome? = reverse dup
  reverse fold [swap concat] ""
```

```
main palindrome? "racecar"
\ Result: true

main palindrome? "hello"
\ Result: false
```

### Towers of Hanoi

Returns a list of moves to solve the Towers of Hanoi for `n` disks.

```
hanoi if [moves] [{} 3drop] = 0 dup
  moves concat concat after recurse-sub before recurse-top
    recurse-top hanoi over over over dec
    before append swap move rot
      move + " → " + " from " +
    recurse-sub hanoi rot rot swap dec
    after drop
    dec - 1
```

Usage: `hanoi "B" "C" "A" 3` — result is a list of move descriptions on the stack.

### Map and Filter

```
squares map [sq]
  sq * dup

evens filter [even?]
  even? = 0 mod 2
```

```
main squares {1 2 3 4 5}
\ Result: {1 4 9 16 25}

main evens {1 2 3 4 5 6}
\ Result: {2 4 6}
```

### Sum of a List

```
sum fold [+] 0
```

```
main sum {1 2 3 4 5}
\ Result: 15
```

### Length of a List

```
length fold [+ 1 drop] 0
```

### Absolute Value

```
abs when [negate] < 0 dup
  negate - swap 0
```

### Max of Two Values

```
max if [drop swap] [drop] > over over
```

### Power (Exponentiation)

```
pow if [* pow dec swap over] [1 drop drop] = 0 dup
```

```
main pow 3 2
\ Result: 8 (2^3)
```

### GCD (Euclid’s Algorithm)

```
gcd if [gcd mod over swap] [drop] = 0 dup
```

```
main gcd 18 48
\ Result: 6
```

### FizzBuzz

```
main each [fizzbuzz] range 100 1
fizzbuzz if [check5] ["FizzBuzz" drop] = 0 mod 15 dup
  check5 if [check3] ["Buzz" drop] = 0 mod 5 dup
    check3 if [] ["Fizz" drop] = 0 mod 3 dup
```

### Quicksort

```
qsort if [cat cat qsort gtr keep [qsort lss]] [] <= 1 length dup
  lss filter [< first over] rest swap
  gtr filter [>= first over] rest swap
  cat concat
```

### Eight Queens

Place 8 queens on a chessboard so none attack each other.

```
queens solve {} 8
solve if [] [each [attempt] range 8 1] = 0 dup
  attempt when [concat solve dec over place] safe? place swap dup
    place append swap
    safe? not any [threatens?] dup
      threatens? or = col dup ..
                 or = + row col dup ..
                    = - row col dup
```

### Tic Tac Toe

A complete tic-tac-toe game with an unbeatable AI (negamax), written entirely in Brief. This is the most complex example — it exercises list manipulation, recursion, higher-order combinators, and the pure-functional outer-loop architecture. The implementation motivated the addition of `nth`, `put`, `dip`, and `keep` to the language.

See [TICTACTOE.md](TICTACTOE.md) for the full implementation, walkthroughs, and design notes.

## Design Notes

- Stack effect comments use traditional Forth notation `( before -- after )` where the top of stack is on the right.
- Evaluation is right-to-left within a line and bottom-to-top across lines.
- The first word on a line is the definition name; the rest is the body.
- Indentation creates lexical scope; inner definitions are only visible to their parent.
- The parser processes indented sub-definitions before compiling the parent's body, so dependencies appear below the code that uses them — enabling a top-down reading style.
- `..` at end of line continues the definition onto the next line.
- Quotations are *not* evaluated when pushed; they must be explicitly invoked via `apply` or consumed by a combinator like `if`, `map`, `fold`, etc.

## Arity Inference and Parenthesization

Brief shares a key property with Lisp: the **arity of every word is known**. Lisp requires explicit parentheses to delimit each expression; Brief does not — because arity can be **inferred** from the stack effects of all words.

Since all built-in words have a fixed number of inputs and outputs, and user-defined words are composed from those built-ins, the arity of any word can be inferred from its definition.

### Implied Parentheses

Because arity is known, parentheses can always be reconstructed. An editor could let you toggle between the two views — a switch between a Forth-like and a Lisp-like reading of the same code.

**Parentheses off:**

```
area * pi sq
  sq * dup
  pi 3.14159
```

**Parentheses on:**

```
area (* pi (sq 𝑥))
  sq (* (dup 𝑥))
  pi 3.14159
```

The structure is identical — same lines, same indentation, same scoping. The parentheses just make explicit which arguments each word captures. Rainbow-colored matching parentheses in the editor would help with readability.

Stack holes are named using the convention from HP calculators: `𝑥` is the top of stack, `𝑦` is second, `𝑧` is third, `𝑤` is fourth. Mathematical italic Unicode characters (𝑥, 𝑦, 𝑧, 𝑤) distinguish these from regular variable names.

In practice, heavy stack shuffling produces tangled hole patterns, which is part of why concatenative languages tend toward a point-free style that minimizes explicit stack manipulation.

### Fully Parenthesized Mode

A fully parenthesized variant of Brief could serve as an alternative representation — useful for debugging, teaching, or tooling. The two forms would be mechanically interconvertible.

### Arity of Stack Operations

Stack manipulation words also have well-defined arities:

| Word   | Inputs | Outputs | Stack Effect          |
|--------|--------|---------|-----------------------|
| `dup`  | 1      | 2       | `( a -- a a )`        |
| `drop` | 1      | 0       | `( a -- )`            |
| `swap` | 2      | 2       | `( a b -- b a )`      |
| `over` | 2      | 3       | `( a b -- a b a )`    |
| `rot`  | 3      | 3       | `( a b c -- b c a )`  |

These can participate in arity inference like any other word.

### Arity Checking

The language (or editor) could enforce that all branches of a conditional consume and produce the same number of stack values — preventing ambiguous arity. For example, this would be rejected:

```
\ Error: branches have different arity
if [+ dup] [drop] = 0 dup
```

The `else` branch (`[+ dup]`, postfix `dup +`) consumes 1 and produces 1; the `then` branch (`[drop]`) consumes 1 and produces 0. The arity is ambiguous.

## Open Questions

- Should there be list literals (e.g., `{1 2 3}`) or are lists built from quotations?
- Error handling strategy: stack underflow, type mismatches, undefined words.
- Module/namespace system for larger programs.
- How should the entry point work? Is it the first (topmost) definition?
- Should line continuation use `..` or some other syntax?
- How deep can indentation nesting go, and are there practical limits?
- How should "option"-style patterns be handled (e.g., `true value` vs `false` with no value)? This creates variable stack depth depending on a runtime flag, which complicates arity inference. Could this be tracked as a special "option type" in the arity system?
- Should there be a fully parenthesized surface syntax as an alternative representation?
- How should arity mismatches in conditional branches be reported — compile-time error, warning, or allowed?
- In a REPL, how do you distinguish a definition from an expression to execute? Possible: lines starting with a known word are executed; unknown words at the start create definitions.

## See Also

- [MACHINE.md](MACHINE.md) — Specification of the Brief Machine, the postfix VM/protocol that Brief compiles to.
- [TICTACTOE.md](TICTACTOE.md) — Complete tic-tac-toe implementation with negamax AI — a non-trivial stress test of the language.
