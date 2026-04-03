# CoCo II Emulator

A TRS-80 Color Computer II emulator in plain JavaScript. No build tools — open `index.html` in a browser.

## Quick Start

1. Start a local web server: `npx serve .` (ES modules require it)
2. Open `http://localhost:3000`
3. Click **"Test ROM"** for a built-in demo, or **"Load ROM"** for real Tandy ROMs
4. Click **"Run"**

## ROM Files

Place in `roms/` (gitignored) or load via the file picker:
- `bas13.rom` — Color BASIC 1.3 (8K) — required
- `extbas11.rom` — Extended Color BASIC 1.1 (8K) — optional

Color BASIC alone boots fine (you get a `>` prompt). Extended BASIC adds `PMODE`, `PSET`, `LINE`, etc.

ROMs are copyrighted by Tandy and not included. Find them at the
[Color Computer Archive](https://colorcomputerarchive.com/repo/ROMs/Color%20Basic/).

## Running Tests

```
node tests/cpu.test.node.js
```

Or open `tests/cpu.test.html` in a browser. Currently 177 tests covering CPU, PIA, SAM, VDG, keyboard, and full system integration.

---

# Architecture

## System Overview

The CoCo II is built from five chips plus RAM and ROM. Our emulator mirrors this structure exactly — one JS file per chip, wired together in `coco.js`.

```
┌──────────────────────────────────────────────────────────────┐
│                        Address Bus                           │
├──────┬──────┬──────┬──────┬──────────┬──────────┬───────────┤
│ CPU  │ RAM  │ ROM  │ ROM  │  PIA 0   │  PIA 1   │    SAM    │
│6809E │ 64K  │Basic │ExtBas│ $FF00-03 │ $FF20-23 │ $FFC0-DF  │
│      │      │$A000 │$8000 │ Keyboard │ Sound    │ Video cfg │
│      │      │      │      │ Joystick │ Cassette │ Clocking  │
├──────┘      │      │      │ VSync    │ VDG mode │           │
│             │      │      └────┬─────┴────┬─────┘           │
│             │      │           │           │                 │
│             │      │      ┌────┴───┐  ┌───┴────┐            │
│             │      │      │Keyboard│  │  VDG   │◄── SAM     │
│             │      │      │ Matrix │  │ MC6847 │    video    │
│             │      │      └────────┘  │ Video  │    offset   │
│             │      │                  │ Output │            │
│             │      │                  └───┬────┘            │
│             │      │                      │                 │
│             │      │                  ┌───┴────┐            │
│             │      │                  │ Canvas │            │
│             │      │                  │ 256×192│            │
│             │      │                  └────────┘            │
└──────────────────────────────────────────────────────────────┘
```

| File | Chip | Role |
|------|------|------|
| `cpu.js` | MC6809E | 8-bit CPU, ~0.895 MHz |
| `memory.js` | — | 64K address bus, routes reads/writes |
| `pia.js` | MC6821 ×2 | Peripheral interface (keyboard, sound, VDG control) |
| `sam.js` | MC6883 | Video addressing, clock rate, memory config |
| `vdg.js` | MC6847 | Video display generator (text + graphics rendering) |
| `keyboard.js` | — | Browser keyboard → CoCo matrix mapping |
| `debug.js` | — | Disassembler, breakpoints, tracing, memory dumps |
| `coco.js` | — | System integration, main loop, UI wiring |
| `testrom.js` | — | Built-in test ROM (no Tandy code needed) |

---

## Memory Map

The MC6809E sees a flat 64K address space. The memory bus (`memory.js`) routes each address to the right device:

```
$0000-$7FFF  RAM (32K)
    $0000-$00FF  Direct page (DP register defaults to $00)
    $0400-$05FF  Default text screen (32×16 = 512 bytes)
    $0600-$0FFF  Graphics screen pages (PMODE)
$8000-$9FFF  Extended BASIC ROM (8K) — optional
$A000-$BFFF  Color BASIC ROM (8K)
$C000-$FEFF  Cartridge space / upper RAM
$FF00-$FF03  PIA 0 (keyboard, joystick, VSYNC)
$FF04-$FF1F  (unmapped, returns $FF)
$FF20-$FF23  PIA 1 (sound, cassette motor, VDG mode)
$FF24-$FFBF  (unmapped)
$FFC0-$FFDF  SAM registers (write-only, bit-pair set/clear)
$FFE0-$FFEF  (unmapped)
$FFF0-$FFFF  Interrupt vectors (mirrored from end of BASIC ROM)
```

### How ROM Mapping Works

Color BASIC occupies `$A000-$BFFF` (8K). The interrupt vectors at `$FFF0-$FFFF` are **mirrored** from the same ROM chip — address line A13 isn't fully decoded, so `$FFFE` reads from ROM offset `$1FFE` (same as `$BFFE`). This is why the reset vector lives in the BASIC ROM even though its address is `$FFFE`.

### ROM Loading

When you click "Load ROM" and select a file:
1. The filename is checked — if it contains "ext", it's loaded at `$8000` (Extended BASIC)
2. Otherwise it's loaded at `$A000` (Color BASIC)
3. The ROM data is stored as a `Uint8Array` and served on reads to that address range
4. Writes to ROM addresses are silently ignored

---

## Boot Sequence

When you click "Reset":

1. **CPU reset**: The MC6809E reads the **reset vector** from `$FFFE-$FFFF`
2. This vector points into the BASIC ROM (typically `$A027` for Color BASIC 1.3)
3. BASIC initializes:
   - Sets up the stack pointer (S)
   - Configures PIA0 and PIA1 (DDR registers, then data registers)
   - Sets SAM registers for text mode
   - Clears screen memory at `$0400` with `$60` (green blocks)
   - Scans for Extended BASIC at `$8000` and cartridge ROMs
   - Prints the copyright message and `OK` (or `>` without Extended BASIC)
   - Enters the BASIC command loop, scanning the keyboard via PIA0

---

## The Video Display

### How It Actually Works

The VDG chip (`vdg.js`) doesn't know about the CPU at all. It's a simple state machine:

1. **SAM tells the VDG where to look**: The SAM chip sets the video base address (which RAM address the VDG reads from) and the display mode
2. **VDG reads RAM directly**: Every frame, the VDG reads bytes from RAM starting at the base address and turns them into pixels
3. **The CPU writes to the same RAM**: When BASIC does `POKE 1024, 65`, it writes to `$0400`, which is the same memory the VDG is reading

In our emulator, `renderFrame()` in `coco.js` orchestrates this:

```javascript
renderFrame() {
    const ag = !!(this.pia1.dataB & 0x80);    // Text or Graphics?
    const css = !!(this.pia1.dataB & 0x08);   // Color set
    const videoBase = this.sam.videoOffset;     // Where in RAM?

    if (ag) {
        this.vdg.renderGraphics(videoBase, this.sam.videoMode, css);
    } else {
        this.vdg.renderText(videoBase, css);
    }
    // Blit pixel buffer to HTML Canvas
}
```

### Text Mode (32×16)

- **Screen memory**: 512 bytes starting at the video base (default `$0400`)
- **Each byte** = one character cell (8×12 pixels)
- **Character encoding**: NOT ASCII. CoCo uses its own mapping:
  - `$00-$1F` → `@`, `A`-`Z`, `[`, `\`, `]`, `↑`, `←`
  - `$20-$3F` → space, `!`, `"`, ..., `?`
  - `$40-$5F` → inverse of `$00-$1F`
  - `$60-$7F` → inverse of `$20-$3F`
  - `$80-$FF` → semigraphics-4 blocks
