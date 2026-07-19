# U by Moen Smart Shower — Python Controller

Control your U by Moen smart shower from the command line.

Uses the Moen cloud API for auth/status and Pusher websockets
for real-time shower control (the same protocol the Moen app uses).

## Setup

```
<<<<<<< HEAD
cd moen
pip install -r requirements.txt
```

Create a local credentials file from the included example, then edit `.env`
and replace both placeholder values with your Moen account credentials:

```bash
cp example.env .env
```

The `.env` file is ignored by Git and must not be committed. Load it into your
current shell before running the controller:

```bash
set -a
source .env
set +a
```

PowerShell:

```powershell
$env:MOEN_EMAIL = "you@example.com"
$env:MOEN_PASSWORD = "your-password"
```

The controller reads `MOEN_EMAIL` and `MOEN_PASSWORD` from the environment; it
does not load `.env` automatically.

=======
cd moen-shower-control
pip install -r requirements.txt
```

Set environment variables (persisted across sessions):
```powershell
[Environment]::SetEnvironmentVariable("MOEN_EMAIL", "you@example.com", "User")
[Environment]::SetEnvironmentVariable("MOEN_PASSWORD", "yourpassword", "User")
```

>>>>>>> c308f09b8abd61b6de60d17dac96b66a56193bdb
## Commands

| Command | Description |
|---------|-------------|
| `python shower.py list` | List showers on your account |
| `python shower.py status` | Show current shower state, presets & outlets |
| `python shower.py on` | Turn shower on (last-used preset) |
| `python shower.py on --preset 1` | Turn on with Ashley's preset |
| `python shower.py off` | Turn shower off |
| `python shower.py temp 104` | Set target temperature to 104°F |
| `python shower.py preset 2` | Activate Tracey's preset |

If you have multiple showers, pass `--serial YOUR_SERIAL` to any command.

## API Module

```python
from moen_api import MoenClient

client = MoenClient()
client.authenticate("you@email.com", "password")

showers = client.get_showers()
serial = showers[0]["serial_number"]

client.turn_on(serial, preset=1)       # start preset 1
client.set_temperature(serial, 102)    # adjust temp
client.turn_off(serial)                # done
client.disconnect()                    # clean up
```

## How it works

1. **Auth + status** via Moen's REST API at `https://www.moen-iot.com`
2. **Shower control** via Pusher websockets (`client-state-desired` events)
   — the same real-time protocol the Moen mobile app uses

Protocol discovered by sniffing the Pusher channel:
- `shower_on`  → `{"type":"control","data":{"action":"shower_on","params":{"preset":"1"}}}`
- `shower_off` → `{"type":"control","data":{"action":"shower_off","params":{}}}`
- `temperature_set` → `{"type":"control","data":{"action":"temperature_set","params":{"target_temperature":104}}}`
- `shower_set` → full preset config

## Caveats

- **Unofficial, reverse-engineered** — could break if Moen changes their protocol
<<<<<<< HEAD
- Credentials are read from environment variables; keep your local `.env` private
=======
- Credentials stored in environment variables (not plaintext files)
>>>>>>> c308f09b8abd61b6de60d17dac96b66a56193bdb
- Requires internet (cloud auth + Pusher)
- Use at your own risk — controlling water temperature remotely has safety implications
