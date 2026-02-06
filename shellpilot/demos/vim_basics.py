"""
Example: Launch Neovim and type "Hello, World!"

Demonstrates using ShellPilot DSL to:
1. Start a shell with visual viewer
2. Launch Neovim
3. Enter insert mode
4. Type some text (with typos and corrections!)
5. Save and quit
6. Verify the file was created

Run with: python -m demos.vim_basics
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dsl import Demo, Comment, Say, Line, Type, Keys, Wait, Escape, Enter, IfScreen, Overlay


vim_demo = Demo(
    title="Neovim Demo - ShellPilot",
    speed=1.0,  # 2x faster typing
    rows=12,  # Compact for YouTube
    cols=40,  # Compact for YouTube
    humanize=0.7,  # Natural typing variation
    mistakes=0.05,  # Occasional random typos (auto-corrected)
    seed=42,  # Reproducible randomness (same demo every time)
    tts_voice="echo",  # Use echo voice
    borderless=True,  # Borderless for clean recording
    
    # Setup steps (run before recording starts)
    setup=[
        Comment("Creating and switching to vimfu directory..."),
        Line("mkdir -p ~/vimfu && cd ~/vimfu"),
        Wait(0.3),
        Comment("Cleaning up any existing files..."),
        Line("rm -f hello.txt .hello.txt.swp .hello.txt.swo"),
        Wait(0.3),
        # Also clean nvim's swap directory if it exists
        Line("rm -f ~/.local/state/nvim/swap/*hello.txt*"),
        Wait(0.3),
        Line("clear"),
        Wait(0.5),
    ],
    
    # Main demo steps (recorded)
    steps=[
        Overlay("VimFu", caption="Neovim Basics", duration=10.0),
        Say("Let's create a file in Neovim."),
        Comment("Launching Neovim..."),
        Line("nvim hello.txt"),
        Wait(0.5),
        
        # Handle swap file warning if it appears
        IfScreen("swap file", "d"),  # Press 'd' to delete swap and open file
        Wait(0.3),
        
        Say("Neovim starts in normal mode. Press i to enter insert mode."),
        Comment("Entering insert mode..."),
        Keys("i"),
        Wait(0.3),
        
        Say("Now we can type. Watch for the typo and correction."),
        Comment("Typing 'Hello, World!' with a typo..."),
        Type("Helo\blo, World!"),
        
        Say("Let's add another line."),
        Comment("Adding a new line..."),
        Type("\nThis is ShellPilto\b\b\blot controlling Neovim!"),
        
        Say("Press escape to return to normal mode."),
        Comment("Exiting insert mode..."),
        Escape(),
        Wait(0.3),
        
        Say("Now we save and quit with colon w q."),
        Comment("Saving and quitting with :wq"),
        Type(":wq"),
        Enter(),
        Wait(0.5),
        
        Say("Let's verify the file was created."),
        Comment("Verifying file was created..."),
        Line("cat hello.txt"),
        Wait(1.0),
        
        Comment("Cleaning up..."),
        Line("rm hello.txt"),
        
        Say("And that's the basics of Neovim!"),
        Comment("Demo complete! Window will close in 2 seconds..."),
        Wait(2.0),
    ]
)


if __name__ == "__main__":
    vim_demo.run()