- **Font**: Built-in 5×7 character ROM (we embed this in `vdg.js` since the real chip had it in silicon)
- **Colors**: Green on dark-green (CSS=0) or Orange on black (CSS=1)

### Semigraphics-4 (SET/RESET commands)

When a byte in screen memory has bit 7 set (`$80-$FF`), the VDG renders it as a **colored block** instead of a character:

```
Bit layout: 1 CSS C2 C1  TL TR BL BR
            │  │   └─┘   └──┘ └──┘
            │  │    │      │    └── Bottom-right quadrant
            │  │    │      └─────── Top half quadrants
            │  │    └────────────── Color (0-7)
            │  └─────────────────── Color high bit
            └────────────────────── Semigraphics flag (must be 1)
```

Each character cell is split into 4 quadrants (2×2). This gives an effective resolution of **64×32** in 8 colors. This is what BASIC's `SET(X,Y,C)` and `RESET(X,Y)` commands use.

### Graphics Modes (Extended BASIC)

When PIA1 port B bit 7 (AG) is set, the VDG switches to full graphics. The SAM's V0-V2 bits select the mode:

| SAM Mode | Resolution | Colors | Bytes/row | BASIC command |
|----------|-----------|--------|-----------|---------------|
| 0 (CG1) | 64×64 | 4 | 16 | `PMODE 0` |
| 2 (CG2) | 128×96 | 4 | 16 | `PMODE 1` |
| 4 (CG3) | 128×192 | 4 | 32 | `PMODE 2/3` |
| 6 (CG6) | 256×192 | 2 | 32 | `PMODE 4` |

