#!/usr/bin/env python3
"""Test the Agent framework."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from brief import Agent, render_emissions

print("=== Agent Framework Tests ===\n")

# Test 1: Simple expression → result emission
agent = Agent()
em = agent.process('+ 3 4')
assert em == [('result', '7')], f"Expected result emission, got {em}"
assert agent.stack == [7]
print("PASS: expression → result emission")

# Test 2: Definition → defined emission
agent.stack.clear()
em = agent.process('square * dup')
assert em == [('defined', ['square'])], f"Expected defined emission, got {em}"
print("PASS: definition → defined emission")

# Test 3: Use defined word (state threading)
em = agent.process('square 5')
assert em == [('result', '25')], f"Expected 25, got {em}"
print("PASS: state threading — defined word available in next message")

# Test 4: .s → stack emission (pure, no print!)
agent.stack.clear()
agent.stack.append(42)
em = agent.process('.s')
tags = [t for t, c in em]
assert 'stack' in tags, f"Expected stack emission, got {em}"
# .s is non-destructive, so stack should still have 42 + result emission
print("PASS: .s → stack emission (pure)")

# Test 5: . → value emission (pure, no print!)
agent2 = Agent()
em = agent2.process('. + 3 4')
assert ('value', '7') in em, f"Expected value emission, got {em}"
print("PASS: . → value emission (pure)")

# Test 6: Error → error emission (no exception raised)
agent_err = Agent()
em = agent_err.process('/ 0 1')  # 1 / 0 = division by zero
tags = [t for t, c in em]
assert 'error' in tags, f"Expected error emission, got {em}"
print("PASS: error → error emission")

# Test 7: Snapshot and restore
agent3 = Agent()
agent3.process('triple * 3')
agent3.process('triple 7')
snap = agent3.snapshot()
assert snap['stack'] == [21]
assert 'triple' in snap['dictionary']
print("PASS: snapshot exports stack + dictionary")

agent4 = Agent(state=snap)
em = agent4.process('inc')
assert agent4.stack == [22]  # 21 carried over, incremented
print("PASS: restored agent inherits state")

# Test 8: process_program with multi-line source
agent5 = Agent()
source = """
sq * dup
cube * sq dup
"""
em = agent5.process_program(source)
tags = [t for t, c in em]
assert 'defined' in tags
em2 = agent5.process('cube 3')
assert em2 == [('result', '27')], f"Expected 27, got {em2}"
print("PASS: process_program handles multi-line definitions")

# Test 9: render_emissions (the render agent)
import io
old_stdout = sys.stdout
sys.stdout = buf = io.StringIO()
render_emissions([
    ('result', '42'),
    ('defined', ['sq', 'cube']),
    ('error', 'Stack underflow'),
    ('value', 'hello'),
    ('stack', '[1 2 3]'),
])
sys.stdout = old_stdout
output = buf.getvalue()
assert '  42' in output
assert '  defined: sq cube' in output
assert '  Error: Stack underflow' in output
assert 'hello' in output
assert 'Stack: [1 2 3]' in output
print("PASS: render_emissions formats all emission types")

# Test 10: Multiple messages, state accumulates
agent6 = Agent()
agent6.process('1')  # push 1
agent6.process('2')  # push 2
agent6.process('3')  # push 3
em = agent6.process('+')  # 2+3=5
assert agent6.stack == [1, 5], f"Expected [1, 5], got {agent6.stack}"
print("PASS: stack accumulates across messages")

# Test 11: Agent with load (file operations)
agent7 = Agent()
em = agent7.process('load "tictactoe.brief"')
# Should have defined TTT words
assert 'won?' in agent7.dictionary
assert 'play' in agent7.dictionary
em2 = agent7.process('init')
assert agent7.stack[-1] == [0]*9
print("PASS: Agent supports load for file definitions")

print(f"\n{'='*40}")
print("All agent tests passed!")
