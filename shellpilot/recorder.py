"""
Video recording module for ShellPilot demos.

Captures the terminal viewer window and saves to MP4 video files.
Uses PIL for frame capture and imageio for video encoding.
Includes audio recording for keyboard clicks and TTS.
"""

import ctypes
import re
import threading
import time
import wave
from pathlib import Path
from typing import Optional, List, Tuple

import numpy as np
from PIL import ImageGrab

# Enable DPI awareness on Windows for correct screen capture
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # Per-monitor DPI aware
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

# Video output directory
VIDEOS_DIR = Path(__file__).parent / "videos"


def sanitize_filename(title: str) -> str:
    """Convert a title to a safe filename."""
    # Replace spaces with underscores, remove special characters
    safe = re.sub(r'[^\w\s-]', '', title)
    safe = re.sub(r'[-\s]+', '_', safe)
    return safe.lower().strip('_')


class AudioTrack:
    """
    Collects audio events during recording and renders to a WAV file.
    """
    
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self._events: List[Tuple[float, np.ndarray]] = []  # (timestamp, audio_data)
        self._start_time: float = 0
        self._lock = threading.Lock()
    
    def start(self) -> None:
        """Start the audio track."""
        self._start_time = time.time()
        self._events = []
    
    def add_audio(self, audio_data: np.ndarray, sample_rate: int = None) -> None:
        """
        Add audio data at the current timestamp.
        
        Args:
            audio_data: Numpy array of audio samples (mono or stereo)
            sample_rate: Sample rate of the audio (will resample if different)
        """
        timestamp = time.time() - self._start_time
        
        # Resample if needed
        if sample_rate and sample_rate != self.sample_rate:
            # Simple resampling (not high quality, but functional)
            ratio = self.sample_rate / sample_rate
            if len(audio_data.shape) == 1:
                new_length = int(len(audio_data) * ratio)
                indices = np.linspace(0, len(audio_data) - 1, new_length).astype(int)
                audio_data = audio_data[indices]
            else:
                new_length = int(audio_data.shape[0] * ratio)
                indices = np.linspace(0, audio_data.shape[0] - 1, new_length).astype(int)
                audio_data = audio_data[indices]
        
        with self._lock:
            self._events.append((timestamp, audio_data.copy()))
    
    def render(self, duration: float) -> np.ndarray:
        """
        Render all audio events into a single audio track.
        
        Args:
            duration: Total duration in seconds
            
        Returns:
            Stereo audio data as numpy array
        """
        # Create empty stereo track
        total_samples = int(duration * self.sample_rate)
        output = np.zeros((total_samples, 2), dtype=np.float32)
        
        with self._lock:
            for timestamp, audio_data in self._events:
                start_sample = int(timestamp * self.sample_rate)
                
                # Handle mono vs stereo
                if len(audio_data.shape) == 1:
                    # Mono - duplicate to stereo
                    stereo = np.column_stack([audio_data, audio_data])
                else:
                    stereo = audio_data
                
                # Ensure float32
                if stereo.dtype != np.float32:
                    if stereo.dtype == np.int16:
                        stereo = stereo.astype(np.float32) / 32768.0
                    elif stereo.dtype == np.int32:
                        stereo = stereo.astype(np.float32) / 2147483648.0
                    else:
                        stereo = stereo.astype(np.float32)
                
                # Mix into output
                end_sample = min(start_sample + len(stereo), total_samples)
                samples_to_copy = end_sample - start_sample
                if samples_to_copy > 0 and start_sample >= 0:
                    output[start_sample:end_sample] += stereo[:samples_to_copy]
        
        # Clip to prevent distortion
        output = np.clip(output, -1.0, 1.0)
        return output
    
    def save_wav(self, path: Path, duration: float) -> None:
        """Save the audio track to a WAV file."""
        audio = self.render(duration)
        
        # Convert to int16
        audio_int16 = (audio * 32767).astype(np.int16)
        
        with wave.open(str(path), 'wb') as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            wf.writeframes(audio_int16.tobytes())


