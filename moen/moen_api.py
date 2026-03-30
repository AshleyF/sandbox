"""
Moen Cloud API + Pusher real-time client for U by Moen Smart Shower.

Cloud API (https://www.moen-iot.com) handles auth and shower info.
Pusher websocket (client-state-desired) sends actual control commands.
"""

import json
import logging
import time
import threading
import requests
import pysher
from typing import Optional

# Suppress noisy pysher/websocket logs
logging.getLogger("pysher").setLevel(logging.CRITICAL)
logging.getLogger("pysher.connection").setLevel(logging.CRITICAL)
logging.getLogger("websocket").setLevel(logging.CRITICAL)

PUSHER_KEY = "dcc28ccb5296f18f8eae"
PUSHER_CLUSTER = "us2"


class MoenClient:
    BASE_URL = "https://www.moen-iot.com"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers["Accept"] = "application/json"
        self.token: Optional[str] = None
        self._pusher: Optional[pysher.Pusher] = None
        self._channel_name: Optional[str] = None
        self._connected = threading.Event()
        self._subscribed = threading.Event()

    def _require_auth(self):
        if not self.token:
            raise RuntimeError("Not authenticated. Call authenticate() first.")
        self.session.headers["User-Token"] = self.token

    # ── Authentication ──────────────────────────────────────────────

    def authenticate(self, email: str, password: str) -> dict:
        resp = self.session.get(
            f"{self.BASE_URL}/v2/authenticate",
            params={"email": email, "password": password},
        )
        resp.raise_for_status()
        data = resp.json()
        self.token = data.get("token")
        return data

    # ── Shower queries ──────────────────────────────────────────────

    def get_showers(self) -> list:
        self._require_auth()
        resp = self.session.get(f"{self.BASE_URL}/v2/showers")
        resp.raise_for_status()
        return resp.json()

    def get_shower_details(self, serial: str) -> dict:
        self._require_auth()
        resp = self.session.get(f"{self.BASE_URL}/v5/showers/{serial}")
        resp.raise_for_status()
        return resp.json()

    # ── Pusher connection ───────────────────────────────────────────

    def _ensure_pusher(self, serial: str):
        """Connect to Pusher and subscribe to the shower's channel."""
        if self._pusher and self._subscribed.is_set():
            return

        details = self.get_shower_details(serial)
        self._channel_name = f"private-{details['channel']}"

        # Register capability
        self.session.headers["Shower-Token"] = details["token"]
        self.session.post(
            f"{self.BASE_URL}/v2/capabilities?name=mobile_supports_pusher"
        )
        self.session.headers.pop("Shower-Token", None)

        self._connected.clear()
        self._subscribed.clear()

        self._pusher = pysher.Pusher(
            key=PUSHER_KEY,
            cluster=PUSHER_CLUSTER,
            auth_endpoint=f"{self.BASE_URL}/v3/pusher-auth",
            auth_endpoint_headers={"User-Token": self.token},
            log_level=logging.CRITICAL,
        )

        def on_connect(data):
            ch = self._pusher.subscribe(self._channel_name)
            ch.bind("pusher_internal:subscription_succeeded",
                    lambda d: self._subscribed.set())
            self._connected.set()

        self._pusher.connection.bind("pusher:connection_established", on_connect)
        self._pusher.connect()

        if not self._connected.wait(timeout=10):
            raise RuntimeError("Failed to connect to Pusher")
        if not self._subscribed.wait(timeout=10):
            raise RuntimeError("Failed to subscribe to shower channel")

    def _send_control(self, serial: str, action: str, params: dict = None):
        """Send a control command via Pusher client-state-desired event."""
        self._ensure_pusher(serial)
        data = {
            "type": "control",
            "data": {
                "action": action,
                "params": params or {},
            },
        }
        msg = json.dumps({
            "event": "client-state-desired",
            "channel": self._channel_name,
            "data": json.dumps(data),
        })
        self._pusher.connection.socket.send(msg)

    def disconnect(self):
        if self._pusher:
            try:
                self._pusher.disconnect()
            except Exception:
                pass
            self._pusher = None
            self._connected.clear()
            self._subscribed.clear()

    # ── Shower control ──────────────────────────────────────────────

    def turn_on(self, serial: str, preset: int = 0):
        """Turn the shower ON with the given preset (0 = last used)."""
        self._send_control(serial, "shower_on", {"preset": str(preset)})

    def turn_off(self, serial: str):
        """Turn the shower OFF."""
        self._send_control(serial, "shower_off")

    def set_temperature(self, serial: str, temp_f: int):
        """Set target temperature (°F)."""
        self._send_control(serial, "temperature_set",
                           {"target_temperature": temp_f})

    def set_preset(self, serial: str, preset_config: dict):
        """
        Apply a full preset configuration.
        preset_config should include keys like: active_preset, title, greeting,
        target_temperature, outlets, timer_enabled, timer_length, etc.
        """
        self._send_control(serial, "shower_set", preset_config)

    def activate_preset(self, serial: str, preset_index: int):
        """
        Turn on the shower with a specific preset by index.
        Sends shower_set (to select the preset) then shower_on (to start).
        """
        details = self.get_shower_details(serial)
        presets = details.get("presets", [])
        preset = None
        for p in presets:
            if p.get("position") == preset_index:
                preset = p
                break
        if not preset:
            raise ValueError(f"Preset {preset_index} not found")

        config = {
            "active_preset": preset_index,
            "title": preset.get("title", ""),
            "greeting": preset.get("greeting", ""),
            "target_temperature": preset.get("target_temperature", 100),
            "ready_pauses_water": preset.get("ready_pauses_water", False),
            "ready_pushes_notification": preset.get("ready_pushes_notification", False),
            "ready_sounds_alert": preset.get("ready_sounds_alert", False),
            "timer_enabled": preset.get("timer_enabled", False),
            "timer_length": preset.get("timer_length", 600),
            "timer_ends_shower": preset.get("timer_ends_shower", False),
            "timer_sounds_alert": preset.get("timer_sounds_alert", True),
            "outlets": preset.get("outlets", []),
        }
        self._send_control(serial, "shower_set", config)
        time.sleep(0.5)
        self._send_control(serial, "shower_on", {"preset": str(preset_index)})

