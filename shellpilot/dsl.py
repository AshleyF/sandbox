"""
ShellPilot Demo DSL

A simple domain-specific language for describing shell demos.
Instead of writing Python code, describe your demo as data.

Example:
    demo = Demo(
        title="Vim Basics",
        speed=0.5,
        steps=[
            Comment("Let's edit a file"),
            Line("vim hello.txt"),
            Wait(0.5),
            Keys("i"),
            Type("Hello, World!"),
            Escape(),
            Type(":wq"),
            Enter(),
        ]
    )
    demo.run()
"""

from dataclasses import dataclass, field
from typing import Union
import yaml
import json
from pathlib import Path


# === Step Types ===

@dataclass
class Comment:
    """Display a comment/narration."""
    text: str
    
    def execute(self, demo):
        demo.comment(self.text)


@dataclass
class Say:
    """Speak text aloud using text-to-speech."""
    text: str
    wait: bool = True  # Wait for speech to complete before continuing
    
    def execute(self, demo):
        demo.say(self.text, wait=self.wait)


@dataclass
class Type:
    """Type text character by character. Supports \\b for backspace, \\n for enter."""
    text: str
    
    def execute(self, demo):
        demo.type_text(self.text)


@dataclass
class Keys:
    """Send raw keystrokes."""
    keys: str
    
    def execute(self, demo):
        demo.send_keys(self.keys)


@dataclass
class Line:
    """Send a command line (typed char by char with Enter)."""
    command: str
    
    def execute(self, demo):
        demo.send_line(self.command)


@dataclass
class Wait:
    """Pause for a duration (in seconds, adjusted by speed)."""
    seconds: float = 0.5
    
    def execute(self, demo):
        demo.wait(self.seconds)


@dataclass
class Escape:
    """Send the Escape key."""
    
    def execute(self, demo):
        demo.send_escape()


@dataclass
class Enter:
    """Send the Enter key."""
    
    def execute(self, demo):
        demo.send_enter()


@dataclass
class Backspace:
    """Send backspace key(s)."""
    count: int = 1
    
    def execute(self, demo):
        demo.send_backspace(self.count)


@dataclass
class Ctrl:
    """Send a control character (e.g., Ctrl+C)."""
    char: str
    
    def execute(self, demo):
        demo.send_ctrl(self.char)


@dataclass
class Pause:
    """Pause and wait for user to press Enter (interactive)."""
    message: str = "Press Enter to continue..."
    
    def execute(self, demo):
        demo.pause(self.message)


@dataclass
class IfScreen:
    """Conditionally send keys if screen contains text."""
    contains: str
    then_keys: str
    
    def execute(self, demo):
        demo.if_screen_contains(self.contains, self.then_keys)


@dataclass
class WaitForScreen:
    """Wait for text to appear on screen."""
    text: str
    timeout: float = 5.0
    
    def execute(self, demo):
        demo.wait_for_screen(self.text, self.timeout)


@dataclass
class Overlay:
    """Show a key overlay with optional caption."""
    text: str
    caption: str = ""
    duration: float = 2.0  # How long to show it
    
    def execute(self, demo):
        demo.show_overlay(self.text, self.caption, self.duration)


# Type alias for any step
Step = Union[Comment, Say, Type, Keys, Line, Wait, Escape, Enter, Backspace, Ctrl, Pause, IfScreen, WaitForScreen]


# === Demo Definition ===

