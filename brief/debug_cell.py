#!/usr/bin/env python3
"""Debug display functions."""
from brief import Machine, format_value, parse_program, format_tokens

TTT_DEFS = r'''
cell if [if ["." drop] ["O" drop] = 2 dup] ["X" drop] = 1 dup nth swap over

row0 concat concat concat concat cell 2 " | " cell 1 " | " cell 0
row1 concat concat concat concat cell 5 " | " cell 4 " | " cell 3
row2 concat concat concat concat cell 8 " | " cell 7 " | " cell 6

show nip concat concat concat concat row2 "\n---+---+---\n" row1 "\n---+---+---\n" row0
'''

# Check row0 postfix
defs, _ = parse_program(TTT_DEFS)
print('row0 postfix:', format_tokens(defs['row0']))
print('show postfix:', format_tokens(defs['show']))

# Test row0
m = Machine()
m.trace = True
try:
    result = m.run_program(f'main row0 {{1 0 2 0 0 0 0 0 0}}\n{TTT_DEFS}')
    print('row0 result:', [format_value(v) for v in result])
except Exception as e:
    print(f'Error: {e}')
