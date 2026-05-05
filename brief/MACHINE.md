# Brief Machine Specification

## Overview

The **Brief Machine** is the runtime target for the Brief language. It is a stack-based virtual machine that consumes a flat stream of **tokens** — no indentation, no scoping structure, no comments. It operates in **postfix** order, left-to-right.

The Brief compiler transforms Brief source (prefix notation, indented scopes, top-down structure) into the Brief Machine's flat postfix stream. The machine format is an intermediate representation — it can be rendered as text, but it is conceptually a data structure (a sequence of typed tokens).

Critically, the machine itself is a **pure function**. It takes a state and a message (a stream of tokens), and produces a new state. There are no side effects inside the machine. An outer loop manages persistence, I/O, and feeding messages through.

## Architecture

```
┌──────────────┐       ┌──────────┐       ┌───────────────┐
│ Brief Source │ ───▶  │ Compiler │ ───▶  │    Message     │
│ (prefix,     │       │          │       │  (flat postfix │
│  indented,   │       │ - flatten│       │   token stream)│
│  scoped)     │       │ - reorder│       │               │
│              │       │ - inline │       └───────┬───────┘
└──────────────┘       └──────────┘               │
                                                  ▼
                                    ┌─────────────────────────┐
                                    │       Outer Loop        │
                              ┌────▶│                         │
                              │     │  • receives messages    │
                              │     │  • feeds machine        │
                              │     │  • reads results from   │
                              │     │    stack                │
                              │     │  • renders / dispatches │
                              │     │  • carries state forward│
                              │     └────────────┬────────────┘
                              │                  │
                              │                  ▼
                              │     ┌─────────────────────────┐
                              │     │     Brief Machine       │
                              │     │     (pure function)     │
                              │     │                         │
                              │     │  f(state, message)      │
                              │     │       → state'          │
                              │     │                         │
                              │     └────────────┬────────────┘
                              │                  │
                              │          state'  │
                              └──────────────────┘
```

## The Machine

The Brief Machine is a **pure function**:

```
machine : (State, Message) → State
```

It takes a state and a message (a stream of tokens), evaluates the tokens against the state, and returns a new state. There are no side effects. No I/O, no mutation — just a state-to-state transformation.

### State

The machine's state is an immutable value containing:

| Component       | Description                                              |
|-----------------|----------------------------------------------------------|
| **Stack**       | The data stack. Values are pushed and popped by words.   |
| **Dictionary**  | A map of names → definitions. Grows as definitions arrive. |

The state that comes *out* of one message evaluation becomes the state fed *into* the next.

### The Outer Loop

The machine itself is pure, but something has to manage the real world. The **outer loop** is responsible for:

1. **Receiving messages** — from a pipe, command line, network, file, wherever.
2. **Feeding each message** through the machine along with the current state.
3. **Reading results** — whatever is left on the stack after evaluation is the "return value" of that message.
4. **Dispatching effects** — the stack contents after evaluation describe *what should happen*: render a UI, send a message, update storage, etc. The outer loop interprets these descriptions and acts on them.
5. **Carrying state forward** — the new state (including any dictionary additions) becomes the input to the next iteration.

This is analogous to:

- **The Elm Architecture**: `update : Msg → Model → (Model, Cmd)` — the machine is like `update`, the outer loop is like the Elm runtime.
- **An actor** in an actor model — except the actor has no internal mutable state. The outer loop threads the state through.
- **A game loop** — state goes in, new state comes out, render, repeat.
- **A Redux reducer** — `reducer(state, action) → state`.

```
state₀ ──▶ machine(state₀, msg₁) ──▶ state₁
state₁ ──▶ machine(state₁, msg₂) ──▶ state₂
state₂ ──▶ machine(state₂, msg₃) ──▶ state₃
...
```

### Results and Effects

After the machine processes a message, whatever remains on the stack is the result. The outer loop decides what to do with it. Possible conventions:

