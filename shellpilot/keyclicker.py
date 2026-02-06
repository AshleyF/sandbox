"""
KeyClicker - Play keyboard click sounds

Adapted from keyclicker project for ShellPilot integration.
Plays mechanical keyboard sounds when keys are "typed".
Also captures audio data for video recording.
"""

import os
from pathlib import Path
from typing import Optional

import numpy as np

# Hide pygame welcome message
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = 'hide'

# Lazy import pygame - only when sounds are actually used
_pygame_initialized = False
_sounds: dict = {}
_sound_arrays: dict = {}  # Raw audio data for recording


def _init_pygame():
    """Initialize pygame mixer on first use."""
    global _pygame_initialized, _sounds, _sound_arrays
    
    if _pygame_initialized:
        return
    
    try:
        import pygame
        pygame.mixer.init(frequency=44100, size=-16, channels=2)
        _pygame_initialized = True
        
        # Load sounds from the sounds directory
        sounds_dir = Path(__file__).parent / "sounds"
        if sounds_dir.exists():
            for mp3_file in sounds_dir.glob("*.mp3"):
                key_name = mp3_file.stem.upper()
                try:
                    sound = pygame.mixer.Sound(str(mp3_file))
                    sound.set_volume(0.15)
                    _sounds[key_name] = sound
                    
                    # Also load the raw audio data for recording
                    _load_sound_array(key_name, mp3_file)
                except Exception:
                    pass
    except ImportError:
        print("Warning: pygame not installed. Key sounds disabled.")
        print("Install with: pip install pygame")


def _load_sound_array(key_name: str, path: Path) -> None:
    """Load sound file as numpy array for recording."""
    global _sound_arrays
    try:
        # Use pygame's sndarray to get the audio data
        import pygame
        sound = pygame.mixer.Sound(str(path))
        arr = pygame.sndarray.array(sound)
        _sound_arrays[key_name] = arr.astype(np.float32) / 32768.0
    except Exception:
        pass


def _send_to_recorder(key: str, volume: float) -> None:
    """Send audio data to the active video recorder."""
    try:
        from recorder import get_active_recorder
        recorder = get_active_recorder()
        if recorder is None:
            return
        
        key_upper = key.upper()
        
        # Find the audio array
        if key_upper in _sound_arrays:
            arr = _sound_arrays[key_upper]
        elif key in ('\r', '\n'):
            arr = _sound_arrays.get('ENTER')
        elif key == ' ':
            arr = _sound_arrays.get('SPACE')
        elif key == '\x7f' or key == '\x08':
            arr = _sound_arrays.get('BACKSPACE')
        elif key == '\x1b':
            arr = _sound_arrays.get('SPACE')
        else:
            arr = _sound_arrays.get('SPACE')
        
        if arr is not None:
            # Apply volume - full volume for recording (playback is controlled by pygame)
            # The original sounds are normalized to -1.0 to 1.0
            recorder.add_audio(arr, sample_rate=44100)
        else:
            pass  # No audio array for this key
    except Exception:
        pass  # Silently fail if recorder not available


def play_key_sound(key: str, volume: float = 0.15) -> None:
    """
    Play the sound for a specific key.
    
    Args:
        key: The key character (e.g., 'A', 'ENTER', 'SPACE')
        volume: Volume level 0.0 to 1.0
    """
    _init_pygame()
    
    if not _sounds:
        return
    
    key_upper = key.upper()
    
    # Map special characters to sound names
    if key_upper in _sounds:
        sound = _sounds[key_upper]
    elif key in ('\r', '\n'):
        sound = _sounds.get('ENTER')
    elif key == ' ':
        sound = _sounds.get('SPACE')
    elif key == '\x7f' or key == '\x08':  # Backspace
        sound = _sounds.get('BACKSPACE')
    elif key == '\x1b':  # Escape - use a generic click
        sound = _sounds.get('SPACE')
    else:
        # Default to space sound for unknown keys
        sound = _sounds.get('SPACE')
    
    if sound:
        sound.set_volume(volume)
        sound.play()
        # Also send to video recorder
        _send_to_recorder(key, volume)


def play_text_sounds(text: str, volume: float = 0.15, delay: float = 0.0) -> None:
    """
    Play sounds for a sequence of characters.
    
    Args:
        text: The text to "click" through
        volume: Volume level 0.0 to 1.0
        delay: Delay between sounds (0 = no delay, sounds may overlap)
    """
    import time
    
    for char in text:
        play_key_sound(char, volume)
        if delay > 0:
            time.sleep(delay)


class KeyClicker:
    """
    Context manager for adding key click sounds to shell operations.
    
    Usage:
        clicker = KeyClicker(volume=0.2)
        clicker.click("Hello")  # Play clicks for each character
        clicker.click_key("ENTER")  # Single key sound
    """
    
    def __init__(self, volume: float = 0.15, enabled: bool = True):
        self.volume = volume
        self.enabled = enabled
        _init_pygame()
    
    def click(self, text: str, delay: float = 0.0) -> None:
        """Play click sounds for text."""
        if self.enabled:
            play_text_sounds(text, self.volume, delay)
    
    def click_key(self, key: str) -> None:
        """Play sound for a single key."""
        if self.enabled:
            play_key_sound(key, self.volume)
    
    def set_volume(self, volume: float) -> None:
        """Set volume (0.0 to 1.0)."""
        self.volume = max(0.0, min(1.0, volume))
    
    def set_enabled(self, enabled: bool) -> None:
        """Enable or disable sounds."""
        self.enabled = enabled


# Global clicker instance for convenience
_default_clicker: Optional[KeyClicker] = None


def get_clicker() -> KeyClicker:
    """Get the default KeyClicker instance."""
    global _default_clicker
    if _default_clicker is None:
        _default_clicker = KeyClicker()
    return _default_clicker


# Example usage
if __name__ == "__main__":
    import time
    
    print("Testing key clicker sounds...")
    
    clicker = KeyClicker(volume=0.2)
    
    # Type out a message with delays
    message = "Hello, World!"
    print(f"Playing: {message}")
    for char in message:
        clicker.click_key(char)
        time.sleep(0.1)
    
    time.sleep(0.3)
    clicker.click_key("ENTER")
    
    print("Done!")
    time.sleep(0.5)
