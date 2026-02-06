"""
ShellPilot Demo Recorder

Records shell sessions with timing information for playback.
Useful for creating demonstrations and tutorials.

Features:
- Record commands and their timing
- Capture screen state at each step
- Export to JSON for later playback
- Human-readable script format
"""

import json
import time
from dataclasses import dataclass, asdict
from typing import Optional
from pathlib import Path


@dataclass
class DemoStep:
    """A single step in a demonstration."""
    timestamp: float  # Time since start
    action: str       # "send_keys", "send_line", "wait", "comment"
    content: str      # The keys/command/wait pattern/comment text
    screen_before: Optional[str] = None  # Screen state before action
    screen_after: Optional[str] = None   # Screen state after action
    delay_after: float = 0.5  # Delay before next step for playback


@dataclass  
class Demo:
    """A recorded demonstration."""
    title: str
    description: str
    steps: list[DemoStep]
    created_at: str
    shell_type: str = "bash"
    
    def to_json(self) -> str:
        """Export to JSON."""
        return json.dumps(asdict(self), indent=2)
    
    def save(self, path: str) -> None:
        """Save to a JSON file."""
        Path(path).write_text(self.to_json())
    
    @classmethod
    def load(cls, path: str) -> 'Demo':
        """Load from a JSON file."""
        data = json.loads(Path(path).read_text())
        data['steps'] = [DemoStep(**s) for s in data['steps']]
        return cls(**data)


class DemoRecorder:
    """
    Records shell interactions for later playback.
    
    Usage:
        recorder = DemoRecorder(shell_pilot)
        recorder.start_recording("My Demo", "Shows how to do X")
        
        recorder.comment("First, let's check the directory")
        recorder.send_line("pwd")
        
        recorder.comment("Now list the files")  
        recorder.send_line("ls -la")
        
        demo = recorder.stop_recording()
        demo.save("my_demo.json")
    """
    
    def __init__(self, pilot):
        """
        Initialize with a shell pilot (PTY, tmux, or pexpect).
        The pilot must have send_line() and get_screen_text() methods.
        """
        self.pilot = pilot
        self.recording = False
        self.start_time: float = 0
        self.steps: list[DemoStep] = []
        self.title: str = ""
        self.description: str = ""
        
    def start_recording(self, title: str, description: str = "") -> None:
        """Start recording a new demo."""
        self.recording = True
        self.start_time = time.time()
        self.steps = []
        self.title = title
        self.description = description
        
    def stop_recording(self) -> Demo:
        """Stop recording and return the demo."""
        self.recording = False
        from datetime import datetime
        return Demo(
            title=self.title,
            description=self.description,
            steps=self.steps,
            created_at=datetime.now().isoformat(),
        )
    
    def _get_timestamp(self) -> float:
        return time.time() - self.start_time
    
    def _capture_screen(self) -> str:
        if hasattr(self.pilot, 'get_screen_text'):
            return self.pilot.get_screen_text()
        return ""
    
    def send_line(self, command: str, delay_after: float = 0.5) -> None:
        """Record sending a command."""
        if not self.recording:
            return
            
        screen_before = self._capture_screen()
        self.pilot.send_line(command)
        time.sleep(delay_after)  # Wait for command to complete
        screen_after = self._capture_screen()
        
        self.steps.append(DemoStep(
            timestamp=self._get_timestamp(),
            action="send_line",
            content=command,
            screen_before=screen_before,
            screen_after=screen_after,
            delay_after=delay_after,
        ))
    
    def send_keys(self, keys: str, delay_after: float = 0.3) -> None:
        """Record sending keystrokes."""
        if not self.recording:
            return
            
        screen_before = self._capture_screen()
        self.pilot.send_keys(keys)
        time.sleep(delay_after)
        screen_after = self._capture_screen()
        
        self.steps.append(DemoStep(
            timestamp=self._get_timestamp(),
            action="send_keys", 
            content=repr(keys),  # Show escape sequences
            screen_before=screen_before,
            screen_after=screen_after,
            delay_after=delay_after,
        ))
    
    def comment(self, text: str) -> None:
        """Add a comment/annotation to the demo."""
        if not self.recording:
            return
            
        self.steps.append(DemoStep(
            timestamp=self._get_timestamp(),
            action="comment",
            content=text,
            screen_before=self._capture_screen(),
        ))
    
    def wait(self, seconds: float) -> None:
        """Add a pause in the demo."""
        if not self.recording:
            return
            
        time.sleep(seconds)
        self.steps.append(DemoStep(
            timestamp=self._get_timestamp(),
            action="wait",
            content=str(seconds),
        ))


class DemoPlayer:
    """
    Plays back a recorded demonstration.
    
    Can play to:
    - A real shell (for live demos)
    - Console output (for reviewing)
    - A virtual display (for rendering to video/gif)
    """
    
    def __init__(self, pilot=None):
        self.pilot = pilot
        
    def play_to_console(self, demo: Demo, speed: float = 1.0) -> None:
        """
        Play demo to console output.
        Shows commands and screen states.
        """
        print(f"\n{'='*60}")
        print(f"Demo: {demo.title}")
        print(f"Description: {demo.description}")
        print(f"{'='*60}\n")
        
        for step in demo.steps:
            if step.action == "comment":
                print(f"\n# {step.content}")
            elif step.action == "send_line":
                print(f"\n$ {step.content}")
                if step.screen_after:
                    # Show relevant part of screen (last few lines)
                    lines = step.screen_after.strip().split('\n')
                    for line in lines[-10:]:
                        print(f"  {line}")
            elif step.action == "send_keys":
                print(f"\n[keys: {step.content}]")
            elif step.action == "wait":
                print(f"\n[wait {step.content}s]")
            
            time.sleep(step.delay_after / speed)
        
        print(f"\n{'='*60}")
        print("Demo complete!")
        print(f"{'='*60}\n")
    
    def play_to_shell(self, demo: Demo, speed: float = 1.0) -> None:
        """
        Play demo to a real shell.
        Executes the commands in the pilot.
        """
        if not self.pilot:
            raise ValueError("No pilot configured for playback")
            
        for step in demo.steps:
            if step.action == "send_line":
                self.pilot.send_line(step.content)
            elif step.action == "send_keys":
                # Need to eval the repr'd string
                keys = eval(step.content)
                self.pilot.send_keys(keys)
            elif step.action == "wait":
                time.sleep(float(step.content))
            
            time.sleep(step.delay_after / speed)


# Example usage
if __name__ == "__main__":
    # Create a simple demo manually (without a real shell)
    demo = Demo(
        title="Basic Shell Navigation",
        description="Shows how to navigate directories in bash",
        steps=[
            DemoStep(0.0, "comment", "First, let's see where we are"),
            DemoStep(0.1, "send_line", "pwd", delay_after=0.5),
            DemoStep(1.0, "comment", "Now let's list files"),
            DemoStep(1.1, "send_line", "ls -la", delay_after=0.5),
            DemoStep(2.0, "comment", "Change to home directory"),
            DemoStep(2.1, "send_line", "cd ~", delay_after=0.5),
            DemoStep(3.0, "send_line", "pwd", delay_after=0.5),
        ],
        created_at="2024-01-01T00:00:00",
    )
    
    # Save and reload
    demo.save("example_demo.json")
    loaded = Demo.load("example_demo.json")
    
    # Play to console
    player = DemoPlayer()
    player.play_to_console(loaded, speed=2.0)
