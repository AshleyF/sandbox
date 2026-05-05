#!/usr/bin/env python3
"""Development test file for TTT in Brief."""

from brief import Machine, format_value, parse_program, format_tokens

def test(name, program, expected=None):
    """Run a Brief program and print result."""
    m = Machine()
    try:
        result = m.run_program(program)
        formatted = [format_value(v) for v in result]
        status = "✓" if expected is None or formatted == expected else "✗"
        print(f"  {status} {name}: {formatted}")
        if expected and formatted != expected:
            print(f"    expected: {expected}")
        return formatted
    except Exception as e:
        print(f"  ✗ {name}: ERROR - {e}")
        return None

# ═══════════════════════════════════════════════════════════════
# Complete TTT definitions
# ═══════════════════════════════════════════════════════════════

TTT_DEFS = r'''
\ ── Board ────────────────────────────────────────────────
empty-board {0 0 0 0 0 0 0 0 0}

winning-lines ..
  {{0 1 2} {3 4 5} {6 7 8} ..
   {0 3 6} {1 4 7} {2 5 8} ..
   {0 4 8} {2 4 6}}

\ empty-cells ( board -- positions )
\ For each index 0-8, keep it if board[idx] == 0
empty-cells nip filter [= 0 nth swap over] range 8 0

\ swap-player ( player -- other )
swap-player if [1] [2] = 1

\ ── Win Detection ────────────────────────────────────────

\ line-won? ( player board line -- bool )
\ Stack convention: line on top, board second, player third.
\ Uses pick to access board and player without disturbing the stack.
line-won? nip nip nip and and = pick 5 nth swap pick 4 nth 2 pick 2 ..
  = pick 4 nth swap pick 3 nth 1 over = pick 3 nth swap pick 2 nth 0 dup

\ won? ( board player -- bool )  [board on top in prefix: won? board player]
\ Prefix R→L: push player, push board → stack (player board) — board on top.
\ any iterates winning-lines. Quotation receives (player board line_i).
\ dip [over over] copies player+board beneath line for line-won?.
won? nip nip any [line-won? dip [over over]] winning-lines

\ draw? ( board -- bool )
draw? = 0 length empty-cells

\ game-over? ( board -- bool )
\ Postfix: dup 1 swap won? swap dup 2 swap won? swap draw? or or
game-over? or or draw? swap won? swap 2 dup swap won? swap 1 dup

\ ── Display ──────────────────────────────────────────────

\ cell ( board n -- board string )
\ Look up board[n], return "X", "O", or "."
\ if [else/false] [then/true] condition
\ When val==1 (true): second bracket ["X" drop] runs
\ When val!=1 (false): first bracket checks val==2
cell if [if ["." drop] ["O" drop] = 2 dup] ["X" drop] = 1 dup nth swap over

\ Row builders: each row uses 3 cells with " | " separators
\ row0 ( board -- board string )
row0 concat concat concat concat cell 2 " | " cell 1 " | " cell 0
row1 concat concat concat concat cell 5 " | " cell 4 " | " cell 3
row2 concat concat concat concat cell 8 " | " cell 7 " | " cell 6

\ show ( board -- string )
\ Renders full board, consuming the board from the stack
show nip concat concat concat concat row2 "\n---+---+---\n" row1 "\n---+---+---\n" row0
'''

# ═══════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════

print("=== Board Primitives ===")
test("empty-board", f"main empty-board\n{TTT_DEFS}", ["{0 0 0 0 0 0 0 0 0}"])

test("empty-cells (some filled)", 
     f"main empty-cells {{1 0 0 0 1 0 0 0 1}}\n{TTT_DEFS}",
     ["{1 2 3 5 6 7}"])

test("empty-cells (empty board)", 
     f"main empty-cells {{0 0 0 0 0 0 0 0 0}}\n{TTT_DEFS}",
     ["{0 1 2 3 4 5 6 7 8}"])

test("empty-cells (full board)", 
     f"main empty-cells {{1 2 1 2 1 2 2 1 2}}\n{TTT_DEFS}",
     ["{}"])

test("swap-player 1→2", f"main swap-player 1\n{TTT_DEFS}", ["2"])
test("swap-player 2→1", f"main swap-player 2\n{TTT_DEFS}", ["1"])

print("\n=== Win Detection ===")
test("won? X top row", f"main won? {{1 1 1 0 0 0 0 0 0}} 1\n{TTT_DEFS}", ["-1"])
test("won? X no win", f"main won? {{1 0 1 0 0 0 0 0 0}} 1\n{TTT_DEFS}", ["0"])
test("won? O diagonal", f"main won? {{2 0 0 0 2 0 0 0 2}} 2\n{TTT_DEFS}", ["-1"])
test("won? O not won (X board)", f"main won? {{1 1 1 0 0 0 0 0 0}} 2\n{TTT_DEFS}", ["0"])
test("won? X column", f"main won? {{1 0 0 1 0 0 1 0 0}} 1\n{TTT_DEFS}", ["-1"])
test("won? O middle row", f"main won? {{0 0 0 2 2 2 0 0 0}} 2\n{TTT_DEFS}", ["-1"])
test("won? X anti-diagonal", f"main won? {{0 0 1 0 1 0 1 0 0}} 1\n{TTT_DEFS}", ["-1"])

print("\n=== Game Over ===")
test("game-over? X wins", f"main game-over? {{1 1 1 0 0 0 0 0 0}}\n{TTT_DEFS}", ["-1"])
test("game-over? O wins", f"main game-over? {{0 0 0 2 2 2 0 0 0}}\n{TTT_DEFS}", ["-1"])
test("game-over? draw", f"main game-over? {{1 2 1 2 1 2 2 1 2}}\n{TTT_DEFS}", ["-1"])
test("game-over? in progress", f"main game-over? {{1 0 0 0 0 0 0 0 0}}\n{TTT_DEFS}", ["0"])
test("game-over? empty", f"main game-over? {{0 0 0 0 0 0 0 0 0}}\n{TTT_DEFS}", ["0"])

print("\n=== Display ===")
# cell is called from row builders with (board n) — n on top.
# In prefix, "cell 0 {board}" → R→L: push board, push 0 → (board 0) ✓
test("cell X", f'main cell 0 {{1 0 2 0 0 0 0 0 0}}\n{TTT_DEFS}')
test("cell O", f'main cell 2 {{1 0 2 0 0 0 0 0 0}}\n{TTT_DEFS}')
test("cell empty", f'main cell 1 {{1 0 2 0 0 0 0 0 0}}\n{TTT_DEFS}')

test("show empty board", f'main show {{0 0 0 0 0 0 0 0 0}}\n{TTT_DEFS}')
test("show mixed board", f'main show {{1 0 2 0 1 0 0 0 2}}\n{TTT_DEFS}')
