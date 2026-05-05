#!/usr/bin/env python3
"""Test negamax AI behavior."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from brief import Machine, format_value, parse_program

def load_ttt():
    m = Machine()
    with open(os.path.join(os.path.dirname(__file__), 'tictactoe.brief'), 'r', encoding='utf-8') as f:
        defs, _ = parse_program(f.read())
    m.dictionary.update(defs)
    return m

def play_move(machine, board, pos):
    """Play a move and return (board', status_str)."""
    machine.stack.clear()
    machine.push(board)
    machine.push(pos)
    machine._eval_word('play')
    status = machine.pop()
    board = machine.pop()
    return board, format_value(status)

# Test 1: AI blocks X winning threat
m = load_ttt()
board = [1, 1, 0, 0, 0, 0, 0, 0, 0]  # X has 0,1 - needs to block at 2
m.eval_line('ai-move {1 1 0 0 0 0 0 0 0}')
result = m.stack[-1]
assert result[2] == 2, f"AI should block at 2, got {result}"
print("PASS: AI blocks X winning row")

# Test 2: AI wins when it can
m2 = load_ttt()
m2.eval_line('ai-move {1 1 0 2 2 0 1 0 0}')
result2 = m2.stack[-1]
assert result2[5] == 2, f"AI should win at 5, got {result2}"
print("PASS: AI wins when possible")

# Test 3: Full game - AI should never lose
# Try all possible human first moves, play greedily as X, AI should draw or win
def play_full_game(x_strategy):
    """Play a game with given X strategy function. Returns final status."""
    m = load_ttt()
    m.eval_line('init')
    board = m.stack[-1]
    move_count = 0
    for pos in x_strategy:
        if board[pos] != 0:
            continue  # skip occupied cells
        board, status = play_move(m, board, pos)
        move_count += 1
        if status != "'playing":
            return status, move_count
    return "'draw", move_count

# Try X taking center then all corners then sides
status, n = play_full_game([4, 0, 2, 6, 8, 1, 3, 5, 7])
print(f"Game center+corners: {status} in {n} moves")
assert status != "'x-wins", "AI should never lose!"

status, n = play_full_game([0, 1, 2, 3, 4, 5, 6, 7, 8])
print(f"Game sequential: {status} in {n} moves")
assert status != "'x-wins", "AI should never lose!"

# Test 4: best-move directly
m3 = Machine()
# Empty board - AI should pick corner (0) or center (4)
m3.push([0]*9)
m3.push(2)
m3._best_move()
pos = m3.stack[-1]
print(f"best-move empty board: pos {pos}")
assert pos in [0, 2, 4, 6, 8], f"Should pick corner or center, got {pos}"

# Test 5: AI blocks fork - X at 0 and 8, AI must play edge not corner
m4 = Machine()
board = [1, 0, 0, 0, 2, 0, 0, 0, 1]  # X corners, O center
m4.push(list(board))
m4.push(2)
m4._best_move()
pos = m4.stack[-1]
print(f"best-move fork defense: pos {pos}")
assert pos in [1, 3, 5, 7], f"Should play edge to avoid fork, got {pos}"

print("\nAll AI tests passed!")
