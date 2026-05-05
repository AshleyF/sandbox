#!/usr/bin/env python3
"""
Brief Language Interpreter

A complete interpreter for the Brief programming language.
Includes: tokenizer, parser (Brief prefix → machine postfix), and evaluator.

Usage:
    python brief.py <file.brief>       # Run a file
    python brief.py                    # Start REPL
    python brief.py -e "expression"    # Evaluate expression
    python brief.py -t <file.brief>    # Trace execution (debug)
"""

import sys
import re
import os

# ─── Token Types ──────────────────────────────────────────────────────

class Token:
    """A typed token in the Brief machine."""
    __slots__ = ('kind', 'value')

    def __init__(self, kind, value):
        self.kind = kind    # 'int', 'float', 'str', 'sym', 'bool', 'word', 'quot', 'list'
        self.value = value

    def __repr__(self):
        if self.kind == 'quot':
            return f'[{format_tokens(self.value)}]'
        elif self.kind == 'list':
            return '{' + ' '.join(format_value(v) for v in self.value) + '}'
        elif self.kind == 'str':
            return f'"{self.value}"'
        elif self.kind == 'sym':
            return f"'{self.value}"
        elif self.kind == 'bool':
            return 'true' if self.value else 'false'
        else:
            return str(self.value)


def format_value(v):
    """Format a stack value for display."""
    if isinstance(v, dict) and '__rec__' in v:
        # Record type
        fields = {k: v2 for k, v2 in v.items() if k != '__rec__'}
        if not fields:
            return 'rec{}'
        pairs = ' '.join(f"'{k} {format_value(v2)}" for k, v2 in fields.items())
        return 'rec{' + pairs + '}'
    elif isinstance(v, tuple) and len(v) == 2 and v[0] == 'sym':
        return f"'{v[1]}"
    elif isinstance(v, tuple) and len(v) == 2 and v[0] == 'quot':
        return '[...]'
    elif isinstance(v, list):
        return '{' + ' '.join(format_value(x) for x in v) + '}'
    elif isinstance(v, Token):
        return repr(v)
    elif isinstance(v, str):
        return f'"{v}"'
    elif isinstance(v, bool):
        return 'true' if v else 'false'
    elif isinstance(v, int):
        return str(v)
    elif isinstance(v, float):
        return str(v)
    else:
        return str(v)


def format_tokens(tokens):
    """Format a list of tokens for display."""
    return ' '.join(repr(t) for t in tokens)


# ─── Tokenizer ────────────────────────────────────────────────────────

def tokenize(text):
    """
    Tokenize a Brief source line (or expression) into a list of Tokens.
    Handles: integers, floats, strings, symbols, booleans, words,
             quotations [...], and lists {...}.
    """
    tokens = []
    i = 0
    while i < len(text):
        c = text[i]

        # Whitespace
        if c in ' \t\r\n':
            i += 1
            continue

        # Line comment: \ to end of line
        if c == '\\':
            break

        # Inline comment: ( ... )
        if c == '(':
            depth = 1
            i += 1
            while i < len(text) and depth > 0:
                if text[i] == '(':
                    depth += 1
                elif text[i] == ')':
                    depth -= 1
                i += 1
            continue

        # String literal: "..."
        if c == '"':
            i += 1
            s = []
            while i < len(text) and text[i] != '"':
                if text[i] == '\\' and i + 1 < len(text):
                    nc = text[i + 1]
                    if nc == 'n':
                        s.append('\n')
                    elif nc == 't':
                        s.append('\t')
                    elif nc == '"':
                        s.append('"')
                    elif nc == '\\':
                        s.append('\\')
                    else:
                        s.append(nc)
                    i += 2
                else:
                    s.append(text[i])
                    i += 1
            if i < len(text):
                i += 1  # skip closing "
            tokens.append(Token('str', ''.join(s)))
            continue

        # Quotation: [...]
        if c == '[':
            depth = 1
            i += 1
            start = i
            while i < len(text) and depth > 0:
                if text[i] == '[':
                    depth += 1
                elif text[i] == ']':
                    depth -= 1
                elif text[i] == '"':
                    # Skip over string literals inside quotation
                    i += 1
                    while i < len(text) and text[i] != '"':
                        if text[i] == '\\' and i + 1 < len(text):
                            i += 1
                        i += 1
                i += 1
            inner = text[start:i - 1]
            tokens.append(Token('quot', tokenize(inner)))
            continue

        # List literal: {...}
        if c == '{':
            depth = 1
            i += 1
            start = i
            while i < len(text) and depth > 0:
                if text[i] == '{':
                    depth += 1
                elif text[i] == '}':
                    depth -= 1
                elif text[i] == '"':
                    i += 1
                    while i < len(text) and text[i] != '"':
                        if text[i] == '\\' and i + 1 < len(text):
                            i += 1
                        i += 1
                i += 1
            inner = text[start:i - 1]
            inner_tokens = tokenize(inner)
            # Evaluate inner tokens to build the list
            # For list literals, elements can be sub-lists or simple values
            list_val = tokens_to_list_values(inner_tokens)
            tokens.append(Token('list', list_val))
            continue

        # Symbol: 'name
        if c == "'":
            i += 1
            start = i
            while i < len(text) and text[i] not in ' \t\r\n[]{}()"':
                i += 1
            tokens.append(Token('sym', text[start:i]))
            continue

        # Line continuation: ..
        if c == '.' and i + 1 < len(text) and text[i + 1] == '.':
            # Don't emit a token; this is handled by the parser at line level
            i += 2
            continue

        # Number or negative number or word starting with -
        if c.isdigit() or (c == '-' and i + 1 < len(text) and text[i + 1].isdigit()):
            start = i
            if c == '-':
                i += 1
            while i < len(text) and text[i].isdigit():
                i += 1
            if i < len(text) and text[i] == '.' and i + 1 < len(text) and text[i + 1].isdigit():
                i += 1
                while i < len(text) and text[i].isdigit():
                    i += 1
                tokens.append(Token('float', float(text[start:i])))
            else:
                tokens.append(Token('int', int(text[start:i])))
            continue

        # Word (anything else)
        start = i
        while i < len(text) and text[i] not in ' \t\r\n[]{}()"':
            i += 1
        word = text[start:i]

        # Check for booleans
        if word == 'true':
            tokens.append(Token('bool', True))
        elif word == 'false':
            tokens.append(Token('bool', False))
        else:
            tokens.append(Token('word', word))
        continue

    return tokens