@dataclass
class Demo:
    """
    A complete demo definition.
    
    Attributes:
        title: Window title
        setup: List of setup steps (run before recording starts)
        steps: List of main demo steps (recorded)
        speed: Speed multiplier (0.5 = slower, 2.0 = faster)
        rows: Terminal rows
        cols: Terminal columns
        click_keys: Whether to play keyboard sounds
        click_volume: Volume for key clicks (0.0 to 1.0)
        humanize: Amount of humanization for typing (0.0 = robotic, 1.0 = very human)
        mistakes: Probability of random typos (0.0 = none, 0.1 = occasional, 0.3 = frequent)
        seed: Random seed for reproducible demos (None = random each time)
        tts_enabled: Whether to enable text-to-speech
        tts_voice: OpenAI TTS voice (alloy, echo, fable, onyx, nova, shimmer)
        record_video: Whether to record demo to MP4 video
        video_fps: Video recording frames per second
        borderless: Whether to use borderless window (clean for recording)
    """
    title: str
    steps: list[Step] = field(default_factory=list)
    setup: list[Step] = field(default_factory=list)
    speed: float = 1.0
    rows: int = 24
    cols: int = 80
    click_keys: bool = True
    click_volume: float = 0.15
    humanize: float = 0.5
    mistakes: float = 0.0
    seed: int = None
    tts_enabled: bool = True
    tts_voice: str = "nova"
    record_video: bool = True
    video_fps: int = 30
    borderless: bool = True
    
    def run(self, show_viewer: bool = True) -> None:
        """Execute the demo."""
        from viewer import ScriptedDemo
        
        with ScriptedDemo(
            rows=self.rows,
            cols=self.cols,
            speed=self.speed,
            show_viewer=show_viewer,
            click_keys=self.click_keys,
            click_volume=self.click_volume,
            humanize=self.humanize,
            mistakes=self.mistakes,
            seed=self.seed,
            tts_enabled=self.tts_enabled,
            tts_voice=self.tts_voice,
            record_video=self.record_video and show_viewer,  # Create recorder but don't auto-start
            video_fps=self.video_fps,
            title=self.title,
            borderless=self.borderless,
            auto_start_recording=False,  # Don't start recording immediately
        ) as demo:
            # Run setup steps (not recorded)
            for step in self.setup:
                step.execute(demo)
            
            # Start recording for main steps
            if self.record_video and show_viewer:
                demo.start_recording()
            
            # Run main demo steps (recorded)
            for step in self.steps:
                step.execute(demo)
    
    def to_dict(self) -> dict:
        """Convert to a dictionary for serialization."""
        def step_to_dict(step):
            name = type(step).__name__.lower()
            if isinstance(step, Comment):
                return {"comment": step.text}
            elif isinstance(step, Say):
                if step.wait:
                    return {"say": step.text}
                else:
                    return {"say": step.text, "wait": False}
            elif isinstance(step, Type):
                return {"type": step.text}
            elif isinstance(step, Keys):
                return {"keys": step.keys}
            elif isinstance(step, Line):
                return {"line": step.command}
            elif isinstance(step, Wait):
                return {"wait": step.seconds}
            elif isinstance(step, Escape):
                return "escape"
            elif isinstance(step, Enter):
                return "enter"
            elif isinstance(step, Backspace):
                return {"backspace": step.count}
            elif isinstance(step, Ctrl):
                return {"ctrl": step.char}
            elif isinstance(step, Pause):
                return {"pause": step.message}
            return {}
        
        result = {
            "title": self.title,
            "speed": self.speed,
            "rows": self.rows,
            "cols": self.cols,
            "click_keys": self.click_keys,
            "click_volume": self.click_volume,
            "humanize": self.humanize,
            "mistakes": self.mistakes,
            "steps": [step_to_dict(s) for s in self.steps],
        }
        if self.seed is not None:
            result["seed"] = self.seed
        return result
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Demo':
        """Create a Demo from a dictionary."""
        steps = []
        for item in data.get("steps", []):
            if isinstance(item, str):
                # Simple string commands
                if item == "escape":
                    steps.append(Escape())
                elif item == "enter":
                    steps.append(Enter())
            elif isinstance(item, dict):
                if "comment" in item:
                    steps.append(Comment(item["comment"]))
                elif "type" in item:
                    steps.append(Type(item["type"]))
                elif "say" in item:
                    wait = item.get("wait", True)
                    steps.append(Say(item["say"], wait=wait))
                elif "keys" in item:
                    steps.append(Keys(item["keys"]))
                elif "line" in item:
                    steps.append(Line(item["line"]))
                elif "wait" in item:
                    steps.append(Wait(item["wait"]))
                elif "backspace" in item:
                    steps.append(Backspace(item["backspace"]))
                elif "ctrl" in item:
                    steps.append(Ctrl(item["ctrl"]))
                elif "pause" in item:
                    steps.append(Pause(item["pause"]))
        
        return cls(
            title=data.get("title", "Demo"),
            steps=steps,
            speed=data.get("speed", 1.0),
            rows=data.get("rows", 24),
            cols=data.get("cols", 80),
            click_keys=data.get("click_keys", True),
            click_volume=data.get("click_volume", 0.15),
            humanize=data.get("humanize", 0.5),
            mistakes=data.get("mistakes", 0.0),
            seed=data.get("seed", None),
        )
    
    def to_yaml(self) -> str:
        """Export to YAML format."""
        return yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=False)
    
    @classmethod
    def from_yaml(cls, yaml_str: str) -> 'Demo':
        """Load from YAML string."""
        return cls.from_dict(yaml.safe_load(yaml_str))
    
    def save(self, path: str) -> None:
        """Save demo to a YAML file."""
        Path(path).write_text(self.to_yaml())
    
    @classmethod
    def load(cls, path: str) -> 'Demo':
        """Load demo from a YAML file."""
        return cls.from_yaml(Path(path).read_text())


# === Example ===

# The vim demo as a data structure
vim_demo = Demo(
    title="Vim Demo - ShellPilot",
    speed=0.5,
    rows=16,
    cols=32,
    steps=[
        Comment("Shell started, launching vim..."),
        Line("vim hello.txt"),
        Wait(0.5),
        
        Comment("Entering insert mode..."),
        Keys("i"),
        Wait(0.3),
        
        Comment("Typing 'Hello, World!' with a typo..."),
        Type("Helo\blo, World!"),
        
        Comment("Adding a new line..."),
        Type("\nThis is ShellPilto\b\b\blot controlling Vim!"),
        
        Comment("Exiting insert mode..."),
        Escape(),
        Wait(0.3),
        
        Comment("Saving and quitting with :wq"),
        Type(":wq"),
        Enter(),
        Wait(0.5),
        
        Comment("Verifying file was created..."),
        Line("cat hello.txt"),
        Wait(1.0),
        
        Comment("Cleaning up..."),
        Line("rm hello.txt"),
        
        Comment("Demo complete! Window will close in 2 seconds..."),
        Wait(2.0),
    ]
)


if __name__ == "__main__":
    # Run the demo
    vim_demo.run()
    
    # Or save it to YAML and reload:
    # vim_demo.save("vim_demo.yaml")
    # loaded = Demo.load("vim_demo.yaml")
    # loaded.run()
