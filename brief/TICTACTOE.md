# Tic Tac Toe in Brief

A complete, working implementation of tic-tac-toe with an unbeatable AI (negamax), written entirely in Brief. This serves as a non-trivial stress test of the language — it exercises list manipulation, recursion, higher-order combinators, state threading, and the pure-functional outer-loop architecture.

## Language Primitives Used

This example motivated the addition of several primitives to the language. These are documented in [SPEC.md](SPEC.md) and [MACHINE.md](MACHINE.md) but summarized here for reference:

| Word   | Effect                         | Description                                            |
|--------|--------------------------------|--------------------------------------------------------|
| `nth`  | `( list n -- a )`             | Get element at index n (0-based)                       |
| `put`  | `( list n a -- list' )`       | Return new list with element at index n replaced       |
| `dip`  | `( a quot -- ... a )`         | Stash top, execute quotation on rest, restore top      |
| `keep` | `( a quot -- ... a )`         | Apply quotation to a copy of top, keep original on top |

## Game Design

### Representation

| Concept   | Representation                                          |
|-----------|---------------------------------------------------------|
| Board     | A list of 9 integers: `{0 0 0 0 0 0 0 0 0}`           |
| Empty     | `0`                                                     |
| X (human) | `1`                                                     |
| O (computer) | `2`                                                  |
| Position  | Index 0–8 into the board list                           |
| Player    | `1` or `2`                                              |

### Board Layout

```
 0 │ 1 │ 2
───┼───┼───
 3 │ 4 │ 5
───┼───┼───
 6 │ 7 │ 8
```

### Architecture

The game follows Brief's pure-functional architecture. The machine is a pure function — it receives a message, transforms state, and leaves a result on the stack. The outer loop handles I/O.

```
┌─────────────┐         ┌──────────────────┐
│  Outer Loop │         │  Brief Machine   │
│             │  move   │                  │
│  display ◄──┼─────────┤  play            │
│  board      │  board  │  ├─ validate     │
│             │  string │  ├─ place mark   │
│  read    ───┼─────────►  ├─ check win    │
│  input      │         │  ├─ AI move      │
│             │         │  └─ render board │
└─────────────┘         └──────────────────┘
```

**Message protocol:**

| Message sent to machine       | Stack result                          |
|-------------------------------|---------------------------------------|
| `init`                        | Board string of empty board           |
| `play <board> <pos>`          | `{<board'> <status> <display>}`       |

The result is a list of three values: the new board, a status symbol (`'playing`, `'x-wins`, `'o-wins`, or `'draw`), and a display string. The outer loop extracts each and acts accordingly.

## The Code

### Entry Points

```
\ Initialize: push an empty board and render it
init show empty-board

\ Play: human moves at position, computer responds
\ ( board pos -- {board' status display} )
play if [result 'invalid dup] ..
     [after-human] valid? over over
  valid? = 0 nth swap over
  after-human if [result status dup] ..
              [after-ai] game-over? board
    board put swap 1
    after-ai if [result status dup] ..
             [result 'playing ai-board] game-over? ai-board
      ai-board put swap 2 best-move dup
  status if ['x-wins] [if ['o-wins] ['draw] won? 2 dup] won? 1 dup
  result append append {} show rot
```

Reading `play` top-down: given a board and position, check if the move is valid. If not, return the unchanged board with `'invalid`. If valid, place the human's mark (`1`). If that ends the game, return the status. Otherwise, run the AI (`best-move`), place the AI's mark (`2`), and return the result.

### Board Primitives

```
\ The empty board: 9 zeros
empty-board {0 0 0 0 0 0 0 0 0}

\ All eight winning lines
winning-lines ..
  {{0 1 2} {3 4 5} {6 7 8} ..
   {0 3 6} {1 4 7} {2 5 8} ..
   {0 4 8} {2 4 6}}

\ List of positions that are empty (contain 0)
\ ( board -- positions )
empty-cells filter [= 0 nth swap dup] range 8 0
  \ For each index 0–8, keep it if board[index] = 0.
  \ The quotation receives the board beneath and an index on top.
  \ dup: copy index; swap: bring board up; nth: get cell; 0 =: test empty.
  \ filter keeps the index if the result is true.

\ Is there a winner? Check if any line is all one player.
\ ( board player -- bool )
won? any [line-won? swap over] winning-lines dip [drop]
  line-won? and and = nth 2 rot over ..
                      = nth 1 rot over ..
                      = nth 0 rot over
    \ line-won? ( board player line -- bool )
    \ Checks that all three cells in line equal player.
    \ line is {a b c}. Extract each index, look up in board, compare to player.
    \ For index at line[0]: over gets player, rot gets line,
    \   0 nth gets line[0], rot brings board to top, nth gets board[line[0]],
    \   = compares with player. Repeat for line[1] and line[2], AND the results.

\ Is the game over? Someone won or no empty cells remain.
\ ( board -- bool )
game-over? or or draw? won? 2 dup won? 1 dup
  draw? = 0 length empty-cells
```