def tokens_to_list_values(tokens):
    """Convert a list of tokens into Python values for a list literal."""
    values = []
    for t in tokens:
        if t.kind == 'int':
            values.append(t.value)
        elif t.kind == 'float':
            values.append(t.value)
        elif t.kind == 'str':
            values.append(t.value)
        elif t.kind == 'sym':
            values.append(('sym', t.value))
        elif t.kind == 'bool':
            values.append(t.value)
        elif t.kind == 'list':
            values.append(t.value)
        elif t.kind == 'quot':
            values.append(('quot', t.value))
        else:
            # Word inside a list literal — treat as value
            values.append(t.value)
    return values


# ─── Parser ───────────────────────────────────────────────────────────

def parse_program(source):
    """
    Parse a Brief program (multiple lines) into a dictionary of definitions
    and identify the entry point.

    Returns: (definitions_dict, entry_point_name)

    Brief rules:
    - Every line is a definition: first word = name, rest = body
    - Indented lines beneath = scoped sub-definitions
    - Line continuation: .. at end
    - Evaluation: right-to-left within a line → compiler reverses to postfix
    - First (topmost) non-indented definition = entry point
    """
    lines = source.split('\n')
    definitions = {}

    # Build a tree of definitions respecting indentation
    parsed_defs = parse_definitions(lines, 0, 0)

    # Flatten: process sub-definitions first, adding them to the parent's scope
    entry_point = None
    for defn in parsed_defs:
        compile_definition(defn, definitions)
        if entry_point is None:
            entry_point = defn['name']

    return definitions, entry_point


def get_indent(line):
    """Return the number of leading spaces in a line."""
    return len(line) - len(line.lstrip())


def parse_definitions(lines, start, base_indent):
    """
    Parse lines starting at `start` with the given base indentation level.
    Returns a list of definition dicts: {name, body_text, children}
    """
    defs = []
    i = start
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip blank lines and comment-only lines
        if not stripped or stripped.startswith('\\'):
            i += 1
            continue

        indent = get_indent(line)

        # If this line is less indented than our base, we're done at this level
        if indent < base_indent:
            break

        if indent > base_indent:
            # This shouldn't happen at the top level call; skip
            i += 1
            continue

        # This line is at our base indent level — it's a new definition
        # Handle line continuation (..)
        body_text = stripped
        while body_text.endswith('..'):
            body_text = body_text[:-2].rstrip()
            i += 1
            while i < len(lines):
                next_line = lines[i].strip()
                if not next_line or next_line.startswith('\\'):
                    i += 1
                    continue
                body_text += ' ' + next_line
                if not next_line.endswith('..'):
                    break
                body_text = body_text[:-2].rstrip()
                i += 1
            break

        i += 1

        # Parse the name and body from body_text
        tokens = body_text.split(None, 1)
        if not tokens:
            continue
        name = tokens[0]
        body = tokens[1] if len(tokens) > 1 else ''

        # Collect children (indented lines below this definition)
        children = []
        if i < len(lines):
            # Check if next non-blank line is indented more
            j = i
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and get_indent(lines[j]) > indent:
                child_indent = get_indent(lines[j])
                children = parse_definitions(lines, j, child_indent)
                # Advance i past the children
                while i < len(lines):
                    stripped_i = lines[i].strip()
                    if stripped_i and get_indent(lines[i]) <= indent:
                        break
                    i += 1

        defs.append({
            'name': name,
            'body': body,
            'children': children,
        })

    return defs


