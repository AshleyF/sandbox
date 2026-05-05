#!/usr/bin/env python3
"""
Test suite for the Tic Tac Toe implementation in Brief.
Tests each word incrementally by loading tictactoe.brief.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from brief import Machine, BriefError, format_value, parse_program

PASS = 0
FAIL = 0
ERRORS = []


def load_ttt():
    """Load tictactoe.brief definitions into a fresh machine."""
    machine = Machine()
    ttt_path = os.path.join(os.path.dirname(__file__), 'tictactoe.brief')
    with open(ttt_path, 'r', encoding='utf-8') as f:
        source = f.read()
    definitions, _ = parse_program(source)
    machine.dictionary.update(definitions)
    return machine


def test(name, expr, expected):
    """Test a Brief expression against expected stack (using loaded TTT defs)."""
    global PASS, FAIL
    machine = load_ttt()
    try:
        machine.eval_line(expr)
        result = [format_value(v) for v in machine.stack]
        exp = [str(e) for e in expected]
        if result == exp:
            PASS += 1
            print(f"  PASS  {name}")
        else:
            FAIL += 1
            msg = f"  FAIL  {name}: expected {exp}, got {result}"
            print(msg)
            ERRORS.append(msg)
    except BriefError as e:
        FAIL += 1
        msg = f"  FAIL  {name}: BriefError: {e}"
        print(msg)
        ERRORS.append(msg)
    except Exception as e:
        FAIL += 1
        msg = f"  FAIL  {name}: {type(e).__name__}: {e}"
        print(msg)
        ERRORS.append(msg)


# ===================================================================
print("=== Tic Tac Toe Test Suite ===\n")

# -- Constants ------------------------------------------------------
print("Constants:")
test("empty-board", "empty-board", ["{0 0 0 0 0 0 0 0 0}"])
test("winning-lines count", "length winning-lines", ["8"])
test("winning-lines first", "first winning-lines", ["{0 1 2}"])

print()

# -- swap-player -----------------------------------------------------
print("swap-player:")
test("1 -> 2", "swap-player 1", ["2"])
test("2 -> 1", "swap-player 2", ["1"])

print()

# -- empty-cells ------------------------------------------------------
print("empty-cells:")
test("empty board -> all 9",
     "empty-cells {0 0 0 0 0 0 0 0 0}",
     ["{0 1 2 3 4 5 6 7 8}"])
test("partial board",
     "empty-cells {1 0 2 0 1 0 0 0 2}",
     ["{1 3 5 6 7}"])
test("full board -> empty list",
     "empty-cells {1 2 1 2 1 1 2 1 2}",
     ["{}"])

print()

# -- line-won? --------------------------------------------------------
# line-won? ( board player line -- bool )
# In prefix: line-won? {line} player {board}
#   -> push {board}, push player, push {line}
#   -> stack: (board player line) with line on top
print("line-won?:")
test("X wins row 0",
     "line-won? {0 1 2} 1 {1 1 1 0 0 0 0 0 0}", ["-1"])
test("X partial row 0 (no win)",
     "line-won? {0 1 2} 1 {1 0 1 0 0 0 0 0 0}", ["0"])
test("O wins col 2",
     "line-won? {2 5 8} 2 {0 0 2 0 0 2 0 0 2}", ["-1"])
test("O wins diagonal",
     "line-won? {0 4 8} 2 {2 0 0 0 2 0 0 0 2}", ["-1"])
test("wrong player for line",
     "line-won? {0 1 2} 2 {1 1 1 0 0 0 0 0 0}", ["0"])

print()

# -- won? --------------------------------------------------------------
# won? ( player board -- bool )
# In prefix: won? player board
#   -> push board, push player -> (board player) player on top
print("won?:")
# won? expects (player board) with board on TOP
# In prefix: won? {board} player -> pushes player, then board -> board on top
test("X wins row 0",
     "won? {1 1 1 0 0 0 0 0 0} 1", ["-1"])
test("X not winning",
     "won? {1 0 1 0 0 0 0 0 0} 1", ["0"])
test("O wins row 1",
     "won? {0 0 0 2 2 2 0 0 0} 2", ["-1"])
test("O wins diagonal",
     "won? {2 0 0 0 2 0 0 0 2} 2", ["-1"])
test("empty board",
     "won? {0 0 0 0 0 0 0 0 0} 1", ["0"])
test("wrong player",
     "won? {1 1 1 0 0 0 0 0 0} 2", ["0"])
test("X wins col 0",
     "won? {1 0 0 1 0 0 1 0 0} 1", ["-1"])
test("O wins anti-diag",
     "won? {0 0 2 0 2 0 2 0 0} 2", ["-1"])

print()

# -- draw? --------------------------------------------------------------
print("draw?:")
test("full board -> draw",
     "draw? {1 2 1 2 1 1 2 1 2}", ["-1"])
test("empty board -> not draw",
     "draw? {0 0 0 0 0 0 0 0 0}", ["0"])
test("partial board -> not draw",
     "draw? {1 0 2 0 1 0 0 0 2}", ["0"])

print()

# -- check-status -------------------------------------------------------
# check-status ( board -- board 'status )
print("check-status:")
test("X wins -> 'x-wins",
     "check-status {1 1 1 0 0 0 0 0 0}",
     ["{1 1 1 0 0 0 0 0 0}", "'x-wins"])
test("O wins -> 'o-wins",
     "check-status {2 0 0 0 2 0 0 0 2}",
     ["{2 0 0 0 2 0 0 0 2}", "'o-wins"])
test("draw -> 'draw",
     "check-status {1 2 1 2 1 1 2 1 2}",
     ["{1 2 1 2 1 1 2 1 2}", "'draw"])
test("still playing -> 'playing",
     "check-status {1 0 0 0 0 0 0 0 0}",
     ["{1 0 0 0 0 0 0 0 0}", "'playing"])
test("empty board -> 'playing",
     "check-status {0 0 0 0 0 0 0 0 0}",
     ["{0 0 0 0 0 0 0 0 0}", "'playing"])

print()

# -- valid? ---------------------------------------------------------------
# valid? ( board pos -- board pos bool )
print("valid?:")
test("empty cell is valid",
     "valid? 4 {0 0 0 0 0 0 0 0 0}",
     ["{0 0 0 0 0 0 0 0 0}", "4", "-1"])
test("occupied cell not valid",
     "valid? 0 {1 0 0 0 0 0 0 0 0}",
     ["{1 0 0 0 0 0 0 0 0}", "0", "0"])

print()

# -- place ----------------------------------------------------------------
# place ( board pos player -- board' )
# In prefix: place player pos board
print("place:")
test("X at center",
     "place 1 4 {0 0 0 0 0 0 0 0 0}",
     ["{0 0 0 0 1 0 0 0 0}"])
test("O at corner",
     "place 2 0 {0 0 0 0 1 0 0 0 0}",
     ["{2 0 0 0 1 0 0 0 0}"])

print()

# -- cell-char --------------------------------------------------------------
print("cell-char:")
test("0 -> '.'", "cell-char 0", ['"."'])
test("1 -> 'X'", "cell-char 1", ['"X"'])
test("2 -> 'O'", "cell-char 2", ['"O"'])

print()

# -- board-chars -------------------------------------------------------------
print("board-chars:")
test("empty board",
     'board-chars {0 0 0 0 0 0 0 0 0}',
     ['{"." "." "." "." "." "." "." "." "."}'])
test("mixed board",
     'board-chars {1 2 0 0 1 0 0 0 2}',
     ['{"X" "O" "." "." "X" "." "." "." "O"}'])

print()

# -- negamax -------------------------------------------------------------------
# negamax ( board player depth -- score )
print("negamax:")
test("player won at depth 0",
     "negamax 0 1 {1 1 1 2 2 0 0 0 0}", ["10"])
test("player won at depth 3",
     "negamax 3 1 {1 1 1 2 2 0 0 0 0}", ["7"])
test("opponent won at depth 0",
     "negamax 0 1 {2 2 2 1 1 0 0 0 0}", ["-10"])
test("opponent won at depth 2",
     "negamax 2 1 {2 2 2 1 1 0 0 0 0}", ["-8"])
test("full board draw",
     "negamax 0 1 {1 2 1 2 1 2 2 1 2}", ["0"])
test("1 empty cell draw",
     "negamax 0 1 {1 2 1 1 2 2 2 1 0}", ["0"])
test("2 empty cells win",
     "negamax 0 1 {1 2 1 1 2 2 0 1 0}", ["9"])
test("2 empty cells draw",
     "negamax 0 1 {1 2 0 1 2 0 2 1 1}", ["0"])
test("3 empty cells",
     "negamax 0 1 {1 2 1 0 2 2 0 1 0}", ["0"])

print()

# -- ai-move ------------------------------------------------------------------
print("ai-move (negamax):")
test("O blocks X col 0 threat (2 empty)",
     "ai-move {1 2 1 1 2 2 0 1 0}",
     ["{1 2 1 1 2 2 2 1 0}"])
test("O wins when it can (4 empty)",
     "ai-move {1 1 0 2 2 0 1 0 0}",
     ["{1 1 0 2 2 2 1 0 0}"])
test("O takes last cell (1 empty)",
     "ai-move {1 2 1 2 1 2 2 1 0}",
     ["{1 2 1 2 1 2 2 1 2}"]
)

print()

# -- play ---------------------------------------------------------------------
# play ( board pos -- board' 'status )
# In prefix: play pos board -> push board, push pos -> (board pos)
# NOTE: play triggers AI via ai-move, so boards must have few empty cells
# to keep tests fast with the pure-Brief negamax.
print("play:")
test("invalid move (occupied)",
     "play 0 {1 0 0 0 0 0 0 0 0}",
     ["{1 0 0 0 0 0 0 0 0}", "'invalid"])

# Human plays X at 6, AI responds at 8 (2 empty -> 1 after X -> 0 after AI)
test("mid-game play (2 empty)",
     "play 6 {1 2 2 2 1 1 0 1 0}",
     ["{1 2 2 2 1 1 1 1 2}", "'draw"])

test("human wins immediately",
     "play 2 {1 1 0 0 2 0 0 0 2}",
     ["{1 1 1 0 2 0 0 0 2}", "'x-wins"])
# Human places X at 2, completing row 0 -> X wins, no AI move

print()

# -- best-move (negamax) -------------------------------------------------------
# best-move ( board player -- pos )
# In prefix: best-move player board → pushes board, then player
print("best-move (negamax):")
test("only move (1 empty)",
     "best-move 1 {1 2 1 1 2 2 2 1 0}", ["8"])
test("X takes col 0 win (2 empty)",
     "best-move 1 {1 2 1 1 2 2 0 1 0}", ["6"])
test("O wins when possible (4 empty)",
     "best-move 2 {1 1 0 2 2 0 1 0 0}", ["5"])
test("3 empty cells",
     "best-move 1 {1 2 1 0 2 2 0 1 0}", ["3"])

print()

# -- show-board ----------------------------------------------------------------
print("show-board:")
test("empty board display",
     'show-board {0 0 0 0 0 0 0 0 0}',
     ['". | . | .\n---+---+---\n. | . | .\n---+---+---\n. | . | ."'])

test("X at center",
     'show-board {0 0 0 0 1 0 0 0 0}',
     ['". | . | .\n---+---+---\n. | X | .\n---+---+---\n. | . | ."'])

print()

# -- Integration: Multi-move game -----------------------------------------------
print("Integration:")

def play_game(moves, expected_final_status):
    """Play a sequence of moves and check final status."""
    global PASS, FAIL
    machine = load_ttt()
    name = f"game: moves={moves} -> {expected_final_status}"
    try:
        machine.eval_line("init")
        board = machine.stack[-1]

        for pos in moves:
            machine.stack.clear()
            machine.push(board)
            machine.push(pos)
            machine._eval_word('play')
            status = machine.pop()
            board = machine.pop()
            status_str = format_value(status)
            if pos != moves[-1]:
                if status_str != "'playing":
                    FAIL += 1
                    msg = f"  FAIL  {name}: mid-game status {status_str} at move {pos}"
                    print(msg)
                    ERRORS.append(msg)
                    return

        final_status = format_value(status)
        expected = f"'{expected_final_status}"
        if final_status == expected:
            PASS += 1
            print(f"  PASS  {name}")
        else:
            FAIL += 1
            msg = f"  FAIL  {name}: expected {expected}, got {final_status}"
            print(msg)
            ERRORS.append(msg)
    except BriefError as e:
        FAIL += 1
        msg = f"  FAIL  {name}: BriefError: {e}"
        print(msg)
        ERRORS.append(msg)
    except Exception as e:
        FAIL += 1
        msg = f"  FAIL  {name}: {type(e).__name__}: {e}"
        print(msg)
        ERRORS.append(msg)


# Near-endgame draw: start from {1 1 2 2 2 1 1 2 0}, human plays at 8 -> draw
# Board already has 8 cells filled, so AI never triggers (game ends on human move)
def test_late_game_draw():
    """Human completes the last cell, resulting in a draw."""
    global PASS, FAIL
    machine = load_ttt()
    # Board with 1 empty cell at position 8, no winner
    machine.push([1, 1, 2, 2, 2, 1, 1, 2, 0])
    machine.push(8)
    machine._eval_word('play')
    status = format_value(machine.pop())
    if status != "'draw":
        FAIL += 1
        msg = f"  FAIL  late-game draw: expected 'draw, got {status}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print("  PASS  late-game draw")

test_late_game_draw()

# Near-endgame where AI wins: 3 empty cells, human plays badly
# Board: {2 1 1 2 1 0 0 0 2} — 3 empty at 5,6,7
# Human plays X at 7, board becomes {2 1 1 2 1 0 0 1 2}
# AI (O) plays at 6: {2 1 1 2 1 0 2 1 2} — O wins col 2 (2,5,8)? No.
# Let me pick a better board.
# Board: {1 2 0 1 2 0 0 0 0} — too many empty
# Board: {2 1 1 2 1 0 0 2 0} — 3 empty at 5,6,8
# Human plays at 5: {2 1 1 2 1 1 0 2 0} — 2 empty at 6,8
# AI plays at 6: {2 1 1 2 1 1 2 2 0} — col 0: 2,2,2 = O wins!
def test_late_game_ai_wins():
    """AI wins from a near-endgame position."""
    global PASS, FAIL
    machine = load_ttt()
    machine.push([2, 1, 1, 2, 1, 0, 0, 2, 0])
    machine.push(5)
    machine._eval_word('play')
    status = format_value(machine.pop())
    if status != "'o-wins":
        FAIL += 1
        msg = f"  FAIL  late-game AI wins: expected 'o-wins, got {status}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print("  PASS  late-game AI wins")

test_late_game_ai_wins()

# Test that AI doesn't lose from a near-endgame position
def test_ai_defends():
    """AI blocks human's winning threat."""
    global PASS, FAIL
    # Board: {1 1 0 2 2 0 0 1 0} — 4 empty at 2,5,6,8
    # Human plays X at 5: {1 1 0 2 2 1 0 1 0} — 3 empty
    # AI should block to prevent X win
    machine = load_ttt()
    machine.push([1, 1, 0, 2, 2, 0, 0, 1, 0])
    machine.push(5)
    machine._eval_word('play')
    status = format_value(machine.pop())
    board = machine.pop()
    if status == "'x-wins":
        FAIL += 1
        msg = f"  FAIL  AI defends: AI let X win! board={format_value(board)}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print(f"  PASS  AI defends (status={status})")

