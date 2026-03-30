#!/usr/bin/env python3
"""
U by Moen Smart Shower — CLI controller.

Requires environment variables:
  MOEN_EMAIL       Your Moen account email
  MOEN_PASSWORD    Your Moen account password

Usage:
  python shower.py list
  python shower.py status  [--serial SERIAL]
  python shower.py on      [--serial SERIAL] [--preset N]
  python shower.py off     [--serial SERIAL]
  python shower.py temp    VALUE [--serial SERIAL]
  python shower.py preset  N [--serial SERIAL]

The serial number of your first shower is auto-detected and cached
in config.json so you don't have to pass --serial every time.
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from moen_api import MoenClient

logging.basicConfig(level=logging.WARNING)
logging.getLogger("pysher").setLevel(logging.CRITICAL)
logging.getLogger("pysher.connection").setLevel(logging.CRITICAL)
logging.getLogger("websocket").setLevel(logging.CRITICAL)
CONFIG_PATH = Path(__file__).parent / "config.json"


# ── helpers ─────────────────────────────────────────────────────────

def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}


def save_config(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


def get_client() -> MoenClient:
    # Check process env first, then fall back to persistent user-level vars (Windows)
    email = os.environ.get("MOEN_EMAIL")
    password = os.environ.get("MOEN_PASSWORD")
    if not email and sys.platform == "win32":
        import subprocess
        email = subprocess.run(
            ["powershell", "-Command",
             '[Environment]::GetEnvironmentVariable("MOEN_EMAIL","User")'],
            capture_output=True, text=True).stdout.strip() or None
    if not password and sys.platform == "win32":
        import subprocess
        password = subprocess.run(
            ["powershell", "-Command",
             '[Environment]::GetEnvironmentVariable("MOEN_PASSWORD","User")'],
            capture_output=True, text=True).stdout.strip() or None
    if not email or not password:
        print("Missing environment variables.")
        print("Please set both MOEN_EMAIL and MOEN_PASSWORD:")
        print()
        print("  PowerShell:")
        print('    $env:MOEN_EMAIL = "you@example.com"')
        print('    $env:MOEN_PASSWORD = "yourpassword"')
        print()
        print("  To persist across sessions:")
        print('    [Environment]::SetEnvironmentVariable("MOEN_EMAIL", "you@example.com", "User")')
        print('    [Environment]::SetEnvironmentVariable("MOEN_PASSWORD", "yourpassword", "User")')
        sys.exit(1)
    client = MoenClient()
    client.authenticate(email, password)
    return client


def resolve_serial(client: MoenClient, cfg: dict, args) -> str:
    serial = getattr(args, "serial", None) or cfg.get("serial")
    if serial:
        return serial
    showers = client.get_showers()
    if not showers:
        print("No showers found on your account.")
        sys.exit(1)
    serial = showers[0].get("serial_number") or showers[0].get("serial")
    if serial:
        cfg["serial"] = serial
        save_config(cfg)
        print(f"Auto-selected shower: {serial}")
    return serial


# ── commands ────────────────────────────────────────────────────────

def cmd_list(args):
    cfg = load_config()
    client = get_client()
    showers = client.get_showers()
    if not showers:
        print("No showers found.")
        return
    for i, s in enumerate(showers):
        serial = s.get("serial_number") or s.get("serial", "?")
        name = s.get("name", "Unnamed")
        print(f"  [{i}] {name}  (serial: {serial})")


def cmd_status(args):
    cfg = load_config()
    client = get_client()
    serial = resolve_serial(client, cfg, args)
    details = client.get_shower_details(serial)

    print(f"\n  Shower: {details.get('name', '?')}")
    print(f"  Serial: {details.get('serial_number', serial)}")
    print(f"  Mode:   {details.get('mode', '?')}")
    print(f"  Temp:   {details.get('current_temperature', '?')}°F "
          f"(target {details.get('target_temperature', '?')}°F)")
    print(f"  Preset: {details.get('active_preset', '?')} "
          f"— \"{details.get('preset_title', '')}\"")
    print(f"  Timer:  {'ON' if details.get('timer_enabled') else 'OFF'} "
          f"({details.get('timer_length', 0)}s)")
    print(f"  Firmware: {details.get('current_firmware_version', '?')}")

    presets = details.get("presets", [])
    if presets:
        print("\n  Presets:")
        for p in presets:
            outlets = p.get("outlets", [])
            active_outlets = [o["position"] for o in outlets if o.get("active")]
            print(f"    [{p['position']}] \"{p.get('title', '?')}\" "
                  f"— {p.get('target_temperature', '?')}°F  "
                  f"outlets={active_outlets}")

    outlets = details.get("outlets", [])
    if outlets:
        print("\n  Outlets:")
        for o in outlets:
            state = "ON" if o.get("active") else "OFF"
            print(f"    [{o['position']}] {state}")
    print()


def cmd_on(args):
    cfg = load_config()
    client = get_client()
    serial = resolve_serial(client, cfg, args)
    preset = args.preset if args.preset is not None else 0
    if preset > 0:
        client.activate_preset(serial, preset)
    else:
        client.turn_on(serial, preset=preset)
    print(f"✓ Shower ON (preset {preset})")
    client.disconnect()


def cmd_off(args):
    cfg = load_config()
    client = get_client()
    serial = resolve_serial(client, cfg, args)
    client.turn_off(serial)
    print("✓ Shower OFF")
    client.disconnect()


def cmd_temp(args):
    cfg = load_config()
    client = get_client()
    serial = resolve_serial(client, cfg, args)
    client.set_temperature(serial, args.value)
    print(f"✓ Target temperature set to {args.value}°F")
    client.disconnect()


def cmd_preset(args):
    cfg = load_config()
    client = get_client()
    serial = resolve_serial(client, cfg, args)
    client.activate_preset(serial, args.n)
    print(f"✓ Activated preset {args.n}")
    client.disconnect()


# ── main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="U by Moen Smart Shower controller",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("list",  help="List showers on your account")

    p = sub.add_parser("status", help="Show shower status")
    p.add_argument("--serial", help="Shower serial number")

    p = sub.add_parser("on", help="Turn shower on")
    p.add_argument("--serial", help="Shower serial number")
    p.add_argument("--preset", type=int, default=None,
                   help="Preset index (1=first preset, 0=last used)")

    p = sub.add_parser("off", help="Turn shower off")
    p.add_argument("--serial", help="Shower serial number")

    p = sub.add_parser("temp", help="Set target temperature (°F)")
    p.add_argument("value", type=int, help="Temperature in °F")
    p.add_argument("--serial", help="Shower serial number")

    p = sub.add_parser("preset", help="Activate a preset")
    p.add_argument("n", type=int, help="Preset index (1=Ashley, 2=Tracey, etc.)")
    p.add_argument("--serial", help="Shower serial number")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    dispatch = {
        "list":   cmd_list,
        "status": cmd_status,
        "on":     cmd_on,
        "off":    cmd_off,
        "temp":   cmd_temp,
        "preset": cmd_preset,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