def compile_definition(defn, definitions):
    """
    Compile a definition (and its children) into machine postfix format,
    adding all definitions to the dictionary.

    Children are compiled first (they're scoped sub-definitions).
    The parent body is reversed from prefix (R→L) to postfix (L→R).
    """
    # First, compile all children (sub-definitions)
    child_dict = {}
    for child in defn['children']:
        compile_definition(child, definitions)
        compile_definition(child, child_dict)

    # Tokenize the body (in Brief prefix notation)
    body_tokens = tokenize(defn['body'])

    # Reverse quotations recursively (they're also in prefix)
    body_tokens = [reverse_token(t) for t in body_tokens]

    # Reverse the body to get postfix (machine format)
    body_tokens = list(reversed(body_tokens))

    # Store in dictionary
    definitions[defn['name']] = body_tokens


def reverse_token(token):
    """Recursively reverse quotation contents from prefix to postfix."""
    if token.kind == 'quot':
        inner = [reverse_token(t) for t in token.value]
        return Token('quot', list(reversed(inner)))
    return token


# ─── Machine (Evaluator) ─────────────────────────────────────────────

# Boolean representation: true = -1, false = 0 (as per spec)
TRUE = -1
FALSE = 0


def to_brief_bool(b):
    """Convert Python bool to Brief bool."""
    return TRUE if b else FALSE


def is_truthy(v):
    """Check if a Brief value is truthy (non-zero)."""
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return v != 0
    if isinstance(v, float):
        return v != 0.0
    return True  # strings, lists, quotations are truthy


class BriefError(Exception):
    """Runtime error in the Brief machine."""
    pass