test_ai_defends()

print()

# -- print-board (display via emissions) ----------------------------------------
print("print-board:")

def test_print_board():
    """print-board should preserve the board on stack and emit the board display."""
    global PASS, FAIL
    machine = load_ttt()
    # Set up a board with some moves
    machine.eval_line("put 2 4 put 1 0 empty-board")
    board_before = list(machine.stack[-1])
    machine.eval_line("print-board")
    board_after = list(machine.stack[-1])
    # Board should be preserved on stack
    if board_before != board_after:
        FAIL += 1
        msg = f"  FAIL  print-board preserves board: expected {board_before}, got {board_after}"
        print(msg)
        ERRORS.append(msg)
        return
    # Should have emitted a 'value' with the board display
    value_emissions = [(t, c) for t, c in machine.output if t == 'value']
    if len(value_emissions) != 1:
        FAIL += 1
        msg = f"  FAIL  print-board emits value: expected 1 emission, got {len(value_emissions)}"
        print(msg)
        ERRORS.append(msg)
        return
    content = value_emissions[0][1]
    if 'X' not in content or 'O' not in content:
        FAIL += 1
        msg = f"  FAIL  print-board content: expected X and O in display, got {content!r}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print("  PASS  print-board preserves board and emits display")

test_print_board()

def test_print_board_empty():
    """print-board on empty board shows dots."""
    global PASS, FAIL
    machine = load_ttt()
    machine.eval_line("print-board empty-board")
    value_emissions = [(t, c) for t, c in machine.output if t == 'value']
    if len(value_emissions) != 1:
        FAIL += 1
        msg = f"  FAIL  print-board empty: expected 1 emission, got {len(value_emissions)}"
        print(msg)
        ERRORS.append(msg)
        return
    content = value_emissions[0][1]
    if content.count('.') != 9:
        FAIL += 1
        msg = f"  FAIL  print-board empty: expected 9 dots, got {content.count('.')} in {content!r}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print("  PASS  print-board empty board shows 9 dots")

