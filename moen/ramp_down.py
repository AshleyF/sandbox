#!/usr/bin/env python3
"""Start the shower at 100°F and lower it to 90°F, one degree at a time."""

import argparse
import time


def ramp_down(client, serial: str, start: int, end: int, interval: float,
              sleep=time.sleep) -> None:
    """Start the shower at *start*, then lower it to *end* at *interval*."""
    if not 60 <= end < start <= 115:
        raise ValueError("temperatures must descend within the 60–115°F range")
    if interval < 0:
        raise ValueError("interval must not be negative")

    print(f"Setting target temperature to {start}°F...")
    client.set_temperature(serial, start)
    client.turn_on(serial, preset=0)
    print(f"Shower started at {start}°F")

    for temperature in range(start - 1, end - 1, -1):
        sleep(interval)
        client.set_temperature(serial, temperature)
        print(f"Target temperature: {temperature}°F")

    # Give the websocket time to transmit the final command before disconnecting.
    sleep(1.0)
    print(f"Ramp complete; shower remains on at {end}°F")


class DryRunClient:
    def set_temperature(self, serial: str, temperature: int) -> None:
        print(f"DRY RUN: set {serial} to {temperature}°F")

    def turn_on(self, serial: str, preset: int = 0) -> None:
        print(f"DRY RUN: turn on {serial} with preset {preset}")

    def disconnect(self) -> None:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, default=100)
    parser.add_argument("--end", type=int, default=90)
    parser.add_argument("--interval", type=float, default=5.0,
                        help="seconds between one-degree changes (default: 5)")
    parser.add_argument("--serial", help="shower serial number")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the sequence without contacting the shower")
    args = parser.parse_args()

    if not 60 <= args.end < args.start <= 115:
        parser.error("temperatures must descend within the 60–115°F range")
    if args.interval < 0:
        parser.error("--interval must not be negative")

    if args.dry_run:
        client = DryRunClient()
        serial = args.serial or "SHOWER"
        sleeper = lambda seconds: None
    else:
        from shower import get_client, load_config, resolve_serial

        client = get_client()
        serial = resolve_serial(client, load_config(), args)
        sleeper = time.sleep

    try:
        ramp_down(client, serial, args.start, args.end, args.interval, sleeper)
    except KeyboardInterrupt:
        print("\nRamp cancelled; no further temperature changes will be sent.")
        print("The shower may still be running; use `python shower.py off` to stop it.")
        raise SystemExit(130)
    finally:
        client.disconnect()


if __name__ == "__main__":
    main()