class Machine:
    """
    The Brief Machine: a stack-based evaluator.

    State: stack + dictionary.
    Pure function: (state, message) → state'
    """

    def __init__(self):
        self.stack = []
        self.dictionary = {}
        self.output = []       # emission buffer — pure output accumulator
        self.trace = False
        self.call_depth = 0
        self.max_depth = 10000
        self._load_builtins()
        self._load_prelude()

    def emit(self, tag, content):
        """Append an emission to the output buffer.
        Emissions are (tag, content) tuples describing observable effects.
        Tags: 'value', 'stack', 'error', 'defined', 'result', 'trace'."""
        self.output.append((tag, content))

    def _load_builtins(self):
        """Register all built-in primitive words."""
        self.builtins = {
            # Stack operations
            'dup':    self._dup,
            'drop':   self._drop,
            'swap':   self._swap,
            'over':   self._over,
            'rot':    self._rot,

            # Arithmetic
            '+':      self._add,
            '-':      self._sub,
            '*':      self._mul,
            '/':      self._div,
            'mod':    self._mod,

            # Comparison
            '=':      self._eq,
            '<':      self._lt,
            '>':      self._gt,
            '<=':     self._le,
            '>=':     self._ge,

            # Logic
            'and':    self._and,
            'or':     self._or,
            'not':    self._not,

            # Combinators
            'apply':  self._apply,
            'dip':    self._dip,
            'keep':   self._keep,
            'if':     self._if,
            'when':   self._when,
            'unless': self._unless,
            'map':    self._map,
            'fold':   self._fold,
            'filter': self._filter,
            'compose':self._compose,
            'each':   self._each,
            'any':    self._any,

            # List operations
            'first':  self._first,
            'rest':   self._rest,
            'nth':    self._nth,
            'append': self._append,
            'put':    self._put,
            'concat': self._concat,
            'length': self._length,
            'range':  self._range,

            # Record operations
            'rec':    self._rec,
            'set':    self._set,
            'get':    self._get,
            'getr':   self._getr,
            'has?':   self._has,
            'keys':   self._keys,
            'del':    self._del_field,

            # Additional stack operations
            'pick':   self._pick,
            'nip':    self._nip,
            '2dip':   self._2dip,

            # Additional combinators
            'bi':     self._bi,

            # File operations
            'load':   self._load,

            # Debugging / introspection
            'words':  self._words,
            '.s':     self._dot_s,
            '.':      self._dot,
            'print':  self._print,
        }

    def _load_prelude(self):
        """Load standard secondary definitions (the prelude)."""
        prelude = """
dec - 1
inc + 1
sq * dup
double + dup
negate - swap 0
abs when [negate] < 0 dup
even? = 0 mod 2
odd? not even?
max if [drop swap] [drop] > over over
min if [drop swap] [drop] < over over
2drop drop drop
3drop drop drop drop
2dup over over
empty? = 0 length
"""
        prelude_defs, _ = parse_program(prelude.strip())
        self.dictionary.update(prelude_defs)

    def push(self, value):
        self.stack.append(value)

    def pop(self):
        if not self.stack:
            raise BriefError("Stack underflow")
        return self.stack.pop()

    def peek(self):
        if not self.stack:
            raise BriefError("Stack underflow (peek)")
        return self.stack[-1]

    def _trace_print(self, msg):
        if self.trace:
            indent = '  ' * self.call_depth
            self.emit('trace', f"{indent}{msg}")

    def eval_tokens(self, tokens):
        """Evaluate a list of tokens (in machine postfix order)."""
        for token in tokens:
            self.eval_token(token)

    def eval_token(self, token):
        """Evaluate a single token."""
        if token.kind in ('int', 'float', 'str', 'sym', 'bool'):
            val = token.value
            if token.kind == 'bool':
                val = TRUE if token.value else FALSE
            elif token.kind == 'sym':
                val = ('sym', token.value)
            self.push(val)
            self._trace_print(f"push {format_value(val)}  →  {self._stack_str()}")

        elif token.kind == 'quot':
            self.push(('quot', token.value))
            self._trace_print(f"push [...]  →  {self._stack_str()}")

        elif token.kind == 'list':
            self.push(list(token.value))
            self._trace_print(f"push {{...}}  →  {self._stack_str()}")

        elif token.kind == 'word':
            self._eval_word(token.value)

        else:
            raise BriefError(f"Unknown token kind: {token.kind}")

    def _eval_word(self, word):
        """Look up and execute a word."""
        if word in self.builtins:
            self._trace_print(f"{word}  →  ", )
            self.builtins[word]()
            self._trace_print(f"  {self._stack_str()}")
        elif word in self.dictionary:
            self.call_depth += 1
            if self.call_depth > self.max_depth:
                raise BriefError(f"Maximum call depth exceeded ({self.max_depth}) — possible infinite recursion")
            self._trace_print(f"call {word}")
            self.eval_tokens(self.dictionary[word])
            self.call_depth -= 1
        else:
            raise BriefError(f"Undefined word: '{word}'")

    def _stack_str(self):
        """Format the stack for debug display."""
        items = [format_value(v) for v in self.stack]
        return f"[{' '.join(items)}]"

    def _eval_quotation(self, quot):
        """Execute a quotation (a list of tokens)."""
        if not isinstance(quot, tuple) or quot[0] != 'quot':
            raise BriefError(f"Expected quotation, got {format_value(quot)}")
        self.eval_tokens(quot[1])

    # ─── Stack Primitives ─────────────────────────────────────────────

    def _dup(self):
        a = self.peek()
        self.push(_copy_value(a))

    def _drop(self):
        self.pop()

    def _swap(self):
        b = self.pop()
        a = self.pop()
        self.push(b)
        self.push(a)

    def _over(self):
        b = self.pop()
        a = self.peek()
        self.push(b)
        self.push(_copy_value(a))

    def _rot(self):
        c = self.pop()
        b = self.pop()
        a = self.pop()
        self.push(b)
        self.push(c)
        self.push(a)

    # ─── Arithmetic ───────────────────────────────────────────────────

    def _add(self):
        b = self.pop()
        a = self.pop()
        if isinstance(a, str) and isinstance(b, str):
            self.push(a + b)
        else:
            self.push(a + b)

    def _sub(self):
        b = self.pop()
        a = self.pop()
        self.push(a - b)

    def _mul(self):
        b = self.pop()
        a = self.pop()
        self.push(a * b)

    def _div(self):
        b = self.pop()
        a = self.pop()
        if b == 0:
            raise BriefError("Division by zero")
        if isinstance(a, int) and isinstance(b, int):
            self.push(a // b)
        else:
            self.push(a / b)

    def _mod(self):
        b = self.pop()
        a = self.pop()
        if b == 0:
            raise BriefError("Modulo by zero")
        self.push(a % b)

    # ─── Comparison ───────────────────────────────────────────────────

    def _eq(self):
        b = self.pop()
        a = self.pop()
        self.push(to_brief_bool(a == b))

    def _lt(self):
        b = self.pop()
        a = self.pop()
        self.push(to_brief_bool(a < b))

    def _gt(self):
        b = self.pop()
        a = self.pop()
        self.push(to_brief_bool(a > b))

    def _le(self):
        b = self.pop()
        a = self.pop()
        self.push(to_brief_bool(a <= b))

    def _ge(self):
        b = self.pop()
        a = self.pop()
        self.push(to_brief_bool(a >= b))

    # ─── Logic ────────────────────────────────────────────────────────

    def _and(self):
        b = self.pop()
        a = self.pop()
        if isinstance(a, int) and isinstance(b, int):
            self.push(a & b)
        else:
            self.push(to_brief_bool(is_truthy(a) and is_truthy(b)))

    def _or(self):
        b = self.pop()
        a = self.pop()
        if isinstance(a, int) and isinstance(b, int):
            self.push(a | b)
        else:
            self.push(to_brief_bool(is_truthy(a) or is_truthy(b)))

    def _not(self):
        a = self.pop()
        if isinstance(a, int):
            self.push(~a)
        else:
            self.push(to_brief_bool(not is_truthy(a)))

    # ─── Combinators ──────────────────────────────────────────────────

    def _apply(self):
        quot = self.pop()
        self._eval_quotation(quot)

    def _dip(self):
        quot = self.pop()
        a = self.pop()
        self._eval_quotation(quot)
        self.push(a)

    def _keep(self):
        quot = self.pop()
        a = self.peek()  # keep a copy
        a_copy = _copy_value(a)
        self._eval_quotation(quot)
        self.push(a_copy)

    def _if(self):
        else_quot = self.pop()
        then_quot = self.pop()
        cond = self.pop()
        if is_truthy(cond):
            self._eval_quotation(then_quot)
        else:
            self._eval_quotation(else_quot)

    def _when(self):
        quot = self.pop()
        cond = self.pop()
        if is_truthy(cond):
            self._eval_quotation(quot)

    def _unless(self):
        quot = self.pop()
        cond = self.pop()
        if not is_truthy(cond):
            self._eval_quotation(quot)

    def _map(self):
        quot = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"map expects a list, got {format_value(lst)}")
        result = []
        for item in lst:
            self.push(item)
            self._eval_quotation(quot)
            result.append(self.pop())
        self.push(result)

    def _fold(self):
        quot = self.pop()
        acc = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"fold expects a list, got {format_value(lst)}")
        for item in lst:
            self.push(acc)
            self.push(item)
            self._eval_quotation(quot)
            acc = self.pop()
        self.push(acc)

    def _filter(self):
        quot = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"filter expects a list, got {format_value(lst)}")
        result = []
        for item in lst:
            self.push(item)
            self._eval_quotation(quot)
            cond = self.pop()
            if is_truthy(cond):
                result.append(item)
        self.push(result)

    def _compose(self):
        quot2 = self.pop()
        quot1 = self.pop()
        if not (isinstance(quot1, tuple) and quot1[0] == 'quot'):
            raise BriefError(f"compose expects quotation, got {format_value(quot1)}")
        if not (isinstance(quot2, tuple) and quot2[0] == 'quot'):
            raise BriefError(f"compose expects quotation, got {format_value(quot2)}")
        self.push(('quot', quot1[1] + quot2[1]))

    def _each(self):
        quot = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"each expects a list, got {format_value(lst)}")
        for item in lst:
            self.push(item)
            self._eval_quotation(quot)

    def _any(self):
        quot = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"any expects a list, got {format_value(lst)}")
        for item in lst:
            self.push(item)
            self._eval_quotation(quot)
            cond = self.pop()
            if is_truthy(cond):
                self.push(TRUE)
                return
        self.push(FALSE)

    # ─── List Operations ──────────────────────────────────────────────

    def _first(self):
        lst = self.pop()
        if not isinstance(lst, list) or len(lst) == 0:
            raise BriefError(f"first: empty list or not a list: {format_value(lst)}")
        self.push(lst[0])

    def _rest(self):
        lst = self.pop()
        if not isinstance(lst, list) or len(lst) == 0:
            raise BriefError(f"rest: empty list or not a list: {format_value(lst)}")
        self.push(list(lst[1:]))

    def _nth(self):
        n = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"nth: not a list: {format_value(lst)}")
        if not isinstance(n, int) or n < 0 or n >= len(lst):
            raise BriefError(f"nth: index {n} out of range for list of length {len(lst)}")
        self.push(lst[n])

    def _append(self):
        a = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"append: not a list: {format_value(lst)}")
        self.push(lst + [a])

    def _put(self):
        a = self.pop()
        n = self.pop()
        lst = self.pop()
        if not isinstance(lst, list):
            raise BriefError(f"put: not a list: {format_value(lst)}")
        if not isinstance(n, int) or n < 0 or n >= len(lst):
            raise BriefError(f"put: index {n} out of range for list of length {len(lst)}")
        new_lst = list(lst)
        new_lst[n] = a
        self.push(new_lst)

    def _concat(self):
        b = self.pop()
        a = self.pop()
        if isinstance(a, str) and isinstance(b, str):
            self.push(a + b)
        elif isinstance(a, list) and isinstance(b, list):
            self.push(a + b)
        else:
            # String + non-string coercion
            self.push(str(a) + str(b))

    def _length(self):
        lst = self.pop()
        if isinstance(lst, list):
            self.push(len(lst))
        elif isinstance(lst, str):
            self.push(len(lst))
        else:
            raise BriefError(f"length: not a list or string: {format_value(lst)}")

    def _range(self):
        b = self.pop()
        a = self.pop()
        if not isinstance(a, int) or not isinstance(b, int):
            raise BriefError(f"range: requires integers, got {format_value(a)} and {format_value(b)}")
        if a <= b:
            self.push(list(range(a, b + 1)))
        else:
            self.push(list(range(a, b - 1, -1)))

    # ─── Record Operations ─────────────────────────────────────────────

    def _rec(self):
        """Push an empty record onto the stack."""
        self.push({'__rec__': True})

    def _set(self):
        """( rec key val -- rec' ) Set a field in a record.
        In Brief prefix: set 'key val rec
        R→L: rec pushed, val pushed, 'key pushed → stack (rec val key)
        Pops: key (top), val (second), rec (third).
        """
        key = self.pop()
        val = self.pop()
        rec = self.pop()
        if not isinstance(rec, dict) or '__rec__' not in rec:
            raise BriefError(f"set: not a record: {format_value(rec)}")
        key_name = key[1] if isinstance(key, tuple) and key[0] == 'sym' else key
        new_rec = dict(rec)
        new_rec[key_name] = val
        self.push(new_rec)

    def _get(self):
        """( rec key -- val ) Get a field from a record (consumes the record)."""
        key = self.pop()
        rec = self.pop()
        if not isinstance(rec, dict) or '__rec__' not in rec:
            raise BriefError(f"get: not a record: {format_value(rec)}")
        key_name = key[1] if isinstance(key, tuple) and key[0] == 'sym' else key
        if key_name not in rec:
            raise BriefError(f"get: field '{key_name}' not found in record")
        self.push(rec[key_name])

    def _getr(self):
        """( rec key -- rec val ) Get a field, keeping the record on the stack."""
        key = self.pop()
        rec = self.peek()
        if not isinstance(rec, dict) or '__rec__' not in rec:
            raise BriefError(f"getr: not a record: {format_value(rec)}")
        key_name = key[1] if isinstance(key, tuple) and key[0] == 'sym' else key
        if key_name not in rec:
            raise BriefError(f"getr: field '{key_name}' not found in record")
        self.push(rec[key_name])

    def _has(self):
        """( rec key -- rec bool ) Check if a field exists, keeping the record."""
        key = self.pop()
        rec = self.peek()
        if not isinstance(rec, dict) or '__rec__' not in rec:
            raise BriefError(f"has?: not a record: {format_value(rec)}")
        key_name = key[1] if isinstance(key, tuple) and key[0] == 'sym' else key
        self.push(to_brief_bool(key_name in rec))

    def _keys(self):
        """( rec -- rec list ) List all field names, keeping the record."""
        rec = self.peek()
        if not isinstance(rec, dict) or '__rec__' not in rec:
            raise BriefError(f"keys: not a record: {format_value(rec)}")
        field_names = [('sym', k) for k in rec if k != '__rec__']
        self.push(field_names)

    def _del_field(self):
        """( rec key -- rec' ) Remove a field from a record."""
        key = self.pop()
        rec = self.pop()
        if not isinstance(rec, dict) or '__rec__' not in rec:
            raise BriefError(f"del: not a record: {format_value(rec)}")
        key_name = key[1] if isinstance(key, tuple) and key[0] == 'sym' else key
        new_rec = {k: v for k, v in rec.items() if k != key_name}
        self.push(new_rec)

    # ─── Additional Stack Operations ──────────────────────────────────

    def _pick(self):
        """( n -- val ) Copy the nth item from the stack (0=top, 1=second, etc)."""
        n = self.pop()
        if not isinstance(n, int) or n < 0:
            raise BriefError(f"pick: invalid index: {n}")
        if n >= len(self.stack):
            raise BriefError(f"pick: index {n} too deep for stack of depth {len(self.stack)}")
        val = self.stack[-(n + 1)]
        self.push(_copy_value(val))

    def _nip(self):
        """( a b -- b ) Drop second element (swap drop)."""
        b = self.pop()
        self.pop()
        self.push(b)

    def _2dip(self):
        """( a b quot -- ... a b ) Stash top two, execute quotation, restore."""
        quot = self.pop()
        b = self.pop()
        a = self.pop()
        self._eval_quotation(quot)
        self.push(a)
        self.push(b)

    # ─── Additional Combinators ───────────────────────────────────────

    def _bi(self):
        """( a quot1 quot2 -- r1 r2 ) Apply two quotations to copies of the same value."""
        quot2 = self.pop()
        quot1 = self.pop()
        a = self.pop()
        # Apply quot1 to a copy
        self.push(_copy_value(a))
        self._eval_quotation(quot1)
        # Apply quot2 to a copy
        self.push(_copy_value(a))
        self._eval_quotation(quot2)

    # ─── File Operations ─────────────────────────────────────────────

    # ─── File Loading ─────────────────────────────────────────────────

    def _load(self):
        """( filename -- ) Load a .brief file, adding its definitions to the dictionary."""
        filename = self.pop()
        if not isinstance(filename, str):
            raise BriefError(f"load: expected string filename, got {format_value(filename)}")
        # Resolve relative to cwd
        if not os.path.isabs(filename):
            filename = os.path.join(os.getcwd(), filename)
        if not os.path.exists(filename):
            raise BriefError(f"load: file not found: {filename}")
        with open(filename, 'r', encoding='utf-8') as f:
            source = f.read()
        definitions, _ = parse_program(source)
        self.dictionary.update(definitions)

    # ─── Debugging ────────────────────────────────────────────────────

    def _words(self):
        all_words = list(self.builtins.keys()) + list(self.dictionary.keys())
        self.push(all_words)

    def _dot_s(self):
        """Emit the stack contents (non-destructive)."""
        self.emit('stack', self._stack_str())

    def _dot(self):
        """Pop top of stack and emit its formatted value."""
        val = self.pop()
        self.emit('value', format_value(val))

    def _print(self):
        """Pop top of stack and emit it. Strings are emitted raw (no quotes)."""
        val = self.pop()
        if isinstance(val, str):
            self.emit('value', val)
        else:
            self.emit('value', format_value(val))

    # ─── High-level API ───────────────────────────────────────────────

    def load_program(self, source):
        """Parse and load a Brief program's definitions into the dictionary."""
        definitions, entry_point = parse_program(source)
        self.dictionary.update(definitions)
        return entry_point

    def run_program(self, source):
        """Load and execute a Brief program. Returns the stack."""
        entry_point = self.load_program(source)
        if entry_point and entry_point in self.dictionary:
            self._eval_word(entry_point)
        return list(self.stack)

    def eval_line(self, line):
        """
        Evaluate a single line in REPL mode.
        If the first word is unknown, treat as a definition.
        If the first word is known, treat as an expression to execute.
        """
        stripped = line.strip()
        if not stripped or stripped.startswith('\\'):
            return

        tokens = tokenize(stripped)
        if not tokens:
            return

        first = tokens[0]

        # Check if first token is a known word (builtin or defined)
        if first.kind == 'word' and first.value not in self.builtins and first.value not in self.dictionary:
            # Unknown word at start — this is a definition
            name = first.value
            body_tokens = tokens[1:]
            # Reverse from prefix to postfix
            body_tokens = [reverse_token(t) for t in body_tokens]
            body_tokens = list(reversed(body_tokens))
            self.dictionary[name] = body_tokens
            return

        # Known word or literal at start — execute as expression
        # Reverse the whole thing (prefix → postfix)
        tokens = [reverse_token(t) for t in tokens]
        tokens = list(reversed(tokens))
        self.eval_tokens(tokens)