CSS (PIA1 bit 3) selects between two color palettes:
- **CSS=0**: Green, Yellow, Blue, Red
- **CSS=1**: Buff, Cyan, Magenta, Orange

Currently implemented: CG2, CG3, CG6. The VDG renders pixels directly into a 256×192 RGBA buffer, which is blitted to the HTML Canvas each frame.

---

## The PIA (Peripheral Interface Adapter)

Each MC6821 PIA has two sides (A and B), each with:
- **Data Direction Register (DDR)**: each bit = 0 (input) or 1 (output)
- **Data Register**: reads mix input pins with output latches per DDR
- **Control Register**: selects DDR vs data access, interrupt config

The CPU sees 4 registers per PIA:

| Offset | Bit 2 of Control | Register |
|--------|-------------------|----------|
| 0 | 0 | DDR A |
| 0 | 1 | Data A |
| 1 | — | Control A |
| 2 | 0 | DDR B |
| 2 | 1 | Data B |
| 3 | — | Control B |

### PIA0 — Keyboard & Joystick (`$FF00-$FF03`)

- **Port B** (output): selects which keyboard column to scan (active low)
- **Port A** (input): reads which rows have keys pressed (active low)
- **CA1**: VSYNC signal from VDG (triggers IRQ for 60fps timing)

Keyboard scanning works like this:
1. BASIC writes a column-select pattern to PIA0 port B (e.g., `$FE` = column 0)
2. BASIC reads PIA0 port A — any row bit that's 0 means a key is pressed at that row+column intersection
3. BASIC repeats for all 8 columns to find all pressed keys

### PIA1 — Sound, Cassette, VDG Control (`$FF20-$FF23`)

- **Port B bit 7 (AG)**: 0 = text mode, 1 = graphics mode
- **Port B bit 3 (CSS)**: color set select
- **Port B bit 1**: single-bit DAC (1-bit sound)
- **Port A**: cassette data, serial

---

## The SAM (Synchronous Address Multiplexer)

The SAM at `$FFC0-$FFDF` uses a unique **bit-pair set/clear** interface:
- Even addresses **clear** a bit: write to `$FFC0` clears bit 0
- Odd addresses **set** a bit: write to `$FFC1` sets bit 0
- The actual value written is ignored — only the address matters

```
$FFC0/$FFC1  → bit 0  (V0 - video mode)
$FFC2/$FFC3  → bit 1  (V1)
$FFC4/$FFC5  → bit 2  (V2)
$FFC6/$FFC7  → bit 3  (F0 - video offset)
$FFC8/$FFC9  → bit 4  (F1)
  ...
$FFD2/$FFD3  → bit 9  (F6)
$FFD4/$FFD5  → bit 10 (Page)
  ...
$FFD8/$FFD9  → bit 12 (M0 - memory size)
$FFDA/$FFDB  → bit 13 (M1)
$FFDC/$FFDD  → bit 14 (R0 - CPU rate)
$FFDE/$FFDF  → bit 15 (R1)
```