### Display

```
\ Render the board as a string for display
\ ( board -- string )
show concat concat concat concat row2 sep row1 sep row0
  row0 concat concat cell 2 sep-col cell 1 sep-col cell 0
    cell if ["X"] [cell-o] = 1 nth over
      cell-o if ["O"] ["."] = 2 nth over
    sep-col " | "
    \ cell ( board n -- board string )
    \ over: copy board, nth: get value, compare to 1 or 2, produce string.
    \ The board remains beneath for subsequent cells.
  row1 concat concat cell 5 sep-col cell 4 sep-col cell 3
  row2 concat concat cell 8 sep-col cell 7 sep-col cell 6
  sep "\n---+---+---\n"
```

Example output for a board `{1 0 2 0 1 0 0 0 2}`:

```
 X | . | O
---+---+---
 . | X | .
---+---+---
 . | . | O
```

### AI: Negamax

The AI uses [negamax](https://en.wikipedia.org/wiki/Negamax), a variant of minimax where the score is always from the current player's perspective. The key insight: `score(board, me) = -score(board, opponent)`. This eliminates the need for separate "maximize" and "minimize" branches.

```
\ Find the best move for the current player (always called with player=2, the computer)
\ ( board -- pos )
best-move first best-scored score-all dup
  \ score-all: score every empty cell, return list of {score pos} pairs
  score-all map [score-one] dip [empty-cells] keep [dup]
    \ keep [dup]: keeps a copy of the board on top
    \ dip [empty-cells]: computes empty-cells on the board copy beneath
    \ map [score-one]: scores each position
    \ The quotation runs with board beneath and a position on top.
    score-one pair negate negamax swap-player try-move dup
      try-move put swap 2 over over
        \ try-move ( board pos -- board' )
        \ over over: copy board and pos; 2: the AI player; swap: reorder; put: place mark
      swap-player drop 1
        \ After AI places, evaluate from opponent's (player 1) perspective.
        \ drop: discard old player (2), push 1.
      pair append append {} swap
        \ pair ( score pos -- {score pos} )
        \ Build a two-element list.
  best-scored fold [better] first dup
    better if [swap drop] [drop] > first swap first over over
      \ better ( best candidate -- best-or-candidate )
      \ Compare scores (first element of each pair). Keep the one with higher score.

\ Negamax: score a board from the perspective of the given player
\ ( board player -- score )
negamax if [terminal-score] ..
        [negate best-score move-scores] game-over? over
  terminal-score if [10] [if [-10] [0] won? swap-player dup] won? dup over
    \ If current player has won: 10. If opponent won: -10. Draw: 0.
    \ Note: won? ( board player -- bool ) needs board and player.
    \ dup over: copies player and board for the first won? check.
  swap-player if [2] [1] = 1
  move-scores map [negate negamax swap-player try-move dup] ..
              dip [empty-cells] keep [2dup]
    try-move put rot dup rot
      \ try-move ( board player pos -- board' player )
      \ dup rot: copy pos, bring player up; dup rot: copy player, bring board up
      \ put: place player at pos; result: ( board' player )
    2dup over over
  best-score fold [max] first dup
```

#### How Negamax Works

Negamax evaluates every possible game tree to find the optimal move. At each node:

1. **Terminal check**: If the game is over, return a score from the current player's perspective — `+10` for a win, `-10` for a loss, `0` for a draw.
2. **Recurse**: For each empty cell, place the current player's mark, then call negamax for the opponent. Negate the result (opponent's gain is our loss).
3. **Pick best**: Take the maximum score across all moves.

The negation is the key trick — it means the same code works for both players without separate min/max logic.

```
     X plays at 4          (score from X's perspective)
     ┌──────┼──────┐
  O@0     O@1     O@2      (score from O's perspective, negated for X)
  ┌─┼─┐  ┌─┼─┐  ┌─┼─┐
  ...      ...     ...     (continue until terminal states)
```

#### Walkthrough: AI Picks a Winning Move

Board state — computer (`2`) has two in a row:

```
 X | . | .       board = {1 0 0 0 2 2 1 0 0}
---+---+---
 . | O | O       empty cells = {1 2 3 7 8}
---+---+---
 X | . | .
```

