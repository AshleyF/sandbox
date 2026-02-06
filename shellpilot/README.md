# ShellPilot

Host a bash shell in Python with full terminal emulation. View the screen buffer and send keys programmatically - like Neovim's `:terminal` but controllable from Python.

## Goals

1. **Host a shell** - Spawn bash in a pseudo-terminal
2. **View buffer contents** - Read what's on screen at any time
3. **Send keys/commands** - Send keystrokes including control sequences
4. **Automate tasks** - Script complex command-line workflows (vim, tmux, etc.)
5. **Create demonstrations** - Record and replay shell sessions for teaching

## How it works

Uses Python's `pty` module to spawn a shell in a pseudo-terminal, combined with `pyte` for terminal emulation. This gives us:
- Full terminal control
- Accurate screen buffer (cursor position, colors, etc.)
- Ability to send any keystrokes including escape sequences

## Installation

```bash
pip install -r requirements.txt
```

## Usage

```python
from shell_pty import ShellPilot

with ShellPilot() as shell:
    # Send a command
    shell.send_line("echo hello")
    
    # Read the screen
    print(shell.get_screen_text())
    
    # Send keystrokes (e.g., Escape)
    shell.send_keys("\x1b")
    
    # Send Ctrl+C
    shell.send_ctrl("c")
```

## Examples

- `shell_pty.py` - Core ShellPilot class
- `example_vim.py` - Launch vim and type "Hello, World!"
- `demo_recorder.py` - Record/playback shell sessions
