# Brief Agent Framework

## Overview

An **Agent** is a stateful message processor built on the Brief Machine. It receives messages (Brief code), processes them against accumulated state (stack + dictionary), and produces **emissions** — tagged descriptions of observable effects — along with updated state.

The core principle: **the machine is pure**. It never performs I/O directly. I/O-like words (`.`, `.s`) produce *descriptions* of output that accumulate in an emission buffer. An outer loop interprets these descriptions and performs actual I/O.

This closes the gap between the architecture described in [MACHINE.md](MACHINE.md) and the implementation. The machine becomes `f(state, message) → (state', emissions)` in practice, not just in theory.

## Agent Interface

```
agent.process(message) → Result { state, emissions }
```

| Field        | Type                | Description                                    |
|--------------|---------------------|------------------------------------------------|
| **message**  | `string`            | Brief source code to evaluate                  |
| **state**    | `State`             | Stack + dictionary, threaded automatically     |
| **emissions**| `list[Emission]`    | Tagged output descriptions produced during eval|

The agent manages state threading internally. Each call to `process()` uses the state left by the previous call.

## State

```python
State = {
    stack:      list[Value]         # the data stack
    dictionary: dict[str, Tokens]   # word definitions (prelude + user)
}
```

State flows forward: the output state of message *N* becomes the input state of message *N+1*. The caller never needs to manage state explicitly — the agent handles it.

```
msg₁ ─→ agent ─→ (state₁, emissions₁)
msg₂ ─→ agent ─→ (state₂, emissions₂)     # state₁ threaded in automatically
msg₃ ─→ agent ─→ (state₃, emissions₃)     # state₂ threaded in automatically
```

### State Snapshots

An agent can export and import state snapshots for persistence, migration, or forking:

```python
snapshot = agent.snapshot()    # → serializable State
agent2 = Agent(state=snapshot) # new agent from saved state
```

## Emissions

When Brief code would produce observable output, the machine appends an **emission** to the output buffer instead of performing I/O. Emissions are tagged values describing *what should happen*, not performing it.

| Tag        | Triggered by      | Content                          | Description                       |
|------------|--------------------|----------------------------------|-----------------------------------|
| `value`    | `.` (dot)          | Formatted string of popped value | Pop and display a value           |
| `stack`    | `.s`               | Formatted stack string           | Display current stack (non-destructive) |
| `error`    | runtime error      | Error message string             | An error occurred during eval     |
| `defined`  | new definition     | List of word names               | New words were added to dictionary|
| `result`   | end of eval        | Formatted top-of-stack value     | Convention: show top after eval   |
| `trace`    | trace mode         | Trace step description           | Debug trace output                |

```python
Emission = (tag: str, content: str | list[str])
```

### Why Emissions?

This is the key design decision. Compare:

**Impure (current):**
```python
def _dot(self):
    val = self.pop()
    print(format_value(val))    # side effect!
```

**Pure (agent model):**
```python
def _dot(self):
    val = self.pop()
    self.emit('value', format_value(val))  # description, not action
```

The machine says *what* should be displayed. The outer loop decides *how* and *where*. This means the same Brief code can:
- Display in a terminal (REPL)
- Render in a web UI
- Accumulate into a log
- Be tested without capturing stdout
- Feed into another agent

## The REPL as an Agent Pipeline

The REPL is composed of two agents in a pipeline:

```
┌─────────────┐          ┌──────────────┐          ┌──────────────┐
│    User      │  input   │  Eval Agent  │ emissions│ Render Agent │  console
│  (keyboard)  │────────▶│              │─────────▶│              │──────────▶
│              │          │  Brief code  │          │  Formats &   │
│              │          │  → state +   │          │  prints      │
│              │          │    emissions │          │  emissions   │
└─────────────┘          └──────────────┘          └──────────────┘
                               ↕ state
```

### Eval Agent

Receives user input as Brief code. Processes it. Returns:
- Updated state (stack + dictionary)
- Emissions from `.`, `.s`, errors, definitions, result display

The eval agent adds a `result` emission when the stack is non-empty after evaluation (the "show top of stack" convention). It adds a `defined` emission when new words are defined. It wraps errors as `error` emissions rather than raising exceptions.

### Render Agent

Receives emissions and renders them to the console:

| Emission Tag | Rendering                                    |
|--------------|----------------------------------------------|
| `value`      | Print the content                            |
| `stack`      | Print `Stack: [...]`                         |
| `error`      | Print `Error: ...`                           |
| `defined`    | Print `defined: word1 word2 ...`             |
| `result`     | Print `  value` (indented, like current REPL)|
| `trace`      | Print to stderr                              |