def _copy_value(v):
    """Deep-copy a value for dup/over/keep (lists and records are mutable)."""
    if isinstance(v, list):
        return list(v)
    if isinstance(v, dict):
        return dict(v)
    return v  # immutable types don't need copying


# ─── Agent ────────────────────────────────────────────────────────────

class Agent:
    """
    A Brief Agent — a stateful message processor.

    Wraps a Machine with a clean process() interface. Each call to process()
    feeds a Brief message through the machine and returns emissions (tagged
    output descriptions). State (stack + dictionary) is threaded automatically.

    The machine is pure: I/O words like . and .s produce emissions instead of
    performing side effects. The caller (or a downstream render agent) decides
    what to do with the emissions.

    Usage:
        agent = Agent()
        emissions = agent.process("sq * dup")       # define sq
        emissions = agent.process("sq 5")            # evaluate → [25]
        emissions = agent.process(".s")              # show stack
    """

    def __init__(self, state=None):
        """Create a new agent, optionally from a saved state snapshot."""
        self.machine = Machine()
        if state:
            if 'stack' in state:
                self.machine.stack = list(state['stack'])
            if 'dictionary' in state:
                self.machine.dictionary.update(state['dictionary'])

    def process(self, message):
        """Process a Brief message (source code string).

        Returns a list of emissions: [(tag, content), ...].
        Emissions describe observable effects without performing them.

        Tags:
            'value'   — from . (dot): popped value to display
            'stack'   — from .s: stack contents to display
            'error'   — runtime error occurred
            'defined' — new word(s) defined
            'result'  — top-of-stack after eval (if non-empty)
            'trace'   — debug trace step
        """
        self.machine.output = []  # reset emission buffer

        stripped = message.strip()
        if not stripped or stripped.startswith('\\'):
            return []

        tokens = tokenize(stripped)
        if not tokens:
            return []

        first = tokens[0]

        # Check if first token is a known word
        is_known = (first.kind == 'word'
                    and (first.value in self.machine.builtins
                         or first.value in self.machine.dictionary))

        try:
            if first.kind == 'word' and not is_known:
                # Unknown word at start — treat as a definition
                name = first.value
                body_tokens = tokens[1:]
                body_tokens = [reverse_token(t) for t in body_tokens]
                body_tokens = list(reversed(body_tokens))
                self.machine.dictionary[name] = body_tokens
                self.machine.emit('defined', [name])
            else:
                # Known word or literal — execute as expression
                tokens = [reverse_token(t) for t in tokens]
                tokens = list(reversed(tokens))
                self.machine.eval_tokens(tokens)
                # Emit top-of-stack as result (REPL convention)
                if self.machine.stack:
                    top = self.machine.stack[-1]
                    self.machine.emit('result', format_value(top))
        except BriefError as e:
            self.machine.emit('error', str(e))
        except Exception as e:
            self.machine.emit('error', f"{type(e).__name__}: {e}")

        return list(self.machine.output)

    def process_program(self, source):
        """Process a multi-line Brief program (definitions + optional entry point).

        Unlike process(), this handles full programs with indentation,
        sub-definitions, and line continuations. Returns emissions.
        """
        self.machine.output = []

        try:
            definitions, entry_point = parse_program(source)
            if definitions:
                self.machine.dictionary.update(definitions)
                self.machine.emit('defined', list(definitions.keys()))
            if entry_point and entry_point in self.machine.dictionary:
                self.machine._eval_word(entry_point)
                if self.machine.stack:
                    top = self.machine.stack[-1]
                    self.machine.emit('result', format_value(top))
        except BriefError as e:
            self.machine.emit('error', str(e))
        except Exception as e:
            self.machine.emit('error', f"{type(e).__name__}: {e}")

        return list(self.machine.output)

    def snapshot(self):
        """Export current state for persistence, transfer, or forking.

        Returns a dict with 'stack' and 'dictionary' that can be used
        to create a new Agent with the same state.
        """
        return {
            'stack': list(self.machine.stack),
            'dictionary': dict(self.machine.dictionary),
        }

    @property
    def stack(self):
        """Direct access to the machine's stack."""
        return self.machine.stack

    @property
    def dictionary(self):
        """Direct access to the machine's dictionary."""
        return self.machine.dictionary


