"""
ShellPilot Visual Viewer

A tkinter-based window that renders the terminal screen in real-time.
Watch your automation happen at human-readable speed!
"""

import random
import threading
import time
import tkinter as tk
from tkinter import font as tkfont
from typing import Optional

from shell_pty import ShellPilot
from keyclicker import KeyClicker
from tts import TextToSpeech
from recorder import VideoRecorder, set_active_recorder


def humanize_delay(base_delay: float, humanize: float, char: str = '', prev_char: str = '') -> float:
    """
    Add human-like randomness to a delay.
    
    Args:
        base_delay: The base delay in seconds
        humanize: Amount of humanization (0.0 = none, 1.0 = full)
        char: Current character being typed
        prev_char: Previous character typed
    
    Returns:
        Randomized delay that feels more natural
    """
    if humanize <= 0:
        return base_delay
    
    # Base variation: +/- 50% randomness scaled by humanize
    variation = base_delay * 0.5 * humanize
    delay = base_delay + random.uniform(-variation, variation)
    
    # Longer pause after punctuation (thinking pause)
    if prev_char in '.!?':
        delay += base_delay * 1.5 * humanize * random.random()
    elif prev_char in ',;:':
        delay += base_delay * 0.5 * humanize * random.random()
    
    # Slight pause at word boundaries
    if prev_char == ' ':
        delay += base_delay * 0.3 * humanize * random.random()
    
    # Occasional "hesitation" (rare longer pause)
    if random.random() < 0.02 * humanize:
        delay += base_delay * 2.0 * random.random()
    
    # Faster for common letter pairs
    fast_pairs = {'th', 'he', 'in', 'er', 'an', 're', 'on', 'es', 'st', 'en'}
    if prev_char and char and (prev_char.lower() + char.lower()) in fast_pairs:
        delay *= 0.7
    
    return max(0.01, delay)  # Never less than 10ms


def make_typo(char: str) -> str:
    """
    Generate a realistic typo for a character.
    Returns a wrong character that's typically adjacent on keyboard.
    """
    # QWERTY keyboard adjacency map
    adjacent = {
        'a': 'sqwz', 'b': 'vghn', 'c': 'xdfv', 'd': 'erfcxs', 'e': 'rdsw34',
        'f': 'rtgvcd', 'g': 'tyhbvf', 'h': 'yujnbg', 'i': 'ujko89', 'j': 'uikmnh',
        'k': 'iolmj', 'l': 'opk', 'm': 'njk', 'n': 'bhjm', 'o': 'iklp90',
        'p': 'ol0', 'q': 'wa12', 'r': 'edft45', 's': 'wedxza', 't': 'rfgy56',
        'u': 'yhji78', 'v': 'cfgb', 'w': 'qeas23', 'x': 'zsdc', 'y': 'tghu67',
        'z': 'asx',
    }
    lower = char.lower()
    if lower in adjacent:
        typo = random.choice(adjacent[lower])
        return typo.upper() if char.isupper() else typo
    return char  # No typo for this character


