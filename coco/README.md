# CoCo II Emulator

A TRS-80 Color Computer II emulator in plain JavaScript. No build tools — open `index.html` in a browser.

## Quick Start

1. Open `index.html` in a modern browser
2. Click "Load ROM" and select your Color BASIC + Extended BASIC ROM files
3. Click "Run"

## ROM Files Needed

Place in `roms/` (gitignored) or load via the file picker:
- `bas13.rom` — Color BASIC 1.3 (8K)
- `extbas11.rom` — Extended Color BASIC 1.1 (8K)

ROMs are copyrighted by Tandy and not included. Find them at the
[Color Computer Archive](https://colorcomputerarchive.com/repo/ROMs/Color%20Basic/).

## Running Tests

Open `tests/cpu.test.html` in a browser. Tests run automatically and results display on the page.

## Architecture

| File | Emulates |
|------|----------|
| `cpu.js` | MC6809E CPU |
| `memory.js` | 64K address space, ROM, I/O routing |
| `pia.js` | MC6821 PIAs (keyboard, joystick, sound) |
| `sam.js` | MC6883 SAM (video addressing, clock) |
| `vdg.js` | MC6847 VDG (video display) |
| `keyboard.js` | Browser keyboard → CoCo matrix |
| `coco.js` | System integration + main loop |

## References

- [MC6809E Programming Manual](http://www.maddes.net/m6809pm/)
- [CoCo Technical Reference](https://archive.org/details/ETC2052)
- [Lomont Hardware Guide](https://www.lomont.org/software/misc/coco/Lomont_CoCoHardware.pdf)
