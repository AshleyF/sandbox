"""
ShellPilot - Cross-platform PTY approach

Uses pseudo-terminals to spawn a shell with full terminal emulation.
- Windows: pywinpty (ConPTY)
- Unix: pty module

Combined with pyte for terminal emulation to track screen state.

This gives us:
- Full terminal control (like Neovim has with :terminal)
- Screen buffer that we can read at any time
- Ability to send any keystrokes including control sequences
"""

import sys
import threading
import time
from typing import Optional

import pyte

# Platform-specific
WINDOWS = sys.platform == 'win32'


class ShellPilot:
    """
    A hosted shell with buffer viewing and key sending capabilities.
    
    Similar to Neovim's terminal buffer interface:
    - get_screen() -> view the current terminal buffer
    - send_keys() -> send keystrokes to the shell
    - send_line() -> send a command with enter
    """
    
    def __init__(self, shell: str = None, rows: int = 24, cols: int = 80):
        # Default shell based on platform
        if shell is None:
            # Use login shell to load rc files
            # On Windows, use wsl to run the default shell
            shell = "/bin/bash -l" if not WINDOWS else "wsl.exe"
        
        self.shell = shell
        self.rows = rows
        self.cols = cols
        
        # pyte screen and stream for terminal emulation
        self.screen = pyte.Screen(cols, rows)
        self.stream = pyte.Stream(self.screen)
        
        # Platform-specific process handle
        self._process = None  # Windows
        self._master_fd = None  # Unix
        self._pid = None  # Unix
        
        # Reader thread
        self._reader_thread: Optional[threading.Thread] = None
        self._running = False
        
    def start(self) -> None:
        """Start the shell process."""
        if WINDOWS:
            self._start_windows()
        else:
            self._start_unix()
        
        # Start reader thread
        self._running = True
        self._reader_thread = threading.Thread(target=self._read_output, daemon=True)
        self._reader_thread.start()
        
        # Give shell time to initialize and read MOTD etc
        time.sleep(1.0)
    
    def _start_windows(self) -> None:
        """Start shell on Windows using pywinpty."""
        from winpty import PtyProcess
        
        self._process = PtyProcess.spawn(
            self.shell,
            dimensions=(self.rows, self.cols)
        )
    
    def _start_unix(self) -> None:
        """Start shell on Unix using pty module."""
        import fcntl
        import os
        import pty
        import struct
        import termios
        
        pid, master_fd = pty.fork()
        
        if pid == 0:
            # Child process - exec the shell
            os.execvp(self.shell, [self.shell])
        else:
            # Parent process
            self._pid = pid
            self._master_fd = master_fd
            
            # Set terminal size
            winsize = struct.pack("HHHH", self.rows, self.cols, 0, 0)
            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
    
    def _read_output(self) -> None:
        """Background thread to read shell output and feed to terminal emulator."""
        if WINDOWS:
            self._read_output_windows()
        else:
            self._read_output_unix()
    
    def _read_output_windows(self) -> None:
        """Read output on Windows using non-blocking reads."""
        while self._running and self._process and self._process.isalive():
            try:
                # Read in smaller chunks - pywinpty read can block
                # We do short blocking reads and accumulate
                data = self._process.read(1024)
                if data:
                    self.stream.feed(data)
            except EOFError:
                break
            except Exception:
                time.sleep(0.05)
    
    def _read_output_unix(self) -> None:
        """Read output on Unix."""
        import os
        import select
        
        while self._running:
            try:
                r, _, _ = select.select([self._master_fd], [], [], 0.1)
                if r:
                    data = os.read(self._master_fd, 4096)
                    if data:
                        self.stream.feed(data.decode("utf-8", errors="replace"))
            except (OSError, IOError):
                break
    
    def stop(self) -> None:
        """Stop the shell process."""
        self._running = False
        
        if WINDOWS:
            if self._process:
                try:
                    self._process.terminate()
                except Exception:
                    pass
        else:
            import os
            import signal
            if self._master_fd is not None:
                os.close(self._master_fd)
            if self._pid is not None:
                try:
                    os.kill(self._pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
    
    def send_keys(self, keys: str) -> None:
        """
        Send keystrokes to the shell.
        
        Special keys can be sent using escape sequences:
        - \\x03 for Ctrl+C
        - \\x1b for Escape
        - \\r for Enter
        - etc.
        """
        if WINDOWS:
            if self._process:
                self._process.write(keys)
        else:
            import os
            if self._master_fd is not None:
                os.write(self._master_fd, keys.encode("utf-8"))
    
    def send_line(self, command: str) -> None:
        """Send a command followed by Enter."""
        self.send_keys(command + "\r")
    
    def send_ctrl(self, char: str) -> None:
        """Send a control character (e.g., 'c' for Ctrl+C)."""
        code = ord(char.upper()) - ord('A') + 1
        self.send_keys(chr(code))
    
    def get_screen(self) -> list[str]:
        """
        Get the current screen buffer as a list of lines.
        Similar to viewing a Neovim buffer.
        """
        return [line.rstrip() for line in self.screen.display]
    
    def get_screen_buffer(self):
        """
        Get the raw screen buffer with color/attribute information.
        
        Returns a dict mapping (row, col) to pyte.Char objects.
        Each Char has: data, fg, bg, bold, italics, underscore, etc.
        """
        return self.screen.buffer
    
    def get_screen_text(self) -> str:
        """Get the screen as a single string."""
        return "\n".join(self.get_screen())
    
    def get_cursor_position(self) -> tuple[int, int]:
        """Get current cursor position (row, col), 0-indexed."""
        return (self.screen.cursor.y, self.screen.cursor.x)
    
    def wait_for(self, pattern: str, timeout: float = 5.0) -> bool:
        """
        Wait for a pattern to appear on screen.
        Returns True if found, False if timeout.
        """
        import re
        start = time.time()
        while time.time() - start < timeout:
            screen_text = self.get_screen_text()
            if re.search(pattern, screen_text):
                return True
            time.sleep(0.1)
        return False
    
    def __enter__(self):
        self.start()
        return self
    
    def __exit__(self, *args):
        self.stop()


# Example usage
if __name__ == "__main__":
    print("Starting ShellPilot...")
    print(f"Platform: {'Windows' if WINDOWS else 'Unix'}")
    print("=" * 60)
    
    with ShellPilot() as shell:
        # Show initial screen (after MOTD)
        print("Initial screen:")
        print(shell.get_screen_text())
        print("=" * 60)
        
        # Send a command
        shell.send_line("echo 'Hello from ShellPilot!'")
        time.sleep(0.5)
        
        print("\nAfter echo command:")
        print(shell.get_screen_text())
        print("=" * 60)
        
        # Try another command
        shell.send_line("pwd")
        time.sleep(0.5)
        
        print("\nAfter pwd command:")
        print(shell.get_screen_text())
        print("=" * 60)
        
        # Show cursor position
        print(f"\nCursor position: {shell.get_cursor_position()}")