The render agent is intentionally simple — it's just a formatter. Different render agents could output HTML, JSON, or feed into another system.

## Protocol Schema

For inter-process or network use, the agent protocol has a standard JSON schema:

### Request

```json
{
    "message": "* 3.14159 sq 5",
    "state": {                          // optional — omit to use agent's current state
        "stack": [42],
        "dictionary": {
            "sq": "dup *"
        }
    }
}
```

### Response

```json
{
    "state": {
        "stack": [78.53975],
        "dictionary": {
            "sq": "dup *"
        }
    },
    "emissions": [
        {"tag": "result", "content": "78.53975"}
    ]
}
```

### State-Only Request (definitions)

```json
{
    "message": "sq * dup"
}
```

```json
{
    "state": {
        "stack": [],
        "dictionary": {"sq": "dup *"}
    },
    "emissions": [
        {"tag": "defined", "content": ["sq"]}
    ]
}
```

## Agent Composition

Agents can be composed in several patterns:

### Pipeline

Output emissions of one agent become input messages to the next:

```
Agent A ──emissions──▶ Agent B ──emissions──▶ Agent C
```

Each agent maintains its own state. The REPL is a two-stage pipeline: eval → render.

### Fan-out

One agent's emissions feed multiple downstream agents:

```
                ┌──▶ Agent B (console renderer)
Agent A ────────┤
                └──▶ Agent C (log recorder)
```

### Feedback Loop

An agent's emissions can generate new messages back to itself or another agent:

```
Agent A ──emissions──▶ Router ──messages──▶ Agent A
```

This enables reactive patterns: Brief code emits a description, the router interprets it and generates a follow-up message.

## Implementation Plan

### Phase 1: Pure Machine

1. Add `self.output` buffer to `Machine` — list of `(tag, content)` tuples
2. Add `self.emit(tag, content)` method
3. Change `.` to emit `('value', formatted_value)` instead of printing
4. Change `.s` to emit `('stack', formatted_stack)` instead of printing
5. Change trace output to emit `('trace', msg)` instead of printing

### Phase 2: Agent Class

```python
class Agent:
    def __init__(self, state=None):
        self.machine = Machine()
        if state:
            self.machine.stack = state['stack']
            self.machine.dictionary.update(state['dictionary'])

    def process(self, message):
        """Process a Brief message. Returns (emissions, error)."""
        self.machine.output = []  # reset emission buffer
        try:
            # ... evaluate message ...
            return self.machine.output, None
        except BriefError as e:
            return self.machine.output + [('error', str(e))], e

    def snapshot(self):
        """Export current state for persistence/transfer."""
        return {
            'stack': list(self.machine.stack),
            'dictionary': dict(self.machine.dictionary)
        }
```

### Phase 3: REPL Refactor

```python
def repl():
    eval_agent = Agent()
    while True:
        line = input("brief> ")
        emissions = eval_agent.process(line)
        render(emissions)   # the "render agent" — just a function for now

def render(emissions):
    for tag, content in emissions:
        if tag == 'result':   print(f"  {content}")
        elif tag == 'value':  print(content)
        elif tag == 'stack':  print(f"Stack: {content}")
        elif tag == 'error':  print(f"  Error: {content}")
        elif tag == 'defined': print(f"  defined: {' '.join(content)}")
```

## Open Questions

1. **Stack carry-over**: Should the stack persist between messages, or be cleared? Current REPL carries forward. The agent should default to carry-forward but allow clearing.

2. **State serialization format**: For network transport, how to serialize quotations and token lists in the dictionary? JSON with a custom token encoding? Or a Brief-native text format?

3. **Error recovery**: When an error occurs mid-evaluation, what's the state? Currently the stack may be partially modified. Should the agent roll back to pre-message state on error?

4. **Concurrency**: Can multiple messages be processed concurrently? Not with shared state — but forked agents (via snapshots) can run in parallel.

5. **Capabilities**: Should agents declare what builtins they support? A sandboxed agent might exclude `load` and file operations. A game agent might include `best-move`.

6. **Agent identity**: Should agents have names/IDs for routing in multi-agent setups?

## See Also

- [MACHINE.md](MACHINE.md) — The Brief Machine specification (pure function model)
- [SPEC.md](SPEC.md) — Brief language specification (prefix source format)