class VideoRecorder:
    """
    Records a tkinter window to an MP4 video file with audio.
    
    Usage:
        recorder = VideoRecorder("My Demo", fps=30)
        recorder.start(window)  # tkinter Tk instance
        # ... do stuff ...
        recorder.stop()
    """
    
    def __init__(
        self,
        title: str,
        fps: int = 30,
        output_dir: Path = None,
    ):
        """
        Initialize the video recorder.
        
        Args:
            title: Video title (used for filename)
            fps: Frames per second
            output_dir: Directory to save videos (default: videos/)
        """
        self.title = title
        self.fps = fps
        self.output_dir = output_dir or VIDEOS_DIR
        
        self._widget = None  # The widget to capture (not the root window)
        self._writer = None
        self._recording = False
        self._record_thread: Optional[threading.Thread] = None
        self._frame_interval = 1.0 / fps
        self._start_time: float = 0
        
        # Audio tracking
        self.audio_track = AudioTrack()
        
        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    @property
    def output_path(self) -> Path:
        """Get the output video file path."""
        filename = sanitize_filename(self.title) + ".mp4"
        return self.output_dir / filename
    
    @property
    def _temp_video_path(self) -> Path:
        """Temporary video file (without audio)."""
        return self.output_dir / f"_temp_{sanitize_filename(self.title)}.mp4"
    
    @property
    def _temp_audio_path(self) -> Path:
        """Temporary audio file."""
        return self.output_dir / f"_temp_{sanitize_filename(self.title)}.wav"
    
    def add_audio(self, audio_data: np.ndarray, sample_rate: int = 44100) -> None:
        """Add audio data to the recording at the current timestamp."""
        if self._recording:
            self.audio_track.add_audio(audio_data, sample_rate)
    
    def start(self, widget) -> None:
        """
        Start recording the widget.
        
        Args:
            widget: tkinter widget to capture (e.g., Frame, Text, or root)
        """
        import imageio
        
        self._widget = widget
        self._start_time = time.time()
        
        # Delete existing files
        for path in [self.output_path, self._temp_video_path, self._temp_audio_path]:
            if path.exists():
                path.unlink()
        
        # Create video writer (to temp file first)
        self._writer = imageio.get_writer(
            str(self._temp_video_path),
            fps=self.fps,
            codec='libx264',
            quality=8,
            pixelformat='yuv420p',
        )
        
        # Start audio track
        self.audio_track.start()
        
        self._recording = True
        self._record_thread = threading.Thread(target=self._record_loop, daemon=True)
        self._record_thread.start()
        
        print(f"[VIDEO] Recording started: {self.output_path}")
    
    def stop(self) -> None:
        """Stop recording and finalize the video with audio."""
        if not self._recording:
            return
        
        self._recording = False
        duration = time.time() - self._start_time
        
        # Wait for recording thread to finish - give it enough time
        if self._record_thread:
            self._record_thread.join(timeout=5.0)
        
        # Close the video writer properly
        if self._writer:
            try:
                self._writer.close()
            except Exception as e:
                print(f"[VIDEO] Error closing writer: {e}")
            self._writer = None
        
        # Save audio
        self.audio_track.save_wav(self._temp_audio_path, duration)
        
        # Mux video and audio together
        self._mux_audio_video()
        
        # Clean up temp files
        for path in [self._temp_video_path, self._temp_audio_path]:
            if path.exists():
                try:
                    path.unlink()
                except:
                    pass
        
        print(f"[VIDEO] Recording saved: {self.output_path}")
    
    def _mux_audio_video(self) -> None:
        """Combine video and audio into final output."""
        try:
            import subprocess
            import imageio_ffmpeg
            
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            
            cmd = [
                ffmpeg_path,
                '-y',  # Overwrite output
                '-i', str(self._temp_video_path),
                '-i', str(self._temp_audio_path),
                '-c:v', 'copy',  # Copy video stream
                '-c:a', 'aac',   # Encode audio as AAC
                '-b:a', '192k',  # Audio bitrate
                '-shortest',     # Match shortest stream
                str(self.output_path)
            ]
            
            subprocess.run(cmd, capture_output=True, check=True)
        except Exception as e:
            print(f"[VIDEO] Warning: Could not add audio: {e}")
            # Try to get more details
            try:
                result = subprocess.run(cmd, capture_output=True, text=True)
                print(f"[VIDEO] FFmpeg stderr: {result.stderr[:500] if result.stderr else 'none'}")
            except:
                pass
            # Fall back to video without audio
            import shutil
            shutil.move(str(self._temp_video_path), str(self.output_path))
    
    def _capture_frame(self) -> Optional[np.ndarray]:
        """Capture the current widget as a numpy array."""
        if not self._widget:
            return None
        
        try:
            # Force update to ensure widget is rendered
            self._widget.update_idletasks()
            
            # Get widget position and size on screen
            x = self._widget.winfo_rootx()
            y = self._widget.winfo_rooty()
            width = self._widget.winfo_width()
            height = self._widget.winfo_height()
            
            # Debug: print dimensions on first frame
            if not hasattr(self, '_first_frame_logged'):
                print(f"[VIDEO] Capturing: x={x}, y={y}, w={width}, h={height}")
                self._first_frame_logged = True
            
            # Ensure we have valid dimensions
            if width <= 0 or height <= 0:
                return None
            
            # Capture the screen region
            # Use all_screens=True for multi-monitor support
            bbox = (x, y, x + width, y + height)
            screenshot = ImageGrab.grab(bbox, all_screens=True)
            
            # Convert to numpy array (RGB)
            frame = np.array(screenshot)
            
            # Ensure dimensions are even (required for most video codecs)
            h, w = frame.shape[:2]
            if h % 2 == 1:
                frame = frame[:-1, :, :]
            if w % 2 == 1:
                frame = frame[:, :-1, :]
            
            return frame
        except Exception as e:
            print(f"[VIDEO] Capture error: {e}")
            return None
    
    def _record_loop(self) -> None:
        """Main recording loop - captures frames at the specified FPS."""
        # Wait a moment for window to be fully rendered
        time.sleep(0.5)
        
        # Track frames written to maintain real-time sync
        frames_written = 0
        last_frame = None
        
        while self._recording:
            # Calculate how many frames should have been written by now
            elapsed = time.time() - self._start_time
            expected_frames = int(elapsed * self.fps)
            
            # Capture new frame
            frame = self._capture_frame()
            if frame is not None:
                last_frame = frame
            
            # Write frames to catch up to real time
            if last_frame is not None and self._writer:
                while frames_written < expected_frames:
                    try:
                        self._writer.append_data(last_frame)
                        frames_written += 1
                    except Exception:
                        break
            
            # Sleep a bit before next capture
            time.sleep(self._frame_interval * 0.5)


# Global recorder reference for audio integration
_active_recorder: Optional[VideoRecorder] = None


def set_active_recorder(recorder: Optional[VideoRecorder]) -> None:
    """Set the active recorder for audio capture."""
    global _active_recorder
    _active_recorder = recorder


def get_active_recorder() -> Optional[VideoRecorder]:
    """Get the active recorder."""
    return _active_recorder


# Simple test
if __name__ == "__main__":
    import tkinter as tk
    
    print("Testing video recorder...")
    
    # Create a simple test window
    root = tk.Tk()
    root.title("Test Window")
    root.geometry("400x300")
    
    label = tk.Label(root, text="Recording test...", font=("Arial", 24))
    label.pack(expand=True)
    
    # Start recording
    recorder = VideoRecorder("test_recording", fps=30)
    
    def start_recording():
        recorder.start(root)
        # Change text every second
        count = [0]
        def update():
            count[0] += 1
            label.config(text=f"Frame {count[0]}")
            if count[0] < 90:  # 3 seconds at 30fps
                root.after(33, update)
            else:
                recorder.stop()
                root.quit()
        update()
    
    root.after(100, start_recording)
    root.mainloop()
    
    print(f"Video saved to: {recorder.output_path}")