class TerminalViewer:
    """
    A tkinter window that displays the terminal screen buffer.
    
    Features:
    - Real-time display of terminal contents
    - Monospace font for proper alignment
    - Cursor display
    - Configurable refresh rate
    - Key press overlay for demos
    """
    
    # Unicode symbols for modifier keys
    MODIFIER_SYMBOLS = {
        'ctrl': '⌃',
        'shift': '⇧',
        'alt': '⌥',
        'meta': '⌘',
        'super': '⊞',
    }
    
    # Display names for special keys
    KEY_DISPLAY = {
        'ENTER': '⏎',
        'RETURN': '⏎',
        '\r': '⏎',
        '\n': '⏎',
        'BACKSPACE': '⌫',
        '\b': '⌫',
        '\x7f': '⌫',
        'TAB': '⇥',
        '\t': '⇥',
        'ESCAPE': '⎋',
        'ESC': '⎋',
        '\x1b': '⎋',
        'SPACE': '␣',
        ' ': '␣',
        'UP': '↑',
        'DOWN': '↓',
        'LEFT': '←',
        'RIGHT': '→',
        'HOME': '⇱',
        'END': '⇲',
        'PAGEUP': '⇞',
        'PAGEDOWN': '⇟',
        'DELETE': '⌦',
        'INSERT': '⎀',
    }
    
    def __init__(self, shell: ShellPilot, title: str = "ShellPilot Viewer", borderless: bool = True):
        self.shell = shell
        self.title = title
        self.borderless = borderless
        
        self.root: Optional[tk.Tk] = None
        self.canvas: Optional[tk.Canvas] = None
        self.canvas: Optional[tk.Canvas] = None
        self.key_label: Optional[tk.Label] = None
        self.key_canvas: Optional[tk.Canvas] = None
        
        self._running = False
        self._ui_thread: Optional[threading.Thread] = None
        
        # Current key display state
        self._current_keys: list[str] = []
        self._key_display_time: float = 0
        self._key_fade_duration: float = 5.0  # seconds to show key
        
        # Display settings
        self.font_family = "Consolas" if __import__('sys').platform == 'win32' else "Monaco"
        self.font_size = 14
        self.bg_color = "#1e1e1e"  # Dark background
        self.fg_color = "#d4d4d4"  # Light text
        self.cursor_color = "#ffffff"
        self.key_bg_color = "#5a1a1a"  # Semi-transparent deep red (simulated)
        self.key_fg_color = "#ffffff"  # White key overlay text
        
        # Vim/Neovim key command descriptions
        self._vim_commands = {
            # Motion commands
            'h': 'left',
            'j': 'down',
            'k': 'up',
            'l': 'right',
            'w': 'next word',
            'W': 'next WORD',
            'b': 'back word',
            'B': 'back WORD',
            'e': 'end of word',
            'E': 'end of WORD',
            '0': 'line start',
            '^': 'first char',
            '$': 'line end',
            'gg': 'file start',
            'G': 'file end',
            'f': 'find char',
            'F': 'find back',
            't': 'till char',
            'T': 'till back',
            ';': 'repeat find',
            ',': 'reverse find',
            '%': 'match bracket',
            '{': 'prev paragraph',
            '}': 'next paragraph',
            '(': 'prev sentence',
            ')': 'next sentence',
            'H': 'screen top',
            'M': 'screen middle',
            'L': 'screen bottom',
            'n': 'next match',
            'N': 'prev match',
            '*': 'find word',
            '#': 'find word back',
            'gn': 'select next match',
            'gN': 'select prev match',
            
            # Mode switching
            'i': 'insert',
            'I': 'insert at start',
            'a': 'append',
            'A': 'append at end',
            'o': 'open below',
            'O': 'open above',
            'v': 'visual',
            'V': 'visual line',
            '⌃V': 'visual block',
            'R': 'replace mode',
            's': 'substitute',
            'S': 'substitute line',
            'c': 'change',
            'C': 'change to end',
            'cc': 'change line',
            
            # Editing
            'x': 'delete char',
            'X': 'backspace',
            'd': 'delete',
            'dd': 'delete line',
            'D': 'delete to end',
            'y': 'yank',
            'yy': 'yank line',
            'Y': 'yank line',
            'p': 'paste after',
            'P': 'paste before',
            'u': 'undo',
            '⌃R': 'redo',
            '.': 'repeat',
            'r': 'replace char',
            '~': 'toggle case',
            'J': 'join lines',
            '>': 'indent',
            '<': 'unindent',
            '>>': 'indent line',
            '<<': 'unindent line',
            '=': 'auto-indent',
            '==': 'indent line',
            
            # Text objects (usually with operator)
            'iw': 'inner word',
            'aw': 'a word',
            'iW': 'inner WORD',
            'aW': 'a WORD',
            'is': 'inner sentence',
            'as': 'a sentence',
            'ip': 'inner paragraph',
            'ap': 'a paragraph',
            'i(': 'inner parens',
            'a(': 'around parens',
            'i{': 'inner braces',
            'a{': 'around braces',
            'i[': 'inner brackets',
            'a[': 'around brackets',
            'i"': 'inner quotes',
            'a"': 'around quotes',
            "i'": 'inner quotes',
            "a'": 'around quotes',
            'it': 'inner tag',
            'at': 'around tag',
            
            # Scrolling
            '⌃F': 'page down',
            '⌃B': 'page up',
            '⌃D': 'half page down',
            '⌃U': 'half page up',
            '⌃E': 'scroll down',
            '⌃Y': 'scroll up',
            'zz': 'center cursor',
            'zt': 'cursor to top',
            'zb': 'cursor to bottom',
            
            # Search
            '/': 'search',
            '?': 'search back',
            
            # Marks
            'm': 'set mark',
            "'": 'go to mark',
            '`': 'go to mark exact',
            
            # Macros
            'q': 'record macro',
            '@': 'play macro',
            '@@': 'repeat macro',
            
            # Special keys
            '⎋': 'normal mode',
            '⏎': 'execute',
            '⌫': 'backspace',
            '⇥': 'tab',
            
            # Command mode
            ':w': 'save',
            ':q': 'quit',
            ':wq': 'save & quit',
            ':q!': 'force quit',
            ':x': 'save & quit',
            'ZZ': 'save & quit',
            'ZQ': 'force quit',
        }
        
        # Current caption for key display
        self._current_caption: str = ''
        
        # ANSI 16-color palette (standard terminal colors)
        self._ansi_colors = {
            'black': '#000000',
            'red': '#cd0000',
            'green': '#00cd00',
            'brown': '#cdcd00',  # Also 'yellow' in some contexts
            'yellow': '#cdcd00',
            'blue': '#0000ee',
            'magenta': '#cd00cd',
            'cyan': '#00cdcd',
            'white': '#e5e5e5',
            # Bright variants
            'brightblack': '#7f7f7f',
            'brightred': '#ff0000',
            'brightgreen': '#00ff00',
            'brightyellow': '#ffff00',
            'brightblue': '#5c5cff',
            'brightmagenta': '#ff00ff',
            'brightcyan': '#00ffff',
            'brightwhite': '#ffffff',
            # Default
            'default': None,
        }
        
        # Tag cache for color combinations (created lazily)
        self._color_tags_created = set()
        
    def start(self) -> None:
        """Start the viewer in a separate thread."""
        self._running = True
        self._ui_thread = threading.Thread(target=self._run_ui, daemon=True)
        self._ui_thread.start()
        # Give UI time to initialize
        time.sleep(0.2)
    
    def stop(self) -> None:
        """Stop the viewer."""
        self._running = False
        if self.root:
            try:
                self.root.quit()
            except:
                pass
    
    def _run_ui(self) -> None:
        """Run the tkinter main loop."""
        self.root = tk.Tk()
        self.root.title(self.title)
        self.root.configure(bg=self.bg_color)
        
        # Make window borderless (no title bar) for clean video recording
        # Note: overrideredirect can cause issues on some systems
        if self.borderless:
            self.root.overrideredirect(True)
        
        # Target window size - large for YouTube HD (1920x1080)
        target_width = 1920
        target_height = 1080
        padding = 60  # Padding on each side
        
        # Available space for terminal content
        available_width = target_width - (padding * 2)
        available_height = target_height - (padding * 2)
        
        # Calculate the font size that fills the available space
        # For a 40x12 terminal in 1800x960 space:
        # max char width = 1800/40 = 45px
        # max char height = 960/12 = 80px
        max_char_width = available_width / self.shell.cols
        max_char_height = available_height / self.shell.rows
        
        # Find font size by binary search using actual measurements
        best_font_size = 16
        low, high = 16, 200
        while low <= high:
            mid = (low + high) // 2
            test_font = tkfont.Font(family=self.font_family, size=mid)
            char_width = test_font.measure("M")
            # Use ascent + descent for tighter line spacing
            char_height = test_font.metrics()["ascent"] + test_font.metrics()["descent"]
            
            if char_width <= max_char_width and char_height <= max_char_height:
                best_font_size = mid
                low = mid + 1
            else:
                high = mid - 1
        
        # Create the optimally-sized font
        mono_font = tkfont.Font(family=self.font_family, size=best_font_size)
        char_width = mono_font.measure("M")
        char_height = mono_font.metrics()["ascent"] + mono_font.metrics()["descent"]
        
        # Store font metrics
        self._char_width = char_width
        self._char_height = char_height
        self._font_size = best_font_size
        self._ascent = mono_font.metrics()["ascent"]
        
        # Calculate actual terminal size in pixels
        terminal_width = self.shell.cols * char_width
        terminal_height = self.shell.rows * char_height
        
        # Window size = terminal + padding
        window_width = terminal_width + (padding * 2)
        window_height = terminal_height + (padding * 2)
        
        self.root.geometry(f"{window_width}x{window_height}")
        
        # Use a Canvas for precise character placement (no extra line spacing)
        self.canvas = tk.Canvas(
            self.root,
            bg=self.bg_color,
            highlightthickness=0,
            width=window_width,
            height=window_height,
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        # Store the font for drawing
        self._mono_font = mono_font
        self._padding = padding
        
        # Create key overlay using Canvas for rounded corners
        # Semi-transparent dark background with rounded corners
        self.key_canvas = tk.Canvas(
            self.root,
            highlightthickness=0,
            bg=self.bg_color,  # Will be overwritten by rounded rect
        )
        
        # Key label with extra large font for visibility in videos (108pt)
        key_font = tkfont.Font(family=self.font_family, size=108, weight='bold')
        self.key_label = tk.Label(
            self.key_canvas,
            text="",
            font=key_font,
            bg="#2a2a2a",  # Slightly lighter than main bg for visibility
            fg=self.key_fg_color,
        )
        
        # Store references for rounded rectangle drawing
        self._key_canvas_rect = None
        self._key_canvas_text = None
        self._key_font = key_font
        
        # Hide initially (don't place yet)
        
        # Position window at top-left and ensure it's visible
        self.root.geometry("+0+0")  # Position at (0, 0)
        self.root.deiconify()  # Ensure window is not minimized
        self.root.lift()  # Bring to front
        self.root.attributes('-topmost', True)  # Keep on top temporarily
        self.root.update()  # Force update
        self.root.attributes('-topmost', False)  # Allow other windows on top again
        
        # Start refresh loop
        self._refresh()
        
        # Handle window close
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        
        self.root.mainloop()
    
    def _refresh(self) -> None:
        """Refresh the display with current terminal contents."""
        if not self._running or not self.canvas:
            return
        
        try:
            # Clear canvas
            self.canvas.delete("all")
            
            # Get current screen buffer with colors
            buffer = self.shell.get_screen_buffer()
            cursor_y, cursor_x = self.shell.get_cursor_position()
            
            padding = self._padding
            char_width = self._char_width
            char_height = self._char_height
            
            for row in range(self.shell.rows):
                line_buffer = buffer.get(row, {})
                y = padding + (row * char_height)
                
                for col in range(self.shell.cols):
                    char = line_buffer.get(col, self.shell.screen.default_char)
                    char_data = char.data if char.data else ' '
                    
                    # Get colors
                    fg = self._resolve_color(char.fg, char.bold, is_fg=True)
                    bg = self._resolve_color(char.bg, False, is_fg=False)
                    
                    x = padding + (col * char_width)
                    
                    # Draw background if not default
                    if bg != self.bg_color:
                        self.canvas.create_rectangle(
                            x, y, x + char_width, y + char_height,
                            fill=bg, outline=""
                        )
                    
                    # Draw cursor background
                    if row == cursor_y and col == cursor_x:
                        self.canvas.create_rectangle(
                            x, y, x + char_width, y + char_height,
                            fill=self.cursor_color, outline=""
                        )
                        # Cursor text is inverted
                        fg = self.bg_color
                    
                    # Draw character
                    if char_data != ' ':
                        font_style = []
                        if char.bold:
                            font_style.append('bold')
                        if char.italics:
                            font_style.append('italic')
                        font_spec = (self.font_family, self._font_size, ' '.join(font_style) if font_style else 'normal')
                        
                        self.canvas.create_text(
                            x, y,
                            text=char_data,
                            font=font_spec,
                            fill=fg,
                            anchor="nw"
                        )
            
            # Update key overlay
            self._update_key_display()
        except Exception as e:
            pass  # Ignore errors during refresh
        
        # Schedule next refresh (60 FPS-ish)
        if self._running:
            self.root.after(16, self._refresh)
    
    def _resolve_color(self, color: str, bold: bool, is_fg: bool) -> str:
        """Convert pyte color name to hex color."""
        if color == 'default':
            return self.fg_color if is_fg else self.bg_color
        
        # Handle 256-color codes (numeric strings)
        if isinstance(color, str) and color.isdigit():
            return self._color_256_to_hex(int(color))
        
        # Handle named colors
        color_lower = color.lower() if isinstance(color, str) else 'default'
        
        # Bright variant for bold foreground text
        if bold and is_fg and not color_lower.startswith('bright'):
            bright_key = 'bright' + color_lower
            if bright_key in self._ansi_colors:
                return self._ansi_colors[bright_key]
        
        if color_lower in self._ansi_colors:
            result = self._ansi_colors[color_lower]
            return result if result else (self.fg_color if is_fg else self.bg_color)
        
        # If it looks like a hex color, use it directly
        if isinstance(color, str) and color.startswith('#'):
            return color
        
        return self.fg_color if is_fg else self.bg_color
    
    def _color_256_to_hex(self, code: int) -> str:
        """Convert 256-color code to hex."""
        # Standard 16 colors (0-15)
        if code < 16:
            palette = [
                '#000000', '#cd0000', '#00cd00', '#cdcd00',
                '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
                '#7f7f7f', '#ff0000', '#00ff00', '#ffff00',
                '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
            ]
            return palette[code]
        
        # 216 color cube (16-231)
        if code < 232:
            code -= 16
            r = (code // 36) % 6
            g = (code // 6) % 6
            b = code % 6
            r = 0 if r == 0 else 55 + r * 40
            g = 0 if g == 0 else 55 + g * 40
            b = 0 if b == 0 else 55 + b * 40
            return f'#{r:02x}{g:02x}{b:02x}'
        
        # Grayscale (232-255)
        gray = (code - 232) * 10 + 8
        return f'#{gray:02x}{gray:02x}{gray:02x}'
    
    def _get_color_tag(self, fg: str, bg: str, bold: bool, italic: bool, underline: bool) -> str:
        """Get or create a tag for a color/style combination. (Unused - Canvas mode)"""
        # This method is no longer used with Canvas-based rendering
        return f"c_{fg}_{bg}_{bold}_{italic}_{underline}".replace('#', 'x')
    
    def _on_close(self) -> None:
        """Handle window close."""
        self._running = False
        self.root.quit()
    
    def show_key(self, key: str, modifiers: list[str] = None, caption: str = None) -> None:
        """
        Show a key press in the overlay.
        
        Args:
            key: The key being pressed (character or name like 'ENTER')
            modifiers: List of modifier keys ('ctrl', 'shift', 'alt', 'meta')
            caption: Optional caption to display (overrides auto-lookup)
        """
        modifiers = modifiers or []
        
        # Build display string with modifier symbols
        parts = []
        for mod in modifiers:
            if mod.lower() in self.MODIFIER_SYMBOLS:
                parts.append(self.MODIFIER_SYMBOLS[mod.lower()])
        
        # Convert key to display form
        if key in self.KEY_DISPLAY:
            display_key = self.KEY_DISPLAY[key]
        elif len(key) == 1:
            # Single character - show uppercase (the physical key)
            display_key = key.upper()
        else:
            # Named key - show as is
            display_key = key.upper()
        
        parts.append(display_key)
        display_text = ''.join(parts)
        
        # Store for display
        self._current_keys = [display_text]
        self._key_display_time = time.time()
        
        # Look up caption from vim commands or use provided one
        if caption:
            self._current_caption = caption
        else:
            # Try to find caption in vim commands
            # First try the full display text (for things like ⌃R)
            if display_text in self._vim_commands:
                self._current_caption = self._vim_commands[display_text]
            # Then try the raw key
            elif key in self._vim_commands:
                self._current_caption = self._vim_commands[key]
            # For single chars, try both cases
            elif len(key) == 1:
                if key in self._vim_commands:
                    self._current_caption = self._vim_commands[key]
                elif key.lower() in self._vim_commands:
                    self._current_caption = self._vim_commands[key.lower()]
                else:
                    self._current_caption = ''
            else:
                self._current_caption = ''
    
    def _draw_rounded_rect(self, canvas, x1, y1, x2, y2, radius, **kwargs):
        """Draw a rounded rectangle on a canvas."""
        points = [
            x1 + radius, y1,
            x2 - radius, y1,
            x2, y1,
            x2, y1 + radius,
            x2, y2 - radius,
            x2, y2,
            x2 - radius, y2,
            x1 + radius, y2,
            x1, y2,
            x1, y2 - radius,
            x1, y1 + radius,
            x1, y1,
            x1 + radius, y1,
        ]
        return canvas.create_polygon(points, smooth=True, **kwargs)
    
    def _update_key_display(self) -> None:
        """Update the key overlay visibility and content."""
        if not self.key_canvas or not self.root:
            return
        
        now = time.time()
        elapsed = now - self._key_display_time
        
        if elapsed < self._key_fade_duration and self._current_keys:
            # Show the key with rounded rectangle background
            display_text = ' '.join(self._current_keys)
            
            # Calculate size based on text
            text_width = self._key_font.measure(display_text)
            text_height = self._key_font.metrics()["linespace"]
            
            # Caption font (smaller)
            caption_font = (self.font_family, 14)
            
            # Calculate caption size if present
            caption_height = 0
            caption_width = 0
            if self._current_caption:
                # Use a temporary font object to measure
                import tkinter.font as tkfont
                temp_font = tkfont.Font(family=self.font_family, size=14)
                caption_width = temp_font.measure(self._current_caption)
                caption_height = temp_font.metrics()["linespace"] + 8  # Extra spacing
            
            padding_x = 24
            padding_y = 16
            radius = 20
            
            total_width = max(text_width, caption_width)
            canvas_width = total_width + padding_x * 2
            canvas_height = text_height + caption_height + padding_y * 2
            
            # Configure and show canvas in upper right corner (inset by terminal padding)
            self.key_canvas.config(width=canvas_width, height=canvas_height)
            self.key_canvas.place(relx=1.0, rely=0, anchor='ne', x=-60, y=60)
            
            # Clear and redraw
            self.key_canvas.delete("all")
            
            # Draw semi-transparent red rounded rectangle
            self._draw_rounded_rect(
                self.key_canvas,
                0, 0, canvas_width, canvas_height,
                radius,
                fill=self.key_bg_color,  # Semi-transparent red
                outline="#3a1010",  # Subtle darker border
                width=1
            )
            
            # Draw key text centered (or above center if caption)
            key_y = canvas_height // 2 if not self._current_caption else padding_y + text_height // 2
            self.key_canvas.create_text(
                canvas_width // 2,
                key_y,
                text=display_text,
                font=self._key_font,
                fill=self.key_fg_color,
                anchor='center'
            )
            
            # Draw caption below if present
            if self._current_caption:
                self.key_canvas.create_text(
                    canvas_width // 2,
                    key_y + text_height // 2 + caption_height // 2 + 4,
                    text=self._current_caption,
                    font=caption_font,
                    fill="#ffffff",  # White caption
                    anchor='center'
                )
        else:
            # Hide the overlay
            self.key_canvas.place_forget()
            self._current_keys = []
            self._current_caption = ''


class ScriptedDemo:
    """
    Run scripted shell demos with visual display and speed control.
    
    Usage:
        with ScriptedDemo(speed=0.5) as demo:  # Half speed
            demo.send_line("echo hello")
            demo.send_keys("i")
            demo.type_text("Hello, World!", char_delay=0.05)
    """
    
    def __init__(
        self,
        shell: str = None,
        rows: int = 24,
        cols: int = 80,
        speed: float = 1.0,
        show_viewer: bool = True,
        click_keys: bool = True,
        click_volume: float = 0.15,
        humanize: float = 0.5,
        mistakes: float = 0.0,
        seed: int = None,
        tts_enabled: bool = True,
        tts_voice: str = "nova",
        record_video: bool = True,
        video_fps: int = 30,
        title: str = "ShellPilot Demo",
        borderless: bool = True,
        auto_start_recording: bool = True,
    ):
        """
        Initialize a scripted demo.
        
        Args:
            shell: Shell to use (default: bash)
            rows: Terminal rows
            cols: Terminal columns
            speed: Speed multiplier (0.5 = half speed, 2.0 = double speed)
            show_viewer: Whether to show the visual viewer
            click_keys: Whether to play keyboard click sounds
            click_volume: Volume for key clicks (0.0 to 1.0)
            humanize: Amount of humanization for typing (0.0 = robotic, 1.0 = very human)
            mistakes: Probability of random typos (0.0 = none, 0.1 = occasional, 0.3 = frequent)
            seed: Random seed for reproducible demos (None = random each time)
            tts_enabled: Whether to enable text-to-speech
            tts_voice: OpenAI TTS voice (alloy, echo, fable, onyx, nova, shimmer)
            record_video: Whether to record demo to MP4 video file
            video_fps: Video recording frames per second
            title: Window title (also used for video filename)
            borderless: Whether to use borderless window (clean for recording)
        """
        # Set random seed for reproducible behavior
        if seed is not None:
            random.seed(seed)
        
        self.shell = ShellPilot(shell=shell, rows=rows, cols=cols)
        self.speed = speed
        self.show_viewer = show_viewer
        self.title = title
        self.humanize = humanize
        self.mistakes = mistakes
        self.borderless = borderless
        
        # Key clicker for sound effects
        self.clicker = KeyClicker(volume=click_volume, enabled=click_keys)
        
        # Text-to-speech
        self.tts = TextToSpeech(voice=tts_voice, enabled=tts_enabled)
        
        # Video recorder
        self.record_video = record_video and show_viewer  # Can only record if viewer is shown
        self.auto_start_recording = auto_start_recording
        self.recorder: Optional[VideoRecorder] = None
        if self.record_video:
            self.recorder = VideoRecorder(title=title, fps=video_fps)
        
        self.viewer: Optional[TerminalViewer] = None
        
        # Base delays (will be divided by speed)
        self.base_delay = 0.3  # Default delay after actions
        self.char_delay = 0.05  # Delay between characters when typing
    
    def start(self) -> None:
        """Start the shell and viewer."""
        self.shell.start()
        
        if self.show_viewer:
            self.viewer = TerminalViewer(self.shell, title=self.title, borderless=self.borderless)
            self.viewer.start()
            
            # Start recording if enabled and auto-start is on
            if self.recorder and self.viewer.root and self.auto_start_recording:
                self.recorder.start(self.viewer.root)
                set_active_recorder(self.recorder)
        
        # Initial delay for shell to start
        self.wait(1.0)
    
    def start_recording(self) -> None:
        """Start video recording (call after setup steps)."""
        if self.recorder and self.viewer and self.viewer.root:
            if not self.recorder._recording:  # Only start if not already recording
                self.recorder.start(self.viewer.root)
                set_active_recorder(self.recorder)
    
    def stop(self) -> None:
        """Stop recording, viewer, and shell."""
        # Clear active recorder
        set_active_recorder(None)
        
        # Stop recording first to capture final frames
        if self.recorder:
            self.recorder.stop()
        
        if self.viewer:
            self.viewer.stop()
        self.shell.stop()
    
    def wait(self, seconds: float) -> 'ScriptedDemo':
        """Wait for a duration (adjusted by speed)."""
        time.sleep(seconds / self.speed)
        return self
    
    def _show_key(self, key: str, modifiers: list[str] = None) -> None:
        """Show a key in the viewer overlay if available."""
        if self.viewer:
            self.viewer.show_key(key, modifiers)
    
    def send_keys(self, keys: str, delay: float = None) -> 'ScriptedDemo':
        """Send keystrokes (with click sounds and key display)."""
        for char in keys:
            self.clicker.click_key(char)
            self._show_key(char)
        self.shell.send_keys(keys)
        self.wait(delay if delay is not None else self.base_delay)
        return self
    
    def send_line(self, command: str, delay: float = None) -> 'ScriptedDemo':
        """Send a command with Enter (with click sounds, no key overlay for chars)."""
        # Type each character with click sound and humanized delay
        # No key overlay - the text is visible on screen
        prev_char = ''
        for char in command:
            # Maybe make a mistake
            if self.mistakes > 0 and char.isalpha() and random.random() < self.mistakes:
                typo = make_typo(char)
                # Type the wrong character
                self.clicker.click_key(typo)
                self.shell.send_keys(typo)
                self.wait(humanize_delay(self.char_delay, self.humanize, typo, prev_char))
                # Pause (noticing the mistake)
                self.wait(self.char_delay * 3)
                # Backspace
                self.clicker.click_key('BACKSPACE')
                self.shell.send_keys('\x7f')
                self.wait(humanize_delay(self.char_delay, self.humanize, '\b', typo))
            # Type the correct character
            self.clicker.click_key(char)
            self.shell.send_keys(char)
            char_delay = humanize_delay(self.char_delay, self.humanize, char, prev_char)
            self.wait(char_delay)
            prev_char = char
        # Enter key - show in overlay
        self.clicker.click_key('ENTER')
        self._show_key('ENTER')
        self.shell.send_keys('\r')
        self.wait(delay if delay is not None else self.base_delay * 2)
        return self
    
    def type_text(self, text: str, char_delay: float = None) -> 'ScriptedDemo':
        """
        Type visible text content character by character (human-like) with click sounds.
        No key overlay - the text appears on screen.
        
        Special characters:
            \\b - backspace (delete previous character)
            \\r or \\n - enter key
        
        Example:
            demo.type_text("Helo\\b\\bllo")  # Types "Helo", backspaces twice, types "llo"
        """
        base_delay = char_delay if char_delay is not None else self.char_delay
        prev_char = ''
        for char in text:
            if char == '\b':
                # Backspace
                self.clicker.click_key('BACKSPACE')
                self.shell.send_keys('\x7f')
            elif char in ('\r', '\n'):
                # Enter
                self.clicker.click_key('ENTER')
                self.shell.send_keys('\r')
            else:
                # Maybe make a mistake
                if self.mistakes > 0 and char.isalpha() and random.random() < self.mistakes:
                    typo = make_typo(char)
                    # Type the wrong character
                    self.clicker.click_key(typo)
                    self.shell.send_keys(typo)
                    self.wait(humanize_delay(base_delay, self.humanize, typo, prev_char))
                    # Pause (noticing the mistake)
                    self.wait(base_delay * 3)
                    # Backspace
                    self.clicker.click_key('BACKSPACE')
                    self.shell.send_keys('\x7f')
                    self.wait(humanize_delay(base_delay, self.humanize, '\b', typo))
                # Type the correct character
                self.clicker.click_key(char)
                self.shell.send_keys(char)
            delay = humanize_delay(base_delay, self.humanize, char, prev_char)
            self.wait(delay)
            prev_char = char
        return self
    
    def send_ctrl(self, char: str, delay: float = None) -> 'ScriptedDemo':
        """Send a control character with key display."""
        self._show_key(char.upper(), ['ctrl'])
        self.shell.send_ctrl(char)
        self.wait(delay if delay is not None else self.base_delay)
        return self
    
    def send_escape(self, delay: float = None) -> 'ScriptedDemo':
        """Send Escape key."""
        self._show_key('ESCAPE')
        self.clicker.click_key('ESCAPE')
        self.shell.send_keys("\x1b")
        self.wait(delay if delay is not None else self.base_delay)
        return self
    
    def send_enter(self, delay: float = None) -> 'ScriptedDemo':
        """Send Enter key."""
        self._show_key('ENTER')
        self.clicker.click_key('ENTER')
        self.shell.send_keys("\r")
        self.wait(delay if delay is not None else self.base_delay)
        return self
    
    def send_backspace(self, count: int = 1, delay: float = None) -> 'ScriptedDemo':
        """Send Backspace key(s) with click sound and key display."""
        char_delay = delay if delay is not None else self.char_delay
        for _ in range(count):
            self.clicker.click_key('BACKSPACE')
            self._show_key('BACKSPACE')
            self.shell.send_keys("\x7f")  # DEL character (backspace)
            self.wait(char_delay)
        return self
    
    def wait_for(self, pattern: str, timeout: float = 5.0) -> bool:
        """Wait for a pattern to appear on screen."""
        return self.shell.wait_for(pattern, timeout / self.speed)
    
    def comment(self, text: str) -> 'ScriptedDemo':
        """
        Print a comment (for script readability).
        Doesn't affect the shell, just prints to console.
        """
        print(f"# {text}")
        return self
    
    def say(self, text: str, wait: bool = True) -> 'ScriptedDemo':
        """
        Speak text aloud using text-to-speech.
        
        Args:
            text: The text to speak
            wait: If True, wait for speech to complete before continuing
        """
        print(f"[SAY] {text}")
        self.tts.say(text, wait=wait)
        return self
    
    def pause(self, message: str = "Press Enter to continue...") -> 'ScriptedDemo':
        """Pause and wait for user input."""
        input(message)
        return self
    
    def get_screen(self) -> str:
        """Get the current screen content as text."""
        return self.shell.get_screen_text()
    
    def screen_contains(self, text: str) -> bool:
        """Check if the screen contains the given text."""
        return text in self.shell.get_screen_text()
    
    def wait_for_screen(self, text: str, timeout: float = 5.0) -> bool:
        """
        Wait for text to appear on screen.
        
        Args:
            text: Text to wait for
            timeout: Maximum seconds to wait
            
        Returns:
            True if text appeared, False if timeout
        """
        import time
        start = time.time()
        while time.time() - start < timeout:
            if text in self.shell.get_screen_text():
                return True
            time.sleep(0.1)
        return False
    
    def if_screen_contains(self, text: str, then_keys: str) -> 'ScriptedDemo':
        """
        Conditionally send keys if screen contains text.
        
        Args:
            text: Text to look for on screen
            then_keys: Keys to send if text is found
        """
        if self.screen_contains(text):
            self.keys(then_keys)
        return self
    
    def show_overlay(self, text: str, caption: str = "", duration: float = 2.0) -> 'ScriptedDemo':
        """
        Show a custom overlay with text and optional caption.
        
        Args:
            text: Main text to display (like a key)
            caption: Optional caption below the text
            duration: How long to show the overlay (in seconds)
        """
        if self.viewer:
            # Set the overlay text and caption directly
            self.viewer._current_keys = [text]
            self.viewer._current_caption = caption
            self.viewer._key_display_time = __import__('time').time()
            # Set fade duration to match the requested duration
            self.viewer._key_fade_duration = duration
        self.wait(duration)
        # Restore default fade duration after overlay
        if self.viewer:
            self.viewer._key_fade_duration = 5.0
        return self
    
    def __enter__(self):
        self.start()
        return self
    
    def __exit__(self, *args):
        self.stop()


# Example usage
if __name__ == "__main__":
    print("Starting ScriptedDemo viewer test...")
    
    with ScriptedDemo(speed=0.5, title="ShellPilot Test") as demo:
        demo.comment("Shell started, running some commands...")
        
        demo.send_line("echo 'Hello from ShellPilot!'")
        demo.send_line("pwd")
        demo.send_line("ls -la")
        
        demo.comment("Demo complete!")
        demo.wait(2.0)