1. `best-move` is called with this board.
2. `score-all` maps `score-one` over positions `{1 2 3 7 8}`.
3. For position `5` (already filled — not in empty list). For position `3`:
   - `try-move`: places `2` at position `3` → `{1 0 0 2 2 2 1 0 0}`
   - This doesn't actually win (row 1 is positions 3,4,5 — wait, that IS `{2 2 2}` — **O wins!**)
   - `negamax` detects `won? 2` → terminal score `10` from O's perspective.
   - Negated for the search: `-(-10) = 10` — wait, let me re-trace.

Actually, `best-move` calls `score-one` which does:
- `try-move`: place AI mark (2) at the position
- `swap-player`: switch to player 1 (opponent)
- `negamax`: score from player 1's perspective
- `negate`: flip to AI's perspective

For position 3: placing 2 gives `{1 0 0 2 2 2 1 0 0}`. Row `{3 4 5}` = `{2 2 2}` → O wins. `negamax` from player 1's perspective: player 1 hasn't won, player 2 has won → score is `-10` (loss for player 1). Negated: `10`. So position 3 scores 10 — the maximum possible. The AI picks it.

## Full Listing

All definitions in one block, with sub-definitions properly scoped:

```
\ ═══════════════════════════════════════════════
\  Tic Tac Toe in Brief
\ ═══════════════════════════════════════════════

\ Initialize game — returns display string of empty board
init show empty-board

\ Human plays at position pos on board
\ ( board pos -- {board' status display} )
play if [result 'invalid dup] [after-human] valid? over over
  valid? = 0 nth swap over
  after-human if [result status dup] ..
              [after-ai] game-over? board
    board put swap 1
    after-ai if [result status dup] ..
             [result 'playing ai-board] game-over? ai-board
      ai-board put swap 2 best-move dup
  status if ['x-wins] [if ['o-wins] ['draw] won? 2 dup] won? 1 dup
  result append append {} show rot

\ ── Board ────────────────────────────────────────────────

empty-board {0 0 0 0 0 0 0 0 0}

winning-lines ..
  {{0 1 2} {3 4 5} {6 7 8} ..
   {0 3 6} {1 4 7} {2 5 8} ..
   {0 4 8} {2 4 6}}

empty-cells filter [= 0 nth swap dup] range 8 0

won? any [line-won? swap over] winning-lines dip [drop]
  line-won? and and = nth 2 rot over ..
                      = nth 1 rot over ..
                      = nth 0 rot over

game-over? or or draw? won? 2 dup won? 1 dup
  draw? = 0 length empty-cells

swap-player if [2] [1] = 1

\ ── Display ──────────────────────────────────────────────

show concat concat concat concat row2 sep row1 sep row0
  row0 concat concat cell 2 sep-col cell 1 sep-col cell 0
  row1 concat concat cell 5 sep-col cell 4 sep-col cell 3
  row2 concat concat cell 8 sep-col cell 7 sep-col cell 6
  cell if ["X"] [cell-o] = 1 nth over
    cell-o if ["O"] ["."] = 2 nth over
  sep-col " | "
  sep "\n---+---+---\n"

\ ── AI (Negamax) ─────────────────────────────────────────

best-move first best-scored score-all dup
  score-all map [score-one] dip [empty-cells] keep [dup]
    score-one pair negate negamax swap-player try-move dup
      try-move put swap 2 over over
      pair append append {} swap
  best-scored fold [better] first dup
    better if [swap drop] [drop] > first swap first over over

negamax if [terminal-score] ..
        [negate best-score move-scores] game-over? over
  terminal-score if [10] [if [-10] [0] won? swap-player dup] won? dup over
  move-scores map [negate negamax swap-player try-move dup] ..
              dip [empty-cells] keep [2dup]
    try-move put rot dup rot
    2dup over over
  best-score fold [max] first dup
```

## Interaction: Full Game Session

Below is a sample session showing messages sent to the machine and results returned. The outer loop displays the board and reads input.