test_print_board_empty()

print()

# -- new-game -------------------------------------------------------------------
print("new-game:")

def test_new_game():
    """new-game returns empty board and emits the board display."""
    global PASS, FAIL
    machine = load_ttt()
    machine.eval_line("new-game")
    board = machine.stack[-1]
    if board != [0]*9:
        FAIL += 1
        msg = f"  FAIL  new-game board: expected empty board, got {board}"
        print(msg)
        ERRORS.append(msg)
        return
    value_emissions = [(t, c) for t, c in machine.output if t == 'value']
    if len(value_emissions) != 1:
        FAIL += 1
        msg = f"  FAIL  new-game emissions: expected 1 value emission, got {len(value_emissions)}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print("  PASS  new-game returns board and emits display")

test_new_game()

print()

# -- move -----------------------------------------------------------------------
print("move:")

def test_move_valid():
    """move displays the board and emits status after a valid play."""
    global PASS, FAIL
    machine = load_ttt()
    # Use a near-endgame board (3 empty) so AI is fast
    machine.push([1, 2, 1, 2, 1, 2, 0, 1, 0])
    machine.push(6)  # Human plays X at 6, AI responds at 8
    machine._eval_word('move')
    board = machine.stack[-1]
    if board[6] != 1:
        FAIL += 1
        msg = f"  FAIL  move valid: expected X at pos 6"
        print(msg)
        ERRORS.append(msg)
        return
    # Should have emitted board display + status
    value_emissions = [(t, c) for t, c in machine.output if t == 'value']
    if len(value_emissions) < 2:
        FAIL += 1
        msg = f"  FAIL  move valid: expected at least 2 value emissions (board + status), got {len(value_emissions)}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print("  PASS  move valid play emits board and status")

