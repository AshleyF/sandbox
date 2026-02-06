"""
Text-to-Speech module using OpenAI's TTS API.

Features:
- High quality voices (alloy, echo, fable, onyx, nova, shimmer)
- Caches generated audio to avoid redundant API calls
- Plays audio using pygame
"""

import hashlib
import os
from pathlib import Path
from typing import Optional

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

# Hide pygame welcome message
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = 'hide'

# Cache directory for generated audio
CACHE_DIR = Path(__file__).parent / ".tts_cache"


def get_cache_path(text: str, voice: str, model: str) -> Path:
    """Generate a cache file path based on text and voice settings."""
    # Create hash of text + settings for unique filename
    content = f"{text}|{voice}|{model}"
    hash_value = hashlib.md5(content.encode()).hexdigest()[:16]
    return CACHE_DIR / f"{hash_value}.mp3"

def generate_speech(
    text: str,
    voice: str = "nova",
    model: str = "tts-1",
    api_key: Optional[str] = None,
) -> Path:
    """
    Generate speech audio from text using OpenAI's TTS API.
    
    Args:
        text: The text to speak
        voice: Voice to use (alloy, echo, fable, onyx, nova, shimmer)
        model: TTS model (tts-1 for speed, tts-1-hd for quality)
        api_key: OpenAI API key (or set OPENAI_API_KEY env var)
    
    Returns:
        Path to the generated audio file
    """
    # Check cache first
    cache_path = get_cache_path(text, voice, model)
    if cache_path.exists():
        return cache_path
    
    # Get API key
    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError(
            "OpenAI API key required. Set OPENAI_API_KEY environment variable "
            "or pass api_key parameter."
        )
    
    # Create cache directory
    CACHE_DIR.mkdir(exist_ok=True)
    
    # Call OpenAI TTS API
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        response = client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
        )
        
        # Save to cache
        response.stream_to_file(str(cache_path))
        return cache_path
        
    except ImportError:
        raise ImportError(
            "OpenAI library required. Install with: pip install openai"
        )


def play_audio(audio_path: Path, wait: bool = True) -> None:
    """
    Play an audio file using pygame.
    
    Args:
        audio_path: Path to the audio file
        wait: If True, block until audio finishes playing
    """
    try:
        import pygame
        import numpy as np
        
        if not pygame.mixer.get_init():
            pygame.mixer.init(frequency=44100, size=-16, channels=2)
        
        sound = pygame.mixer.Sound(str(audio_path))
        sound.play()
        
        # Send audio to video recorder
        try:
            from recorder import get_active_recorder
            recorder = get_active_recorder()
            if recorder:
                arr = pygame.sndarray.array(sound)
                arr_float = arr.astype(np.float32) / 32768.0
                recorder.add_audio(arr_float, sample_rate=44100)
        except Exception:
            pass
        
        if wait:
            import time
            # Wait for sound to finish (with small buffer)
            duration = sound.get_length()
            time.sleep(duration + 0.1)
            
    except ImportError:
        print(f"[TTS] pygame not available, cannot play audio: {audio_path}")


class TextToSpeech:
    """
    Text-to-speech engine using OpenAI's API with caching.
    
    Usage:
        tts = TextToSpeech(voice="nova")
        tts.say("Hello, world!")
    """
    
    def __init__(
        self,
        voice: str = "nova",
        model: str = "tts-1",
        api_key: Optional[str] = None,
        enabled: bool = True,
    ):
        """
        Initialize TTS engine.
        
        Args:
            voice: Voice to use (alloy, echo, fable, onyx, nova, shimmer)
            model: TTS model (tts-1 for speed, tts-1-hd for quality)
            api_key: OpenAI API key (or set OPENAI_API_KEY env var)
            enabled: If False, TTS is disabled (just prints text)
        """
        self.voice = voice
        self.model = model
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.enabled = enabled
    
    def say(self, text: str, wait: bool = True) -> None:
        """
        Speak text aloud.
        
        Args:
            text: The text to speak
            wait: If True, wait for speech to complete before returning
        """
        if not self.enabled:
            return
        
        if not self.api_key:
            print("[TTS] No API key - speech disabled")
            return
        
        try:
            audio_path = generate_speech(
                text=text,
                voice=self.voice,
                model=self.model,
                api_key=self.api_key,
            )
            play_audio(audio_path, wait=wait)
        except Exception as e:
            print(f"[TTS] Error: {e}")
    
    def pregenerate(self, texts: list[str]) -> None:
        """
        Pre-generate audio for a list of texts (useful for demos).
        This caches all the audio upfront so playback is instant.
        """
        if not self.enabled or not self.api_key:
            return
        
        for text in texts:
            cache_path = get_cache_path(text, self.voice, self.model)
            if not cache_path.exists():
                print(f"[TTS] Generating: {text[:50]}...")
                try:
                    generate_speech(
                        text=text,
                        voice=self.voice,
                        model=self.model,
                        api_key=self.api_key,
                    )
                except Exception as e:
                    print(f"[TTS] Error generating '{text[:30]}...': {e}")
    
    def clear_cache(self) -> None:
        """Clear all cached audio files."""
        if CACHE_DIR.exists():
            for f in CACHE_DIR.glob("*.mp3"):
                f.unlink()
            print(f"[TTS] Cache cleared")


# Available voices
VOICES = {
    "alloy": "Neutral, balanced",
    "echo": "Warm, conversational", 
    "fable": "Expressive, British",
    "onyx": "Deep, authoritative",
    "nova": "Friendly, upbeat",
    "shimmer": "Clear, pleasant",
}


# Example usage
if __name__ == "__main__":
    print("OpenAI TTS Test")
    print("=" * 40)
    print(f"Available voices: {', '.join(VOICES.keys())}")
    print()
    
    # Check for API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY environment variable to test.")
        print("Example: $env:OPENAI_API_KEY = 'sk-...'")
    else:
        tts = TextToSpeech(voice="nova")
        tts.say("Hello! This is a test of the text to speech system.")
        tts.say("The audio is cached, so this should be instant if played again.")