| Stack contents       | Outer loop interpretation                    |
|----------------------|----------------------------------------------|
| Empty stack          | No result; state update only (e.g., new definitions) |
| A single value       | A return value (display it, send it, etc.)   |
| A description list   | Commands/effects to execute (render UI, send message, write file) |
| A new state value    | Explicit state replacement                   |

The key insight: **Brief code can only produce values on the stack.** It cannot directly print, send messages, or touch the file system. The outer loop interprets stack contents as *descriptions of effects* and executes them. This keeps the machine pure.

This is similar to how Haskell's `IO` monad works — programs describe effects as data, and the runtime executes them.

### Token Types

The machine consumes a stream of typed tokens:

| Token Type    | Example              | Description                                    |
|---------------|----------------------|------------------------------------------------|
| **Integer**   | `42`                 | Pushed onto the stack                          |
| **Float**     | `3.14`               | Pushed onto the stack                          |
| **String**    | `"hello"`            | Pushed onto the stack                          |
| **Symbol**    | `'foo`               | Pushed onto the stack as an atomic name        |
| **Boolean**   | `true`, `false`      | Integer constants: `true` = `-1`, `false` = `0`|
| **Word**      | `dup`, `*`, `swap`   | Looked up in dictionary and executed           |
| **Quotation** | `[dup *]`            | Pushed onto the stack as an unevaluated block  |
| **List**      | `{1 2 3}`            | Pushed onto the stack as a list value          |
| **Define**    | `: name body ;`      | Adds an entry to the dictionary               |

### Evaluation

Tokens are consumed **left-to-right**:

1. **Literals** (integer, float, string, symbol, boolean) → pushed onto the stack.
2. **Quotations** → pushed onto the stack as a value (not executed).
3. **Lists** → pushed onto the stack as a value.
4. **Words** → looked up in the dictionary and executed.
5. **Define** → consumes tokens until `;`, binds the name in the dictionary.

### Definitions

Definitions use Forth-style syntax in the machine format:

```
: sq dup * ;
: pi 3.14159 ;
: area sq pi * ;
```

The `: name ... ;` form adds an entry to the dictionary. After this stream is processed, `sq`, `pi`, and `area` are all available for subsequent use.

Since the machine is a persistent process, you can send definitions once and then use them in future streams:

```
\ Stream 1: send definitions
: sq dup * ;
: pi 3.14159 ;
: area sq pi * ;

\ Stream 2: use them (sent later)
5 area
```

## Machine Primitives

These are built into the machine and always available in the dictionary.

### Stack

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

| Word  | Effect                  |
|-------|-------------------------|
| `=`   | `( a b -- bool )`       |
| `<`   | `( a b -- bool )`       |
| `>`   | `( a b -- bool )`       |
| `<=`  | `( a b -- bool )`       |
| `>=`  | `( a b -- bool )`       |

### Logic

Booleans are integers (`true` = `-1`, `false` = `0`). These are bitwise operations that double as logical operators.

| Word  | Effect                  |
|-------|-------------------------|
| `and` | `( a b -- n )`          |
| `or`  | `( a b -- n )`          |
| `not` | `( a -- n )`            |

### Combinators

| Word      | Effect                              | Description                                      |
|-----------|--------------------------------------|--------------------------------------------------|
| `apply`   | `( quot -- ... )`                    | Execute a quotation                              |
| `dip`     | `( a quot -- ... a )`                | Stash top, execute quotation on rest, restore top|
| `keep`    | `( a quot -- ... a )`                | Apply quotation to a copy of top, keep original  |
| `if`      | `( bool then-q else-q -- ... )`      | Conditional: execute then-q if true, else-q if false |
| `when`    | `( bool quot -- ... )`               | Execute quotation if true, else do nothing           |
| `unless`  | `( bool quot -- ... )`               | Execute quotation if false, else do nothing          |
| `map`     | `( list quot -- list )`              | Apply quotation to each element                  |
| `fold`    | `( list init quot -- result )`       | Reduce a list with an accumulator                |
| `filter`  | `( list quot -- list )`              | Keep elements where quotation returns true       |
| `compose` | `( quot quot -- quot )`              | Concatenate two quotations into one              |
| `each`    | `( list quot -- ... )`               | Execute quotation for each element               |
| `any`     | `( list quot -- bool )`              | True if quotation returns true for any element   |