test_move_valid()

def test_move_invalid():
    """move on occupied cell emits 'invalid status and board."""
    global PASS, FAIL
    machine = load_ttt()
    # Use a pre-filled board and try to move at an occupied cell
    board = [1, 2, 1, 2, 1, 2, 0, 1, 0]
    machine.push(board[:])
    machine.push(0)  # pos 0 is occupied by X
    machine._eval_word('move')
    board_after = machine.stack[-1]
    # Should emit board display and 'invalid status
    value_emissions = [(t, c) for t, c in machine.output if t == 'value']
    has_invalid = any("'invalid" in c for _, c in value_emissions)
    if not has_invalid:
        FAIL += 1
        msg = f"  FAIL  move invalid: expected 'invalid in emissions, got {[c for _, c in value_emissions]}"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print("  PASS  move invalid emits 'invalid status and board")

test_move_invalid()

def test_move_game_sequence():
    """Play a late-game sequence with move and verify emissions."""
    global PASS, FAIL
    machine = load_ttt()
    # Start from a near-endgame board with 3 empty cells
    board = [1, 2, 1, 2, 1, 2, 0, 1, 0]
    moves_played = 0
    all_emitted = True
    for pos in [6, 8]:  # Two human moves to finish the game
        if board[pos] != 0:
            continue
        machine.output = []
        machine.stack.clear()
        machine.push(board[:])
        machine.push(pos)
        machine._eval_word('move')
        board = list(machine.stack[-1])
        moves_played += 1
        value_emissions = [(t, c) for t, c in machine.output if t == 'value']
        if len(value_emissions) < 2:
            all_emitted = False
        status_vals = [c for _, c in value_emissions]
        if any(s in ("'x-wins", "'o-wins", "'draw") for s in status_vals):
            break
    if moves_played < 1:
        FAIL += 1
        msg = f"  FAIL  move sequence: expected at least 1 move, got {moves_played}"
        print(msg)
        ERRORS.append(msg)
        return
    if not all_emitted:
        FAIL += 1
        msg = f"  FAIL  move sequence: not every move emitted board + status"
        print(msg)
        ERRORS.append(msg)
        return
    PASS += 1
    print(f"  PASS  move sequence emits board + status ({moves_played} moves)")

test_move_game_sequence()

print()

# -- Summary -------------------------------------------------------------------
total = PASS + FAIL
print(f"{'='*50}")
print(f"Results: {PASS}/{total} passed, {FAIL} failed")
if ERRORS:
    print(f"\nFailures:")
    for e in ERRORS:
        print(e)
print()
sys.exit(0 if FAIL == 0 else 1)