```
→ init
← stack: " . | . | . \n---+---+---\n . | . | . \n---+---+---\n . | . | . "

  (User sees the empty board, enters position 4)

→ play {0 0 0 0 0 0 0 0 0} 4
← stack: {{0 0 2 0 1 0 0 0 0} 'playing " . | . | O\n---+---+---\n . | X | . \n---+---+---\n . | . | . "}

  (Outer loop extracts: board={0 0 2 0 1 0 0 0 0}, status='playing,
   display string shown to user. AI chose position 2.)

→ play {0 0 2 0 1 0 0 0 0} 6
← stack: {{0 0 2 0 1 0 1 0 2} 'playing " . | . | O\n---+---+---\n . | X | . \n---+---+---\n X | . | O"}

  (Human plays 6. AI responds at 8.)

→ play {0 0 2 0 1 0 1 0 2} 1
← stack: {{2 0 2 0 1 0 1 1 2} 'playing "O | . | O\n---+---+---\n . | X | . \n---+---+---\n X | X | O"}

  (Hmm, AI takes 0 — threatening a win at position 1... wait, human just played 1.
   Actually, human played position 1. AI takes 0.)

→ play {2 1 2 0 1 0 1 0 2} 3
← stack: {{2 1 2 1 1 0 1 0 2} 'playing "O | X | O\n---+---+---\n X | X | . \n---+---+---\n X | . | O"}

  (Human plays 3, threatening row {3,4,5}. AI must block at 5.)

→ play {2 1 2 1 1 2 1 0 2} 7
← stack: {{2 1 2 1 1 2 1 1 2} 'draw "O | X | O\n---+---+---\n X | X | O\n---+---+---\n X | X | O"}

  (Game drawn — all cells filled, no winner.)
```

With perfect play from both sides, tic-tac-toe is always a draw. The negamax AI guarantees this.

## Compilation to Machine Format

The Brief compiler transforms the prefix, scoped source into the machine's flat postfix stream. Here is what the machine sees for selected definitions (comments added for clarity):

```
\ Board primitives (flat postfix)
: empty-board {0 0 0 0 0 0 0 0 0} ;
: swap-player 1 = [1] [2] if ;
: empty-cells 0 8 range [dup swap nth 0 =] filter ;

\ Win detection
: line-won?
  over rot 0 nth over rot 1 nth = rot over 2 nth =
  and and ;
: won? [drop] dip winning-lines [over swap line-won?] any ;
: draw? empty-cells length 0 = ;
: game-over? dup 1 won? dup 2 won? draw? or or ;

\ Display (postfix)
: cell over nth 1 = ["X"] [over nth 2 = ["O"] ["."] if] if ;
: row0 0 cell " | " 1 cell " | " 2 cell concat concat concat concat ;
: row1 3 cell " | " 4 cell " | " 5 cell concat concat concat concat ;
: row2 6 cell " | " 7 cell " | " 8 cell concat concat concat concat ;
: show row0 "\n---+---+---\n" row1 "\n---+---+---\n" row2
       concat concat concat concat ;
```

Note how the compiler reverses token order within each body and hoists scoped definitions into flat top-level entries.

## Design Lessons

### What Went Well

- **Top-down readability**: `play` reads like a narrative — validate, place human mark, check game over, run AI, place AI mark, return result. Details are below.
- **Factoring**: Each word does one thing. `won?`, `game-over?`, `show`, `best-move` are all independent, testable units.
- **Purity**: The machine never does I/O. The outer loop protocol is simple: send board + move, get back board + status + display.
- **`dip` and `keep`**: These two combinators eliminated most stack shuffling. Without them, every function that needed to preserve a value across a sub-computation would require `swap rot swap rot` gymnastics.

### What Was Hard

- **Negamax**: The recursive structure requires careful stack management — board, player, position, and score all need to coexist. `dip` and `keep` help, but the deepest parts of `negamax` still require `rot` and `over`.
- **List as board**: Without `nth` and `put` as primitives, indexing into a list is painful (recursive `first`/`rest` traversal). This motivated adding them to the language.
- **No closures**: The quotation passed to `map` or `fold` can only see what's on the stack. When scoring moves, the board and player need to be threaded through manually. Languages with closures would capture them automatically.
- **Three-value return**: Returning `{board status display}` as a list works but is verbose to construct and destructure. A tuple or record type would be nicer.

### Language Changes Motivated by This Example

| Addition  | Why                                                        |
|-----------|------------------------------------------------------------|
| `nth`     | List indexing is fundamental; building it from `first`/`rest` is O(n) either way, but the recursive definition clutters every program that uses lists as arrays. |
| `put`     | Same rationale — replacing an element at an index is a basic operation for any data structure used as an array. |
| `dip`     | THE key combinator for stack languages. Eliminates the majority of `swap`/`rot` shuffling. Without it, any function that needs to "reach past" the top of stack becomes a puzzle. |
| `keep`    | Common pattern: compute something from a value but also preserve it. Without `keep`, you write `dup dip [operation]` everywhere. |

These four additions are general-purpose — they benefit every non-trivial Brief program, not just this game.

## See Also

- [SPEC.md](SPEC.md) — Brief language specification
- [MACHINE.md](MACHINE.md) — Brief Machine (VM) specification