The video offset (F0-F6) is shifted left by 9 to produce the RAM address:
- Default: F1=1, all others 0 → offset = `$0400` (the text screen)
- `PMODE 1,1` sets the offset to `$0600`, `$0C00`, `$1200`, or `$1800`

---

## The Keyboard Matrix

The CoCo has a 7-row × 8-column key matrix:

```
       Col 0  Col 1  Col 2  Col 3  Col 4  Col 5  Col 6  Col 7
Row 0:   @      A      B      C      D      E      F      G
Row 1:   H      I      J      K      L      M      N      O
Row 2:   P      Q      R      S      T      U      V      W
Row 3:   X      Y      Z      ↑      ↓      ←      →    SPACE
Row 4:   0      1      2      3      4      5      6      7
Row 5:   8      9      :      ;      ,      -      .      /
Row 6: ENTER  CLEAR  BREAK  ---    ---    ---    ---    SHIFT
```

Our `keyboard.js` maps browser `KeyboardEvent` keys to matrix positions. Shifted symbols (like `"`, which is SHIFT+2 on the CoCo) automatically press both SHIFT and the base key.

---

## Main Loop & Timing

The CoCo runs at **0.895 MHz** (NTSC timing). At 60fps, that's **14,914 cycles per frame**.

Each frame:
1. Check for pending interrupts (NMI, FIRQ, IRQ)
2. Execute ~14,914 CPU cycles
3. Render the current video mode to the pixel buffer
4. Blit the pixel buffer to the Canvas
5. Signal VSYNC via PIA0 CA1 (triggers IRQ if enabled)
6. `requestAnimationFrame` schedules the next frame

---

## The Debugger

`debug.js` provides developer tools:

- **Disassembler**: Decodes 6809 machine code back to mnemonics, handles all addressing modes including indexed with indirect
- **Step**: Execute one instruction, return disassembly + register state
- **Breakpoints**: Set addresses where execution pauses
- **Trace log**: Records last N instructions executed
- **Register dump**: Formatted display of all CPU registers and flags
- **Memory dump**: Hex + ASCII display of any memory region

The "Step" button in the UI uses the debugger to single-step and shows registers + disassembly of upcoming instructions.

---

## File Map

```
coco/
├── cpu.js          MC6809E: 59 instructions, all addressing modes, cycle-accurate
├── memory.js       64K bus: RAM, ROM, I/O routing to PIA/SAM
├── pia.js          MC6821: DDR/data/control registers, IRQ flags
├── sam.js          MC6883: bit-pair set/clear, video offset/mode
├── vdg.js          MC6847: text, semigraphics-4, CG2/CG3/CG6 graphics
├── keyboard.js     7×8 matrix, browser key mapping, auto-shift
├── debug.js        Disassembler, breakpoints, tracing, memory dumps
├── coco.js         System integration, 60fps loop, Canvas rendering, UI
├── testrom.js      Built-in test ROM (hand-assembled 6809 code)
├── index.html      Web page with canvas, controls, debug panel
├── tests/
│   ├── run.js          Minimal test framework (browser)
│   ├── cpu.test.js     Browser test suite
│   └── cpu.test.node.js  Node.js test suite (177 tests)
├── roms/           User-supplied ROM files (.gitignored)
└── README.md       This file
```

## References

- [MC6809E Programming Manual](http://www.maddes.net/m6809pm/)
- [CoCo Technical Reference](https://archive.org/details/ETC2052)
- [Lomont Hardware Guide](https://www.lomont.org/software/misc/coco/Lomont_CoCoHardware.pdf)
- [CoCo3.org 6809 Opcode Table](https://coco3.org/cpu/6x09/InstructionSet.html)
- [Color Computer Archive](https://colorcomputerarchive.com/)