### Lists

| Word     | Effect                    | Description                                  |
|----------|---------------------------|----------------------------------------------|
| `first`  | `( list -- a )`           | First element of a list                      |
| `rest`   | `( list -- list )`        | All elements except the first                |
| `nth`    | `( list n -- a )`         | Element at index n (0-based)                 |
| `append` | `( list a -- list )`      | Add an element to the end                    |
| `put`    | `( list n a -- list' )`   | New list with element at index n replaced    |
| `concat` | `( list list -- list )`   | Concatenate two lists or strings             |
| `length` | `( list -- n )`           | Number of elements                           |
| `range`  | `( a b -- list )`         | List of integers from a to b inclusive       |

### Dictionary

| Word     | Effect                  | Description                                     |
|----------|-------------------------|-------------------------------------------------|
| `words`  | `( -- list )`             | List all words in the dictionary                |
| `see`    | `( 'name -- quot )`       | Return the definition of a word                 |
| `forget` | `( 'name -- )`          | Remove a word from the dictionary               |

## Compilation: Brief → Machine Format

The compiler transforms Brief source into the machine's flat postfix stream. This involves several steps:

### 1. Resolve Line Continuations

Soft line breaks (`..`) are joined, producing single logical lines.

### 2. Flatten Scopes

Indented sub-definitions are hoisted out and ordered so that dependencies come before dependents.

**Brief source:**

```
area * pi sq
  sq * dup
  pi 3.14159
```

**Machine format:**

```
: pi 3.14159 ;
: sq dup * ;
: area sq pi * ;
```

Note: the machine format is postfix — the compiler reverses the token order within each definition body.

### 3. Reverse Token Order

Each definition body is reversed from prefix (right-to-left) to postfix (left-to-right).

| Brief (prefix)      | Machine (postfix)    |
|----------------------|----------------------|
| `* dup`              | `dup *`              |
| `* pi sq`            | `sq pi *`            |
| `= 0 mod 2`          | `2 mod 0 =`          |
| `if [A] [B] = 0 dup` | `dup 0 = [B] [A] if` |

### 4. Inline Simple Definitions

Definitions that are simple aliases or constants can be inlined to reduce dictionary lookups.

**Before inlining:**

```
: pi 3.14159 ;
: sq dup * ;
: area sq pi * ;
```

**After inlining `pi`:**

```
: sq dup * ;
: area sq 3.14159 * ;
```

Whether to inline `sq` as well is an optimization decision — it's small enough that inlining is likely worthwhile:

```
: area dup * 3.14159 * ;
```

### 5. Strip Comments

All comments (both `( ... )` and `\ ...`) are removed.

## Machine as Protocol

Even though the machine is a pure function, from the outside it behaves like a **protocol endpoint**. The outer loop makes it look like a persistent service: clients send messages, the machine processes them, results come back.

### Session Example

```
→ msg₁:  : sq dup * ;
← state₁: stack=[], dict={sq: [dup *]}

→ msg₂:  : pi 3.14159 ;
← state₂: stack=[], dict={sq: [dup *], pi: [3.14159]}

→ msg₃:  5 sq pi *
← state₃: stack=[78.53975], dict={sq, pi}
   outer loop sees 78.53975 on stack, renders/returns it

→ msg₄:  words
← state₄: stack=[{sq pi ...}], dict={sq, pi}
   outer loop prints the word list
```

Each arrow is a separate call to `machine(stateₙ, msgₙ₊₁) → stateₙ₊₁`. The outer loop threads the state through and interprets results.

### Streaming

The machine processes tokens as they arrive. A complete definition (`: name ... ;`) must arrive in full before it takes effect, but literals and words can be interleaved with definitions:

```
: sq dup * ;
5 sq
: double dup + ;
double
```

Result: `50` on the stack — `5 sq` → `25`, then `double` → `50`.

## Text Rendering

The machine format has a simple text rendering:

- Tokens separated by whitespace
- Quotations delimited by `[ ]`
- Lists delimited by `{ }`
- Strings delimited by `" "`
- Definitions delimited by `: name ... ;`
- Line breaks are insignificant (purely for readability)

This text format is for human inspection and debugging. The actual machine input could be a binary or structured data format — a sequence of tagged values.

## Tail-Call Optimization

The Brief Machine **must** support tail-call optimization (TCO). When the last operation in a definition (or in a branch of an `if`) is a call to another word (including itself), the machine reuses the current call frame rather than allocating a new one. This means recursive definitions can run in constant stack space.

Without TCO, recursive definitions like `fact` or `gcd` would overflow the call stack for large inputs. Since Brief is pure functional and has no loop constructs, recursion is the only way to iterate — making TCO essential, not optional.

### Example

```
: gcd dup 0 = [drop] [dup rot mod gcd] if ;
```

The recursive call to `gcd` is in tail position (it's the last thing the `else` branch does). With TCO, `gcd` runs in constant space regardless of input size.

### What Counts as Tail Position

- The last word in a definition body.
- The last word in either branch of an `if`.
- The last word in a quotation passed to `apply`, when `apply` is itself in tail position.

## Referential Transparency and Option Types

Brief enforces **referential transparency**: a word given the same stack always produces the same stack. This is what makes the machine a pure function.

This imposes a constraint: **all branches of an `if` must have the same stack effect.** You cannot have one branch push two values and another push one — that would make the stack depth unpredictable and break arity inference.

### The Option Problem

A common pattern in other languages is an "option" or "maybe" type — a value that is either present or absent. In a stack language without type enforcement, this is often represented as:

- `true value` — present (two items on stack)
- `false` — absent (one item on stack)

This violates the same-arity-for-all-branches rule. Brief needs a principled alternative.

### Option Type

Brief could have a built-in **option** type (inspired by F#'s `Option<'T>` / Haskell's `Maybe a`):

| Word     | Effect                    | Description                          |
|----------|---------------------------|--------------------------------------|
| `some`   | `( a -- option )`         | Wrap a value in an option            |
| `none`   | `( -- option )`           | Push an empty option                 |
| `some?`  | `( option -- bool )`      | Is the option present?               |
| `unwrap` | `( option -- a )`         | Extract the value (error if none)    |
| `maybe`  | `( option default-q some-q -- ... )` | Like `if` but for options  |

This way, an option is always **one item** on the stack regardless of whether it's present or absent. Arity stays consistent.

```
\ Find an element, return an option
: find filter first-or-none
  : first-or-none dup length 0 = [drop none] [first some] if

\ Use it
{1 2 3} [2 >] find [0] [dup *] maybe
\ Result: 9 (found 3, squared it)

{1 2 3} [5 >] find [0] [dup *] maybe
\ Result: 0 (not found, used default)
```

## Open Questions

- Should the machine support scoped/nested dictionaries, or is it always flat?
- Binary wire format for the token stream — what encoding?
- Error reporting: what does the machine return on stack underflow, undefined word, type error? Perhaps errors are also values on the stack (like option types).
- Should there be a `reset` word to clear the dictionary and stack?
- Garbage collection or memory management for quotations and lists?
- Could the machine run in a sandboxed mode with restricted primitives (no I/O)?
- Should the outer loop clear the stack between messages, or carry it forward?
- What is the schema for effect descriptions on the stack? A list of tagged commands? Symbols?
- Should there be a key-value store / property hierarchy as part of the state, beyond just the dictionary?

## See Also

- [SPEC.md](SPEC.md) — Brief language specification (prefix source format).
- [TICTACTOE.md](TICTACTOE.md) — Complete tic-tac-toe implementation with negamax AI — a non-trivial stress test of the language.