def render_emissions(emissions):
    """Render agent — formats emissions for console output.

    This is the 'render agent' in the REPL pipeline:
        user input → [Eval Agent] → emissions → [Render Agent] → console
    """
    for tag, content in emissions:
        if tag == 'result':
            print(f"  {content}")
        elif tag == 'value':
            print(content)
        elif tag == 'stack':
            print(f"Stack: {content}")
        elif tag == 'error':
            print(f"  Error: {content}")
        elif tag == 'defined':
            print(f"  defined: {' '.join(content)}")
        elif tag == 'trace':
            print(content, file=sys.stderr)


# ─── REPL ─────────────────────────────────────────────────────────────

def repl(agent=None):
    """Interactive REPL — built on the Agent framework.

    The REPL is a two-agent pipeline:
      user input → [Eval Agent] → emissions → [Render Agent] → console

    The eval agent processes Brief code and produces emissions.
    The render agent (render_emissions) formats them for the console.
    """
    if agent is None:
        agent = Agent()

    print("Brief REPL  (type 'bye' to exit, '.s' to show stack)")
    print('  load "file.brief"  to load definitions')
    print()
    while True:
        try:
            line = input("brief> ")
        except (EOFError, KeyboardInterrupt):
            print()
            break

        stripped = line.strip()
        if stripped == 'bye':
            break
        if not stripped or stripped.startswith('\\'):
            continue

        # Collect continuation lines (.. at end) and indented sub-definitions
        lines = [line]
        needs_more = stripped.endswith('..')
        # Check if this looks like a definition (first word unknown)
        first_word = stripped.split()[0] if stripped.split() else ''
        is_def = (first_word and first_word not in agent.machine.builtins
                  and first_word not in agent.machine.dictionary
                  and not first_word[0].isdigit()
                  and first_word not in ('true', 'false')
                  and not first_word.startswith('"')
                  and not first_word.startswith("'")
                  and first_word not in ('[', '{'))

        while needs_more:
            try:
                cont = input("  ...> ")
            except (EOFError, KeyboardInterrupt):
                print()
                break
            lines.append(cont)
            needs_more = cont.strip().endswith('..')

        # If it's a definition, also collect indented children
        if is_def and not needs_more:
            while True:
                try:
                    cont = input("  ...> ")
                except (EOFError, KeyboardInterrupt):
                    print()
                    break
                if not cont.strip():
                    break  # blank line ends the definition
                if cont[0] in ' \t':
                    lines.append(cont)
                    if cont.strip().endswith('..'):
                        # continuation within indented block
                        while True:
                            try:
                                cont2 = input("  ...> ")
                            except (EOFError, KeyboardInterrupt):
                                print()
                                break
                            lines.append(cont2)
                            if not cont2.strip().endswith('..'):
                                break
                else:
                    lines.append(cont)
                    break

        source = '\n'.join(lines)

        # Process through the agent pipeline
        if is_def and len(lines) > 1:
            # Multi-line definition — use process_program
            emissions = agent.process_program(source)
        else:
            # Single-line expression or definition
            emissions = agent.process(lines[0] if len(lines) == 1 else source)

        # Render emissions to console (the "render agent")
        render_emissions(emissions)


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    agent = Agent()

    if len(sys.argv) < 2:
        repl(agent)
        return

    if sys.argv[1] == '-e':
        # Evaluate expression from command line
        expr = ' '.join(sys.argv[2:])
        emissions = agent.process(expr)
        for tag, content in emissions:
            if tag == 'result':
                print(content)
            elif tag == 'value':
                print(content)
            elif tag == 'error':
                print(f"Error: {content}", file=sys.stderr)
                sys.exit(1)
        return

    if sys.argv[1] == '-t':
        agent.machine.trace = True
        if len(sys.argv) < 3:
            repl(agent)
            return
        filepath = sys.argv[2]
    else:
        filepath = sys.argv[1]

    # Run a file
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}", file=sys.stderr)
        sys.exit(1)

    with open(filepath, 'r', encoding='utf-8') as f:
        source = f.read()

    emissions = agent.process_program(source)
    for tag, content in emissions:
        if tag == 'result':
            print(content)
        elif tag == 'value':
            print(content)
        elif tag == 'error':
            print(f"Error: {content}", file=sys.stderr)
            sys.exit(1)
        elif tag == 'trace':
            print(content, file=sys.stderr)


if __name__ == '__main__':
    main()
